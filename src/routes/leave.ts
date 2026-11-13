import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { sendEmailInBackground } from '../services/smtp';
import { getLeaveStatusEmail } from '../services/email-templates';
import { getFile, putFile } from '../services/storage';
import { makeId } from '../utils/id';

export const leaveRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

leaveRoutes.use('*', authMiddleware);

// 1. Leave Types
leaveRoutes.get('/types', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM leave_types ORDER BY name ASC`).all<any>();
  return c.json({ leaveTypes: rows.results || [] });
});

// 2. Holiday Calendar (Indonesian National + Company)
leaveRoutes.get('/holidays', async (c) => {
  const year = c.req.query('year') || '2026';
  const holidays = await c.env.DB.prepare(
    `SELECT * FROM holidays WHERE year = ? ORDER BY date ASC`
  )
    .bind(parseInt(year, 10))
    .all<any>();

  return c.json({ year, holidays: holidays.results || [] });
});

leaveRoutes.post('/holidays', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { name, date, type, branch_id, is_cuti_bersama_deducts_leave } = body;

  if (!name || !date || !type) {
    return c.json({ error: 'Nama, tanggal, dan jenis libur wajib diisi' }, 400);
  }

  const year = parseInt(date.substring(0, 4), 10);
  const id = `hol-${Date.now()}`;

  await c.env.DB.prepare(
    `INSERT INTO holidays (id, tenant_id, name, date, type, branch_id, year, is_cuti_bersama_deducts_leave)
     VALUES (?, 'default', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      name,
      date,
      type,
      branch_id || null,
      year,
      is_cuti_bersama_deducts_leave ? 1 : 0
    )
    .run();

  return c.json({ message: 'Hari libur berhasil ditambahkan', holidayId: id });
});

// 3. Employee Leave Balances
leaveRoutes.get('/balances', async (c) => {
  const user = c.get('user');
  const targetEmpId = c.req.query('employee_id') || user.employeeId;

  if (user.role === 'employee' && targetEmpId !== user.employeeId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const rows = await c.env.DB.prepare(
    `SELECT lb.*, lt.name as leave_type_name, lt.code as leave_type_code, lt.is_paid
     FROM leave_balances lb
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     WHERE lb.employee_id = ?
     ORDER BY lt.name ASC`
  )
    .bind(targetEmpId)
    .all<any>();

  return c.json({ balances: rows.results || [] });
});

// 4. Adjust Balance (HR only, with logged reason)
leaveRoutes.post('/adjust-balance', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { employee_id, leave_type_id, adjustment_days, reason } = body;

  if (!employee_id || !leave_type_id || adjustment_days === undefined || !reason) {
    return c.json({ error: 'Karyawan, jenis cuti, jumlah hari, dan alasan wajib diisi' }, 400);
  }

  // Resolve employee by id or nik
  let targetEmpId = employee_id;
  const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE id = ? OR nik = ?').bind(employee_id, employee_id).first<any>();
  if (emp) {
    targetEmpId = emp.id;
  }

  const balance = await c.env.DB.prepare(
    `SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?`
  )
    .bind(targetEmpId, leave_type_id)
    .first<any>();

  const currentTotal = balance ? balance.total_entitled : 12;
  const currentRemaining = balance ? balance.remaining_days : 12;
  const currentUsed = balance ? balance.used_days : 0;
  const newRemaining = currentRemaining + parseFloat(adjustment_days);

  if (balance) {
    await c.env.DB.prepare(
      `UPDATE leave_balances SET
        remaining_days = ?,
        adjusted_days = adjusted_days + ?,
        adjustment_reason = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(newRemaining, parseFloat(adjustment_days), reason, balance.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO leave_balances (
        id, tenant_id, employee_id, leave_type_id, year,
        total_entitled, used_days, remaining_days, adjusted_days, adjustment_reason
      ) VALUES (
        ?, 'default', ?, ?, 2026,
        ?, ?, ?, ?, ?
      )`
    )
      .bind(
        `bal-${targetEmpId}-${leave_type_id}`,
        targetEmpId,
        leave_type_id,
        currentTotal,
        currentUsed,
        newRemaining,
        parseFloat(adjustment_days),
        reason
      )
      .run();
  }

  // Audit Log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'ADJUST_LEAVE_BALANCE', 'leave_balances', ?, ?)`
  )
    .bind(
      makeId('aud'),
      user.userId,
      employee_id,
      JSON.stringify({ leave_type_id, adjustment_days, reason, newRemaining })
    )
    .run();

  return c.json({ message: 'Saldo cuti berhasil disesuaikan', newRemaining });
});

// 5. Submit Leave Request
leaveRoutes.post('/requests', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { leave_type_id, start_date, end_date, total_days, reason, attachment_key } = body;

  const employeeId = body.employee_id || user.employeeId;
  if (!employeeId || !leave_type_id || !start_date || !end_date || !total_days || !reason) {
    return c.json({ error: 'Mohon lengkapi semua field formulir pengajuan cuti' }, 400);
  }

  if (end_date < start_date) {
    return c.json({ error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' }, 400);
  }

  // Validate balance if annual leave
  const lt = await c.env.DB.prepare(`SELECT * FROM leave_types WHERE id = ?`).bind(leave_type_id).first<any>();
  if (lt && lt.code === 'annual') {
    const bal = await c.env.DB.prepare(
      `SELECT remaining_days FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?`
    )
      .bind(employeeId, leave_type_id)
      .first<any>();

    if (bal && bal.remaining_days < parseFloat(total_days)) {
      return c.json({
        error: `Saldo cuti tahunan tidak mencukupi (Tersisa: ${bal.remaining_days} hari, diajukan: ${total_days} hari)`,
      }, 400);
    }
  }

  const reqId = `lvr-${Date.now()}`;

  let savedAttachmentKey = attachment_key || null;
  if (typeof body.attachment_base64 === 'string' && body.attachment_base64.length > 0) {
    savedAttachmentKey = `leave/${employeeId}/${reqId}-${Date.now()}`;
    const raw = body.attachment_base64.includes(',')
      ? body.attachment_base64.split(',').pop() || ''
      : body.attachment_base64;
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (char: string) => char.charCodeAt(0));
    await putFile(c.env, {
      key: savedAttachmentKey,
      data: bytes,
      contentType: body.attachment_mime || 'image/jpeg',
    });
  }

  await c.env.DB.prepare(
    `INSERT INTO leave_requests (
      id, tenant_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, attachment_key, status
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, ?, ?, ?, 'pending'
    )`
  )
    .bind(
      reqId,
      employeeId,
      leave_type_id,
      start_date,
      end_date,
      parseFloat(total_days),
      reason,
      savedAttachmentKey
    )
    .run();

  return c.json({ message: 'Pengajuan cuti berhasil diajukan dan menunggu persetujuan.', requestId: reqId });
});

// 5b. Serve leave attachment (self or HR/manager/finance)
leaveRoutes.get('/requests/:id/attachment', async (c) => {
  const user = c.get('user');
  const req = await c.env.DB.prepare(`SELECT * FROM leave_requests WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<any>();

  if (!req || !req.attachment_key) return c.json({ error: 'Lampiran tidak ditemukan' }, 404);
  if (user.role === 'employee' && user.employeeId !== req.employee_id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const stored = await getFile(c.env, req.attachment_key);
  if (!stored) return c.json({ error: 'File fisik tidak ditemukan' }, 404);

  c.header('Content-Type', stored.contentType || 'application/octet-stream');
  c.header('Content-Disposition', 'inline');
  return c.body(stored.data as any);
});

// 6. List Leave Requests (Approval Inbox)
leaveRoutes.get('/requests', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT lr.*, e.nik, e.full_name, e.job_title, d.name as department_name, lt.name as leave_type_name, lt.code as leave_type_code
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    LEFT JOIN departments d ON e.department_id = d.id
  `;

  const params: any[] = [];
  const onlyMine = c.req.query('scope') === 'mine' || user.role === 'employee';
  if (onlyMine) {
    query += ` WHERE lr.employee_id = ?`;
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    query += ` WHERE (e.manager_id = ? OR e.id = ?)`;
    params.push(user.employeeId, user.employeeId);
  }

  query += ` ORDER BY lr.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  return c.json({ requests: rows.results || [] });
});

// 7. Approve / Reject Leave Request (Updates balance + updates attendance!)
leaveRoutes.post('/requests/:id/review', requireRole(['owner_admin', 'manager']), async (c) => {
  const reqId = c.req.param('id');
  const user = c.get('user');
  const { status, note } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  const req = await c.env.DB.prepare(
    `SELECT lr.*, e.full_name, e.personal_email, e.company_email, lt.name as leave_type_name, lt.code as leave_type_code
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     JOIN leave_types lt ON lr.leave_type_id = lt.id
     WHERE lr.id = ?`
  )
    .bind(reqId)
    .first<any>();

  if (!req) {
    return c.json({ error: 'Pengajuan cuti tidak ditemukan' }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE leave_requests SET
      status = ?,
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?
     WHERE id = ?`
  )
    .bind(status, user.userId, note || null, reqId)
    .run();

  if (status === 'approved') {
    // 1. Update leave balance
    await c.env.DB.prepare(
      `UPDATE leave_balances SET
        used_days = used_days + ?,
        remaining_days = remaining_days - ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = ? AND leave_type_id = ?`
    )
      .bind(req.total_days, req.total_days, req.employee_id, req.leave_type_id)
      .run();

    // 2. Automatically feed into attendance records for the leave period!
    const startDate = new Date(req.start_date);
    const endDate = new Date(req.end_date);
    const attStatus = req.leave_type_code === 'sick' ? 'sick' : 'on_leave';

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      // Skip weekend if standard 5-day week
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO attendance (id, tenant_id, employee_id, date, status, source)
           VALUES (?, 'default', ?, ?, ?, 'manual')`
        )
          .bind(`att-leave-${req.employee_id}-${dateStr}`, req.employee_id, dateStr, attStatus)
          .run();
      }
    }
  }

  // Send Email Notification
  const reviewer = await c.env.DB.prepare(`SELECT full_name FROM employees WHERE id = ?`)
    .bind(user.employeeId)
    .first<any>();
  const reviewerName = reviewer?.full_name || user.email;

  const emailTarget = req.company_email || req.personal_email;
  if (emailTarget) {
    const comp = await c.env.DB.prepare(
      `SELECT name, legal_name, custom_domain FROM companies LIMIT 1`
    ).first<any>();
    const appUrl = comp?.custom_domain
      ? (comp.custom_domain.startsWith('http') ? comp.custom_domain : `https://${comp.custom_domain}`)
      : (c.env.APP_URL || undefined);
    const emailData = getLeaveStatusEmail({
      employeeName: req.full_name,
      leaveType: req.leave_type_name,
      startDate: req.start_date,
      endDate: req.end_date,
      totalDays: req.total_days,
      status: status as any,
      reviewerName,
      note,
      appUrl,
      companyName: comp?.legal_name || comp?.name,
    });
    sendEmailInBackground(c, c.env, {
      to: emailTarget,
      subject: `Pengajuan cuti ${status === 'approved' ? 'disetujui' : 'ditolak'} (Leave ${status === 'approved' ? 'approved' : 'rejected'})`,
      text: emailData.text,
      html: emailData.html,
      type: 'leave_status',
    });
  }

  return c.json({ message: `Pengajuan cuti berhasil di-${status}.` });
});

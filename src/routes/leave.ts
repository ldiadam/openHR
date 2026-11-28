import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { sendEmailInBackground } from '../services/smtp';
import { getLeaveStatusEmail } from '../services/email-templates';
import { getFile, putFile } from '../services/storage';
import { makeId } from '../utils/id';
import {
  ADMIN_CLASH_FLAGS,
  DEPT_HEAD_FLAGS,
  applyApprovalSideEffects,
  auditLeaveAction,
  canTransition,
  findLeaveConflicts,
  formatDDMMYY,
  isOpenStatus,
  letterheadGaps,
  loadLetterhead,
  nextReferenceNo,
  parseFlags,
  workingDaySlaDueAt,
  type LeaveStatus,
} from '../services/leave-workflow';
import { loadLeaveFormTemplate } from '../services/form-templates';
import { getEmployeeLevelContext, hasLevelBypassOnly } from '../services/employee-levels';

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
    // Balance deduction and attendance backfill live in the workflow service so
    // the multi-stage approval, an override and this legacy route all agree.
    await applyApprovalSideEffects(c.env, req);
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

/* ------------------------------------------------------------------ */
/* Multi-stage leave application                                       */
/*                                                                     */
/* Company identity is read from the companies table and the department */
/* and leave-type choices come from their own tables. Nothing in this   */
/* section describes a particular organisation.                        */
/* ------------------------------------------------------------------ */

const LEAVE_APPLICATION_SELECT = `
  SELECT lr.*,
         e.full_name, e.nik, e.job_title, e.manager_id,
         d.name AS employee_department_name
  FROM leave_requests lr
  JOIN employees e ON e.id = lr.employee_id
  LEFT JOIN departments d ON e.department_id = d.id
`;

/** Roles allowed to act at each stage, given how this app maps its roles. */
function stageRights(user: { role: string }, request: any) {
  const isAdmin = user.role === 'owner_admin';
  const isDeptHead = user.role === 'manager';
  return {
    canAdminCheck: isAdmin && ['pending', 'submitted', 'pending_administrator'].includes(request.status),
    canDeptHeadReview: (isAdmin || isDeptHead) && request.status === 'pending_dept_head',
    canManagementDecide: isAdmin && request.status === 'pending_management',
    canOverride: isAdmin && !['cancelled'].includes(request.status),
    canPrint: isAdmin,
  };
}

async function loadApplication(db: D1Database, id: string) {
  return db.prepare(`${LEAVE_APPLICATION_SELECT} WHERE lr.id = ?`).bind(id).first<any>();
}

/** Employees see only their own; managers see their reports; admins see all. */
function scopeClause(user: { role: string; employeeId?: string | null }) {
  if (user.role === 'owner_admin' || user.role === 'finance') return { sql: '', params: [] as any[] };
  if (user.role === 'manager') {
    return {
      sql: 'WHERE (e.manager_id = ? OR e.id = ?)',
      params: [user.employeeId, user.employeeId],
    };
  }
  return { sql: 'WHERE lr.employee_id = ?', params: [user.employeeId] };
}

// Form configuration: letterhead + the real department and leave-type rows.
leaveRoutes.get('/form/config', async (c) => {
  const user = c.get('user');

  const [letterhead, departments, leaveTypes, employee, leaveTpl] = await Promise.all([
    loadLetterhead(c.env),
    c.env.DB.prepare(`SELECT id, name, code FROM departments ORDER BY name ASC`).all<any>(),
    c.env.DB.prepare(`SELECT id, code, name, is_paid FROM leave_types ORDER BY name ASC`).all<any>(),
    user.employeeId
      ? c.env.DB.prepare(`SELECT id, full_name, department_id FROM employees WHERE id = ?`)
          .bind(user.employeeId)
          .first<any>()
      : Promise.resolve(null),
    loadLeaveFormTemplate(c.env),
  ]);

  return c.json({
    letterhead,
    letterheadGaps: letterheadGaps(letterhead),
    departments: departments.results || [],
    leaveTypes: leaveTypes.results || [],
    adminClashFlags: leaveTpl.config.adminClashFlags,
    deptHeadFlags: leaveTpl.config.deptHeadFlags,
    formTitle: leaveTpl.config.formTitle,
    formTemplate: leaveTpl.config,
    viewer: {
      role: user.role,
      employeeId: user.employeeId || null,
      fullName: employee?.full_name || null,
      departmentId: employee?.department_id || null,
      canPrint: user.role === 'owner_admin',
    },
  });
});

// Stage 1 — applicant submits a signed application.
leaveRoutes.post('/applications', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const employeeId = String(body.employee_id || user.employeeId || '').trim();
  if (!employeeId) return c.json({ error: 'Karyawan wajib dipilih.' }, 400);

  // Only HR may file on someone else's behalf.
  if (user.role !== 'owner_admin' && employeeId !== user.employeeId) {
    return c.json({ error: 'Anda hanya dapat mengajukan cuti untuk diri sendiri.' }, 403);
  }

  const departmentId = String(body.department_id || '').trim();
  const leaveTypeId = String(body.leave_type_id || '').trim();
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  const signature = String(body.applicant_signature || '').trim();
  const otherNote = String(body.leave_type_other_note || '').trim();
  const reason = String(body.reason || '').trim();

  const missing = Object.entries({ departmentId, leaveTypeId, startDate, endDate, signature, reason })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return c.json({ error: `Lengkapi field berikut: ${missing.join(', ')}.` }, 400);
  }
  if (endDate < startDate) {
    return c.json({ error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' }, 400);
  }

  // Both choices must be real rows: the options are configuration, not literals.
  const department = await c.env.DB.prepare(`SELECT id, name FROM departments WHERE id = ?`)
    .bind(departmentId)
    .first<any>();
  if (!department) return c.json({ error: 'Departemen tidak ditemukan.' }, 400);

  const leaveType = await c.env.DB.prepare(`SELECT id, code, name FROM leave_types WHERE id = ?`)
    .bind(leaveTypeId)
    .first<any>();
  if (!leaveType) return c.json({ error: 'Jenis cuti tidak ditemukan.' }, 400);

  if (['other', 'others'].includes(String(leaveType.code).toLowerCase()) && !otherNote) {
    return c.json({ error: 'Jelaskan jenis cuti "Others".' }, 400);
  }

  const employee = await c.env.DB.prepare(
    `SELECT id, full_name, manager_id FROM employees WHERE id = ?`
  )
    .bind(employeeId)
    .first<any>();
  if (!employee) return c.json({ error: 'Karyawan tidak ditemukan.' }, 404);

  // Working days, holiday-aware, is the number that actually gets deducted.
  const holidayRows = await c.env.DB.prepare(
    `SELECT date FROM holidays WHERE date BETWEEN ? AND ?`
  )
    .bind(startDate, endDate)
    .all<{ date: string }>();
  const holidays = (holidayRows.results || []).map((row) => row.date);

  const submissionDate = String(body.submission_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const totalDays = Number(body.total_days) > 0 ? Number(body.total_days) : undefined;

  let referenceNo: string;
  try {
    referenceNo = await nextReferenceNo(c.env, submissionDate);
  } catch (err: any) {
    // A missing column here means migration 0018 has not been applied.
    console.error('[leave] reference number failed:', err?.message || err);
    return c.json(
      { error: 'Gagal membuat nomor referensi. Pastikan migrasi database sudah dijalankan.' },
      500
    );
  }

  const requestId = makeId('lvr');
  const slaDueAt = workingDaySlaDueAt(submissionDate, holidays);
  const computedDays = totalDays ?? Math.max(1, countWorkingDaysFallback(startDate, endDate, holidays));

  const applicantCtx = await getEmployeeLevelContext(c.env.DB, { ...user, employeeId });
  let initialStatus: LeaveStatus = 'pending_administrator';
  if (hasLevelBypassOnly(applicantCtx, 'bypass_approval_chain')) {
    initialStatus = 'approved';
  } else if (
    hasLevelBypassOnly(applicantCtx, 'bypass_leave_admin_check') &&
    hasLevelBypassOnly(applicantCtx, 'bypass_leave_dept_head')
  ) {
    initialStatus = 'pending_management';
  } else if (hasLevelBypassOnly(applicantCtx, 'bypass_leave_admin_check')) {
    initialStatus = 'pending_dept_head';
  }

  await c.env.DB.prepare(
    `INSERT INTO leave_requests (
       id, tenant_id, employee_id, leave_type_id, start_date, end_date, total_days,
       reason, status, reference_no, submission_date, department_id, department_label,
       leave_type_label, leave_type_other_note, applicant_signature, applicant_signed_at,
       submitted_at, sla_due_at
     ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`
  )
    .bind(
      requestId,
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      computedDays,
      reason,
      initialStatus,
      referenceNo,
      submissionDate,
      department.id,
      department.name,
      leaveType.name,
      otherNote || null,
      signature,
      slaDueAt
    )
    .run();

  if (initialStatus === 'approved') {
    await applyApprovalSideEffects(c.env, {
      id: requestId,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_days: computedDays,
    });
  }

  await auditLeaveAction(c.env.DB, user.userId, 'LEAVE_SUBMITTED', requestId, {
    reference_no: referenceNo,
    status: initialStatus,
    department: department.name,
    leave_type: leaveType.name,
    total_days: computedDays,
    level_code: applicantCtx.level?.code ?? null,
  });

  return c.json(
    { message: 'Pengajuan cuti berhasil dikirim.', requestId, referenceNo, status: initialStatus, slaDueAt },
    201
  );
});

/** Shared working-day count (kept local so the route reads without extra imports). */
function countWorkingDaysFallback(fromISO: string, toISO: string, holidays: string[]): number {
  const holidaySet = new Set(holidays);
  const start = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    if (holidaySet.has(cursor.toISOString().slice(0, 10))) continue;
    days++;
  }
  return days;
}

// List applications, scoped by role.
leaveRoutes.get('/applications', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');
  const scope = c.req.query('scope');

  let sql = LEAVE_APPLICATION_SELECT;
  const where: string[] = [];
  const params: any[] = [];

  if (scope === 'mine' || user.role === 'employee') {
    where.push('lr.employee_id = ?');
    params.push(user.employeeId);
  } else {
    const scoped = scopeClause(user);
    if (scoped.sql) {
      where.push(scoped.sql.replace(/^WHERE /, ''));
      params.push(...scoped.params);
    }
  }

  if (status && status !== 'all') {
    where.push('lr.status = ?');
    params.push(status);
  }

  if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY COALESCE(lr.submitted_at, lr.created_at) DESC LIMIT 300`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>();
  return c.json({ applications: rows.results || [] });
});

// Conflict detection for the administrative check and department head review.
leaveRoutes.get(
  '/applications/conflicts',
  requireRole(['owner_admin', 'manager']),
  async (c) => {
    const departmentId = c.req.query('departmentId');
    const start = c.req.query('start');
    const end = c.req.query('end');
    const excludeId = c.req.query('excludeId');

    if (!departmentId || !start || !end) {
      return c.json({ error: 'departmentId, start dan end wajib diisi.' }, 400);
    }

    const conflicts = await findLeaveConflicts(c.env.DB, {
      departmentId,
      start,
      end,
      excludeId,
    });
    return c.json({ conflicts });
  }
);

// SLA summary for the dashboard badge.
leaveRoutes.get('/sla-summary', requireRole(['owner_admin']), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const row = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS open_count,
       SUM(CASE WHEN sla_due_at IS NOT NULL AND sla_due_at < ? THEN 1 ELSE 0 END) AS overdue
     FROM leave_requests
     WHERE status IN ('submitted', 'pending_administrator', 'pending_dept_head', 'pending_management')`
  )
    .bind(today)
    .first<any>();

  return c.json({
    open: Number(row?.open_count || 0),
    overdue: Number(row?.overdue || 0),
  });
});

// Single application with its stage history.
leaveRoutes.get('/applications/:id', async (c) => {
  const user = c.get('user');
  const request = await loadApplication(c.env.DB, c.req.param('id'));
  if (!request) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

  const isOwn = user.employeeId && request.employee_id === user.employeeId;
  const isReports = user.role === 'manager';
  if (user.role === 'employee' && !isOwn) return c.json({ error: 'Forbidden' }, 403);
  if (isReports && !isOwn && request.manager_id !== user.employeeId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const history = await c.env.DB.prepare(
    `SELECT id, action, user_id, new_values, created_at FROM audit_logs
     WHERE entity_type = 'leave_requests' AND entity_id = ?
     ORDER BY created_at ASC`
  )
    .bind(request.id)
    .all<any>();

  const letterhead = await loadLetterhead(c.env);

  return c.json({
    application: {
      ...request,
      submission_date_display: formatDDMMYY(request.submission_date || request.created_at || ''),
      start_date_display: formatDDMMYY(request.start_date || ''),
      end_date_display: formatDDMMYY(request.end_date || ''),
    },
    history: history.results || [],
    letterhead,
    rights: stageRights(user, request),
  });
});

// Stage 2 — administrative check.
leaveRoutes.post('/applications/:id/admin-check', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const request = await loadApplication(c.env.DB, c.req.param('id'));
  if (!request) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

  if (!canTransition(request.status, 'pending_dept_head')) {
    return c.json(
      { error: `Tidak dapat melakukan pemeriksaan administratif pada status "${request.status}".` },
      409
    );
  }

  const leaveTpl = await loadLeaveFormTemplate(c.env);
  const allowedAdminFlags = leaveTpl.config.adminClashFlags.length > 0
    ? leaveTpl.config.adminClashFlags
    : ADMIN_CLASH_FLAGS;
  const flags = parseFlags(body.admin_clash_checks, allowedAdminFlags);
  const otherReason = String(body.admin_other_reason || '').trim().slice(0, 500);

  if (flags.includes('Other reason') && !otherReason) {
    return c.json({ error: 'Isi keterangan untuk "Other reason".' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE leave_requests
     SET status = 'pending_dept_head',
         admin_clash_checks = ?,
         admin_other_reason = ?,
         admin_checked_by = ?,
         admin_checked_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(JSON.stringify(flags), otherReason || null, user.userId, request.id)
    .run();

  await auditLeaveAction(c.env.DB, user.userId, 'LEAVE_ADMIN_CHECKED', request.id, {
    admin_clash_checks: flags,
    admin_other_reason: otherReason || null,
    from: request.status,
    to: 'pending_dept_head',
  });

  return c.json({ message: 'Pemeriksaan administratif disimpan.', status: 'pending_dept_head' });
});

// Stage 3 — department head review.
leaveRoutes.post(
  '/applications/:id/dept-head-review',
  requireRole(['owner_admin', 'manager']),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const request = await loadApplication(c.env.DB, c.req.param('id'));
    if (!request) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

    // Only the applicant's own manager may act, unless it is an HR admin.
    if (user.role === 'manager' && request.manager_id !== user.employeeId) {
      return c.json({ error: 'Anda bukan atasan langsung karyawan ini.' }, 403);
    }

    if (!canTransition(request.status, 'pending_management')) {
      return c.json(
        { error: `Tidak dapat meninjau pada status "${request.status}". Pemeriksaan administratif harus selesai lebih dulu.` },
        409
      );
    }

    const decisionRaw = String(body.dept_head_decision || '').trim().toUpperCase();
    const decision = decisionRaw === 'NOT_APPROVED' ? 'NOT_APPROVED' : decisionRaw === 'APPROVED' ? 'APPROVED' : '';
    if (!decision) {
      return c.json({ error: 'Keputusan department head wajib dipilih.' }, 400);
    }

    const leaveTpl = await loadLeaveFormTemplate(c.env);
    const allowedDeptFlags = leaveTpl.config.deptHeadFlags.length > 0
      ? leaveTpl.config.deptHeadFlags
      : DEPT_HEAD_FLAGS;
    const issues = parseFlags(body.dept_head_issues, allowedDeptFlags);

    await c.env.DB.prepare(
      `UPDATE leave_requests
       SET status = 'pending_management',
           dept_head_issues = ?,
           dept_head_decision = ?,
           dept_head_decided_by = ?,
           dept_head_decided_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(JSON.stringify(issues), decision, user.userId, request.id)
      .run();

    await auditLeaveAction(c.env.DB, user.userId, 'LEAVE_DEPT_HEAD_REVIEWED', request.id, {
      dept_head_issues: issues,
      dept_head_decision: decision,
      from: request.status,
      to: 'pending_management',
    });

    return c.json({ message: 'Tinjauan department head disimpan.', status: 'pending_management' });
  }
);

// Stage 4 — final management decision. Requires a signature.
leaveRoutes.post('/applications/:id/management-decision', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const request = await loadApplication(c.env.DB, c.req.param('id'));
  if (!request) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

  const decisionRaw = String(body.management_decision || '').trim().toUpperCase();
  const nextStatus: LeaveStatus | null =
    decisionRaw === 'APPROVED' ? 'approved' : decisionRaw === 'NOT_APPROVED' ? 'rejected' : null;
  if (!nextStatus) {
    return c.json({ error: 'Keputusan management wajib dipilih.' }, 400);
  }

  const signature = String(body.management_signature || '').trim();
  if (!signature) {
    return c.json({ error: 'Tanda tangan management wajib diisi.' }, 400);
  }

  if (!canTransition(request.status, nextStatus)) {
    return c.json(
      { error: `Keputusan akhir tidak dapat diambil pada status "${request.status}".` },
      409
    );
  }

  await c.env.DB.prepare(
    `UPDATE leave_requests
     SET status = ?,
         management_decision = ?,
         management_signature = ?,
         management_signed_at = CURRENT_TIMESTAMP,
         management_by = ?,
         approved_by = ?,
         approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
         rejection_note = CASE WHEN ? = 'rejected' THEN ? ELSE rejection_note END
     WHERE id = ?`
  )
    .bind(
      nextStatus,
      decisionRaw,
      signature,
      user.userId,
      user.userId,
      nextStatus,
      nextStatus,
      String(body.note || '').trim().slice(0, 500) || null,
      request.id
    )
    .run();

  if (nextStatus === 'approved') {
    await applyApprovalSideEffects(c.env, request);
  }

  await auditLeaveAction(c.env.DB, user.userId, 'LEAVE_MANAGEMENT_DECIDED', request.id, {
    management_decision: decisionRaw,
    from: request.status,
    to: nextStatus,
  });

  await notifyLeaveOutcome(c, request, nextStatus, String(body.note || '').trim());

  return c.json({ message: 'Keputusan management tersimpan.', status: nextStatus });
});

// Override — management may force an outcome from any non-terminal status.
leaveRoutes.post('/applications/:id/override', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const request = await loadApplication(c.env.DB, c.req.param('id'));
  if (!request) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

  const raw = String(body.status || '').trim().toLowerCase();
  const nextStatus: LeaveStatus | null =
    raw === 'approved' ? 'approved' : raw === 'rejected' ? 'rejected' : raw === 'cancelled' ? 'cancelled' : null;
  if (!nextStatus) {
    return c.json({ error: 'Status override harus approved, rejected atau cancelled.' }, 400);
  }

  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!reason) return c.json({ error: 'Alasan override wajib diisi.' }, 400);

  if (request.status === 'cancelled' || request.status === 'rejected') {
    return c.json({ error: `Pengajuan yang sudah ${request.status} tidak dapat diubah.` }, 409);
  }
  if (request.status === 'approved' && nextStatus !== 'cancelled') {
    return c.json({ error: `Pengajuan yang sudah disetujui hanya dapat dibatalkan.` }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE leave_requests
     SET status = ?,
         override_reason = ?,
         management_decision = CASE WHEN ? = 'approved' THEN COALESCE(management_decision, 'APPROVED') WHEN ? = 'rejected' THEN COALESCE(management_decision, 'REJECTED') ELSE management_decision END,
         management_signed_at = CASE WHEN ? IN ('approved', 'rejected') THEN COALESCE(management_signed_at, CURRENT_TIMESTAMP) ELSE management_signed_at END,
         management_by = CASE WHEN ? IN ('approved', 'rejected') THEN COALESCE(management_by, ?) ELSE management_by END,
         approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
         approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
         rejection_note = CASE WHEN ? = 'rejected' THEN ? ELSE rejection_note END,
         cancelled_at = CASE WHEN ? = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
         cancelled_by = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_by END
     WHERE id = ?`
  )
    .bind(
      nextStatus,
      reason,
      nextStatus,
      nextStatus,
      nextStatus,
      nextStatus,
      user.userId,
      nextStatus,
      user.userId,
      nextStatus,
      nextStatus,
      reason,
      nextStatus,
      nextStatus,
      user.userId,
      request.id
    )
    .run();

  if (nextStatus === 'approved') {
    await applyApprovalSideEffects(c.env, request);
  }

  await auditLeaveAction(c.env.DB, user.userId, 'LEAVE_OVERRIDDEN', request.id, {
    from: request.status,
    to: nextStatus,
    reason,
  });

  if (nextStatus !== 'cancelled') {
    await notifyLeaveOutcome(c, request, nextStatus, reason);
  }

  return c.json({ message: 'Override tersimpan.', status: nextStatus });
});

// Delete a leave request (owner_admin only, e.g. cleaning up test entries).
// If the leave was already approved and side effects applied, restores the
// employee's leave balance and removes auto-created leave attendance rows.
leaveRoutes.delete('/requests/:id', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const req = await c.env.DB.prepare(`SELECT * FROM leave_requests WHERE id = ?`)
    .bind(id)
    .first<any>();
  if (!req) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

  if (req.side_effects_applied_at || req.status === 'approved') {
    const year = parseInt(String(req.start_date).slice(0, 4), 10) || new Date().getUTCFullYear();
    const days = Number(req.total_days || 0);
    if (days > 0) {
      await c.env.DB.prepare(
        `UPDATE leave_balances
         SET used_days = MAX(0, used_days - ?),
             remaining_days = remaining_days + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE employee_id = ? AND leave_type_id = ? AND year = ?`
      )
        .bind(days, days, req.employee_id, req.leave_type_id, year)
        .run();
    }

    await c.env.DB.prepare(
      `DELETE FROM attendance
       WHERE employee_id = ? AND date BETWEEN ? AND ?
         AND status IN ('on_leave', 'sick') AND clock_in_time IS NULL AND source = 'manual'`
    )
      .bind(req.employee_id, req.start_date, req.end_date)
      .run();
  }

  await c.env.DB.prepare(`DELETE FROM leave_requests WHERE id = ?`).bind(id).run();

  await auditLeaveAction(c.env.DB, user.userId, 'LEAVE_REQUEST_DELETED', id, {
    employee_id: req.employee_id,
    status: req.status,
    start_date: req.start_date,
    end_date: req.end_date,
  });

  return c.json({ message: 'Pengajuan cuti berhasil dihapus.' });
});

// Everything the client needs to render the printable document.
leaveRoutes.get('/applications/:id/print', async (c) => {
  const user = c.get('user');
  const request = await loadApplication(c.env.DB, c.req.param('id'));
  if (!request) return c.json({ error: 'Pengajuan cuti tidak ditemukan.' }, 404);

  const isOwn = user.employeeId && request.employee_id === user.employeeId;
  if (user.role === 'employee' && !isOwn) return c.json({ error: 'Forbidden' }, 403);
  if (user.role !== 'owner_admin' && user.role !== 'manager' && !isOwn) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // The printed form lists every department and leave type as a checkbox, so the
  // payload carries the full option sets rather than only this application's.
  const [departmentRows, leaveTypeRows, leaveTpl] = await Promise.all([
    c.env.DB.prepare(`SELECT name FROM departments ORDER BY name ASC`).all<any>(),
    c.env.DB.prepare(`SELECT name FROM leave_types ORDER BY name ASC`).all<any>(),
    loadLeaveFormTemplate(c.env),
  ]);

  return c.json({
    application: request,
    letterhead: await loadLetterhead(c.env),
    adminClashFlags: leaveTpl.config.adminClashFlags,
    deptHeadFlags: leaveTpl.config.deptHeadFlags,
    formTemplate: leaveTpl.config,
    // Full option lists so the printed form shows every checkbox, not just the
    // ones this application happens to use.
    departments: (departmentRows.results || []).map((row: any) => row.name),
    leaveTypes: (leaveTypeRows.results || []).map((row: any) => row.name),
    canPrint: user.role === 'owner_admin',
  });
});

/** Emails the applicant the final outcome. Silently skips a missing address. */
async function notifyLeaveOutcome(c: any, request: any, status: string, note: string): Promise<void> {
  if (!['approved', 'rejected'].includes(status)) return;

  const employee: any = await c.env.DB.prepare(
    `SELECT full_name, personal_email, company_email FROM employees WHERE id = ?`
  )
    .bind(request.employee_id)
    .first();
  const email = employee?.company_email || employee?.personal_email;
  if (!email) return;

  const company: any = await c.env.DB.prepare(
    `SELECT name, legal_name, custom_domain FROM companies LIMIT 1`
  ).first();
  const appUrl = company?.custom_domain
    ? company.custom_domain.startsWith('http')
      ? company.custom_domain
      : `https://${company.custom_domain}`
    : c.env.APP_URL || undefined;

  const content = getLeaveStatusEmail({
    employeeName: employee.full_name,
    leaveType: request.leave_type_label || request.leave_type_name || 'Leave',
    startDate: request.start_date,
    endDate: request.end_date,
    totalDays: Number(request.total_days),
    status: status as 'approved' | 'rejected',
    reviewerName: 'Management',
    note,
    appUrl,
    companyName: company?.legal_name || company?.name,
  });

  sendEmailInBackground(c, c.env, {
    to: email,
    subject:
      status === 'approved'
        ? 'Pengajuan cuti disetujui (Leave approved)'
        : 'Pengajuan cuti ditolak (Leave rejected)',
    text: content.text,
    html: content.html,
    type: 'leave_status',
  });
}

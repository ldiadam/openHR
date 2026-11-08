import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { putFile } from '../services/storage';

export const kasbonRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

kasbonRoutes.use('*', authMiddleware);

// 1. Request Kasbon (Employee Advance)
kasbonRoutes.post('/requests', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { amount, reason, total_instalments } = body;

  const employeeId = body.employee_id || user.employeeId;
  const numAmount = parseFloat(amount);
  const instalments = parseInt(total_instalments || '1', 10);

  if (!employeeId || !numAmount || numAmount <= 0 || !reason) {
    return c.json({ error: 'Jumlah kasbon dan alasan wajib diisi' }, 400);
  }

  const id = `ksb-${Date.now()}`;
  const instalmentAmount = Math.round(numAmount / instalments);

  await c.env.DB.prepare(
    `INSERT INTO kasbon (
      id, tenant_id, employee_id, amount, reason, total_instalments, remaining_amount, instalment_amount, status
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, ?, ?, 'pending'
    )`
  )
    .bind(id, employeeId, numAmount, reason, instalments, numAmount, instalmentAmount)
    .run();

  return c.json({ message: 'Pengajuan kasbon berhasil dikirim.', kasbonId: id });
});

kasbonRoutes.get('/requests', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT k.*, e.nik, e.full_name, e.job_title, d.name as department_name
    FROM kasbon k
    JOIN employees e ON k.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
  `;
  const params: any[] = [];

  if (user.role === 'employee') {
    query += ` WHERE k.employee_id = ?`;
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    query += ` WHERE e.manager_id = ? OR e.id = ?`;
    params.push(user.employeeId, user.employeeId);
  }

  query += ` ORDER BY k.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  return c.json({ kasbonList: rows.results || [] });
});

kasbonRoutes.post('/requests/:id/review', requireRole(['owner_admin', 'finance']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const { status, note } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE kasbon SET
      status = ?,
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?
     WHERE id = ?`
  )
    .bind(status, user.userId, note || null, id)
    .run();

  return c.json({ message: `Kasbon berhasil di-${status}.` });
});

// 2. Reimbursements
kasbonRoutes.post('/reimbursements', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { category, amount, description, receipt_photo_base64, payment_method } = body;

  const employeeId = body.employee_id || user.employeeId;
  const numAmount = parseFloat(amount);

  if (!employeeId || !category || !numAmount || numAmount <= 0 || !description) {
    return c.json({ error: 'Kategori, jumlah, dan deskripsi klaim reimbursement wajib diisi' }, 400);
  }

  let photoKey = null;
  if (receipt_photo_base64) {
    photoKey = `receipts/${employeeId}/${Date.now()}.jpg`;
    await putFile(c.env, {
      key: photoKey,
      data: receipt_photo_base64,
      contentType: 'image/jpeg',
    });
  }

  const id = `reimb-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO reimbursements (
      id, tenant_id, employee_id, category, amount, description, receipt_photo_key, payment_method, status
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, ?, ?, 'pending'
    )`
  )
    .bind(id, employeeId, category, numAmount, description, photoKey, payment_method || 'payroll')
    .run();

  return c.json({ message: 'Klaim reimbursement berhasil dikirim.', reimbursementId: id });
});

kasbonRoutes.get('/reimbursements', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT r.*, e.nik, e.full_name, e.job_title, d.name as department_name
    FROM reimbursements r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
  `;
  const params: any[] = [];

  if (user.role === 'employee') {
    query += ` WHERE r.employee_id = ?`;
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    query += ` WHERE e.manager_id = ? OR e.id = ?`;
    params.push(user.employeeId, user.employeeId);
  }

  query += ` ORDER BY r.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  return c.json({ reimbursements: rows.results || [] });
});

kasbonRoutes.post('/reimbursements/:id/review', requireRole(['owner_admin', 'finance', 'manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const { status, note } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE reimbursements SET
      status = ?,
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?
     WHERE id = ?`
  )
    .bind(status, user.userId, note || null, id)
    .run();

  return c.json({ message: `Reimbursement berhasil di-${status}.` });
});

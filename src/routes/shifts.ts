import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';

export const shiftRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

shiftRoutes.use('*', authMiddleware);

// 1. Shift Patterns
shiftRoutes.get('/patterns', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM shift_patterns ORDER BY start_time ASC`).all<any>();
  return c.json({ patterns: rows.results || [] });
});

shiftRoutes.post('/patterns', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { name, code, start_time, end_time, break_minutes } = body;

  if (!name || !code || !start_time || !end_time) {
    return c.json({ error: 'Nama, kode, jam mulai, dan jam selesai wajib diisi' }, 400);
  }

  const id = `shift-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO shift_patterns (id, tenant_id, name, code, start_time, end_time, break_minutes)
     VALUES (?, 'default', ?, ?, ?, ?, ?)`
  )
    .bind(id, name, code, start_time, end_time, parseInt(break_minutes || '60', 10))
    .run();

  return c.json({ message: 'Pola shift berhasil ditambahkan', shiftId: id });
});

// 2. Weekly Roster Grid
shiftRoutes.get('/roster', async (c) => {
  const startDate = c.req.query('start_date'); // YYYY-MM-DD
  const endDate = c.req.query('end_date'); // YYYY-MM-DD

  if (!startDate || !endDate) {
    return c.json({ error: 'start_date dan end_date diperlukan' }, 400);
  }

  const roster = await c.env.DB.prepare(
    `SELECT er.*, e.nik, e.full_name, e.job_title, sp.name as shift_name, sp.start_time, sp.end_time
     FROM employee_rosters er
     JOIN employees e ON er.employee_id = e.id
     LEFT JOIN shift_patterns sp ON er.shift_pattern_id = sp.id
     WHERE er.date BETWEEN ? AND ?
     ORDER BY er.date ASC, e.nik ASC`
  )
    .bind(startDate, endDate)
    .all<any>();

  return c.json({ roster: roster.results || [] });
});

shiftRoutes.post('/roster/batch', requireRole(['owner_admin', 'manager']), async (c) => {
  const { assignments } = await c.req.json();
  if (!Array.isArray(assignments)) {
    return c.json({ error: 'Assignments array diperlukan' }, 400);
  }

  for (const item of assignments) {
    const id = `ros-${item.employee_id}-${item.date}`;
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO employee_rosters (id, tenant_id, employee_id, date, shift_pattern_id, is_off)
       VALUES (?, 'default', ?, ?, ?, ?)`
    )
      .bind(id, item.employee_id, item.date, item.shift_pattern_id || null, item.is_off ? 1 : 0)
      .run();
  }

  return c.json({ message: `Berhasil mengatur ${assignments.length} penugasan shift.` });
});

// 3. Overtime Requests (Lembur)
shiftRoutes.post('/overtime/requests', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { date, start_time, end_time, planned_hours, reason, is_holiday_or_rest_day } = body;

  const employeeId = body.employee_id || user.employeeId;
  if (!employeeId || !date || !start_time || !end_time || !planned_hours || !reason) {
    return c.json({ error: 'Mohon lengkapi formulir pengajuan lembur' }, 400);
  }

  const otId = `ot-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO overtime_requests (
      id, tenant_id, employee_id, date, start_time, end_time, planned_hours, actual_hours, reason, is_holiday_or_rest_day, status
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
    )`
  )
    .bind(
      otId,
      employeeId,
      date,
      start_time,
      end_time,
      parseFloat(planned_hours),
      parseFloat(planned_hours), // defaults to planned hours until verified
      reason,
      is_holiday_or_rest_day ? 1 : 0
    )
    .run();

  return c.json({ message: 'Pengajuan lembur berhasil dikirim.', overtimeId: otId });
});

shiftRoutes.get('/overtime/requests', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT ot.*, e.nik, e.full_name, e.job_title, d.name as department_name
    FROM overtime_requests ot
    JOIN employees e ON ot.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
  `;

  const params: any[] = [];
  if (user.role === 'manager') {
    query += ` WHERE e.manager_id = ? OR e.id = ?`;
    params.push(user.employeeId, user.employeeId);
  } else if (user.role === 'employee') {
    query += ` WHERE ot.employee_id = ?`;
    params.push(user.employeeId);
  }

  query += ` ORDER BY ot.date DESC, ot.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  return c.json({ requests: rows.results || [] });
});

shiftRoutes.post('/overtime/requests/:id/review', requireRole(['owner_admin', 'manager']), async (c) => {
  const otId = c.req.param('id');
  const user = c.get('user');
  const { status, note, actual_hours } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  const ot = await c.env.DB.prepare(`SELECT * FROM overtime_requests WHERE id = ?`).bind(otId).first<any>();
  if (!ot) {
    return c.json({ error: 'Pengajuan lembur tidak ditemukan' }, 404);
  }

  const hoursToApprove = actual_hours !== undefined ? parseFloat(actual_hours) : ot.planned_hours;

  await c.env.DB.prepare(
    `UPDATE overtime_requests SET
      status = ?,
      actual_hours = ?,
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?
     WHERE id = ?`
  )
    .bind(status, hoursToApprove, user.userId, note || null, otId)
    .run();

  return c.json({ message: `Pengajuan lembur berhasil di-${status}.` });
});

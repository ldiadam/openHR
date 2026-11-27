import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { makeId } from '../utils/id';

export const offboardingRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

offboardingRoutes.use('*', authMiddleware);
offboardingRoutes.use('*', requireRole(['owner_admin', 'manager', 'finance']));

async function getEmployeeBlockers(db: D1Database, employeeId: string) {
  const [assetsRes, tasksRes, kasbonRes] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM asset_assignments WHERE employee_id = ? AND returned_at IS NULL`
      )
      .bind(employeeId)
      .first<any>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM tasks WHERE assignee_id = ? AND status NOT IN ('approved', 'rejected')`
      )
      .bind(employeeId)
      .first<any>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare(
        `SELECT COALESCE(SUM(remaining_amount), 0) AS bal FROM kasbon_loans WHERE employee_id = ? AND status = 'approved' AND remaining_amount > 0`
      )
      .bind(employeeId)
      .first<any>()
      .catch(() => ({ bal: 0 })),
  ]);

  return {
    unreturnedAssets: Number(assetsRes?.cnt || 0),
    openTasks: Number(tasksRes?.cnt || 0),
    kasbonBalance: Number(kasbonRes?.bal || 0),
  };
}

// List offboarding cases + active employees for initiation
offboardingRoutes.get('/', async (c) => {
  const [casesRes, employeesRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT oc.*,
              e.nik, e.full_name, e.job_title, d.name AS department_name,
              (SELECT COUNT(*) FROM offboarding_checklist_items oci WHERE oci.case_id = oc.id) AS total_items,
              (SELECT COUNT(*) FROM offboarding_checklist_items oci WHERE oci.case_id = oc.id AND oci.is_completed = 1) AS completed_items
       FROM offboarding_cases oc
       JOIN employees e ON e.id = oc.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ORDER BY oc.created_at DESC`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT id, nik, full_name, job_title FROM employees WHERE lifecycle_status NOT IN ('resigned', 'terminated') ORDER BY full_name ASC`
    ).all<any>(),
  ]);

  const casesWithBlockers = await Promise.all(
    (casesRes.results || []).map(async (row: any) => ({
      ...row,
      blockers: await getEmployeeBlockers(c.env.DB, row.employee_id),
    }))
  );

  return c.json({ cases: casesWithBlockers, employees: employeesRes.results || [] });
});

// Initiate offboarding case + default clearance checklist
offboardingRoutes.post('/', requireRole(['owner_admin', 'manager']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const employeeId = String(body.employee_id || '').trim();
  const resignationDate = String(body.resignation_date || '').trim();
  const lastWorkingDay = String(body.last_working_day || '').trim();
  if (!employeeId || !resignationDate || !lastWorkingDay) {
    return c.json({ error: 'Karyawan, tanggal pengajuan, dan hari kerja terakhir wajib diisi.' }, 400);
  }

  const caseId = crypto.randomUUID();
  const defaultItems = [
    { dept: 'IT & Assets', title: 'Return laptop, phone, keys, and access badges' },
    { dept: 'Operations / TMS', title: 'Hand over all open tasks & ongoing work' },
    { dept: 'Finance', title: 'Settle kasbon balance & outstanding petty cash' },
    { dept: 'HR', title: 'Complete exit interview & final settlement sign-off' },
  ];

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO offboarding_cases (id, employee_id, initiated_by, resignation_date, last_working_day, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'clearance_in_progress')`
    ).bind(
      caseId,
      employeeId,
      user.employeeId || user.userId,
      resignationDate,
      lastWorkingDay,
      body.reason ? String(body.reason).trim() : null
    ),
    ...defaultItems.map((item) =>
      c.env.DB.prepare(
        `INSERT INTO offboarding_checklist_items (id, case_id, department_label, title)
         VALUES (?, ?, ?, ?)`
      ).bind(makeId('obc'), caseId, item.dept, item.title)
    ),
  ]);

  return c.json({ id: caseId, status: 'clearance_in_progress' }, 201);
});

// Get case detail with checklist & live blockers
offboardingRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT oc.*, e.nik, e.full_name, e.job_title, d.name AS department_name
     FROM offboarding_cases oc
     JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE oc.id = ?`
  )
    .bind(id)
    .first<any>();
  if (!row) return c.json({ error: 'Kasus offboarding tidak ditemukan.' }, 404);

  const [itemsRes, blockers, blockerAssetsRes, blockerTasksRes] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM offboarding_checklist_items WHERE case_id = ?`).bind(id).all<any>(),
    getEmployeeBlockers(c.env.DB, row.employee_id),
    c.env.DB.prepare(
      `SELECT a.id, a.asset_tag, a.name FROM asset_assignments aa JOIN company_assets a ON a.id = aa.asset_id WHERE aa.employee_id = ? AND aa.returned_at IS NULL`
    )
      .bind(row.employee_id)
      .all<any>()
      .catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT id, reference_no, title, status FROM tasks WHERE assignee_id = ? AND status NOT IN ('approved', 'rejected')`
    )
      .bind(row.employee_id)
      .all<any>()
      .catch(() => ({ results: [] })),
  ]);

  return c.json({
    case: row,
    items: itemsRes.results || [],
    blockers,
    blockerDetails: {
      assets: blockerAssetsRes.results || [],
      tasks: blockerTasksRes.results || [],
    },
  });
});

// Add custom checklist item
offboardingRoutes.post('/:id/checklist', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const dept = String(body.department_label || 'HR').trim();
  if (!title) return c.json({ error: 'Judul item wajib diisi.' }, 400);

  const itemId = makeId('obc');
  await c.env.DB.prepare(
    `INSERT INTO offboarding_checklist_items (id, case_id, department_label, title) VALUES (?, ?, ?, ?)`
  )
    .bind(itemId, id, dept, title)
    .run();

  return c.json({ id: itemId }, 201);
});

// Toggle checklist item
offboardingRoutes.post('/:id/checklist/:itemId/toggle', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const itemId = c.req.param('itemId');

  const item = await c.env.DB.prepare(
    `SELECT * FROM offboarding_checklist_items WHERE id = ? AND case_id = ?`
  )
    .bind(itemId, id)
    .first<any>();
  if (!item) return c.json({ error: 'Item checklist tidak ditemukan.' }, 404);

  const nextVal = item.is_completed ? 0 : 1;
  await c.env.DB.prepare(
    `UPDATE offboarding_checklist_items
     SET is_completed = ?, completed_by = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = ?`
  )
    .bind(nextVal, user.name || user.email || 'HR', nextVal, itemId)
    .run();

  return c.json({ is_completed: nextVal });
});

// Complete offboarding & mark employee resigned
offboardingRoutes.post('/:id/complete', requireRole(['owner_admin']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const row = await c.env.DB.prepare(`SELECT * FROM offboarding_cases WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ error: 'Kasus offboarding tidak ditemukan.' }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE offboarding_cases
       SET status = 'completed', exit_interview_notes = COALESCE(?, exit_interview_notes),
           final_settlement_notes = COALESCE(?, final_settlement_notes),
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      body.exit_interview_notes ? String(body.exit_interview_notes) : null,
      body.final_settlement_notes ? String(body.final_settlement_notes) : null,
      id
    ),
    c.env.DB.prepare(
      `UPDATE employees SET lifecycle_status = 'resigned', resignation_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(row.last_working_day, row.employee_id),
  ]);

  return c.json({ status: 'completed' });
});

// Update offboarding case (dates, reason, exit interview / settlement notes)
offboardingRoutes.put('/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  await c.env.DB.prepare(
    `UPDATE offboarding_cases
     SET resignation_date = COALESCE(?, resignation_date),
         last_working_day = COALESCE(?, last_working_day),
         reason = COALESCE(?, reason),
         exit_interview_notes = COALESCE(?, exit_interview_notes),
         final_settlement_notes = COALESCE(?, final_settlement_notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.resignation_date ? String(body.resignation_date) : null,
      body.last_working_day ? String(body.last_working_day) : null,
      body.reason !== undefined ? String(body.reason).trim() : null,
      body.exit_interview_notes !== undefined ? String(body.exit_interview_notes).trim() : null,
      body.final_settlement_notes !== undefined ? String(body.final_settlement_notes).trim() : null,
      id
    )
    .run();

  return c.json({ updated: true });
});

// Delete offboarding case
offboardingRoutes.delete('/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM offboarding_cases WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { makeId } from '../utils/id';

export const performanceRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

performanceRoutes.use('*', authMiddleware);

// List review cycles, goals, and reviews (scoped for employee)
performanceRoutes.get('/', async (c) => {
  const user = c.get('user');
  const isStaffAdmin = user.role === 'owner_admin' || user.role === 'manager';

  const [cyclesRes, goalsRes, reviewsRes, employeesRes] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM review_cycles ORDER BY start_date DESC`).all<any>(),
    c.env.DB.prepare(
      `SELECT g.*, e.full_name AS employee_name, e.nik
       FROM performance_goals g
       JOIN employees e ON e.id = g.employee_id
       ${isStaffAdmin ? '' : 'WHERE g.employee_id = ?'}
       ORDER BY g.created_at DESC`
    )
      .bind(...(isStaffAdmin ? [] : [user.employeeId || '']))
      .all<any>(),
    c.env.DB.prepare(
      `SELECT r.*, e.full_name AS employee_name, e.nik, rev.full_name AS reviewer_name, rc.title AS cycle_title
       FROM performance_reviews r
       JOIN employees e ON e.id = r.employee_id
       JOIN review_cycles rc ON rc.id = r.cycle_id
       LEFT JOIN employees rev ON rev.id = r.reviewer_id
       ${isStaffAdmin ? '' : 'WHERE r.employee_id = ?'}
       ORDER BY r.created_at DESC`
    )
      .bind(...(isStaffAdmin ? [] : [user.employeeId || '']))
      .all<any>(),
    isStaffAdmin
      ? c.env.DB.prepare(
          `SELECT id, nik, full_name FROM employees WHERE lifecycle_status NOT IN ('resigned', 'terminated') ORDER BY full_name ASC`
        ).all<any>()
      : Promise.resolve({ results: [] }),
  ]);

  return c.json({
    cycles: cyclesRes.results || [],
    goals: goalsRes.results || [],
    reviews: reviewsRes.results || [],
    employees: employeesRes.results || [],
  });
});

// Create review cycle + auto-create reviews for active employees
performanceRoutes.post('/cycles', requireRole(['owner_admin', 'manager']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const title = String(body.title || '').trim();
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  if (!title || !startDate || !endDate) {
    return c.json({ error: 'Judul, tanggal mulai, dan tanggal selesai wajib diisi.' }, 400);
  }

  const cycleId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO review_cycles (id, title, cycle_type, start_date, end_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  )
    .bind(cycleId, title, String(body.cycle_type || 'annual'), startDate, endDate, user.employeeId || user.userId)
    .run();

  const activeEmps = await c.env.DB.prepare(
    `SELECT id, manager_id FROM employees WHERE lifecycle_status NOT IN ('resigned', 'terminated')`
  ).all<any>();

  const emps = activeEmps.results || [];
  if (emps.length > 0) {
    await c.env.DB.batch(
      emps.map((emp: any) =>
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO performance_reviews (id, cycle_id, employee_id, reviewer_id, status)
           VALUES (?, ?, ?, ?, 'pending_self')`
        ).bind(makeId('rev'), cycleId, emp.id, emp.manager_id || user.employeeId || null)
      )
    );
  }

  return c.json({ id: cycleId, reviews_created: emps.length }, 201);
});

// Update review cycle
performanceRoutes.put('/cycles/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare(
    `UPDATE review_cycles
     SET title = COALESCE(?, title),
         cycle_type = COALESCE(?, cycle_type),
         start_date = COALESCE(?, start_date),
         end_date = COALESCE(?, end_date),
         status = COALESCE(?, status)
     WHERE id = ?`
  )
    .bind(
      body.title ? String(body.title).trim() : null,
      body.cycle_type ? String(body.cycle_type) : null,
      body.start_date ? String(body.start_date) : null,
      body.end_date ? String(body.end_date) : null,
      body.status ? String(body.status) : null,
      id
    )
    .run();
  return c.json({ updated: true });
});

// Delete review cycle
performanceRoutes.delete('/cycles/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM review_cycles WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

// Add KPI / OKR goal
performanceRoutes.post('/goals', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const cycleId = String(body.cycle_id || '').trim();
  const employeeId = String(body.employee_id || user.employeeId || '').trim();
  const title = String(body.title || '').trim();
  if (!cycleId || !employeeId || !title) {
    return c.json({ error: 'Siklus, karyawan, dan judul target wajib diisi.' }, 400);
  }

  const id = makeId('goal');
  await c.env.DB.prepare(
    `INSERT INTO performance_goals (id, cycle_id, employee_id, title, metric, weight, target_value, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'on_track')`
  )
    .bind(
      id,
      cycleId,
      employeeId,
      title,
      body.metric ? String(body.metric) : null,
      Number(body.weight || 0) || 0,
      body.target_value ? String(body.target_value) : null
    )
    .run();

  return c.json({ id }, 201);
});

// Update KPI / OKR goal
performanceRoutes.put('/goals/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const goal = await c.env.DB.prepare(`SELECT * FROM performance_goals WHERE id = ?`).bind(id).first<any>();
  if (!goal) return c.json({ error: 'Target KPI tidak ditemukan.' }, 404);
  if (user.role !== 'owner_admin' && user.role !== 'manager' && goal.employee_id !== user.employeeId) {
    return c.json({ error: 'Akses ditolak.' }, 403);
  }

  await c.env.DB.prepare(
    `UPDATE performance_goals
     SET title = COALESCE(?, title),
         metric = COALESCE(?, metric),
         weight = COALESCE(?, weight),
         target_value = COALESCE(?, target_value),
         actual_value = COALESCE(?, actual_value),
         status = COALESCE(?, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.title ? String(body.title).trim() : null,
      body.metric !== undefined ? (body.metric ? String(body.metric).trim() : null) : null,
      body.weight !== undefined ? Number(body.weight) || 0 : null,
      body.target_value !== undefined ? (body.target_value ? String(body.target_value).trim() : null) : null,
      body.actual_value !== undefined ? (body.actual_value ? String(body.actual_value).trim() : null) : null,
      body.status ? String(body.status) : null,
      id
    )
    .run();

  return c.json({ updated: true });
});

// Delete KPI / OKR goal
performanceRoutes.delete('/goals/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const goal = await c.env.DB.prepare(`SELECT * FROM performance_goals WHERE id = ?`).bind(id).first<any>();
  if (!goal) return c.json({ error: 'Target KPI tidak ditemukan.' }, 404);
  if (user.role !== 'owner_admin' && user.role !== 'manager' && goal.employee_id !== user.employeeId) {
    return c.json({ error: 'Akses ditolak.' }, 403);
  }
  await c.env.DB.prepare(`DELETE FROM performance_goals WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

// Employee self-review
performanceRoutes.post('/reviews/:id/self', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const rev = await c.env.DB.prepare(`SELECT * FROM performance_reviews WHERE id = ?`).bind(id).first<any>();
  if (!rev) return c.json({ error: 'Penilaian tidak ditemukan.' }, 404);
  if (user.role !== 'owner_admin' && rev.employee_id !== user.employeeId) {
    return c.json({ error: 'Akses ditolak.' }, 403);
  }

  await c.env.DB.prepare(
    `UPDATE performance_reviews
     SET self_rating = ?, self_comments = ?, status = 'pending_manager', submitted_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(Number(body.rating || 0), String(body.comments || '').trim(), id)
    .run();

  return c.json({ status: 'pending_manager' });
});

// Manager review completion
performanceRoutes.post('/reviews/:id/manager', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const rev = await c.env.DB.prepare(`SELECT * FROM performance_reviews WHERE id = ?`).bind(id).first<any>();
  if (!rev) return c.json({ error: 'Penilaian tidak ditemukan.' }, 404);

  const mgrRating = Number(body.rating || 0);
  const finalRating = Number(body.final_rating || mgrRating);

  await c.env.DB.prepare(
    `UPDATE performance_reviews
     SET manager_rating = ?, manager_comments = ?, final_rating = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(mgrRating, String(body.comments || '').trim(), finalRating, id)
    .run();

  return c.json({ status: 'completed', final_rating: finalRating });
});

// Get single review with employee's KPI goals for that cycle + weighted achievement suggestion
performanceRoutes.get('/reviews/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const review = await c.env.DB.prepare(
    `SELECT r.*, e.full_name AS employee_name, e.nik, e.job_title, rev.full_name AS reviewer_name,
            rc.title AS cycle_title, rc.cycle_type, rc.start_date, rc.end_date
     FROM performance_reviews r
     JOIN employees e ON e.id = r.employee_id
     JOIN review_cycles rc ON rc.id = r.cycle_id
     LEFT JOIN employees rev ON rev.id = r.reviewer_id
     WHERE r.id = ?`
  )
    .bind(id)
    .first<any>();

  if (!review) return c.json({ error: 'Penilaian tidak ditemukan.' }, 404);
  if (user.role !== 'owner_admin' && user.role !== 'manager' && review.employee_id !== user.employeeId) {
    return c.json({ error: 'Akses ditolak.' }, 403);
  }

  const goalsRes = await c.env.DB.prepare(
    `SELECT * FROM performance_goals WHERE cycle_id = ? AND employee_id = ? ORDER BY created_at ASC`
  )
    .bind(review.cycle_id, review.employee_id)
    .all<any>();

  const goals = goalsRes.results || [];
  let totalWeight = 0;
  let weightedSum = 0;
  for (const g of goals) {
    const w = Number(g.weight || 0);
    if (w <= 0) continue;
    const t = parseFloat(String(g.target_value || '').replace(/[^0-9.-]/g, ''));
    const a = parseFloat(String(g.actual_value || '').replace(/[^0-9.-]/g, ''));
    let ratio = 0;
    if (!Number.isNaN(t) && t > 0 && !Number.isNaN(a) && a >= 0) {
      ratio = Math.min(a / t, 1.2);
    } else if (g.status === 'achieved') {
      ratio = 1;
    } else if (g.status === 'on_track') {
      ratio = 0.8;
    } else if (g.status === 'at_risk') {
      ratio = 0.5;
    } else {
      ratio = 0.2;
    }
    totalWeight += w;
    weightedSum += w * ratio;
  }

  const weightedAchievementPct = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : null;
  const suggestedRating =
    weightedAchievementPct !== null
      ? Math.max(1, Math.min(5, Math.round((weightedAchievementPct / 20) * 10) / 10))
      : null;

  return c.json({
    review,
    goals,
    total_weight: totalWeight,
    weighted_achievement_pct: weightedAchievementPct,
    suggested_rating: suggestedRating,
  });
});

// Delete review
performanceRoutes.delete('/reviews/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM performance_reviews WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

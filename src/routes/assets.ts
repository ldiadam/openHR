import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { makeId } from '../utils/id';

export const assetRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

assetRoutes.use('*', authMiddleware);

// List all company assets + current active assignment
assetRoutes.get('/', requireRole(['owner_admin', 'manager', 'finance']), async (c) => {
  const status = c.req.query('status') || '';
  const search = (c.req.query('search') || '').trim().toLowerCase();

  const [assetsRes, employeesRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT a.*,
              aa.id AS active_assignment_id,
              aa.employee_id AS holder_id,
              aa.assigned_at AS holder_since,
              aa.expected_return_at,
              e.full_name AS holder_name,
              e.nik AS holder_nik
       FROM company_assets a
       LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
       LEFT JOIN employees e ON e.id = aa.employee_id
       ORDER BY a.created_at DESC`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT id, nik, full_name FROM employees WHERE lifecycle_status NOT IN ('resigned', 'terminated') ORDER BY full_name ASC`
    ).all<any>(),
  ]);

  let list = assetsRes.results || [];
  if (status) list = list.filter((a: any) => a.status === status);
  if (search) {
    list = list.filter((a: any) =>
      `${a.asset_tag} ${a.name} ${a.serial_number || ''} ${a.holder_name || ''}`.toLowerCase().includes(search)
    );
  }

  return c.json({ assets: list, employees: employeesRes.results || [] });
});

// Employee's own assigned assets
assetRoutes.get('/mine', async (c) => {
  const user = c.get('user');
  if (!user.employeeId) return c.json({ assets: [] });

  const rows = await c.env.DB.prepare(
    `SELECT a.*, aa.assigned_at, aa.expected_return_at, aa.condition_out
     FROM asset_assignments aa
     JOIN company_assets a ON a.id = aa.asset_id
     WHERE aa.employee_id = ? AND aa.returned_at IS NULL
     ORDER BY aa.assigned_at DESC`
  )
    .bind(user.employeeId)
    .all<any>();

  return c.json({ assets: rows.results || [] });
});

// Get single asset + assignment history
assetRoutes.get('/:id', requireRole(['owner_admin', 'manager', 'finance']), async (c) => {
  const id = c.req.param('id');
  const asset = await c.env.DB.prepare(`SELECT * FROM company_assets WHERE id = ?`).bind(id).first<any>();
  if (!asset) return c.json({ error: 'Aset tidak ditemukan.' }, 404);

  const historyRes = await c.env.DB.prepare(
    `SELECT aa.*, e.full_name AS employee_name, e.nik AS employee_nik, d.name AS department_name
     FROM asset_assignments aa
     JOIN employees e ON e.id = aa.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE aa.asset_id = ?
     ORDER BY aa.assigned_at DESC`
  )
    .bind(id)
    .all<any>();

  return c.json({ asset, history: historyRes.results || [] });
});

// Create asset
assetRoutes.post('/', requireRole(['owner_admin', 'manager']), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const assetTag = String(body.asset_tag || '').trim();
  const name = String(body.name || '').trim();
  if (!assetTag || !name) {
    return c.json({ error: 'Kode aset dan nama aset wajib diisi.' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO company_assets (id, asset_tag, name, category, serial_number, purchase_date, purchase_cost, condition, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)`
  )
    .bind(
      id,
      assetTag,
      name,
      String(body.category || 'laptop'),
      body.serial_number ? String(body.serial_number).trim() : null,
      body.purchase_date ? String(body.purchase_date) : null,
      Number(body.purchase_cost || 0) || 0,
      String(body.condition || 'good'),
      body.notes ? String(body.notes).trim() : null
    )
    .run();

  return c.json({ id, asset_tag: assetTag, status: 'available' }, 201);
});

// Update asset
assetRoutes.put('/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  await c.env.DB.prepare(
    `UPDATE company_assets
     SET asset_tag = COALESCE(?, asset_tag),
         name = COALESCE(?, name),
         category = COALESCE(?, category),
         serial_number = COALESCE(?, serial_number),
         purchase_date = COALESCE(?, purchase_date),
         purchase_cost = COALESCE(?, purchase_cost),
         condition = COALESCE(?, condition),
         status = COALESCE(?, status),
         notes = COALESCE(?, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.asset_tag ? String(body.asset_tag).trim() : null,
      body.name ? String(body.name).trim() : null,
      body.category ? String(body.category) : null,
      body.serial_number !== undefined ? (body.serial_number ? String(body.serial_number).trim() : null) : null,
      body.purchase_date !== undefined ? (body.purchase_date ? String(body.purchase_date) : null) : null,
      body.purchase_cost !== undefined ? Number(body.purchase_cost || 0) : null,
      body.condition ? String(body.condition) : null,
      body.status ? String(body.status) : null,
      body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : null,
      id
    )
    .run();

  return c.json({ updated: true });
});

// Delete asset
assetRoutes.delete('/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM company_assets WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

// Assign asset to employee
assetRoutes.post('/:id/assign', requireRole(['owner_admin', 'manager']), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const employeeId = String(body.employee_id || '').trim();
  if (!employeeId) return c.json({ error: 'Karyawan penerima wajib dipilih.' }, 400);

  const asset = await c.env.DB.prepare(`SELECT * FROM company_assets WHERE id = ?`).bind(id).first<any>();
  if (!asset) return c.json({ error: 'Aset tidak ditemukan.' }, 404);
  if (asset.status === 'assigned') return c.json({ error: 'Aset sedang dipinjamkan ke karyawan lain.' }, 400);

  const assignId = makeId('asg');
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO asset_assignments (id, asset_id, employee_id, assigned_by, expected_return_at, condition_out, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      assignId,
      id,
      employeeId,
      user.employeeId || user.userId,
      body.expected_return_at ? String(body.expected_return_at) : null,
      String(body.condition_out || asset.condition || 'good'),
      body.notes ? String(body.notes).trim() : null
    ),
    c.env.DB.prepare(
      `UPDATE company_assets SET status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id),
  ]);

  return c.json({ assignment_id: assignId, status: 'assigned' });
});

// Return asset from employee
assetRoutes.post('/:id/return', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const conditionIn = String(body.condition_in || 'good');

  const active = await c.env.DB.prepare(
    `SELECT id FROM asset_assignments WHERE asset_id = ? AND returned_at IS NULL LIMIT 1`
  )
    .bind(id)
    .first<any>();
  if (!active) return c.json({ error: 'Aset tidak sedang dipinjamkan.' }, 400);

  const nextStatus = conditionIn === 'damaged' ? 'maintenance' : 'available';
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE asset_assignments SET returned_at = CURRENT_TIMESTAMP, condition_in = ?, notes = COALESCE(?, notes) WHERE id = ?`
    ).bind(conditionIn, body.notes ? String(body.notes).trim() : null, active.id),
    c.env.DB.prepare(
      `UPDATE company_assets SET status = ?, condition = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(nextStatus, conditionIn, id),
  ]);

  return c.json({ status: nextStatus });
});

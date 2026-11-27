import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { putFile, getFile } from '../services/storage';
import { makeId } from '../utils/id';

export const announcementRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

announcementRoutes.use('*', authMiddleware);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// List announcements (scoped for employee, full + ack stats for HR/admin/manager)
announcementRoutes.get('/', async (c) => {
  const user = c.get('user');
  const isStaffAdmin = user.role === 'owner_admin' || user.role === 'manager';

  let empMeta: { id: string; department_id: string | null; branch_id: string | null } | null = null;
  if (user.employeeId) {
    empMeta = await c.env.DB.prepare(
      `SELECT id, department_id, branch_id FROM employees WHERE id = ?`
    )
      .bind(user.employeeId)
      .first<any>();
  }

  const [rowsRes, activeEmpCountRow, deptsRes, branchesRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT a.*,
              pub.full_name AS publisher_name,
              (SELECT COUNT(*) FROM announcement_acks ack WHERE ack.announcement_id = a.id) AS ack_count,
              ${
                user.employeeId
                  ? `(SELECT acknowledged_at FROM announcement_acks ack WHERE ack.announcement_id = a.id AND ack.employee_id = ?) AS my_ack_at`
                  : `NULL AS my_ack_at`
              }
       FROM announcements a
       LEFT JOIN employees pub ON pub.id = a.published_by
       ORDER BY a.pinned DESC, a.published_at DESC`
    )
      .bind(...(user.employeeId ? [user.employeeId] : []))
      .all<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM employees WHERE lifecycle_status NOT IN ('resigned', 'terminated')`
    ).first<any>(),
    c.env.DB.prepare(`SELECT id, name FROM departments ORDER BY name ASC`).all<any>(),
    c.env.DB.prepare(`SELECT id, name FROM branches ORDER BY name ASC`).all<any>(),
  ]);

  const totalActiveEmployees = Number(activeEmpCountRow?.cnt || 0);
  const today = new Date().toISOString().slice(0, 10);

  const list = (rowsRes.results || []).filter((row: any) => {
    if (isStaffAdmin) return true;
    if (row.expires_at && row.expires_at < today) return false;
    if (row.target_scope === 'department' && row.target_id) {
      return empMeta?.department_id === row.target_id;
    }
    if (row.target_scope === 'branch' && row.target_id) {
      return empMeta?.branch_id === row.target_id;
    }
    return true;
  });

  return c.json({
    announcements: list.map((r: any) => ({
      ...r,
      acknowledged: Boolean(r.my_ack_at),
      attachment_url: r.attachment_key ? `/api/announcements/${r.id}/attachment` : null,
    })),
    totalActiveEmployees,
    departments: deptsRes.results || [],
    branches: branchesRes.results || [],
  });
});

// Who Read / Who Hasn't breakdown for HR/Admin/Manager
announcementRoutes.get('/:id/acks', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const ann = await c.env.DB.prepare(`SELECT * FROM announcements WHERE id = ?`).bind(id).first<any>();
  if (!ann) return c.json({ error: 'Pengumuman tidak ditemukan.' }, 404);

  const [empsRes, acksRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT e.id, e.nik, e.full_name, e.department_id, e.branch_id, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.lifecycle_status NOT IN ('resigned', 'terminated')
       ORDER BY e.full_name ASC`
    ).all<any>(),
    c.env.DB.prepare(`SELECT employee_id, acknowledged_at FROM announcement_acks WHERE announcement_id = ?`)
      .bind(id)
      .all<any>(),
  ]);

  const ackMap = new Map<string, string>();
  for (const a of acksRes.results || []) ackMap.set(a.employee_id, a.acknowledged_at);

  const targetEmps = (empsRes.results || []).filter((e: any) => {
    if (ann.target_scope === 'department' && ann.target_id) return e.department_id === ann.target_id;
    if (ann.target_scope === 'branch' && ann.target_id) return e.branch_id === ann.target_id;
    return true;
  });

  const acked = targetEmps
    .filter((e: any) => ackMap.has(e.id))
    .map((e: any) => ({ ...e, acknowledged_at: ackMap.get(e.id) }));
  const pending = targetEmps.filter((e: any) => !ackMap.has(e.id));

  return c.json({ announcement: ann, acked, pending });
});

// Create announcement
announcementRoutes.post('/', requireRole(['owner_admin', 'manager']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const title = String(body.title || '').trim();
  const content = String(body.body || '').trim();
  if (!title || !content) {
    return c.json({ error: 'Judul dan isi pengumuman wajib diisi.' }, 400);
  }

  const id = crypto.randomUUID();
  const category = ['memo', 'policy', 'sop', 'holiday'].includes(String(body.category))
    ? String(body.category)
    : 'memo';
  const targetScope = ['all', 'department', 'branch'].includes(String(body.target_scope))
    ? String(body.target_scope)
    : 'all';

  await c.env.DB.prepare(
    `INSERT INTO announcements (
      id, title, body, category, target_scope, target_id, require_ack, pinned, published_by, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      title,
      content,
      category,
      targetScope,
      body.target_id ? String(body.target_id) : null,
      body.require_ack ? 1 : 0,
      body.pinned ? 1 : 0,
      user.employeeId || user.userId,
      body.expires_at ? String(body.expires_at) : null
    )
    .run();

  return c.json({ id, title }, 201);
});

// Update announcement
announcementRoutes.put('/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const category = ['memo', 'policy', 'sop', 'holiday'].includes(String(body.category))
    ? String(body.category)
    : undefined;

  const targetScope = ['all', 'department', 'branch'].includes(String(body.target_scope))
    ? String(body.target_scope)
    : undefined;

  await c.env.DB.prepare(
    `UPDATE announcements
     SET title = COALESCE(?, title),
         body = COALESCE(?, body),
         category = COALESCE(?, category),
         target_scope = COALESCE(?, target_scope),
         target_id = CASE WHEN ? IS NOT NULL THEN ? ELSE target_id END,
         require_ack = COALESCE(?, require_ack),
         pinned = COALESCE(?, pinned),
         expires_at = COALESCE(?, expires_at)
     WHERE id = ?`
  )
    .bind(
      body.title ? String(body.title).trim() : null,
      body.body ? String(body.body).trim() : null,
      category ?? null,
      targetScope ?? null,
      targetScope ?? null,
      targetScope === 'all' ? null : (body.target_id ? String(body.target_id) : null),
      body.require_ack !== undefined ? (body.require_ack ? 1 : 0) : null,
      body.pinned !== undefined ? (body.pinned ? 1 : 0) : null,
      body.expires_at !== undefined ? (body.expires_at ? String(body.expires_at) : null) : null,
      id
    )
    .run();

  return c.json({ updated: true });
});

// Upload attachment to announcement
announcementRoutes.post('/:id/attachment', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT id FROM announcements WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ error: 'Pengumuman tidak ditemukan.' }, 404);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return c.json({ error: 'File wajib dipilih.' }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return c.json({ error: 'Ukuran file maksimal 10 MB.' }, 400);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `announcements/${id}/${makeId('doc')}-${safeName}`;
  await putFile(c.env, key, await file.arrayBuffer(), file.type || 'application/octet-stream');

  await c.env.DB.prepare(`UPDATE announcements SET attachment_key = ?, attachment_name = ? WHERE id = ?`)
    .bind(key, file.name, id)
    .run();

  return c.json({ attachment_name: file.name, attachment_url: `/api/announcements/${id}/attachment` });
});

// Download attachment
announcementRoutes.get('/:id/attachment', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT attachment_key, attachment_name FROM announcements WHERE id = ?`
  )
    .bind(id)
    .first<any>();
  if (!row?.attachment_key) return c.json({ error: 'Lampiran tidak ditemukan.' }, 404);

  const file = await getFile(c.env, row.attachment_key);
  if (!file) return c.json({ error: 'File tidak ditemukan di penyimpanan.' }, 404);

  c.header('Content-Type', file.contentType || 'application/octet-stream');
  c.header('Content-Disposition', `inline; filename="${row.attachment_name || 'document'}"`);
  return c.body(file.data);
});

// Employee acknowledges reading announcement/policy
announcementRoutes.post('/:id/ack', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user.employeeId) {
    return c.json({ error: 'Akun tidak terhubung dengan data karyawan.' }, 400);
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM announcements WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ error: 'Pengumuman tidak ditemukan.' }, 404);

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO announcement_acks (id, announcement_id, employee_id)
     VALUES (?, ?, ?)`
  )
    .bind(makeId('ack'), id, user.employeeId)
    .run();

  return c.json({ acknowledged: true });
});

// Delete announcement
announcementRoutes.delete('/:id', requireRole(['owner_admin', 'manager']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM announcements WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

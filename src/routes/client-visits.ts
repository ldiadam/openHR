import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { decodeBase64Image, getFile, putFile } from '../services/storage';
import { makeId } from '../utils/id';

export const clientVisitRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

clientVisitRoutes.use('*', authMiddleware);

function todayLocal(tz = 'Asia/Jakarta'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function nowTimeLocal(tz = 'Asia/Jakarta'): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
  } catch {
    return new Date().toISOString().slice(11, 19);
  }
}

// List client visits (employees see their own; HR/Managers see team/all)
clientVisitRoutes.get('/', async (c) => {
  const user = c.get('user');
  const date = c.req.query('date');
  const scope = c.req.query('scope');

  let query = `
    SELECT cv.*, e.full_name, e.nik, e.job_title, d.name as department_name
    FROM client_visits cv
    JOIN employees e ON cv.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (scope === 'mine' || user.role === 'employee') {
    query += ` AND cv.employee_id = ?`;
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    query += ` AND (e.manager_id = ? OR e.id = ?)`;
    params.push(user.employeeId, user.employeeId);
  }

  if (date) {
    query += ` AND cv.visit_date = ?`;
    params.push(date);
  }

  query += ` ORDER BY cv.visit_date DESC, cv.check_in_time DESC LIMIT 200`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();
  return c.json({ visits: rows.results || [] });
});

// Check in at a client location
clientVisitRoutes.post('/check-in', async (c) => {
  const user = c.get('user');
  if (!user.employeeId) return c.json({ error: 'Akun tidak terhubung ke data karyawan.' }, 400);

  const body = await c.req.json();
  const clientName = String(body.client_name || '').trim();
  if (!clientName) return c.json({ error: 'Nama klien wajib diisi.' }, 400);

  const emp = await c.env.DB.prepare(
    `SELECT e.id, b.timezone as branch_timezone FROM employees e LEFT JOIN branches b ON e.branch_id = b.id WHERE e.id = ?`
  )
    .bind(user.employeeId)
    .first<any>();

  const tz = emp?.branch_timezone || 'Asia/Jakarta';
  const visitDate = String(body.visit_date || '').trim() || todayLocal(tz);
  const checkInTime = String(body.check_in_time || '').trim() || nowTimeLocal(tz);
  const id = makeId('cv');

  let photoKey: string | null = null;
  if (typeof body.photo_base64 === 'string' && body.photo_base64.trim()) {
    const decoded = decodeBase64Image(body.photo_base64);
    if (decoded && decoded.bytes.byteLength > 0) {
      photoKey = `client-visits/${user.employeeId}/${id}-in.jpg`;
      await putFile(c.env, { key: photoKey, data: decoded.bytes, contentType: decoded.contentType });
    }
  }

  const lat = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
  const lng = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;

  await c.env.DB.prepare(
    `INSERT INTO client_visits (
      id, tenant_id, employee_id, client_name, company_name, purpose, notes,
      visit_date, check_in_time, check_in_lat, check_in_lng, photo_key, status
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'checked_in')`
  )
    .bind(
      id,
      user.employeeId,
      clientName,
      body.company_name ? String(body.company_name).trim() : null,
      body.purpose ? String(body.purpose).trim() : null,
      body.notes ? String(body.notes).trim() : null,
      visitDate,
      checkInTime,
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null,
      photoKey
    )
    .run();

  const created = await c.env.DB.prepare(`SELECT * FROM client_visits WHERE id = ?`).bind(id).first<any>();
  return c.json({ message: 'Check-in kunjungan klien berhasil dicatat.', visit: created }, 201);
});

// Check out from a client visit
clientVisitRoutes.post('/:id/check-out', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT * FROM client_visits WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ error: 'Data kunjungan tidak ditemukan.' }, 404);
  if (existing.employee_id !== user.employeeId && user.role !== 'owner_admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const emp = await c.env.DB.prepare(
    `SELECT b.timezone as branch_timezone FROM employees e LEFT JOIN branches b ON e.branch_id = b.id WHERE e.id = ?`
  )
    .bind(existing.employee_id)
    .first<any>();

  const tz = emp?.branch_timezone || 'Asia/Jakarta';
  const checkOutTime = String(body.check_out_time || '').trim() || nowTimeLocal(tz);

  let checkoutPhotoKey = existing.checkout_photo_key;
  if (typeof body.photo_base64 === 'string' && body.photo_base64.trim()) {
    const decoded = decodeBase64Image(body.photo_base64);
    if (decoded && decoded.bytes.byteLength > 0) {
      checkoutPhotoKey = `client-visits/${existing.employee_id}/${id}-out.jpg`;
      await putFile(c.env, { key: checkoutPhotoKey, data: decoded.bytes, contentType: decoded.contentType });
    }
  }

  const lat = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
  const lng = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;
  const notes = body.notes !== undefined ? (String(body.notes).trim() || existing.notes) : existing.notes;

  await c.env.DB.prepare(
    `UPDATE client_visits
     SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, checkout_photo_key = ?,
         notes = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      checkOutTime,
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null,
      checkoutPhotoKey,
      notes,
      id
    )
    .run();

  const updated = await c.env.DB.prepare(`SELECT * FROM client_visits WHERE id = ?`).bind(id).first<any>();
  return c.json({ message: 'Check-out kunjungan klien selesai.', visit: updated });
});

clientVisitRoutes.get('/:id/photo', async (c) => {
  const id = c.req.param('id');
  const type = c.req.query('type') === 'out' ? 'out' : 'in';
  const visit = await c.env.DB.prepare(`SELECT photo_key, checkout_photo_key FROM client_visits WHERE id = ?`).bind(id).first<any>();
  const key = type === 'out' ? visit?.checkout_photo_key : visit?.photo_key;
  if (!key) return c.json({ error: 'Photo not found' }, 404);
  const file = await getFile(c.env, key);
  if (!file) return c.json({ error: 'Photo not found' }, 404);
  c.header('Content-Type', file.contentType || 'image/jpeg');
  return c.body(file.data as any);
});

clientVisitRoutes.delete('/:id', requireRole(['owner_admin']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM client_visits WHERE id = ?`).bind(id).run();
  return c.json({ message: 'Data kunjungan klien dihapus.' });
});

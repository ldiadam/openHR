import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware } from '../middleware/auth';
import { putFile, getFile } from '../services/storage';
import { makeId } from '../utils/id';
import { parseModulesConfig } from '../../shared/modules';
import { sendEmailInBackground } from '../services/smtp';

export const taskRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

taskRoutes.use('*', authMiddleware);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_STATUSES = new Set(['open', 'in_progress', 'rescheduled', 'pending_approval', 'approved', 'rejected']);
const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const ALLOWED_ROUTERS = new Set(['routine', 'adhoc', 'daily', 'weekly', 'monthly']);

function todayYYMMDD(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

async function nextTaskReferenceNo(db: D1Database): Promise<string> {
  const prefix = `TMS ${todayYYMMDD()}`;
  const row = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM tasks WHERE reference_no LIKE ?`)
    .bind(`${prefix}%`)
    .first<any>();
  const seq = Number(row?.cnt || 0) + 1;
  return `${prefix} ${String(seq).padStart(6, '0')}`;
}

async function resolveActorEmployee(db: D1Database, user: AuthContext['user']) {
  if (user.employeeId) {
    const emp = await db
      .prepare(`SELECT id, full_name, nik, department_id FROM employees WHERE id = ?`)
      .bind(user.employeeId)
      .first<any>();
    if (emp) return emp;
  }
  return {
    id: user.employeeId || user.userId,
    full_name: user.name || user.email || 'User',
    nik: null,
    department_id: null,
  };
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function canAccessTask(task: any, user: AuthContext['user']): boolean {
  if (user.role === 'owner_admin' || user.role === 'manager') return true;
  const empId = user.employeeId;
  if (!empId) return false;
  if (task.assignor_id === empId || task.assignee_id === empId) return true;
  const watchers = parseJsonSafe<string[]>(task.watchers_json, []);
  return watchers.includes(empId);
}

async function logActivity(
  db: D1Database,
  params: {
    taskId: string;
    actorId: string;
    actorName: string;
    actionType: string;
    statusAfter?: string | null;
    note?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  const id = makeId('tact');
  await db
    .prepare(
      `INSERT INTO task_activities (id, task_id, actor_id, actor_name, action_type, status_after, note, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.taskId,
      params.actorId,
      params.actorName,
      params.actionType,
      params.statusAfter || null,
      params.note || null,
      JSON.stringify(params.meta || {})
    )
    .run();
  return id;
}

// 1. Metadata for Task creation & filters (employees + configured reference fields)
taskRoutes.get('/meta', async (c) => {
  const [employeesRes, company, nextReferenceNo] = await Promise.all([
    c.env.DB.prepare(
      `SELECT e.id, e.nik, e.full_name,
              (SELECT u.email FROM users u WHERE u.employee_id = e.id LIMIT 1) AS email,
              e.job_title, e.department_id, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.lifecycle_status NOT IN ('resigned', 'terminated')
       ORDER BY e.full_name ASC`
    ).all<any>(),
    c.env.DB.prepare(`SELECT name, modules_json FROM companies WHERE tenant_id = 'default' LIMIT 1`)
      .first<any>()
      .catch(() => null),
    nextTaskReferenceNo(c.env.DB),
  ]);

  const modules = parseModulesConfig(company?.modules_json);
  return c.json({
    companyName: company?.name || 'Company',
    nextReferenceNo,
    employees: employeesRes.results || [],
    referencePreset: modules.task_reference_preset,
    referenceFields: modules.task_reference_fields,
  });
});

// 2. List tasks with tabs & counts
taskRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tab = (c.req.query('tab') || 'inbox').toLowerCase();
  const status = c.req.query('status') || '';
  const priority = c.req.query('priority') || '';
  const category = c.req.query('category') || '';
  const search = (c.req.query('search') || '').trim().toLowerCase();

  const rowsRes = await c.env.DB.prepare(
    `SELECT t.*,
            asor.full_name AS assignor_name, asor.nik AS assignor_nik, d_asor.name AS assignor_department,
            asee.full_name AS assignee_name, asee.nik AS assignee_nik, d_asee.name AS assignee_department,
            comp.full_name AS completed_by_name,
            appr.full_name AS approved_by_name,
            (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count
     FROM tasks t
     LEFT JOIN employees asor ON asor.id = t.assignor_id
     LEFT JOIN departments d_asor ON d_asor.id = asor.department_id
     LEFT JOIN employees asee ON asee.id = t.assignee_id
     LEFT JOIN departments d_asee ON d_asee.id = asee.department_id
     LEFT JOIN employees comp ON comp.id = t.completed_by
     LEFT JOIN employees appr ON appr.id = t.approved_by
     ORDER BY t.created_at DESC`
  ).all<any>();

  const allAccessible = (rowsRes.results || [])
    .filter((row: any) => canAccessTask(row, user))
    .map((row: any) => ({
      ...row,
      watchers: parseJsonSafe<string[]>(row.watchers_json, []),
      reference_meta: parseJsonSafe<Record<string, string>>(row.reference_meta_json, {}),
    }));

  const empId = user.employeeId || '';
  const nowIso = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const isClosed = (s: string) => s === 'approved' || s === 'rejected';

  const counts = {
    inbox: allAccessible.filter((t: any) => t.assignee_id === empId && !isClosed(t.status) && t.status !== 'pending_approval').length,
    assigned: allAccessible.filter((t: any) => t.assignor_id === empId && !isClosed(t.status)).length,
    approvals: allAccessible.filter(
      (t: any) =>
        t.status === 'pending_approval' &&
        (t.assignor_id === empId || user.role === 'owner_admin' || user.role === 'manager')
    ).length,
    results: allAccessible.filter((t: any) => isClosed(t.status)).length,
    overdue: allAccessible.filter((t: any) => !isClosed(t.status) && t.due_at && t.due_at < nowIso).length,
    total: allAccessible.length,
  };

  let filtered = allAccessible;
  if (tab === 'inbox') {
    filtered = filtered.filter((t: any) => t.assignee_id === empId && !isClosed(t.status));
  } else if (tab === 'assigned') {
    filtered = filtered.filter((t: any) => t.assignor_id === empId && !isClosed(t.status));
  } else if (tab === 'approvals') {
    filtered = filtered.filter(
      (t: any) =>
        t.status === 'pending_approval' &&
        (t.assignor_id === empId || user.role === 'owner_admin' || user.role === 'manager')
    );
  } else if (tab === 'results') {
    filtered = filtered.filter((t: any) => isClosed(t.status));
  }

  if (status && ALLOWED_STATUSES.has(status)) {
    filtered = filtered.filter((t: any) => t.status === status);
  }
  if (priority && ALLOWED_PRIORITIES.has(priority)) {
    filtered = filtered.filter((t: any) => t.priority === priority);
  }
  if (category) {
    filtered = filtered.filter((t: any) => String(t.category || '').toLowerCase() === category.toLowerCase());
  }
  if (search) {
    filtered = filtered.filter((t: any) => {
      const metaText = Object.values(t.reference_meta || {}).join(' ').toLowerCase();
      return (
        String(t.reference_no || '').toLowerCase().includes(search) ||
        String(t.title || '').toLowerCase().includes(search) ||
        String(t.description || '').toLowerCase().includes(search) ||
        String(t.assignee_name || '').toLowerCase().includes(search) ||
        String(t.assignor_name || '').toLowerCase().includes(search) ||
        metaText.includes(search)
      );
    });
  }

  return c.json({ tasks: filtered, counts });
});

// 3. Create new task (Section A)
taskRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const assigneeId = String(body.assignee_id || '').trim();
  const dueAt = String(body.due_at || '').trim();

  if (!title) return c.json({ error: 'Judul / subjek tugas wajib diisi.' }, 400);
  if (!assigneeId) return c.json({ error: 'Penerima tugas (Assignee) wajib dipilih.' }, 400);
  if (!dueAt) return c.json({ error: 'Batas waktu penyelesaian wajib diisi.' }, 400);

  const category = String(body.category || 'general').trim() || 'general';
  const router = ALLOWED_ROUTERS.has(String(body.router || '').toLowerCase())
    ? String(body.router).toLowerCase()
    : 'adhoc';
  const priority = ALLOWED_PRIORITIES.has(String(body.priority || '').toLowerCase())
    ? String(body.priority).toLowerCase()
    : 'medium';

  const actor = await resolveActorEmployee(c.env.DB, user);
  const assignee = await c.env.DB.prepare(
    `SELECT e.id, e.full_name, u.email
     FROM employees e
     LEFT JOIN users u ON u.employee_id = e.id
     WHERE e.id = ?`
  )
    .bind(assigneeId)
    .first<any>();
  if (!assignee) return c.json({ error: 'Karyawan penerima tugas tidak ditemukan.' }, 404);

  const watchers: string[] = Array.isArray(body.watchers)
    ? body.watchers.map((w: any) => String(w)).filter(Boolean)
    : [];
  const referenceMeta: Record<string, string> =
    body.reference_meta && typeof body.reference_meta === 'object' ? body.reference_meta : {};

  const id = crypto.randomUUID();
  const referenceNo = await nextTaskReferenceNo(c.env.DB);
  const clampMin = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : def;
  };

  await c.env.DB.prepare(
    `INSERT INTO tasks (
      id, reference_no, title, description, category, router, priority, status,
      assignor_id, assignee_id, watchers_json, reference_meta_json, due_at,
      reminder_minutes, alert1_minutes, alert2_minutes, warning_minutes, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      referenceNo,
      title,
      description || null,
      category,
      router,
      priority,
      actor.id,
      assigneeId,
      JSON.stringify(watchers),
      JSON.stringify(referenceMeta),
      dueAt,
      clampMin(body.reminder_minutes, 30),
      clampMin(body.alert1_minutes, 30),
      clampMin(body.alert2_minutes, 45),
      clampMin(body.warning_minutes, 60),
      String(body.remarks || '').trim() || null
    )
    .run();

  await logActivity(c.env.DB, {
    taskId: id,
    actorId: actor.id,
    actorName: actor.full_name,
    actionType: 'created',
    statusAfter: 'open',
    note: description || title,
    meta: { assignee_id: assigneeId, assignee_name: assignee.full_name, due_at: dueAt, priority, category },
  });

  if (assignee.email) {
    sendEmailInBackground(c, c.env, {
      to: assignee.email,
      subject: `[${referenceNo}] New Task Assigned: ${title}`,
      text: `Hi ${assignee.full_name}, ${actor.full_name} assigned you task ${referenceNo}: ${title} (Due: ${dueAt}).`,
      html: `<p>Hi <strong>${assignee.full_name}</strong>,</p>
               <p><strong>${actor.full_name}</strong> assigned you a new task:</p>
               <ul>
                 <li><strong>Reference:</strong> ${referenceNo}</li>
                 <li><strong>Task:</strong> ${title}</li>
                 <li><strong>Priority:</strong> ${priority.toUpperCase()}</li>
                 <li><strong>Due:</strong> ${dueAt}</li>
               </ul>
               ${description ? `<p>${description}</p>` : ''}`,
    });
  }

  return c.json({ id, reference_no: referenceNo, status: 'open' }, 201);
});

// 4. Task detail + timeline + attachments
taskRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const task = await c.env.DB.prepare(
    `SELECT t.*,
            asor.full_name AS assignor_name, asor.nik AS assignor_nik, d_asor.name AS assignor_department,
            asee.full_name AS assignee_name, asee.nik AS assignee_nik, d_asee.name AS assignee_department,
            comp.full_name AS completed_by_name,
            appr.full_name AS approved_by_name
     FROM tasks t
     LEFT JOIN employees asor ON asor.id = t.assignor_id
     LEFT JOIN departments d_asor ON d_asor.id = asor.department_id
     LEFT JOIN employees asee ON asee.id = t.assignee_id
     LEFT JOIN departments d_asee ON d_asee.id = asee.department_id
     LEFT JOIN employees comp ON comp.id = t.completed_by
     LEFT JOIN employees appr ON appr.id = t.approved_by
     WHERE t.id = ? OR REPLACE(t.reference_no, ' ', '-') = ?`
  )
    .bind(id, id)
    .first<any>();

  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);

  const [activitiesRes, attachmentsRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM task_activities WHERE task_id = ? ORDER BY created_at ASC`
    )
      .bind(task.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT id, task_id, activity_id, uploaded_by, file_name, mime_type, file_size, created_at
       FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC`
    )
      .bind(task.id)
      .all<any>(),
  ]);

  return c.json({
    task: {
      ...task,
      watchers: parseJsonSafe<string[]>(task.watchers_json, []),
      reference_meta: parseJsonSafe<Record<string, string>>(task.reference_meta_json, {}),
    },
    activities: (activitiesRes.results || []).map((a: any) => ({
      ...a,
      meta: parseJsonSafe<Record<string, unknown>>(a.meta_json, {}),
    })),
    attachments: (attachmentsRes.results || []).map((att: any) => ({
      ...att,
      url: `/api/tasks/${task.id}/attachments/${att.id}`,
    })),
  });
});

// 5. Upload attachment
taskRoutes.post('/:id/attachments', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return c.json({ error: 'File lampiran wajib dipilih.' }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: 'Ukuran file maksimal 10 MB.' }, 400);
  }

  const actor = await resolveActorEmployee(c.env.DB, user);
  const attId = makeId('tatt');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `tasks/${id}/${attId}-${safeName}`;
  await putFile(c.env, key, await file.arrayBuffer(), file.type || 'application/octet-stream');

  const activityId = (form?.get('activity_id') as string | null) || null;
  await c.env.DB.prepare(
    `INSERT INTO task_attachments (id, task_id, activity_id, uploaded_by, file_name, mime_type, file_size, file_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(attId, id, activityId, actor.id, file.name, file.type || 'application/octet-stream', file.size, key)
    .run();

  return c.json(
    {
      attachment: {
        id: attId,
        task_id: id,
        activity_id: activityId,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        url: `/api/tasks/${id}/attachments/${attId}`,
      },
    },
    201
  );
});

// 6. Download attachment
taskRoutes.get('/:id/attachments/:attachmentId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const attachmentId = c.req.param('attachmentId');

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);

  const att = await c.env.DB.prepare(
    `SELECT * FROM task_attachments WHERE id = ? AND task_id = ?`
  )
    .bind(attachmentId, id)
    .first<any>();
  if (!att) return c.json({ error: 'Lampiran tidak ditemukan.' }, 404);

  const file = await getFile(c.env, att.file_key);
  if (!file) return c.json({ error: 'File tidak ditemukan di penyimpanan.' }, 404);

  c.header('Content-Type', file.contentType || att.mime_type || 'application/octet-stream');
  c.header('Content-Disposition', `inline; filename="${att.file_name}"`);
  return c.body(file.data);
});

// 7. B1: Take Action / Update Progress
taskRoutes.post('/:id/action', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);
  if (task.status === 'approved') return c.json({ error: 'Tugas sudah disetujui dan ditutup.' }, 400);

  const nextStatus = body.status === 'open' || body.status === 'in_progress' ? body.status : 'in_progress';
  const note = String(body.note || '').trim();
  if (!note) return c.json({ error: 'Catatan tindakan wajib diisi.' }, 400);

  const actor = await resolveActorEmployee(c.env.DB, user);
  await c.env.DB.prepare(
    `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(nextStatus, id)
    .run();

  const activityId = await logActivity(c.env.DB, {
    taskId: id,
    actorId: actor.id,
    actorName: actor.full_name,
    actionType: 'action',
    statusAfter: nextStatus,
    note,
  });

  return c.json({ status: nextStatus, activity_id: activityId });
});

// 8. B2: Next Action / Handover to another employee
taskRoutes.post('/:id/handover', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);
  if (task.status === 'approved') return c.json({ error: 'Tugas sudah disetujui dan ditutup.' }, 400);

  const nextAssigneeId = String(body.next_assignee_id || '').trim();
  const reason = String(body.reason || '').trim();
  if (!nextAssigneeId) return c.json({ error: 'Penerima tindak lanjut wajib dipilih.' }, 400);
  if (!reason) return c.json({ error: 'Rincian / alasan tindak lanjut wajib diisi.' }, 400);

  const nextAssignee = await c.env.DB.prepare(
    `SELECT e.id, e.full_name, u.email
     FROM employees e
     LEFT JOIN users u ON u.employee_id = e.id
     WHERE e.id = ?`
  )
    .bind(nextAssigneeId)
    .first<any>();
  if (!nextAssignee) return c.json({ error: 'Karyawan tidak ditemukan.' }, 404);

  const nextStatus = body.status === 'open' || body.status === 'in_progress' ? body.status : 'in_progress';
  const actor = await resolveActorEmployee(c.env.DB, user);

  await c.env.DB.prepare(
    `UPDATE tasks SET assignee_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(nextAssigneeId, nextStatus, id)
    .run();

  const activityId = await logActivity(c.env.DB, {
    taskId: id,
    actorId: actor.id,
    actorName: actor.full_name,
    actionType: 'handover',
    statusAfter: nextStatus,
    note: reason,
    meta: {
      from_assignee_id: task.assignee_id,
      to_assignee_id: nextAssigneeId,
      to_assignee_name: nextAssignee.full_name,
    },
  });

  if (nextAssignee.email) {
    sendEmailInBackground(c, c.env, {
      to: nextAssignee.email,
      subject: `[${task.reference_no}] Task Handed Over: ${task.title}`,
      text: `Hi ${nextAssignee.full_name}, ${actor.full_name} handed over task ${task.reference_no} (${task.title}) to you. Reason: ${reason}`,
      html: `<p>Hi <strong>${nextAssignee.full_name}</strong>,</p>
               <p><strong>${actor.full_name}</strong> handed over task <strong>${task.reference_no}</strong> (${task.title}) to you.</p>
               <p><strong>Next Action / Reason:</strong> ${reason}</p>`,
    });
  }

  return c.json({ status: nextStatus, assignee_id: nextAssigneeId, activity_id: activityId });
});

// 9. B3 + B4: Reschedule & update reminder thresholds
taskRoutes.post('/:id/reschedule', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);
  if (task.status === 'approved') return c.json({ error: 'Tugas sudah disetujui dan ditutup.' }, 400);

  const newDueAt = String(body.due_at || '').trim();
  if (!newDueAt) return c.json({ error: 'Tanggal & waktu baru wajib diisi.' }, 400);

  const clampMin = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : def;
  };

  const reminderMin = clampMin(body.reminder_minutes, Number(task.reminder_minutes ?? 30));
  const alert1Min = clampMin(body.alert1_minutes, Number(task.alert1_minutes ?? 30));
  const alert2Min = clampMin(body.alert2_minutes, Number(task.alert2_minutes ?? 45));
  const warningMin = clampMin(body.warning_minutes, Number(task.warning_minutes ?? 60));
  const reason = String(body.reason || '').trim();

  const actor = await resolveActorEmployee(c.env.DB, user);
  await c.env.DB.prepare(
    `UPDATE tasks
     SET due_at = ?, reminder_minutes = ?, alert1_minutes = ?, alert2_minutes = ?, warning_minutes = ?,
         status = 'rescheduled', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(newDueAt, reminderMin, alert1Min, alert2Min, warningMin, id)
    .run();

  const activityId = await logActivity(c.env.DB, {
    taskId: id,
    actorId: actor.id,
    actorName: actor.full_name,
    actionType: 'reschedule',
    statusAfter: 'rescheduled',
    note: reason || `Rescheduled from ${task.due_at} to ${newDueAt}`,
    meta: {
      old_due_at: task.due_at,
      new_due_at: newDueAt,
      reminder_minutes: reminderMin,
      alert1_minutes: alert1Min,
      alert2_minutes: alert2Min,
      warning_minutes: warningMin,
    },
  });

  return c.json({ status: 'rescheduled', due_at: newDueAt, activity_id: activityId });
});

// 10. B5: Close / Submit for Approval
taskRoutes.post('/:id/close', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);
  if (!canAccessTask(task, user)) return c.json({ error: 'Akses ditolak.' }, 403);
  if (task.status === 'approved') return c.json({ error: 'Tugas sudah disetujui dan ditutup.' }, 400);

  const remarks = String(body.remarks || '').trim();
  if (!remarks) return c.json({ error: 'Catatan penyelesaian tugas wajib diisi.' }, 400);

  const actor = await resolveActorEmployee(c.env.DB, user);
  const completedAt = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE tasks
     SET status = 'pending_approval', completed_at = ?, completed_by = ?, completion_remarks = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(completedAt, actor.id, remarks, id)
    .run();

  const activityId = await logActivity(c.env.DB, {
    taskId: id,
    actorId: actor.id,
    actorName: actor.full_name,
    actionType: 'submitted_for_approval',
    statusAfter: 'pending_approval',
    note: remarks,
  });

  const notifyEmails: string[] = Array.isArray(body.notify_emails)
    ? body.notify_emails.map((e: any) => String(e).trim()).filter(Boolean)
    : [];
  const mailBody = String(body.mail_body || '').trim();
  for (const recipient of notifyEmails) {
    sendEmailInBackground(c, c.env, {
      to: recipient,
      subject: `[${task.reference_no}] Task Closed / Ready for Approval: ${task.title}`,
      text: `Task ${task.reference_no} (${task.title}) was completed by ${actor.full_name}. Remarks: ${remarks}`,
      html: `<p>Task <strong>${task.reference_no}</strong> (${task.title}) has been marked completed by <strong>${actor.full_name}</strong>.</p>
               <p><strong>Remarks:</strong> ${remarks}</p>
               ${mailBody ? `<p>${mailBody}</p>` : ''}`,
    });
  }

  return c.json({ status: 'pending_approval', completed_at: completedAt, activity_id: activityId });
});

// 11. C: Approval (Approve & Close or Return to Assignee)
taskRoutes.post('/:id/approve', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<any>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan.' }, 404);

  const isAssignor = Boolean(user.employeeId && task.assignor_id === user.employeeId);
  if (!isAssignor && user.role !== 'owner_admin' && user.role !== 'manager') {
    return c.json({ error: 'Hanya pembuat tugas atau manajer/admin yang dapat menyetujui.' }, 403);
  }
  if (task.status !== 'pending_approval') {
    return c.json({ error: 'Tugas belum diajukan untuk persetujuan.' }, 400);
  }

  const decision = body.decision === 'return' ? 'return' : 'approve';
  const remarks = String(body.remarks || '').trim();
  const actor = await resolveActorEmployee(c.env.DB, user);

  if (decision === 'return') {
    await c.env.DB.prepare(
      `UPDATE tasks SET status = 'in_progress', approval_remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(remarks || null, id)
      .run();

    const activityId = await logActivity(c.env.DB, {
      taskId: id,
      actorId: actor.id,
      actorName: actor.full_name,
      actionType: 'returned',
      statusAfter: 'in_progress',
      note: remarks || 'Returned to assignee for follow-up',
    });
    return c.json({ status: 'in_progress', activity_id: activityId });
  }

  const approvedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE tasks
     SET status = 'approved', approved_at = ?, approved_by = ?, approval_remarks = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(approvedAt, actor.id, remarks || null, id)
    .run();

  const activityId = await logActivity(c.env.DB, {
    taskId: id,
    actorId: actor.id,
    actorName: actor.full_name,
    actionType: 'approved',
    statusAfter: 'approved',
    note: remarks || 'Approved and closed',
  });

  return c.json({ status: 'approved', approved_at: approvedAt, activity_id: activityId });
});

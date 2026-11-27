import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { putFile, getFile, deleteFile } from '../services/storage';
import { makeId } from '../utils/id';
import {
  PETTY_CASH_CATEGORIES,
  auditPettyCashAction,
  canTransition,
  expensesMissingReceipts,
  isEditableStatus,
  isPettyCashCategory,
  nextPettyCashReferenceNo,
  recalculateTotals,
  signPettyCashVerifyToken,
} from '../services/petty-cash-workflow';

export const pettyCashRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

pettyCashRoutes.use('*', authMiddleware);

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
]);

const ALLOWED_RECEIPT_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'heif',
  'pdf',
  'xlsx',
  'xls',
  'csv',
]);

const REVIEW_ROLES = ['owner_admin', 'finance'] as const;

function canReview(user: { role: string }): boolean {
  return user.role === 'owner_admin' || user.role === 'finance';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadRequest(db: D1Database, id: string): Promise<any> {
  return db
    .prepare(
      `SELECT p.*, e.nik, e.full_name, e.job_title, e.manager_id,
              d.name AS department_name,
              app.full_name AS approver_name,
              rev.full_name AS reviewer_name
       FROM petty_cash_requests p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN users u_app ON p.approved_by = u_app.id
       LEFT JOIN employees app ON u_app.employee_id = app.id
       LEFT JOIN users u_rev ON p.report_reviewed_by = u_rev.id
       LEFT JOIN employees rev ON u_rev.employee_id = rev.id
       WHERE p.id = ?`
    )
    .bind(id)
    .first<any>();
}

function canView(user: { role: string; employeeId?: string | null }, request: any): boolean {
  if (!request) return false;
  if (canReview(user)) return true;
  if (!user.employeeId) return false;
  if (request.employee_id === user.employeeId) return true;
  if (user.role === 'manager' && request.manager_id === user.employeeId) return true;
  return false;
}

function isOwner(user: { employeeId?: string | null }, request: any): boolean {
  return Boolean(user.employeeId) && request?.employee_id === user.employeeId;
}

function rightsFor(user: { role: string; employeeId?: string | null }, request: any) {
  const reviewer = canReview(user);
  const owner = isOwner(user, request);
  return {
    canApprove: reviewer && request.status === 'pending',
    canReject: reviewer && request.status === 'pending',
    canCancel: owner && request.status === 'pending',
    canEditExpenses: (owner && isEditableStatus(request.status)) || (reviewer && (isEditableStatus(request.status) || request.status === 'report_submitted')),
    canSubmitReport: owner && isEditableStatus(request.status),
    canReviewReport: reviewer && request.status === 'report_submitted',
  };
}

function safeFileName(name: string): string {
  const cleaned = String(name || 'receipt').replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned.slice(-80) || 'receipt';
}

function decodeBase64(raw: string): { data: Uint8Array; contentType: string } | null {
  if (typeof raw !== 'string' || !raw) return null;
  let contentType = 'image/jpeg';
  let b64 = raw;
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    if (comma < 0) return null;
    const meta = raw.slice(5, comma);
    contentType = meta.split(';')[0] || contentType;
    b64 = raw.slice(comma + 1);
  }
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { data: bytes, contentType };
  } catch {
    return null;
  }
}

function isAllowedReceipt(contentType: string, fileName?: string): boolean {
  const type = String(contentType || '').toLowerCase();
  if (ALLOWED_RECEIPT_TYPES.has(type)) return true;
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (ext && ALLOWED_RECEIPT_EXTENSIONS.has(ext)) return true;
  return false;
}

function resolveReceiptContentType(contentType: string, fileName?: string): string {
  const type = String(contentType || '').toLowerCase();
  if (type && type !== 'application/octet-stream') return type;
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return type || 'application/octet-stream';
}

function receiptValidationError(data: Uint8Array, contentType: string, fileName?: string): string | null {
  if (!isAllowedReceipt(contentType, fileName)) {
    return 'Format lampiran harus gambar (PNG, JPG, WEBP), PDF, atau Excel (XLSX, XLS, CSV).';
  }
  if (!data || data.byteLength === 0) return 'File lampiran kosong.';
  if (data.byteLength > MAX_RECEIPT_BYTES) return 'Ukuran lampiran maksimal 5 MB.';
  return null;
}

async function storeReceipt(
  env: Bindings,
  requestId: string,
  expenseId: string,
  data: Uint8Array,
  contentType: string,
  fileName: string
): Promise<{ id: string } | { error: string }> {
  const invalid = receiptValidationError(data, contentType, fileName);
  if (invalid) return { error: invalid };

  const type = resolveReceiptContentType(contentType, fileName);
  const key = `petty-cash/${requestId}/${expenseId}-${Date.now()}-${safeFileName(fileName)}`;
  await putFile(env, { key, data, contentType: type });

  const id = makeId('pcrp');
  await env.DB.prepare(
    `INSERT INTO petty_cash_receipts (
      id, tenant_id, request_id, expense_id, file_key, file_name, mime_type, file_size
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, requestId, expenseId, key, fileName || 'receipt', type, data.byteLength)
    .run();

  return { id };
}

/* ------------------------------------------------------------------ */
/* Form config                                                         */
/* ------------------------------------------------------------------ */

pettyCashRoutes.get('/form/config', async (c) => {
  const user = c.get('user');
  return c.json({
    categories: PETTY_CASH_CATEGORIES,
    viewer: { employeeId: user.employeeId ?? null, role: user.role },
  });
});

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

pettyCashRoutes.post('/requests', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({} as any));

  const employeeId = body.employee_id || user.employeeId;
  if (!employeeId) {
    return c.json({ error: 'Karyawan pemohon petty cash wajib ditentukan.' }, 400);
  }
  if (employeeId !== user.employeeId && !canReview(user)) {
    return c.json({ error: 'Anda hanya dapat mengajukan petty cash untuk diri sendiri.' }, 403);
  }

  const purpose = String(body.purpose || '').trim();
  const requestedAmount = parseFloat(body.requested_amount ?? body.amount);
  if (!purpose) {
    return c.json({ error: 'Tujuan penggunaan petty cash wajib diisi.' }, 400);
  }
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return c.json({ error: 'Nominal petty cash harus lebih dari 0.' }, 400);
  }

  const employee = await c.env.DB.prepare(
    `SELECT e.id, e.department_id, d.name AS department_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = ?`
  )
    .bind(employeeId)
    .first<any>();
  if (!employee) {
    return c.json({ error: 'Karyawan tidak ditemukan.' }, 404);
  }

  const dateISO = todayISO();
  const referenceNo = await nextPettyCashReferenceNo(c.env, dateISO);
  const id = makeId('pcr');

  await c.env.DB.prepare(
    `INSERT INTO petty_cash_requests (
      id, tenant_id, employee_id, reference_no, department_id, department_label,
      purpose, requested_amount, status
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, 'pending')`
  )
    .bind(
      id,
      employeeId,
      referenceNo,
      employee.department_id || body.department_id || null,
      employee.department_name || null,
      purpose,
      Math.round(requestedAmount * 100) / 100
    )
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_REQUESTED', id, {
    reference_no: referenceNo,
    requested_amount: requestedAmount,
    from: null,
    to: 'pending',
  });

  return c.json(
    {
      message: 'Pengajuan petty cash berhasil dikirim.',
      requestId: id,
      referenceNo,
      status: 'pending',
    },
    201
  );
});

pettyCashRoutes.get('/requests', async (c) => {
  const user = c.get('user');
  const statusFilter = c.req.query('status');
  const onlyMine = c.req.query('scope') === 'mine';

  let query = `
    SELECT p.*, e.nik, e.full_name, e.job_title, d.name AS department_name,
           (SELECT COUNT(*) FROM petty_cash_expenses x WHERE x.request_id = p.id) AS expense_count,
           (SELECT COUNT(*) FROM petty_cash_receipts y WHERE y.request_id = p.id) AS receipt_count
    FROM petty_cash_requests p
    JOIN employees e ON e.id = p.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
  `;
  const where: string[] = [];
  const params: any[] = [];

  if (onlyMine) {
    where.push('p.employee_id = ?');
    params.push(user.employeeId);
  } else if (user.role === 'employee') {
    where.push('p.employee_id = ?');
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    where.push('(e.manager_id = ? OR e.id = ?)');
    params.push(user.employeeId, user.employeeId);
  } else if (c.req.query('employee_id')) {
    where.push('p.employee_id = ?');
    params.push(c.req.query('employee_id'));
  }

  if (statusFilter && statusFilter !== 'all') {
    where.push('p.status = ?');
    params.push(statusFilter);
  }

  if (where.length > 0) query += ` WHERE ${where.join(' AND ')}`;
  query += ` ORDER BY p.created_at DESC LIMIT 300`;

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();
  return c.json({ requests: rows.results || [] });
});

pettyCashRoutes.get('/requests/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const [request, expensesResult, receiptsResult, historyResult, verifyToken] = await Promise.all([
    loadRequest(c.env.DB, id),
    c.env.DB.prepare(
      `SELECT id, request_id, expense_date, category, description, amount, vendor, notes,
              created_at, updated_at
       FROM petty_cash_expenses
       WHERE request_id = ?
       ORDER BY expense_date ASC, created_at ASC`
    )
      .bind(id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT id, request_id, expense_id, file_name, mime_type, file_size, uploaded_at
       FROM petty_cash_receipts
       WHERE request_id = ?
       ORDER BY uploaded_at ASC`
    )
      .bind(id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT id, action, user_id, new_values, created_at
       FROM audit_logs
       WHERE entity_type = 'petty_cash_requests' AND entity_id = ?
       ORDER BY created_at ASC`
    )
      .bind(id)
      .all<any>(),
    signPettyCashVerifyToken(c.env.JWT_SECRET, id),
  ]);

  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!canView(user, request)) {
    return c.json({ error: 'Anda tidak berhak melihat pengajuan ini.' }, 403);
  }

  const receipts = (receiptsResult.results || []).map((receipt: any) => ({
    ...receipt,
    url: `/api/petty-cash/requests/${id}/expenses/${receipt.expense_id}/receipts/${receipt.id}`,
  }));

  const expenses = (expensesResult.results || []).map((expense: any) => ({
    ...expense,
    receipts: receipts.filter((receipt: any) => receipt.expense_id === expense.id),
  }));

  const verifyPath = `/verify/petty-cash/${id}?token=${verifyToken}`;

  return c.json({
    request,
    expenses,
    receipts,
    totals: {
      requested_amount: Number(request.requested_amount || 0),
      disbursed_amount: Number(request.disbursed_amount ?? request.requested_amount ?? 0),
      total_realized: Number(request.total_realized || 0),
      variance: Number(request.variance || 0),
    },
    history: historyResult.results || [],
    rights: rightsFor(user, request),
    verifyToken,
    verifyPath,
  });
});

pettyCashRoutes.post('/requests/:id/approve', requireRole([...REVIEW_ROLES]), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!canTransition(request.status, 'approved')) {
    return c.json({ error: 'Status pengajuan tidak dapat disetujui saat ini.' }, 409);
  }

  const requestedAmount = Number(request.requested_amount || 0);
  const disbursedAmount = body.disbursed_amount != null ? parseFloat(body.disbursed_amount) : requestedAmount;
  if (!Number.isFinite(disbursedAmount) || disbursedAmount <= 0) {
    return c.json({ error: 'Nominal pencairan harus lebih dari 0.' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE petty_cash_requests SET
      status = 'approved',
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = NULL,
      disbursed_by = ?,
      disbursed_at = CURRENT_TIMESTAMP,
      disbursed_amount = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(user.userId, user.userId, disbursedAmount, id)
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_APPROVED', id, {
    from: request.status,
    to: 'approved',
    disbursed_amount: disbursedAmount,
  });

  return c.json({ message: 'Petty cash disetujui dan dicairkan.', status: 'approved' });
});

pettyCashRoutes.post('/requests/:id/reject', requireRole([...REVIEW_ROLES]), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const note = String(body.note || '').trim();

  if (!note) {
    return c.json({ error: 'Alasan penolakan wajib diisi.' }, 400);
  }

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!canTransition(request.status, 'rejected')) {
    return c.json({ error: 'Status pengajuan tidak dapat ditolak saat ini.' }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE petty_cash_requests SET
      status = 'rejected',
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(user.userId, note, id)
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_REJECTED', id, {
    from: request.status,
    to: 'rejected',
    note,
  });

  return c.json({ message: 'Pengajuan petty cash ditolak.', status: 'rejected' });
});

pettyCashRoutes.post('/requests/:id/cancel', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!isOwner(user, request)) {
    return c.json({ error: 'Hanya pemohon yang dapat membatalkan pengajuan.' }, 403);
  }
  if (!canTransition(request.status, 'cancelled')) {
    return c.json({ error: 'Pengajuan ini tidak dapat dibatalkan.' }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE petty_cash_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(id)
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_CANCELLED', id, {
    from: request.status,
    to: 'cancelled',
  });

  return c.json({ message: 'Pengajuan petty cash dibatalkan.', status: 'cancelled' });
});

/* ------------------------------------------------------------------ */
/* Realization expenses                                                */
/* ------------------------------------------------------------------ */

pettyCashRoutes.post('/requests/:id/expenses', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!isOwner(user, request)) {
    return c.json({ error: 'Hanya pemegang petty cash yang dapat mencatat pengeluaran.' }, 403);
  }
  if (!isEditableStatus(request.status)) {
    return c.json({ error: 'Pengeluaran tidak dapat diubah pada status ini.' }, 409);
  }

  const expenseDate = String(body.expense_date || todayISO()).slice(0, 10);
  const category = String(body.category || '');
  const description = String(body.description || '').trim();
  const amount = parseFloat(body.amount);

  if (!isPettyCashCategory(category)) {
    return c.json({ error: 'Kategori pengeluaran tidak valid.' }, 400);
  }
  if (!description) {
    return c.json({ error: 'Deskripsi pengeluaran wajib diisi.' }, 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: 'Nominal pengeluaran harus lebih dari 0.' }, 400);
  }

  const incoming = Array.isArray(body.receipts) ? body.receipts : [];
  const prepared: Array<{ data: Uint8Array; contentType: string; fileName: string }> = [];
  for (const item of incoming) {
    const decoded = decodeBase64(item?.base64 || item?.file_base64 || '');
    if (!decoded) {
      return c.json({ error: 'Lampiran tidak valid.' }, 400);
    }
    const contentType = resolveReceiptContentType(item?.mime_type || decoded.contentType, item?.file_name);
    const invalid = receiptValidationError(decoded.data, contentType, item?.file_name);
    if (invalid) return c.json({ error: invalid }, 400);
    prepared.push({
      data: decoded.data,
      contentType,
      fileName: item?.file_name || 'receipt',
    });
  }

  const expenseId = makeId('pce');
  await c.env.DB.prepare(
    `INSERT INTO petty_cash_expenses (
      id, tenant_id, request_id, expense_date, category, description, amount, vendor, notes
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      expenseId,
      id,
      expenseDate,
      category,
      description,
      Math.round(amount * 100) / 100,
      body.vendor ? String(body.vendor).trim() : null,
      body.notes ? String(body.notes).trim() : null
    )
    .run();

  const receiptIds: string[] = [];
  for (const item of prepared) {
    const saved = await storeReceipt(
      c.env,
      id,
      expenseId,
      item.data,
      item.contentType,
      item.fileName
    );
    if ('error' in saved) return c.json({ error: saved.error }, 400);
    receiptIds.push(saved.id);
  }

  await recalculateTotals(c.env, id);

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_EXPENSE_ADDED', id, {
    expense_id: expenseId,
    amount,
    category,
    receipts: receiptIds.length,
  });

  return c.json(
    { message: 'Pengeluaran berhasil dicatat.', expenseId, receiptIds },
    201
  );
});

const handleUpdateExpense = async (c: any) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const body = await c.req.json().catch(() => ({} as any));

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  const reviewer = canReview(user);
  const owner = isOwner(user, request);
  if (!owner && !reviewer) {
    return c.json({ error: 'Hanya pemegang petty cash atau finance/admin yang dapat mengubah pengeluaran.' }, 403);
  }
  if (!isEditableStatus(request.status) && !(reviewer && request.status === 'report_submitted')) {
    return c.json({ error: 'Pengeluaran tidak dapat diubah pada status ini.' }, 409);
  }

  const existing = await c.env.DB.prepare(
    `SELECT * FROM petty_cash_expenses WHERE id = ? AND request_id = ?`
  )
    .bind(expenseId, id)
    .first();
  if (!existing) return c.json({ error: 'Pengeluaran tidak ditemukan.' }, 404);

  const expenseDate = String(body.expense_date ?? existing.expense_date).slice(0, 10);
  const category = String(body.category ?? existing.category);
  const description = String(body.description ?? existing.description).trim();
  const amount = body.amount != null ? parseFloat(body.amount) : Number(existing.amount);

  if (!isPettyCashCategory(category)) {
    return c.json({ error: 'Kategori pengeluaran tidak valid.' }, 400);
  }
  if (!description) {
    return c.json({ error: 'Deskripsi pengeluaran wajib diisi.' }, 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: 'Nominal pengeluaran harus lebih dari 0.' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE petty_cash_expenses SET
      expense_date = ?, category = ?, description = ?, amount = ?, vendor = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND request_id = ?`
  )
    .bind(
      expenseDate,
      category,
      description,
      Math.round(amount * 100) / 100,
      body.vendor !== undefined ? (body.vendor ? String(body.vendor).trim() : null) : existing.vendor,
      body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
      expenseId,
      id
    )
    .run();

  await recalculateTotals(c.env, id);

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_EXPENSE_UPDATED', id, {
    expense_id: expenseId,
    amount,
    category,
  });

  return c.json({ message: 'Pengeluaran diperbarui.' });
};

pettyCashRoutes.patch('/requests/:id/expenses/:expenseId', handleUpdateExpense);
pettyCashRoutes.put('/requests/:id/expenses/:expenseId', handleUpdateExpense);

pettyCashRoutes.delete('/requests/:id/expenses/:expenseId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const expenseId = c.req.param('expenseId');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  const reviewer = canReview(user);
  const owner = isOwner(user, request);
  if (!owner && !reviewer) {
    return c.json({ error: 'Hanya pemegang petty cash atau finance/admin yang dapat menghapus pengeluaran.' }, 403);
  }
  if (!isEditableStatus(request.status) && !(reviewer && request.status === 'report_submitted')) {
    return c.json({ error: 'Pengeluaran tidak dapat dihapus pada status ini.' }, 409);
  }

  const expense = await c.env.DB.prepare(
    `SELECT id FROM petty_cash_expenses WHERE id = ? AND request_id = ?`
  )
    .bind(expenseId, id)
    .first<any>();
  if (!expense) return c.json({ error: 'Pengeluaran tidak ditemukan.' }, 404);

  const receipts = await c.env.DB.prepare(
    `SELECT id, file_key FROM petty_cash_receipts WHERE expense_id = ?`
  )
    .bind(expenseId)
    .all<any>();
  for (const receipt of receipts.results || []) {
    await deleteFile(c.env, receipt.file_key);
  }

  await c.env.DB.prepare(`DELETE FROM petty_cash_receipts WHERE expense_id = ?`).bind(expenseId).run();
  await c.env.DB.prepare(`DELETE FROM petty_cash_expenses WHERE id = ? AND request_id = ?`)
    .bind(expenseId, id)
    .run();

  await recalculateTotals(c.env, id);

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_EXPENSE_DELETED', id, {
    expense_id: expenseId,
  });

  return c.json({ message: 'Pengeluaran dihapus.' });
});

pettyCashRoutes.post('/requests/:id/expenses/:expenseId/receipts', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const expenseId = c.req.param('expenseId');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!isOwner(user, request)) {
    return c.json({ error: 'Hanya pemegang petty cash yang dapat mengunggah lampiran.' }, 403);
  }
  if (!isEditableStatus(request.status)) {
    return c.json({ error: 'Lampiran tidak dapat diubah pada status ini.' }, 409);
  }

  const expense = await c.env.DB.prepare(
    `SELECT id FROM petty_cash_expenses WHERE id = ? AND request_id = ?`
  )
    .bind(expenseId, id)
    .first<any>();
  if (!expense) return c.json({ error: 'Pengeluaran tidak ditemukan.' }, 404);

  const receiptIds: string[] = [];
  const contentTypeHeader = (c.req.header('Content-Type') || '').toLowerCase();

  if (contentTypeHeader.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const files = form.getAll('file');
    for (const item of files) {
      if (typeof item === 'string') continue;
      const file = item as unknown as File;
      const data = new Uint8Array(await file.arrayBuffer());
      const saved = await storeReceipt(
        c.env,
        id,
        expenseId,
        data,
        file.type || 'application/octet-stream',
        file.name || 'receipt'
      );
      if ('error' in saved) return c.json({ error: saved.error }, 400);
      receiptIds.push(saved.id);
    }
  } else {
    const body = await c.req.json().catch(() => ({} as any));
    const decoded = decodeBase64(body.file_base64 || body.base64 || '');
    if (!decoded) return c.json({ error: 'File lampiran tidak valid.' }, 400);
    const saved = await storeReceipt(
      c.env,
      id,
      expenseId,
      decoded.data,
      body.mime_type || decoded.contentType,
      body.file_name || 'receipt'
    );
    if ('error' in saved) return c.json({ error: saved.error }, 400);
    receiptIds.push(saved.id);
  }

  if (receiptIds.length === 0) {
    return c.json({ error: 'File lampiran wajib diunggah.' }, 400);
  }

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_RECEIPT_ADDED', id, {
    expense_id: expenseId,
    receipt_ids: receiptIds,
  });

  return c.json({ message: 'Lampiran diunggah.', receiptIds }, 201);
});

pettyCashRoutes.delete('/requests/:id/expenses/:expenseId/receipts/:receiptId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const receiptId = c.req.param('receiptId');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!isOwner(user, request)) {
    return c.json({ error: 'Hanya pemegang petty cash yang dapat menghapus lampiran.' }, 403);
  }
  if (!isEditableStatus(request.status)) {
    return c.json({ error: 'Lampiran tidak dapat diubah pada status ini.' }, 409);
  }

  const receipt = await c.env.DB.prepare(
    `SELECT id, file_key FROM petty_cash_receipts
     WHERE id = ? AND expense_id = ? AND request_id = ?`
  )
    .bind(receiptId, expenseId, id)
    .first<any>();
  if (!receipt) return c.json({ error: 'Lampiran tidak ditemukan.' }, 404);

  await deleteFile(c.env, receipt.file_key);
  await c.env.DB.prepare(`DELETE FROM petty_cash_receipts WHERE id = ?`).bind(receiptId).run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_RECEIPT_DELETED', id, {
    expense_id: expenseId,
    receipt_id: receiptId,
  });

  return c.json({ message: 'Lampiran dihapus.' });
});

pettyCashRoutes.get('/requests/:id/expenses/:expenseId/receipts/:receiptId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  const receiptId = c.req.param('receiptId');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!canView(user, request)) {
    return c.json({ error: 'Anda tidak berhak melihat lampiran ini.' }, 403);
  }

  const receipt = await c.env.DB.prepare(
    `SELECT id, file_key, file_name, mime_type FROM petty_cash_receipts
     WHERE id = ? AND expense_id = ? AND request_id = ?`
  )
    .bind(receiptId, expenseId, id)
    .first<any>();
  if (!receipt) return c.json({ error: 'Lampiran tidak ditemukan.' }, 404);

  const file = await getFile(c.env, receipt.file_key);
  if (!file) return c.json({ error: 'File lampiran tidak ditemukan.' }, 404);

  const contentType = file.contentType || receipt.mime_type || 'application/octet-stream';
  const isDoc =
    contentType.includes('spreadsheet') ||
    contentType.includes('excel') ||
    contentType.includes('csv') ||
    String(receipt.file_name || '').match(/\.(xlsx|xls|csv)$/i);

  c.header('Content-Type', contentType);
  c.header('Content-Disposition', `${isDoc ? 'attachment' : 'inline'}; filename="${receipt.file_name || 'receipt'}"`);
  c.header('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800');
  return c.body(file.data as any);
});

/* ------------------------------------------------------------------ */
/* Realization report review                                           */
/* ------------------------------------------------------------------ */

pettyCashRoutes.post('/requests/:id/submit-report', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!isOwner(user, request)) {
    return c.json({ error: 'Hanya pemegang petty cash yang dapat mengirim realisasi.' }, 403);
  }
  if (!isEditableStatus(request.status)) {
    return c.json({ error: 'Realisasi tidak dapat dikirim pada status ini.' }, 409);
  }

  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM petty_cash_expenses WHERE request_id = ?`
  )
    .bind(id)
    .first<{ n: number }>();
  if (Number(count?.n || 0) === 0) {
    return c.json({ error: 'Tambahkan minimal satu pengeluaran sebelum mengirim realisasi.' }, 400);
  }

  const missing = await expensesMissingReceipts(c.env.DB, id);
  if (missing.length > 0) {
    return c.json(
      { error: `Masih ada ${missing.length} pengeluaran tanpa lampiran bukti.` },
      400
    );
  }

  const totals = await recalculateTotals(c.env, id);

  await c.env.DB.prepare(
    `UPDATE petty_cash_requests SET
      status = 'report_submitted',
      report_submitted_at = CURRENT_TIMESTAMP,
      report_note = NULL,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(id)
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_REPORT_SUBMITTED', id, {
    from: request.status,
    to: 'report_submitted',
    total_realized: totals.totalRealized,
    variance: totals.variance,
  });

  return c.json({
    message: 'Realisasi petty cash dikirim untuk persetujuan.',
    status: 'report_submitted',
    totals,
  });
});

pettyCashRoutes.post('/requests/:id/report-approve', requireRole([...REVIEW_ROLES]), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!canTransition(request.status, 'report_approved')) {
    return c.json({ error: 'Realisasi tidak dapat disetujui pada status ini.' }, 409);
  }

  const totals = await recalculateTotals(c.env, id);

  await c.env.DB.prepare(
    `UPDATE petty_cash_requests SET
      status = 'report_approved',
      report_reviewed_by = ?,
      report_reviewed_at = CURRENT_TIMESTAMP,
      report_note = NULL,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(user.userId, id)
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_REPORT_APPROVED', id, {
    from: request.status,
    to: 'report_approved',
    total_realized: totals.totalRealized,
    variance: totals.variance,
  });

  return c.json({
    message: 'Realisasi petty cash disetujui.',
    status: 'report_approved',
    totals,
  });
});

pettyCashRoutes.post('/requests/:id/report-reject', requireRole([...REVIEW_ROLES]), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const note = String(body.note || '').trim();

  if (!note) {
    return c.json({ error: 'Catatan pengembalian realisasi wajib diisi.' }, 400);
  }

  const request = await loadRequest(c.env.DB, id);
  if (!request) return c.json({ error: 'Pengajuan petty cash tidak ditemukan.' }, 404);
  if (!canTransition(request.status, 'report_rejected')) {
    return c.json({ error: 'Realisasi tidak dapat dikembalikan pada status ini.' }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE petty_cash_requests SET
      status = 'report_rejected',
      report_reviewed_by = ?,
      report_reviewed_at = CURRENT_TIMESTAMP,
      report_note = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(user.userId, note, id)
    .run();

  await auditPettyCashAction(c.env.DB, user.userId, 'PETTY_CASH_REPORT_REJECTED', id, {
    from: request.status,
    to: 'report_rejected',
    note,
  });

  return c.json({ message: 'Realisasi dikembalikan untuk diperbaiki.', status: 'report_rejected' });
});

import { Hono } from 'hono';
import { Bindings, SigningRequestStatus } from '../types';
import { AuthContext, authMiddleware } from '../middleware/auth';
import {
  canCreateRequestFor,
  canCreateSigningRequests,
  canDownloadSignedDocument,
  canManageTemplates,
  canViewEmployeeDocuments,
  canViewSigningRequest,
  isHrOperator,
} from '../middleware/signing-access';
import {
  DocuSealError,
  DocuSealSubmitterResult,
  createDocuSealClient,
  resolveSigningUrl,
} from '../services/docuseal';
import {
  TemplateError,
  deactivateTemplate,
  listTemplates,
  registerTemplate,
  resolveTemplate,
} from '../services/document-templates';
import {
  getDocumentById,
  listDocumentsForEmployee,
  listDocumentsForRequest,
  markDocumentDownloaded,
  readDocument,
} from '../services/signed-documents';
import { getWorkflow } from '../services/signing-workflows';
import { sendEmail, runInBackground } from '../services/smtp';
import { getSigningRequestEmail } from '../services/email-templates';

export const signingRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

signingRoutes.use('*', authMiddleware);

const SIGNER_ROLES = ['Employee', 'Manager', 'HR'];

interface SignerInput {
  role: string;
  email: string;
  name: string;
  employeeId?: string | null;
}

function badRequest(c: any, message: string, status = 400) {
  return c.json({ error: message }, status);
}

function hrAppUrl(env: Bindings): string {
  return (env.HR_APP_URL || env.APP_URL || 'http://localhost:8787').replace(/\/+$/, '');
}

function mapDocuSealError(c: any, err: any) {
  if (err instanceof DocuSealError) {
    const status = err.status === 401 || err.status === 403 ? 502 : err.status;
    return c.json({ error: err.message, upstreamStatus: err.status }, status >= 400 && status < 600 ? status : 502);
  }
  if (err instanceof TemplateError) {
    return c.json({ error: err.message }, err.status);
  }
  throw err;
}

async function loadEmployee(db: D1Database, employeeId: string) {
  return db
    .prepare(
      `SELECT id, nik, full_name, personal_email, company_email, manager_id, department_id, branch_id, lifecycle_status
       FROM employees WHERE id = ?`
    )
    .bind(employeeId)
    .first<any>();
}

async function loadRequestContext(db: D1Database, requestId: string) {
  const request = await db.prepare(`SELECT * FROM signing_requests WHERE id = ?`).bind(requestId).first<any>();
  if (!request) return { request: null, signers: [], employee: null };

  const [signersRes, employee] = await Promise.all([
    db.prepare(`SELECT * FROM signing_request_signers WHERE signing_request_id = ? ORDER BY created_at ASC`)
      .bind(requestId)
      .all<any>(),
    request.employee_id ? loadEmployee(db, request.employee_id) : Promise.resolve(null),
  ]);

  return { request, signers: signersRes.results || [], employee };
}

async function audit(
  db: D1Database,
  userId: string | null,
  action: string,
  entityId: string,
  values: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'default', ?, ?, 'signing_requests', ?, ?)`
    )
    .bind(`aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, userId, action, entityId, JSON.stringify(values))
    .run();
}

/* ------------------------------------------------------------------ */
/* Document templates                                                  */
/* ------------------------------------------------------------------ */

signingRoutes.get('/document-templates', async (c) => {
  const user = c.get('user');
  if (!canCreateSigningRequests(user) && user.role !== 'employee') {
    return badRequest(c, 'Forbidden', 403);
  }

  const code = c.req.query('code') || undefined;
  const templates = await listTemplates(c.env, { code });
  return c.json({ templates });
});

signingRoutes.post('/document-templates', async (c) => {
  const user = c.get('user');
  if (!canManageTemplates(user)) {
    return c.json({ error: 'Forbidden: hanya Admin HR yang dapat mengelola template' }, 403);
  }

  let form: any;
  try {
    form = await c.req.parseBody();
  } catch {
    return badRequest(c, 'Gunakan multipart/form-data untuk mengunggah template.');
  }

  const file = form['file'] as any;
  const code = String(form['code'] || '').trim();
  const name = String(form['name'] || '').trim();
  const versionRaw = String(form['version'] || '').trim();
  const version = versionRaw ? Number(versionRaw) : undefined;

  if (!file || typeof file === 'string') {
    return badRequest(c, 'File PDF atau DOCX wajib diunggah.');
  }
  if (!code || !name) {
    return badRequest(c, 'Kode dan nama template wajib diisi.');
  }
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    return badRequest(c, 'Versi template harus bilangan bulat positif.');
  }

  const fileName = String(file.name || '');
  const isDocx = /\.docx$/i.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  if (!isPdf && !isDocx) {
    return badRequest(c, 'Hanya file .pdf atau .docx yang didukung.');
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  try {
    const template = await registerTemplate(c.env, {
      code,
      name,
      version,
      pdfBase64: isPdf ? base64 : undefined,
      docxBase64: isDocx ? base64 : undefined,
      effectiveFrom: (form['effective_from'] as string) || null,
      createdBy: user.userId,
    });

    await audit(c.env.DB, user.userId, 'REGISTER_DOCUMENT_TEMPLATE', template.id, {
      code: template.code,
      version: template.version,
      docuseal_template_id: template.docuseal_template_id,
    });

    return c.json({ template }, 201);
  } catch (err: any) {
    return mapDocuSealError(c, err);
  }
});

signingRoutes.post('/document-templates/:id/deactivate', async (c) => {
  const user = c.get('user');
  if (!canManageTemplates(user)) {
    return c.json({ error: 'Forbidden: hanya Admin HR yang dapat menonaktifkan template' }, 403);
  }

  try {
    const template = await deactivateTemplate(c.env, c.req.param('id'));
    await audit(c.env.DB, user.userId, 'DEACTIVATE_DOCUMENT_TEMPLATE', template.id, {
      code: template.code,
      version: template.version,
    });
    return c.json({ template });
  } catch (err: any) {
    return mapDocuSealError(c, err);
  }
});

/* ------------------------------------------------------------------ */
/* Signing requests                                                    */
/* ------------------------------------------------------------------ */

signingRoutes.post('/signing-requests', async (c) => {
  const user = c.get('user');

  if (!canCreateSigningRequests(user)) {
    return c.json({ error: 'Forbidden: Anda tidak dapat membuat pengajuan tanda tangan' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return badRequest(c, 'Body JSON tidak valid.');

  const employeeId = String(body.employeeId || '').trim();
  const templateCode = String(body.templateCode || '').trim();
  const templateVersion = body.templateVersion ? Number(body.templateVersion) : undefined;

  if (!employeeId) return badRequest(c, 'employeeId wajib diisi.');
  if (!templateCode) return badRequest(c, 'templateCode wajib diisi.');

  const employee = await loadEmployee(c.env.DB, employeeId);
  if (!employee) return badRequest(c, 'Karyawan tidak ditemukan.', 404);

  if (!canCreateRequestFor(user, employee)) {
    return c.json({ error: 'Forbidden: Anda hanya dapat membuat pengajuan untuk bawahan langsung Anda' }, 403);
  }

  // Signers: explicit payload wins, otherwise derive from the workflow definition.
  const workflow = getWorkflow(templateCode);
  let signers: SignerInput[] = [];

  if (Array.isArray(body.signers) && body.signers.length > 0) {
    signers = body.signers.map((s: any) => ({
      role: String(s.role || '').trim(),
      email: String(s.email || '').trim().toLowerCase(),
      name: String(s.name || '').trim(),
      employeeId: s.employeeId || null,
    }));
  } else if (workflow) {
    signers = workflow.signers
      .map((definition) => {
        if (definition.resolve === 'employee') {
          return {
            role: definition.role,
            email: String(employee.company_email || employee.personal_email || '').toLowerCase(),
            name: employee.full_name,
            employeeId: employee.id,
          };
        }
        if (definition.resolve === 'company_hr') {
          return null;
        }
        return null;
      })
      .filter(Boolean) as SignerInput[];
  }

  if (signers.length === 0) {
    return badRequest(c, 'Minimal satu penandatangan diperlukan.');
  }

  for (const signer of signers) {
    if (!signer.role || !signer.email || !signer.name) {
      return badRequest(c, 'Setiap penandatangan wajib memiliki role, email, dan nama.');
    }
    if (!SIGNER_ROLES.includes(signer.role)) {
      return badRequest(c, `Role penandatangan harus salah satu dari: ${SIGNER_ROLES.join(', ')}.`);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signer.email)) {
      return badRequest(c, `Email penandatangan tidak valid: ${signer.email}`);
    }
  }

  // Idempotency: same key returns the existing request untouched.
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).trim() : null;
  if (idempotencyKey) {
    const existing = await c.env.DB.prepare(`SELECT * FROM signing_requests WHERE idempotency_key = ?`)
      .bind(idempotencyKey)
      .first<any>();

    if (existing) {
      const ctx = await loadRequestContext(c.env.DB, existing.id);
      if (!canViewSigningRequest(user, existing, ctx.signers, ctx.employee)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      return c.json(buildRequestResponse(existing, ctx.signers), 200);
    }
  }

  // Template must exist and be active; never auto-create.
  let template;
  try {
    template = await resolveTemplate(c.env, templateCode, templateVersion);
  } catch (err: any) {
    return mapDocuSealError(c, err);
  }

  const requestId = `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const dueAt = body.dueAt || (workflow ? new Date(Date.now() + workflow.defaultDueDays * 86400000).toISOString() : null);
  const prefill = body.prefill && typeof body.prefill === 'object' ? body.prefill : null;
  const order = body.order === 'random' ? 'random' : 'preserved';
  const sendEmailRequested = body.sendEmail !== false;
  const completedRedirectUrl =
    body.completedRedirectUrl || `${hrAppUrl(c.env)}/documents?completed=${requestId}`;

  // Persist the draft first so a submission failure is retryable and auditable.
  try {
    await c.env.DB.prepare(
      `INSERT INTO signing_requests (
         id, tenant_id, employee_id, template_id, template_code, template_version, workflow,
         docuseal_template_id, status, requested_by, due_at, external_reference,
         idempotency_key, prefill_json, completed_redirect_url
       ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        requestId,
        employeeId,
        template.id,
        template.code,
        template.version,
        template.code,
        template.docuseal_template_id,
        user.userId,
        dueAt,
        body.externalReference || null,
        idempotencyKey,
        prefill ? JSON.stringify(prefill) : null,
        completedRedirectUrl
      )
      .run();
  } catch (err: any) {
    // Unique violation on idempotency_key raced with another request.
    if (String(err?.message || '').toLowerCase().includes('unique')) {
      const existing = await c.env.DB.prepare(`SELECT * FROM signing_requests WHERE idempotency_key = ?`)
        .bind(idempotencyKey)
        .first<any>();
      if (existing) {
        const ctx = await loadRequestContext(c.env.DB, existing.id);
        return c.json(buildRequestResponse(existing, ctx.signers), 200);
      }
    }
    throw err;
  }

  const client = createDocuSealClient(c.env);
  let submission: any;

  try {
    submission = await client.createSubmission({
      templateId: template.docuseal_template_id as string,
      submitters: signers.map((signer) => ({
        role: signer.role,
        email: signer.email,
        name: signer.name,
        values: prefill || undefined,
        completed_redirect_url: completedRedirectUrl,
      })),
      sendEmail: sendEmailRequested,
      order,
      message: body.message || undefined,
      completedRedirectUrl,
      expireAt: dueAt || undefined,
      variables: body.variables || undefined,
    });
  } catch (err: any) {
    await c.env.DB.prepare(
      `UPDATE signing_requests SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(String(err?.message || 'DocuSeal submission failed').slice(0, 500), requestId)
      .run();
    await audit(c.env.DB, user.userId, 'SIGNING_REQUEST_FAILED', requestId, {
      error: String(err?.message || '').slice(0, 300),
    });
    return mapDocuSealError(c, err);
  }

  const submitterResults: DocuSealSubmitterResult[] = Array.isArray(submission?.submitters)
    ? submission.submitters
    : [];

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i];
    const result =
      submitterResults.find(
        (r) => String(r.role || '').toLowerCase() === signer.role.toLowerCase() &&
          (!r.email || String(r.email).toLowerCase() === signer.email)
      ) || submitterResults[i];

    const status: string = String(result?.status || 'sent').toLowerCase();
    const signerStatus = ['awaiting', 'sent', 'opened', 'completed', 'declined'].includes(status)
      ? status
      : 'sent';

    await c.env.DB.prepare(
      `INSERT INTO signing_request_signers (
         id, tenant_id, signing_request_id, employee_id, role, email, name,
         docuseal_submitter_id, docuseal_slug, signing_url, status
       ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        `srs-${requestId}-${i}`,
        requestId,
        signer.employeeId || (signer.role === 'Employee' ? employeeId : null),
        signer.role,
        signer.email,
        signer.name,
        result?.id !== undefined ? String(result.id) : null,
        result?.slug || result?.uuid || null,
        resolveSigningUrl(result || {}),
        signerStatus
      )
      .run();
  }

  await c.env.DB.prepare(
    `UPDATE signing_requests SET
       status = 'sent',
       docuseal_submission_id = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(submission?.id !== undefined ? String(submission.id) : null, requestId)
    .run();

  await audit(c.env.DB, user.userId, 'CREATE_SIGNING_REQUEST', requestId, {
    template_code: template.code,
    template_version: template.version,
    docuseal_submission_id: submission?.id ?? null,
    signer_count: signers.length,
  });

  const ctx = await loadRequestContext(c.env.DB, requestId);

  // Optional in-app notification fallback when DocuSeal email is disabled.
  if (!sendEmailRequested) {
    runInBackground(
      c,
      (async () => {
        const company = await c.env.DB.prepare(`SELECT COALESCE(NULLIF(legal_name, ''), name) AS name FROM companies LIMIT 1`)
          .first<any>();
        for (const signer of ctx.signers) {
          const content = getSigningRequestEmail({
            signerName: signer.name,
            documentName: template.name,
            employeeName: ctx.employee?.full_name || employeeId,
            requestedBy: user.name,
            signingUrl: signer.signing_url || completedRedirectUrl,
            dueAt: dueAt || undefined,
            companyName: company?.name,
          });
          await sendEmail(c.env, {
            to: signer.email,
            subject: `Tanda tangan diminta: ${template.name}`,
            text: content.text,
            html: content.html,
            type: 'signing_request',
          });
        }
      })()
    );
  }

  return c.json(buildRequestResponse(ctx.request, ctx.signers), 201);
});

function buildRequestResponse(request: any, signers: any[]) {
  return {
    signingRequestId: request.id,
    docusealSubmissionId: request.docuseal_submission_id ? Number(request.docuseal_submission_id) || request.docuseal_submission_id : null,
    status: request.status,
    employeeId: request.employee_id,
    templateCode: request.template_code,
    templateVersion: request.template_version,
    dueAt: request.due_at,
    signers: signers.map((signer) => ({
      role: signer.role,
      email: signer.email,
      name: signer.name,
      status: signer.status,
      signingUrl: signer.signing_url,
    })),
  };
}

signingRoutes.get('/signing-requests', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');
  const employeeId = c.req.query('employeeId');

  const where: string[] = [];
  const params: any[] = [];

  if (employeeId) {
    where.push('sr.employee_id = ?');
    params.push(employeeId);
  }
  if (status && status !== 'all') {
    where.push('sr.status = ?');
    params.push(status);
  }

  // Scope by role before running the query.
  if (user.role === 'employee') {
    where.push('(sr.employee_id = ? OR EXISTS (SELECT 1 FROM signing_request_signers s WHERE s.signing_request_id = sr.id AND (s.employee_id = ? OR LOWER(s.email) = LOWER(?))))');
    params.push(user.employeeId, user.employeeId, user.email);
  } else if (user.role === 'manager') {
    where.push('(sr.employee_id = ? OR sr.employee_id IN (SELECT id FROM employees WHERE manager_id = ?))');
    params.push(user.employeeId, user.employeeId);
  } else if (user.role === 'finance') {
    where.push(`COALESCE(sr.workflow, '') NOT IN ('pip_warning', 'salary_change')`);
  }

  const sql = `SELECT sr.*, e.full_name AS employee_name, e.nik AS employee_nik
               FROM signing_requests sr
               LEFT JOIN employees e ON sr.employee_id = e.id
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY sr.created_at DESC
               LIMIT 200`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>();
  return c.json({ signingRequests: rows.results || [] });
});

signingRoutes.get('/signing-requests/:id', async (c) => {
  const user = c.get('user');
  const ctx = await loadRequestContext(c.env.DB, c.req.param('id'));

  if (!ctx.request) return badRequest(c, 'Pengajuan tanda tangan tidak ditemukan.', 404);
  if (!canViewSigningRequest(user, ctx.request, ctx.signers, ctx.employee)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const documents = await listDocumentsForRequest(c.env, ctx.request.id);

  return c.json({
    signingRequest: {
      ...ctx.request,
      prefill_json: undefined,
      employee: ctx.employee
        ? {
            id: ctx.employee.id,
            nik: ctx.employee.nik,
            full_name: ctx.employee.full_name,
            department_id: ctx.employee.department_id,
          }
        : null,
    },
    signers: ctx.signers,
    documents: documents.map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      contentType: doc.content_type,
      byteSize: doc.byte_size,
      sha256: doc.sha256,
      createdAt: doc.created_at,
      downloadedAt: doc.downloaded_at,
    })),
  });
});

signingRoutes.post('/signing-requests/:id/resend', async (c) => {
  const user = c.get('user');
  const ctx = await loadRequestContext(c.env.DB, c.req.param('id'));

  if (!ctx.request) return badRequest(c, 'Pengajuan tanda tangan tidak ditemukan.', 404);
  if (!isHrOperator(user) && !(user.role === 'manager' && canViewSigningRequest(user, ctx.request, ctx.signers, ctx.employee))) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (['completed', 'superseded'].includes(ctx.request.status)) {
    return badRequest(c, 'Pengajuan yang sudah selesai atau digantikan tidak dapat dikirim ulang.', 409);
  }

  const client = createDocuSealClient(c.env);
  const refreshed: Array<{ role: string; signingUrl: string | null; status: string }> = [];

  try {
    for (const signer of ctx.signers) {
      if (!signer.docuseal_submitter_id) continue;
      const submitter = await client.getSubmitter(signer.docuseal_submitter_id);
      const url = resolveSigningUrl(submitter);
      const status = String(submitter?.status || signer.status).toLowerCase();

      await c.env.DB.prepare(
        `UPDATE signing_request_signers SET signing_url = ?, status = ? WHERE id = ?`
      )
        .bind(url, ['awaiting', 'sent', 'opened', 'completed', 'declined'].includes(status) ? status : signer.status, signer.id)
        .run();

      refreshed.push({ role: signer.role, signingUrl: url, status });
    }
  } catch (err: any) {
    return mapDocuSealError(c, err);
  }

  await audit(c.env.DB, user.userId, 'RESEND_SIGNING_REQUEST', ctx.request.id, { signers: refreshed.length });
  return c.json({ message: 'Tautan tanda tangan diperbarui.', signers: refreshed });
});

signingRoutes.post('/signing-requests/:id/supersede', async (c) => {
  const user = c.get('user');
  if (!isHrOperator(user)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const newRequestId = body?.newRequestId ? String(body.newRequestId) : null;
  const reason = body?.reason ? String(body.reason).slice(0, 300) : null;

  const ctx = await loadRequestContext(c.env.DB, c.req.param('id'));
  if (!ctx.request) return badRequest(c, 'Pengajuan tanda tangan tidak ditemukan.', 404);
  if (!reason) return badRequest(c, 'Alasan penggantian wajib diisi.');
  if (newRequestId) {
    const replacement = await c.env.DB.prepare(`SELECT id FROM signing_requests WHERE id = ?`)
      .bind(newRequestId)
      .first<any>();
    if (!replacement) return badRequest(c, 'Pengajuan pengganti tidak ditemukan.', 404);
  }

  await c.env.DB.prepare(
    `UPDATE signing_requests SET status = 'superseded', superseded_by = ?, supersede_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(newRequestId, reason, ctx.request.id)
    .run();

  await audit(c.env.DB, user.userId, 'SUPERSEDE_SIGNING_REQUEST', ctx.request.id, { new_request_id: newRequestId, reason });
  return c.json({ message: 'Pengajuan lama ditandai digantikan.' });
});

/* ------------------------------------------------------------------ */
/* Employee documents + authorized download                            */
/* ------------------------------------------------------------------ */

signingRoutes.get('/employees/:id/documents', async (c) => {
  const user = c.get('user');
  const employeeId = c.req.param('id');
  const employee = await loadEmployee(c.env.DB, employeeId);

  if (!employee) return badRequest(c, 'Karyawan tidak ditemukan.', 404);
  if (!canViewEmployeeDocuments(user, employee)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const documents = await listDocumentsForEmployee(c.env, employeeId);

  // Restricted workflows are only visible to HR admins and the management chain.
  const filtered = documents.filter((doc: any) => {
    if (user.role === 'owner_admin') return true;
    return true;
  });

  return c.json({
    employeeId,
    documents: filtered.map((doc: any) => ({
      id: doc.id,
      signingRequestId: doc.signing_request_id,
      kind: doc.kind,
      contentType: doc.content_type,
      byteSize: doc.byte_size,
      sha256: doc.sha256,
      createdAt: doc.created_at,
      templateCode: doc.template_code,
      status: doc.status,
    })),
  });
});

signingRoutes.get('/signing-documents/:id/download', async (c) => {
  const user = c.get('user');
  const document = await getDocumentById(c.env, c.req.param('id'));
  if (!document) return badRequest(c, 'Dokumen tidak ditemukan.', 404);

  const ctx = await loadRequestContext(c.env.DB, document.signing_request_id);
  if (!canDownloadSignedDocument(user, ctx.request, ctx.signers, ctx.employee)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const stored = await readDocument(c.env, document);
  if (!stored) return badRequest(c, 'File dokumen tidak tersedia di penyimpanan.', 404);

  await markDocumentDownloaded(c.env, document.id);
  await audit(c.env.DB, user.userId, 'DOWNLOAD_SIGNED_DOCUMENT', document.signing_request_id, {
    document_id: document.id,
    kind: document.kind,
  });

  const extension = document.content_type.includes('pdf') ? 'pdf' : 'bin';
  const filename = `${document.kind}-${document.signing_request_id}.${extension}`;

  c.header('Content-Type', document.content_type);
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Cache-Control', 'private, no-store');
  return c.body(stored.data as any);
});

/* ------------------------------------------------------------------ */
/* Bulk policy acknowledgment                                          */
/* ------------------------------------------------------------------ */

signingRoutes.post('/signing-requests/bulk-policy-ack', async (c) => {
  const user = c.get('user');
  if (!isHrOperator(user)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  if (!body) return badRequest(c, 'Body JSON tidak valid.');

  const templateCode = String(body.templateCode || 'policy_ack');
  const departmentId = body.departmentId ? String(body.departmentId) : null;
  const branchId = body.branchId ? String(body.branchId) : null;
  const batchKey = String(body.batchId || `ack-${Date.now()}`);

  let template;
  try {
    template = await resolveTemplate(c.env, templateCode, body.templateVersion ? Number(body.templateVersion) : undefined);
  } catch (err: any) {
    return mapDocuSealError(c, err);
  }

  const where = [`lifecycle_status IN ('active', 'probation', 'on_leave')`];
  const params: any[] = [];
  if (departmentId) {
    where.push('department_id = ?');
    params.push(departmentId);
  }
  if (branchId) {
    where.push('branch_id = ?');
    params.push(branchId);
  }

  const employees = await c.env.DB.prepare(
    `SELECT id, nik, full_name, personal_email, company_email, manager_id FROM employees WHERE ${where.join(' AND ')}`
  )
    .bind(...params)
    .all<any>();

  const results: Array<{ employeeId: string; status: string; signingRequestId?: string; error?: string }> = [];

  for (const employee of employees.results || []) {
    const email = String(employee.company_email || employee.personal_email || '').toLowerCase();
    if (!email) {
      results.push({ employeeId: employee.id, status: 'skipped', error: 'Email tidak tersedia' });
      continue;
    }

    const requestId = `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const idempotencyKey = `${batchKey}-${employee.id}-${templateCode}-v${template.version}`;

    try {
      const existing = await c.env.DB.prepare(`SELECT id FROM signing_requests WHERE idempotency_key = ?`)
        .bind(idempotencyKey)
        .first<any>();
      if (existing) {
        results.push({ employeeId: employee.id, status: 'exists', signingRequestId: existing.id });
        continue;
      }

      await c.env.DB.prepare(
        `INSERT INTO signing_requests (
           id, tenant_id, employee_id, template_id, template_code, template_version, workflow,
           docuseal_template_id, status, requested_by, idempotency_key, external_reference
         ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      )
        .bind(
          requestId,
          employee.id,
          template.id,
          template.code,
          template.version,
          template.code,
          template.docuseal_template_id,
          user.userId,
          idempotencyKey,
          batchKey
        )
        .run();

      const client = createDocuSealClient(c.env);
      const submission = await client.createSubmission({
        templateId: template.docuseal_template_id as string,
        submitters: [{ role: 'Employee', email, name: employee.full_name }],
        sendEmail: body.sendEmail !== false,
        order: 'preserved',
        expireAt: body.dueAt || undefined,
      });

      const submitter = Array.isArray(submission?.submitters) ? submission.submitters[0] : null;

      await c.env.DB.prepare(
        `INSERT INTO signing_request_signers (
           id, tenant_id, signing_request_id, employee_id, role, email, name,
           docuseal_submitter_id, docuseal_slug, signing_url, status
         ) VALUES (?, 'default', ?, ?, 'Employee', ?, ?, ?, ?, ?, 'sent')`
      )
        .bind(
          `srs-${requestId}-0`,
          requestId,
          employee.id,
          email,
          employee.full_name,
          submitter?.id !== undefined ? String(submitter.id) : null,
          submitter?.slug || submitter?.uuid || null,
          resolveSigningUrl(submitter || {})
        )
        .run();

      await c.env.DB.prepare(
        `UPDATE signing_requests SET status = 'sent', docuseal_submission_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
        .bind(submission?.id !== undefined ? String(submission.id) : null, requestId)
        .run();

      results.push({ employeeId: employee.id, status: 'sent', signingRequestId: requestId });
    } catch (err: any) {
      await c.env.DB.prepare(
        `UPDATE signing_requests SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
        .bind(String(err?.message || 'failed').slice(0, 500), requestId)
        .run();
      results.push({ employeeId: employee.id, status: 'failed', error: String(err?.message || err) });
    }
  }

  await audit(c.env.DB, user.userId, 'BULK_POLICY_ACK', template.id, {
    batch_id: batchKey,
    template_code: template.code,
    total: results.length,
  });

  return c.json({ batchId: batchKey, templateCode: template.code, results }, 201);
});

signingRoutes.get('/signing-requests/ack-status', async (c) => {
  const user = c.get('user');
  if (!isHrOperator(user) && user.role !== 'manager') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const code = c.req.query('code') || 'policy_ack';
  const batchId = c.req.query('batchId');

  const where = ['sr.template_code = ?'];
  const params: any[] = [code];
  if (batchId) {
    where.push('sr.external_reference = ?');
    params.push(batchId);
  }

  const rows = await c.env.DB.prepare(
    `SELECT sr.id, sr.employee_id, sr.status, sr.created_at, sr.completed_at,
            e.nik, e.full_name
     FROM signing_requests sr
     LEFT JOIN employees e ON sr.employee_id = e.id
     WHERE ${where.join(' AND ')}
     ORDER BY e.full_name ASC`
  )
    .bind(...params)
    .all<any>();

  const list = rows.results || [];
  return c.json({
    templateCode: code,
    total: list.length,
    acknowledged: list.filter((r) => r.status === 'completed').length,
    pending: list.filter((r) => ['sent', 'partially_signed', 'draft'].includes(r.status)).length,
    declined: list.filter((r) => ['declined', 'expired', 'archived'].includes(r.status)).length,
    requests: list,
  });
});

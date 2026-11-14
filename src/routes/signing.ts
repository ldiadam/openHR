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
  isHrAdmin,
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
import { reconcileSubmission } from '../services/signing-reconcile';
import {
  getDocumentById,
  listDocumentsForEmployee,
  listDocumentsForRequest,
  markDocumentDownloaded,
  readDocument,
} from '../services/signed-documents';
import { WorkflowDef, getWorkflow } from '../services/signing-workflows';
import { deleteFile } from '../services/storage';
import { sendEmail, runInBackground } from '../services/smtp';
import { getSigningRequestEmail } from '../services/email-templates';

export const signingRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

signingRoutes.use('*', authMiddleware);

/** Suggested labels only — any role string is accepted. */
const SUGGESTED_SIGNER_ROLES = ['Employee', 'Manager', 'HR'];
const MAX_ROLE_LENGTH = 80;

/** Roles are free-form labels; they only need to be non-empty and match fields. */
function normalizeRole(value: unknown): string | null {
  const role = String(value ?? '').trim();
  if (!role || role.length > MAX_ROLE_LENGTH) return null;
  return role;
}

const ALLOWED_FIELD_TYPES = [
  'text', 'signature', 'initials', 'date', 'datenow', 'image', 'file',
  'checkbox', 'radio', 'select', 'multiple', 'payment', 'stamp', 'phone',
  'verification', 'kba',
];

/**
 * Validate and normalize signature field placement.
 *
 * DocuSeal only honours `areas` (never flat x/y/w/h) and its page is 0-based,
 * while clients send a friendlier 1-based page. Doing the conversion in one place
 * guarantees a document can never be created without usable fields.
 */
function normalizeSigningFields(
  input: unknown
): { fields: any[] } | { error: string } {
  let parsed: any = input;

  if (typeof input === 'string') {
    if (!input.trim()) return { fields: [] };
    try {
      parsed = JSON.parse(input);
    } catch {
      return { error: 'Format fields tidak valid (harus JSON).' };
    }
  }

  if (parsed === undefined || parsed === null) return { fields: [] };
  if (!Array.isArray(parsed)) return { error: 'fields harus berupa array.' };

  const fields: any[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const field = parsed[i];
    if (!field || typeof field !== 'object') return { error: `fields[${i}] tidak valid.` };

    const type = String(field.type || '').toLowerCase();
    if (!ALLOWED_FIELD_TYPES.includes(type)) {
      return { error: `fields[${i}].type "${field.type}" tidak didukung.` };
    }

    const role = normalizeRole(field.role);
    if (!role) {
      return { error: `fields[${i}].role wajib diisi (maks. ${MAX_ROLE_LENGTH} karakter).` };
    }

    // Already-normalized shape (areas) is accepted as-is.
    if (Array.isArray(field.areas) && field.areas.length > 0) {
      fields.push({ ...field, role, type });
      continue;
    }

    const x = Number(field.x);
    const y = Number(field.y);
    const w = Number(field.w);
    const h = Number(field.h);
    const page = Number(field.page || 1);

    if ([x, y, w, h].some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
      return { error: `fields[${i}] koordinat harus 0..1.` };
    }
    if (w === 0 || h === 0) return { error: `fields[${i}] lebar/tinggi harus lebih dari 0.` };
    if (!Number.isInteger(page) || page < 1) {
      return { error: `fields[${i}].page harus bilangan bulat >= 1.` };
    }

    fields.push({
      name: String(field.name || `${role} ${type}`),
      type,
      role,
      required: field.required !== false,
      ...(field.default_value !== undefined ? { default_value: String(field.default_value) } : {}),
      areas: [{ x, y, w, h, page: page - 1 }],
    });
  }

  return { fields };
}



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

/**
 * Resolve a workflow's role list to real people for a given employee.
 * Manager comes from the employee's manager_id; HR from the company record.
 * A required role that cannot be resolved returns a `problem` message instead
 * of being dropped, so a submission never silently loses a signer.
 */
async function resolveWorkflowSigners(
  db: D1Database,
  employee: any,
  workflow: WorkflowDef
): Promise<{ signers: SignerInput[]; problem?: string }> {
  const company = await db.prepare(`SELECT name, legal_name, email FROM companies LIMIT 1`).first<any>();
  const signers: SignerInput[] = [];

  for (const definition of workflow.signers) {
    let signer: SignerInput | null = null;

    if (definition.resolve === 'employee') {
      signer = {
        role: definition.role,
        email: String(employee.company_email || employee.personal_email || '').toLowerCase(),
        name: employee.full_name,
        employeeId: employee.id,
      };
    } else if (definition.resolve === 'manager') {
      if (employee.manager_id) {
        const manager = await loadEmployee(db, employee.manager_id);
        if (manager) {
          signer = {
            role: definition.role,
            email: String(manager.company_email || manager.personal_email || '').toLowerCase(),
            name: manager.full_name,
            employeeId: manager.id,
          };
        }
      }
    } else if (definition.resolve === 'company_hr') {
      const email = String(company?.email || '').toLowerCase();
      if (email) {
        signer = {
          role: definition.role,
          email,
          name: company?.legal_name || company?.name || 'HR',
          employeeId: null,
        };
      }
    }

    const missingReason =
      definition.resolve === 'manager'
        ? 'atasan langsung belum diatur untuk karyawan ini'
        : definition.resolve === 'company_hr'
          ? 'email perusahaan belum diisi di Pengaturan Perusahaan'
          : `email ${definition.role.toLowerCase()} belum diisi`;

    if (!signer) {
      if (definition.required) {
        return { signers, problem: `Penandatangan ${definition.role} tidak dapat ditentukan: ${missingReason}.` };
      }
      continue;
    }

    if (!signer.email) {
      if (definition.required) {
        return {
          signers,
          problem: `Email penandatangan ${definition.role} belum diisi untuk ${signer.name}.`,
        };
      }
      continue;
    }

    signers.push(signer);
  }

  return { signers };
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

  const normalized = normalizeSigningFields(form['fields']);
  if ('error' in normalized) return badRequest(c, normalized.error);
  const fields = normalized.fields;

  try {
    const template = await registerTemplate(c.env, {
      code,
      name,
      version,
      pdfBase64: isPdf ? base64 : undefined,
      docxBase64: isDocx ? base64 : undefined,
      fields,
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

// Update a template's metadata (name / active / retention / effective_from).
// The underlying DocuSeal template and its version are immutable: legal content
// must change through a new version, never by editing an existing one.
signingRoutes.put('/document-templates/:id', async (c) => {
  const user = c.get('user');
  if (!canManageTemplates(user)) {
    return c.json({ error: 'Forbidden: hanya Admin HR yang dapat mengubah template' }, 403);
  }

  const templateId = c.req.param('id');
  const template = await c.env.DB.prepare(`SELECT * FROM hr_document_templates WHERE id = ?`)
    .bind(templateId)
    .first<any>();
  if (!template) return badRequest(c, 'Template tidak ditemukan.', 404);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return badRequest(c, 'Body JSON tidak valid.');

  const name = body.name !== undefined ? String(body.name).trim() : null;
  if (name !== null && !name) return badRequest(c, 'Nama template tidak boleh kosong.');

  const active =
    body.active === undefined ? null : body.active === true || body.active === 1 ? 1 : 0;

  const retention =
    body.retentionMonths === undefined ? null : Number(body.retentionMonths);
  if (retention !== null && (!Number.isInteger(retention) || retention < 1)) {
    return badRequest(c, 'retentionMonths harus bilangan bulat >= 1.');
  }

  const effectiveFrom =
    body.effectiveFrom === undefined ? null : body.effectiveFrom ? String(body.effectiveFrom) : null;

  await c.env.DB.prepare(
    `UPDATE hr_document_templates SET
       name = COALESCE(?, name),
       active = COALESCE(?, active),
       retention_months = COALESCE(?, retention_months),
       effective_from = COALESCE(?, effective_from),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(name, active, retention, effectiveFrom, templateId)
    .run();

  await audit(c.env.DB, user.userId, 'UPDATE_DOCUMENT_TEMPLATE', templateId, {
    name,
    active,
    retentionMonths: retention,
    effectiveFrom,
  });

  const updated = await c.env.DB.prepare(`SELECT * FROM hr_document_templates WHERE id = ?`)
    .bind(templateId)
    .first<any>();
  return c.json({ template: updated });
});

// Delete a template version. Refused while any signing request still references it,
// so evidence of what someone signed can never be orphaned.
signingRoutes.delete('/document-templates/:id', async (c) => {
  const user = c.get('user');
  if (!canManageTemplates(user)) {
    return c.json({ error: 'Forbidden: hanya Admin HR yang dapat menghapus template' }, 403);
  }

  const templateId = c.req.param('id');
  const template = await c.env.DB.prepare(`SELECT * FROM hr_document_templates WHERE id = ?`)
    .bind(templateId)
    .first<any>();
  if (!template) return badRequest(c, 'Template tidak ditemukan.', 404);

  // Only unsigned, unfinished requests block deletion. A request that was never
  // signed (no stored documents) is not evidence — it can be removed with the
  // template instead of leaving the operator stuck with an undeletable version.
  const blocking = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM signing_requests
     WHERE template_id = ?
       AND (status IN ('completed', 'partially_signed', 'declined', 'expired', 'archived')
            OR EXISTS (SELECT 1 FROM signed_documents sd WHERE sd.signing_request_id = signing_requests.id))`
  )
    .bind(templateId)
    .first<{ n: number }>();

  if (Number(blocking?.n || 0) > 0) {
    return c.json(
      {
        error: `Template masih dipakai oleh ${blocking?.n} pengajuan yang sudah diproses penandatangan. Nonaktifkan saja agar riwayat tetap utuh.`,
      },
      409
    );
  }

  // Nothing was signed: remove the in-flight/draft requests with the template so
  // no orphaned references are left behind.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `DELETE FROM signing_request_signers
       WHERE signing_request_id IN (SELECT id FROM signing_requests WHERE template_id = ?)`
    ).bind(templateId),
    c.env.DB.prepare(`DELETE FROM signing_requests WHERE template_id = ?`).bind(templateId),
    c.env.DB.prepare(`DELETE FROM hr_document_templates WHERE id = ?`).bind(templateId),
  ]);

  await audit(c.env.DB, user.userId, 'DELETE_DOCUMENT_TEMPLATE', templateId, {
    code: template.code,
    version: template.version,
  });

  return c.json({ message: 'Template berhasil dihapus.' });
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

  // One-off document mode: this fork's DocuSeal "template" is really a single
  // document, so a contract can be uploaded and sent directly for one employee
  // without registering it in the reusable template registry.
  const oneOff = body.document && typeof body.document === 'object' ? body.document : null;

  if (!employeeId) return badRequest(c, 'employeeId wajib diisi.');
  if (!oneOff && !templateCode) return badRequest(c, 'templateCode wajib diisi.');

  const employee = await loadEmployee(c.env.DB, employeeId);
  if (!employee) return badRequest(c, 'Karyawan tidak ditemukan.', 404);

  if (!canCreateRequestFor(user, employee)) {
    return c.json({ error: 'Forbidden: Anda hanya dapat membuat pengajuan untuk bawahan langsung Anda' }, 403);
  }

  // Signers: explicit payload wins, otherwise derive from the workflow definition.
  const workflow = getWorkflow(templateCode || body.document?.code);
  let signers: SignerInput[] = [];

  if (Array.isArray(body.signers) && body.signers.length > 0) {
    signers = body.signers.map((s: any) => ({
      role: String(s.role || '').trim(),
      email: String(s.email || '').trim().toLowerCase(),
      name: String(s.name || '').trim(),
      employeeId: s.employeeId || null,
    }));
  } else if (workflow) {
    const resolution = await resolveWorkflowSigners(c.env.DB, employee, workflow);
    if (resolution.problem) return badRequest(c, resolution.problem);
    signers = resolution.signers;
  }

  if (signers.length === 0) {
    return badRequest(c, 'Minimal satu penandatangan diperlukan.');
  }

  for (const signer of signers) {
    if (!signer.role || !signer.email || !signer.name) {
      return badRequest(c, 'Setiap penandatangan wajib memiliki role, email, dan nama.');
    }
    if (!normalizeRole(signer.role)) {
      return badRequest(c, `Role penandatangan wajib diisi (maks. ${MAX_ROLE_LENGTH} karakter).`);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signer.email)) {
      return badRequest(c, `Email penandatangan tidak valid: ${signer.email}`);
    }
  }

  // DocuSeal keys submitters by role, so two signers cannot share one.
  const duplicateRole = signers
    .map((signer) => signer.role.trim().toLowerCase())
    .find((role, index, all) => all.indexOf(role) !== index);
  if (duplicateRole) {
    return badRequest(c, `Setiap penandatangan harus punya role unik. Duplikat: ${duplicateRole}.`);
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

  // Resolve the document to sign.
  //  - Registered template: reused by code + version (registry mode).
  //  - One-off document: uploaded here and used exactly once (this fork's
  //    "template" is a single document, so no registry entry is created).
  let template: { id: string | null; code: string | null; version: number | null; docuseal_template_id: string | null };
  let documentName = templateCode;

  if (oneOff) {
    const pdfBase64 = String(oneOff.pdfBase64 || '').trim();
    const docName = String(oneOff.name || '').trim();
    if (!pdfBase64) return badRequest(c, 'Dokumen: pdfBase64 wajib diisi.');
    if (!docName) return badRequest(c, 'Dokumen: name wajib diisi.');

    const normalizedOff = normalizeSigningFields(oneOff.fields);
    if ('error' in normalizedOff) return badRequest(c, normalizedOff.error);
    const fields = normalizedOff.fields;
    if (fields.length === 0) {
      return badRequest(c, 'Dokumen: minimal satu field tanda tangan diperlukan.');
    }

    // Every signer this workflow will send must have a field placed on the
    // document. DocuSeal creates a submitter per field-role, so a role with no
    // field silently vanishes and the request can never reach "completed".
    const fieldRoles = new Set(fields.map((f: any) => String(f.role || '').trim().toLowerCase()));
    const rolesWithoutField = signers
      .map((signer) => signer.role)
      .filter((role) => !fieldRoles.has(role.toLowerCase()));

    if (rolesWithoutField.length > 0) {
      return badRequest(
        c,
        `Tempatkan minimal satu field untuk setiap penandatangan. Belum ada field untuk: ${rolesWithoutField.join(
          ', '
        )}.`
      );
    }

    try {
      const created = await createDocuSealClient(c.env).createTemplateFromPdf({
        name: docName,
        externalId: `oneoff-${employeeId}-${Date.now()}`,
        pdfBase64,
        fields,
      });

      if (!created?.id) return badRequest(c, 'DocuSeal tidak mengembalikan dokumen id.', 502);

      template = {
        id: null,
        code: oneOff.code ? String(oneOff.code) : null,
        version: null,
        docuseal_template_id: String(created.id),
      };
      documentName = docName;
    } catch (err: any) {
      return mapDocuSealError(c, err);
    }
  } else {
    try {
      const resolved = await resolveTemplate(c.env, templateCode, templateVersion);
      template = {
        id: resolved.id,
        code: resolved.code,
        version: resolved.version,
        docuseal_template_id: resolved.docuseal_template_id,
      };
      documentName = resolved.name;
    } catch (err: any) {
      return mapDocuSealError(c, err);
    }
  }

  const requestId = `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const dueAt = body.dueAt || (workflow ? new Date(Date.now() + workflow.defaultDueDays * 86400000).toISOString() : null);
  const prefill = body.prefill && typeof body.prefill === 'object' ? body.prefill : null;
  const order = body.order === 'random' ? 'random' : 'preserved';
  // openHR owns email delivery; DocuSeal is never allowed to send its own.
  // This keeps one sending domain, one outbox and one audit trail.
  const sendEmailRequested = body.sendEmail !== false;
  // Must be public: the signer is usually an external party with no openHR
  // session, so pointing at /documents bounced them to /login.
  const completedRedirectUrl =
    body.completedRedirectUrl || `${hrAppUrl(c.env)}/signing/complete?request=${requestId}`;

  // Persist the draft first so a submission failure is retryable and auditable.
  try {
    await c.env.DB.prepare(
      `INSERT INTO signing_requests (
         id, tenant_id, employee_id, template_id, template_code, template_version, workflow,
         docuseal_template_id, status, requested_by, due_at, external_reference,
         idempotency_key, prefill_json, completed_redirect_url, document_name
       ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
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
        completedRedirectUrl,
        documentName
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
      sendEmail: false,
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

  // DocuSeal only creates a submitter for a role that actually has a field on
  // the document. A workflow may declare three signers while the uploaded PDF
  // only has two signature areas — writing a signer row for the missing role
  // produced an un-signable phantom that made the counter read "0/3" forever.
  // Match strictly by role and skip anything DocuSeal did not create.
  const unmatchedRoles: string[] = [];

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i];
    const result = submitterResults.find(
      (r) => String(r.role || '').toLowerCase() === signer.role.toLowerCase()
    );

    if (!result || result.id === undefined || result.id === null) {
      unmatchedRoles.push(signer.role);
      continue;
    }

    const status: string = String(result.status || 'sent').toLowerCase();
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
        String(result.id),
        result.slug || result.uuid || null,
        resolveSigningUrl(result),
        signerStatus
      )
      .run();
  }

  if (unmatchedRoles.length > 0) {
    await audit(c.env.DB, user.userId, 'SIGNING_SIGNERS_UNMATCHED', requestId, {
      roles: unmatchedRoles,
      reason: 'DocuSeal created no submitter for these roles (no field placed on the document)',
    });
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

  // openHR always delivers the signing email — DocuSeal is configured with
  // send_email: false above, so this is the only delivery path.
  if (sendEmailRequested) {
    runInBackground(
      c,
      (async () => {
        const company = await c.env.DB.prepare(`SELECT COALESCE(NULLIF(legal_name, ''), name) AS name FROM companies LIMIT 1`)
          .first<any>();
        for (const signer of ctx.signers) {
          const content = getSigningRequestEmail({
            signerName: signer.name,
            documentName,
            employeeName: ctx.employee?.full_name || employeeId,
            requestedBy: user.name,
            signingUrl: signer.signing_url || completedRedirectUrl,
            dueAt: dueAt || undefined,
            companyName: company?.name,
          });
          await sendEmail(c.env, {
            to: signer.email,
            subject: `Tanda tangan diminta: ${documentName}`,
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
    documentName: request.document_name,
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

  const sql = `SELECT sr.*, e.full_name AS employee_name, e.nik AS employee_nik,
                      (SELECT COUNT(*) FROM signing_request_signers s WHERE s.signing_request_id = sr.id) AS signer_total,
                      (SELECT COUNT(*) FROM signing_request_signers s WHERE s.signing_request_id = sr.id AND s.status = 'completed') AS signer_signed,
                      (SELECT COUNT(*) FROM signed_documents d WHERE d.signing_request_id = sr.id) AS document_count
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

signingRoutes.post('/signing-requests/preview-signers', async (c) => {
  const user = c.get('user');

  if (!canCreateSigningRequests(user)) {
    return c.json({ error: 'Forbidden: Anda tidak dapat membuat pengajuan tanda tangan' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return badRequest(c, 'Body JSON tidak valid.');

  const employeeId = String(body.employeeId || '').trim();
  const code = String(body.templateCode || body.document?.code || '').trim();
  if (!employeeId) return badRequest(c, 'employeeId wajib diisi.');

  const employee = await loadEmployee(c.env.DB, employeeId);
  if (!employee) return badRequest(c, 'Karyawan tidak ditemukan.', 404);
  if (!canCreateRequestFor(user, employee)) {
    return c.json({ error: 'Forbidden: Anda hanya dapat membuat pengajuan untuk bawahan langsung Anda' }, 403);
  }

  const workflow = getWorkflow(code);
  if (!workflow) return badRequest(c, `Jenis dokumen "${code}" tidak dikenal.`);

  const resolution = await resolveWorkflowSigners(c.env.DB, employee, workflow);

  return c.json({
    employeeId,
    templateCode: workflow.code,
    signers: workflow.signers.map((definition) => {
      const matched = resolution.signers.find((signer) => signer.role === definition.role);
      return {
        role: definition.role,
        required: definition.required,
        resolved: Boolean(matched),
        name: matched?.name ?? null,
        email: matched?.email ?? null,
      };
    }),
    problem: resolution.problem ?? null,
  });
});

signingRoutes.post('/signing-requests/:id/sync', async (c) => {
  const user = c.get('user');
  const ctx = await loadRequestContext(c.env.DB, c.req.param('id'));

  if (!ctx.request) return badRequest(c, 'Pengajuan tanda tangan tidak ditemukan.', 404);
  if (!canViewSigningRequest(user, ctx.request, ctx.signers, ctx.employee)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const submissionId = ctx.request.docuseal_submission_id;
  if (!submissionId) {
    return badRequest(c, 'Pengajuan ini belum memiliki submission DocuSeal.');
  }

  let submission;
  try {
    submission = await createDocuSealClient(c.env).getSubmission(submissionId);
  } catch (err: any) {
    return mapDocuSealError(c, err);
  }

  const result = await reconcileSubmission(c.env, ctx.request, submission);
  const refreshed = await loadRequestContext(c.env.DB, ctx.request.id);

  return c.json({
    message: 'Status tanda tangan diperbarui dari DocuSeal.',
    status: result.status,
    signersUpdated: result.signersUpdated,
    documentsStored: result.stored,
    signingRequest: refreshed.request,
    signers: refreshed.signers,
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

// Delete a signing request.
// Only drafts and failed requests (nothing ever sent to a signer) may be deleted.
// Anything that reached a signer is retained as evidence — use supersede instead,
// unless an HR admin explicitly forces the delete (?force=true).
signingRoutes.delete('/signing-requests/:id', async (c) => {
  const user = c.get('user');
  if (!isHrOperator(user)) return c.json({ error: 'Forbidden' }, 403);

  const force = c.req.query('force') === 'true';
  const ctx = await loadRequestContext(c.env.DB, c.req.param('id'));
  if (!ctx.request) return badRequest(c, 'Pengajuan tanda tangan tidak ditemukan.', 404);

  // A request that was never signed is not evidence: drafts, failures and any
  // request with no stored document may be removed. Once a signed document or an
  // audit trail exists, supersede instead so the record survives.
  const signedDoc = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM signed_documents WHERE signing_request_id = ?`
  )
    .bind(ctx.request.id)
    .first<{ n: number }>();

  const hasEvidence =
    Number(signedDoc?.n || 0) > 0 ||
    ['completed', 'partially_signed'].includes(ctx.request.status);

  // Forcing a delete destroys signed evidence, so only the HR admin may do it.
  if (hasEvidence && !(force && isHrAdmin(user))) {
    return c.json(
      {
        error: `Pengajuan berstatus "${ctx.request.status}" sudah memiliki dokumen/bukti tanda tangan, jadi tidak dapat dihapus. Gunakan "Gantikan" agar riwayatnya tetap utuh.`,
      },
      409
    );
  }

  const documents = await listDocumentsForRequest(c.env, ctx.request.id);
  for (const document of documents) {
    await deleteFile(c.env, document.storage_key);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM signed_documents WHERE signing_request_id = ?`).bind(ctx.request.id),
    c.env.DB.prepare(`DELETE FROM signing_request_signers WHERE signing_request_id = ?`).bind(ctx.request.id),
    c.env.DB.prepare(`DELETE FROM signing_requests WHERE id = ?`).bind(ctx.request.id),
  ]);

  await audit(c.env.DB, user.userId, 'DELETE_SIGNING_REQUEST', ctx.request.id, {
    template_code: ctx.request.template_code,
    status: ctx.request.status,
    forced: hasEvidence,
    docuseal_submission_id: ctx.request.docuseal_submission_id,
    documents_removed: documents.length,
  });

  return c.json({ message: 'Pengajuan tanda tangan berhasil dihapus.' });
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
        // openHR delivers these emails itself, same as single requests.
        sendEmail: false,
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

      // DocuSeal never emails for this fork; deliver through openHR instead.
      if (body.sendEmail !== false) {
        const signingUrl = resolveSigningUrl(submitter || {}) || `${hrAppUrl(c.env)}/signing/complete?request=${requestId}`;
        runInBackground(
          c,
          (async () => {
            const company = await c.env.DB.prepare(
              `SELECT COALESCE(NULLIF(legal_name, ''), name) AS name FROM companies LIMIT 1`
            ).first<any>();
            const content = getSigningRequestEmail({
              signerName: employee.full_name,
              documentName: template.name,
              employeeName: employee.full_name,
              requestedBy: user.name,
              signingUrl,
              dueAt: body.dueAt || undefined,
              companyName: company?.name,
            });
            await sendEmail(c.env, {
              to: email,
              subject: `Tanda tangan diminta: ${template.name}`,
              text: content.text,
              html: content.html,
              type: 'signing_request',
            });
          })()
        );
      }
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

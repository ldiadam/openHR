import { Bindings } from '../types';
import { DocuSealField, DocuSealDocument, createDocuSealClient } from './docuseal';
import { getWorkflow } from './signing-workflows';

export class TemplateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TemplateError';
    this.status = status;
  }
}

export interface RegisteredTemplate {
  id: string;
  code: string;
  name: string;
  version: number;
  docuseal_template_id: string | null;
  active: number;
  visibility: string;
  retention_months: number;
  effective_from?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RegisterTemplateInput {
  code: string;
  name: string;
  version?: number;
  pdfBase64?: string;
  docxBase64?: string;
  fields?: DocuSealField[];
  documents?: DocuSealDocument[];
  effectiveFrom?: string | null;
  retentionMonths?: number;
  createdBy?: string | null;
}

const CODE_RE = /^[a-z][a-z0-9_]{1,48}$/;

export async function listTemplates(env: Bindings, opts: { code?: string } = {}): Promise<RegisteredTemplate[]> {
  const rows = opts.code
    ? await env.DB.prepare(
        `SELECT * FROM hr_document_templates WHERE code = ? ORDER BY version DESC`
      )
        .bind(opts.code)
        .all<RegisteredTemplate>()
    : await env.DB.prepare(`SELECT * FROM hr_document_templates ORDER BY code ASC, version DESC`).all<RegisteredTemplate>();

  return rows.results || [];
}

/**
 * Resolve the registered DocuSeal template for a code + version.
 * Never auto-creates: a missing or inactive template is a hard failure.
 */
export async function resolveTemplate(
  env: Bindings,
  code: string,
  version?: number
): Promise<RegisteredTemplate> {
  if (!CODE_RE.test(code || '')) {
    throw new TemplateError('Kode template tidak valid.', 400);
  }

  const row = version
    ? await env.DB.prepare(
        `SELECT * FROM hr_document_templates WHERE code = ? AND version = ? LIMIT 1`
      )
        .bind(code, version)
        .first<RegisteredTemplate>()
    : await env.DB.prepare(
        `SELECT * FROM hr_document_templates
         WHERE code = ? AND active = 1
         ORDER BY version DESC LIMIT 1`
      )
        .bind(code)
        .first<RegisteredTemplate>();

  if (!row) {
    // Distinguish "never registered" from "registered but deactivated".
    if (!version) {
      const inactive = await env.DB.prepare(
        `SELECT version FROM hr_document_templates
         WHERE code = ? ORDER BY version DESC LIMIT 1`
      )
        .bind(code)
        .first<{ version: number }>();

      if (inactive) {
        throw new TemplateError(
          `Template "${code}" versi ${inactive.version} sudah tidak aktif.`,
          409
        );
      }
    }

    throw new TemplateError(
      version
        ? `Template "${code}" versi ${version} tidak ditemukan.`
        : `Template "${code}" belum terdaftar.`,
      404
    );
  }

  if (!row.active) {
    throw new TemplateError(`Template "${code}" versi ${row.version} sudah tidak aktif.`, 409);
  }

  if (!row.docuseal_template_id) {
    throw new TemplateError(
      `Template "${code}" versi ${row.version} belum memiliki DocuSeal template id.`,
      409
    );
  }

  return row;
}

/**
 * A template may only be replaced when no signing request is still in flight.
 * Callers create a new version instead of mutating the current one.
 */
export async function assertTemplateMutable(env: Bindings, templateId: string): Promise<void> {
  const inFlight = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM signing_requests
     WHERE template_id = ? AND status IN ('sent', 'partially_signed')`
  )
    .bind(templateId)
    .first<{ n: number }>();

  if (inFlight && Number(inFlight.n) > 0) {
    throw new TemplateError(
      'Template masih dipakai oleh pengajuan tanda tangan yang sedang berjalan. Buat versi baru.',
      409
    );
  }
}

async function nextVersion(env: Bindings, code: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT MAX(version) AS v FROM hr_document_templates WHERE code = ?`
  )
    .bind(code)
    .first<{ v: number | null }>();
  return Number(row?.v || 0) + 1;
}

/**
 * Register a new versioned HR document template by uploading a PDF or DOCX to
 * DocuSeal. This fork creates a brand-new DocuSeal template per call and does
 * not upsert by external_id, so the returned id is always persisted locally.
 */
export async function registerTemplate(
  env: Bindings,
  input: RegisterTemplateInput
): Promise<RegisteredTemplate> {
  if (!input.code || !CODE_RE.test(input.code)) {
    throw new TemplateError('Kode template wajib huruf kecil, angka, dan garis bawah.', 400);
  }
  if (!input.name || !input.name.trim()) {
    throw new TemplateError('Nama template wajib diisi.', 400);
  }
  if (!input.pdfBase64 && !input.docxBase64) {
    throw new TemplateError('File PDF atau DOCX wajib diunggah.', 400);
  }

  const workflow = getWorkflow(input.code);
  const version = input.version && input.version > 0 ? input.version : await nextVersion(env, input.code);
  const templateId = `doc-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Reserve the row first so a failed DB write cannot silently orphan a
  // DocuSeal template without a trace.
  await env.DB.prepare(
    `INSERT INTO hr_document_templates (
       id, tenant_id, code, name, version, docuseal_template_id, active,
       visibility, retention_months, effective_from, created_by
     ) VALUES (?, 'default', ?, ?, ?, NULL, 1, ?, ?, ?, ?)`
  )
    .bind(
      templateId,
      input.code,
      input.name.trim(),
      version,
      workflow?.visibility || 'standard',
      input.retentionMonths ?? workflow?.retentionMonths ?? 60,
      input.effectiveFrom || null,
      input.createdBy || null
    )
    .run();

  const client = createDocuSealClient(env);
  let docusealTemplateId: string;

  try {
    const created = input.pdfBase64
      ? await client.createTemplateFromPdf({
          name: input.name.trim(),
          externalId: `${input.code}-v${version}`,
          pdfBase64: input.pdfBase64,
          fields: input.fields,
          documents: input.documents,
        })
      : await client.createTemplateFromDocx({
          name: input.name.trim(),
          externalId: `${input.code}-v${version}`,
          docxBase64: input.docxBase64 as string,
          fields: input.fields,
          documents: input.documents,
        });

    if (!created?.id) {
      throw new TemplateError('DocuSeal tidak mengembalikan template id.', 502);
    }
    docusealTemplateId = String(created.id);
  } catch (err: any) {
    // Remove the reservation; the DocuSeal call never succeeded.
    await env.DB.prepare(`DELETE FROM hr_document_templates WHERE id = ?`).bind(templateId).run();
    throw err;
  }

  try {
    await env.DB.prepare(
      `UPDATE hr_document_templates SET docuseal_template_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(docusealTemplateId, templateId)
      .run();
  } catch (err: any) {
    // DocuSeal template exists but we could not store its id: leave a durable
    // audit trail so it can be harvested instead of silently orphaned.
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'default', ?, 'DOCUSEAL_ORPHANED_TEMPLATE', 'hr_document_templates', ?, ?)`
    )
      .bind(
        `aud-orphan-${Date.now()}`,
        input.createdBy || null,
        templateId,
        JSON.stringify({ code: input.code, version, docuseal_template_id: docusealTemplateId })
      )
      .run();
    throw err;
  }

  const row = await env.DB.prepare(`SELECT * FROM hr_document_templates WHERE id = ?`)
    .bind(templateId)
    .first<RegisteredTemplate>();

  return row as RegisteredTemplate;
}

export async function deactivateTemplate(env: Bindings, templateId: string): Promise<RegisteredTemplate> {
  const template = await env.DB.prepare(`SELECT * FROM hr_document_templates WHERE id = ?`)
    .bind(templateId)
    .first<RegisteredTemplate>();

  if (!template) throw new TemplateError('Template tidak ditemukan.', 404);
  await assertTemplateMutable(env, templateId);

  await env.DB.prepare(
    `UPDATE hr_document_templates SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(templateId)
    .run();

  return { ...template, active: 0 };
}

import { Bindings, SignedDocumentKind } from '../types';
import { putFile, getFile, deleteFile } from './storage';

export class StorageError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
  }
}

export interface StoreDocumentInput {
  signingRequestId: string;
  kind: SignedDocumentKind;
  data: ArrayBuffer | Uint8Array;
  contentType: string;
  docusealSubmitterId?: string | null;
  downloadedAt?: boolean;
}

export interface SignedDocumentRow {
  id: string;
  signing_request_id: string;
  docuseal_submitter_id: string | null;
  kind: SignedDocumentKind;
  storage_key: string;
  content_type: string;
  byte_size: number | null;
  sha256: string | null;
  created_at: string;
  downloaded_at: string | null;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer =
    data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extensionFor(contentType: string, kind: SignedDocumentKind): string {
  if (kind === 'audit_trail' || kind === 'signed_pdf' || kind === 'combined' || kind === 'original') {
    return contentType.includes('pdf') ? 'pdf' : 'bin';
  }
  return 'bin';
}

/** Keys never contain employee name/email, only request id + document kind. */
export function storageKeyFor(
  signingRequestId: string,
  kind: SignedDocumentKind,
  submitterId?: string | null,
  contentType = 'application/pdf'
): string {
  const suffix = submitterId ? `-${String(submitterId).replace(/[^A-Za-z0-9_-]/g, '')}` : '';
  return `signed/${signingRequestId}/${kind}${suffix}.${extensionFor(contentType, kind)}`;
}

export async function storeSignedDocument(
  env: Bindings,
  input: StoreDocumentInput
): Promise<SignedDocumentRow> {
  if (!input.data) throw new StorageError('Data dokumen kosong.', 400);

  const byteSize =
    input.data instanceof Uint8Array ? input.data.byteLength : (input.data as ArrayBuffer).byteLength;

  if (byteSize === 0) throw new StorageError('Dokumen yang diunduh kosong.', 502);

  const key = storageKeyFor(input.signingRequestId, input.kind, input.docusealSubmitterId, input.contentType);
  const checksum = await sha256Hex(input.data);

  await putFile(env, {
    key,
    data: input.kind === 'audit_trail' && input.contentType.includes('json')
      ? new TextDecoder().decode(input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data))
      : input.data,
    contentType: input.contentType,
  });

  const id = `sd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Same (request, kind, submitter) may be re-downloaded on retry; keep one row.
  await env.DB.prepare(
    `INSERT INTO signed_documents (
       id, tenant_id, signing_request_id, docuseal_submitter_id, kind,
       storage_key, content_type, byte_size, sha256, downloaded_at
     ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(signing_request_id, kind, docuseal_submitter_id) DO UPDATE SET
       storage_key = excluded.storage_key,
       content_type = excluded.content_type,
       byte_size = excluded.byte_size,
       sha256 = excluded.sha256,
       downloaded_at = COALESCE(signed_documents.downloaded_at, excluded.downloaded_at)`
  )
    .bind(
      id,
      input.signingRequestId,
      input.docusealSubmitterId || null,
      input.kind,
      key,
      input.contentType,
      byteSize,
      checksum,
      input.downloadedAt ? new Date().toISOString() : null
    )
    .run();

  const row = await env.DB.prepare(
    `SELECT * FROM signed_documents
     WHERE signing_request_id = ? AND kind = ?
       AND COALESCE(docuseal_submitter_id, '') = COALESCE(?, '')
     LIMIT 1`
  )
    .bind(input.signingRequestId, input.kind, input.docusealSubmitterId || null)
    .first<SignedDocumentRow>();

  return row as SignedDocumentRow;
}

export async function listDocumentsForRequest(
  env: Bindings,
  signingRequestId: string
): Promise<SignedDocumentRow[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM signed_documents WHERE signing_request_id = ? ORDER BY created_at ASC`
  )
    .bind(signingRequestId)
    .all<SignedDocumentRow>();
  return rows.results || [];
}

export async function listDocumentsForEmployee(
  env: Bindings,
  employeeId: string
): Promise<Array<SignedDocumentRow & { template_code: string | null; template_name: string | null; status: string }>> {
  const rows = await env.DB.prepare(
    `SELECT sd.*, sr.template_code, sr.status
     FROM signed_documents sd
     JOIN signing_requests sr ON sd.signing_request_id = sr.id
     LEFT JOIN hr_document_templates ht ON sr.template_id = ht.id
     WHERE sr.employee_id = ?
     ORDER BY sd.created_at DESC`
  )
    .bind(employeeId)
    .all<any>();

  return (rows.results || []).map((row: any) => ({
    ...row,
    template_name: row.template_code || null,
  }));
}

export async function getDocumentById(
  env: Bindings,
  documentId: string
): Promise<SignedDocumentRow | null> {
  return env.DB.prepare(`SELECT * FROM signed_documents WHERE id = ?`)
    .bind(documentId)
    .first<SignedDocumentRow>();
}

export async function readDocument(
  env: Bindings,
  document: SignedDocumentRow
): Promise<{ data: ArrayBuffer | Uint8Array; contentType: string } | null> {
  return getFile(env, document.storage_key);
}

export async function markDocumentDownloaded(env: Bindings, documentId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE signed_documents SET downloaded_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(documentId)
    .run();
}

/**
 * Retention purge: removes documents whose signing request is older than the
 * template's retention window. Exposed as a CLI script, not a cron.
 */
export async function purgeExpiredDocuments(
  env: Bindings,
  now: Date = new Date()
): Promise<{ scanned: number; deleted: number }> {
  const rows = await env.DB.prepare(
    `SELECT sd.id, sd.storage_key, ht.retention_months, sr.completed_at
     FROM signed_documents sd
     JOIN signing_requests sr ON sd.signing_request_id = sr.id
     LEFT JOIN hr_document_templates ht ON sr.template_id = ht.id`
  ).all<any>();

  const list = rows.results || [];
  let deleted = 0;

  for (const row of list) {
    const months = Number(row.retention_months || 60);
    const basis = row.completed_at ? new Date(row.completed_at) : null;
    if (!basis || Number.isNaN(basis.getTime())) continue;

    const expiry = new Date(basis);
    expiry.setMonth(expiry.getMonth() + months);
    if (expiry > now) continue;

    await deleteFile(env, row.storage_key);
    await env.DB.prepare(`DELETE FROM signed_documents WHERE id = ?`).bind(row.id).run();
    deleted++;
  }

  return { scanned: list.length, deleted };
}

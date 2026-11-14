import { Bindings } from '../types';
import { DocuSealSubmissionResult } from './docuseal';
import { storeSignedDocument } from './signed-documents';
import { onSigningCompleted } from './signing-completion';

/**
 * Single source of truth for "apply DocuSeal's view of a submission to our DB".
 *
 * Both the HMAC webhook and the on-demand status sync call this, so the two
 * paths can never disagree. The webhook is optional insurance; sync is what
 * makes the UI correct even when no webhook is configured.
 */

export interface ReconcileResult {
  status: string;
  stored: number;
  failed: number;
  signersUpdated: number;
}

function normaliseSignerStatus(raw: unknown): string {
  const value = String(raw || '').toLowerCase();
  if (value === 'signed') return 'completed';
  if (['awaiting', 'sent', 'opened', 'completed', 'declined'].includes(value)) return value;
  return 'sent';
}

async function persistSubmissionDocuments(
  env: Bindings,
  signingRequestId: string,
  submission: DocuSealSubmissionResult
): Promise<{ stored: number; failed: number }> {
  let stored = 0;
  let failed = 0;

  const documents = Array.isArray(submission.documents) ? submission.documents : [];

  for (const document of documents) {
    if (!document?.url) continue;

    const isAudit =
      String(document.kind || '').toLowerCase().includes('audit') ||
      String(document.name || '').toLowerCase().includes('audit');

    const submitterId = (document as any).submitter_id ?? (document as any).submitter?.id ?? null;

    try {
      const response = await fetch(document.url, { method: 'GET' });
      if (!response.ok) {
        failed++;
        continue;
      }

      const data = await response.arrayBuffer();
      const contentType =
        response.headers.get('content-type') || (isAudit ? 'application/json' : 'application/pdf');

      await storeSignedDocument(env, {
        signingRequestId,
        kind: isAudit ? 'audit_trail' : 'signed_pdf',
        data,
        contentType,
        docusealSubmitterId: submitterId ? String(submitterId) : null,
        downloadedAt: true,
      });
      stored++;
    } catch {
      failed++;
    }
  }

  // Audit trail is evidence; store it separately when DocuSeal exposes a URL.
  if (submission.audit_log_url) {
    try {
      const response = await fetch(submission.audit_log_url, { method: 'GET' });
      if (response.ok) {
        const data = await response.arrayBuffer();
        await storeSignedDocument(env, {
          signingRequestId,
          kind: 'audit_trail',
          data,
          contentType: response.headers.get('content-type') || 'application/pdf',
          docusealSubmitterId: null,
          downloadedAt: true,
        });
        stored++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { stored, failed };
}

export async function reconcileSubmission(
  env: Bindings,
  request: any,
  submission: DocuSealSubmissionResult
): Promise<ReconcileResult> {
  const submitters = Array.isArray(submission?.submitters) ? submission.submitters : [];

  const byId = new Map<string, any>();
  const byRole = new Map<string, any>();
  for (const submitter of submitters) {
    if (submitter?.id === undefined || submitter?.id === null) continue;
    byId.set(String(submitter.id), submitter);
    if (submitter.role) byRole.set(String(submitter.role).toLowerCase(), submitter);
  }

  const existing = await env.DB.prepare(
    `SELECT id, role, docuseal_submitter_id, status FROM signing_request_signers
     WHERE signing_request_id = ?`
  )
    .bind(request.id)
    .all<any>();

  let signersUpdated = 0;

  for (const row of existing.results || []) {
    // Match on the stored submitter id; fall back to role so a signer row that
    // was created without an id (e.g. an earlier failed send) can be repaired.
    let submitter = row.docuseal_submitter_id ? byId.get(String(row.docuseal_submitter_id)) : undefined;
    if (!submitter) submitter = byRole.get(String(row.role || '').toLowerCase());

    if (!submitter) {
      // A row with no DocuSeal submitter and no matching role is a phantom left
      // behind before role coverage was validated. It can never be signed, so
      // keeping it only inflates the "x/y signed" denominator forever.
      if (!row.docuseal_submitter_id) {
        await env.DB.prepare(`DELETE FROM signing_request_signers WHERE id = ?`).bind(row.id).run();
        await env.DB.prepare(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
           VALUES (?, 'default', NULL, 'SIGNING_PHANTOM_SIGNER_REMOVED', 'signing_requests', ?, ?)`
        )
          .bind(
            `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            request.id,
            JSON.stringify({ role: row.role, reason: 'no DocuSeal submitter for this role' })
          )
          .run();
      }
      continue;
    }

    const status = normaliseSignerStatus(submitter.status);
    await env.DB.prepare(
      `UPDATE signing_request_signers
       SET status = ?,
           docuseal_submitter_id = COALESCE(docuseal_submitter_id, ?),
           completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
           declined_at = CASE WHEN ? = 'declined' THEN COALESCE(declined_at, CURRENT_TIMESTAMP) ELSE declined_at END
       WHERE id = ?`
    )
      .bind(status, String(submitter.id), status, status, row.id)
      .run();
    signersUpdated++;
  }

  const { stored, failed } = await persistSubmissionDocuments(env, request.id, submission);

  const anyDeclined = submitters.some((s) => normaliseSignerStatus(s.status) === 'declined');
  const allCompleted =
    submitters.length > 0 && submitters.every((s) => normaliseSignerStatus(s.status) === 'completed');
  const docusealCompleted = String(submission?.status || '').toLowerCase() === 'completed';

  const nextStatus = anyDeclined
    ? 'declined'
    : allCompleted || docusealCompleted
      ? 'completed'
      : submitters.some((s) => ['completed', 'opened'].includes(normaliseSignerStatus(s.status)))
        ? 'partially_signed'
        : 'sent';

  // Never move a request backwards out of a terminal state.
  const terminal = ['completed', 'declined', 'expired', 'archived', 'superseded'];
  if (terminal.includes(String(request.status)) && nextStatus !== request.status) {
    return { status: request.status, stored, failed, signersUpdated };
  }

  await env.DB.prepare(
    `UPDATE signing_requests SET
       status = ?,
       completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
       last_error = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      nextStatus,
      nextStatus,
      failed > 0 ? `${failed} dokumen gagal diunduh pada ${new Date().toISOString()}` : null,
      request.id
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', NULL, 'SIGNING_SUBMISSION_SYNCED', 'signing_requests', ?, ?)`
  )
    .bind(
      `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      request.id,
      JSON.stringify({
        status: nextStatus,
        stored_documents: stored,
        failed_documents: failed,
        signers_updated: signersUpdated,
      })
    )
    .run();

  if (nextStatus === 'completed' && request.status !== 'completed') {
    await onSigningCompleted(env, { ...request, status: nextStatus });
  }

  return { status: nextStatus, stored, failed, signersUpdated };
}

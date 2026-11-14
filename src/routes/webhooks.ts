import { Hono } from 'hono';
import { Bindings } from '../types';
import { createDocuSealClient, DocuSealError, DocuSealSubmissionResult } from '../services/docuseal';
import { sha256Hex } from '../services/signed-documents';
import { runInBackground, sendEmail } from '../services/smtp';
import { getSigningStatusEmail } from '../services/email-templates';
import { reconcileSubmission } from '../services/signing-reconcile';

export const webhookRoutes = new Hono<{ Bindings: Bindings }>();

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) return null;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Constant-time comparison; no timingSafeEqual on Workers. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function computeHmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * POST /webhooks/docuseal
 *
 * Header format: X-Docuseal-Signature: <timestamp>.<hex_hmac_sha256>
 * HMAC input:    <timestamp>.<raw_request_body>
 */
webhookRoutes.post('/docuseal', async (c) => {
  const secret = (c.env.DOCUSEAL_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    // Misconfiguration must never silently accept unsigned callbacks.
    return c.json({ error: 'Webhook secret belum dikonfigurasi' }, 503);
  }

  // Raw body MUST be read before any JSON parsing.
  const raw = await c.req.text();
  const header = c.req.header('X-Docuseal-Signature') || c.req.header('x-docuseal-signature') || '';

  if (!header || !header.includes('.')) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const separator = header.indexOf('.');
  const timestampRaw = header.slice(0, separator);
  const signatureHex = header.slice(separator + 1);

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return c.json({ error: 'Stale signature' }, 401);
  }

  const expectedHex = await computeHmacHex(secret, `${timestampRaw}.${raw}`);
  const expected = hexToBytes(expectedHex);
  const provided = hexToBytes(signatureHex);

  if (!expected || !provided || !timingSafeEqual(expected, provided)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const eventType = String(payload.event_type || payload.event || '').trim();
  if (!eventType) {
    return c.json({ error: 'Missing event_type' }, 400);
  }

  const data = payload.data || {};
  const submissionId =
    data?.submission_id ?? data?.submission?.id ?? data?.id ?? null;
  const submissionIdStr = submissionId === null || submissionId === undefined ? null : String(submissionId);

  const payloadSha = await sha256Hex(new TextEncoder().encode(raw) as any);
  const eventId = `whe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Dedupe identical retries: same submission + event + payload.
  const insert = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO docuseal_webhook_events (
       id, tenant_id, event_type, docuseal_submission_id, event_timestamp, payload_sha256
     ) VALUES (?, 'default', ?, ?, ?, ?)`
  )
    .bind(eventId, eventType, submissionIdStr, String(payload.timestamp || timestampRaw), payloadSha)
    .run();

  const inserted = Number((insert as any)?.meta?.changes ?? 1) > 0;
  if (!inserted) {
    // Already processed — stay idempotent and 2xx.
    return c.json({ ok: true, duplicate: true });
  }

  // Acknowledge fast; do the heavy work in the background when available.
  runInBackground(
    c,
    processWebhookEvent(c.env, {
      eventId,
      eventType,
      submissionId: submissionIdStr,
      data,
    })
  );

  return c.json({ ok: true });
});

interface WebhookEventContext {
  eventId: string;
  eventType: string;
  submissionId: string | null;
  data: any;
}

async function markEvent(
  env: Bindings,
  eventId: string,
  error?: string | null
): Promise<void> {
  await env.DB.prepare(
    `UPDATE docuseal_webhook_events
     SET processed_at = CURRENT_TIMESTAMP, error = ?
     WHERE id = ?`
  )
    .bind(error ? String(error).slice(0, 500) : null, eventId)
    .run();
}

export async function processWebhookEvent(env: Bindings, ctx: WebhookEventContext): Promise<void> {
  try {
    switch (ctx.eventType) {
      case 'submission.completed':
        await handleSubmissionCompleted(env, ctx);
        break;
      case 'submission.expired':
      case 'submission.archived':
      case 'submission.declined':
        await handleSubmissionTerminal(env, ctx);
        break;
      case 'form.completed':
      case 'form.declined':
        await handleFormEvent(env, ctx);
        break;
      default:
        // Unsubscribed/unknown events are recorded but not acted upon.
        break;
    }
    await markEvent(env, ctx.eventId, null);
  } catch (err: any) {
    await markEvent(env, ctx.eventId, err?.message || String(err));
    throw err;
  }
}

async function findRequestBySubmission(env: Bindings, submissionId: string | null) {
  if (!submissionId) return null;
  return env.DB.prepare(`SELECT * FROM signing_requests WHERE docuseal_submission_id = ?`)
    .bind(submissionId)
    .first<any>();
}

async function handleSubmissionCompleted(env: Bindings, ctx: WebhookEventContext): Promise<void> {
  const request = await findRequestBySubmission(env, ctx.submissionId);
  if (!request) return; // Unknown submission — recorded, nothing to do.

  // Never trust the webhook alone: fetch and validate the final submission.
  let submission: DocuSealSubmissionResult;
  try {
    const client = createDocuSealClient(env);
    submission = await client.getSubmission(ctx.submissionId as string);
  } catch (err: any) {
    if (err instanceof DocuSealError) {
      // Leave the request retryable rather than marking it completed blindly.
      await env.DB.prepare(
        `UPDATE signing_requests SET status = 'partially_signed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
        .bind(`Webhook completion fetch failed: ${String(err.message).slice(0, 300)}`, request.id)
        .run();
      throw err;
    }
    throw err;
  }

  // Shared with the on-demand sync route so both paths agree on status,
  // signer rows and stored documents.
  await reconcileSubmission(env, request, submission);
}

async function handleSubmissionTerminal(env: Bindings, ctx: WebhookEventContext): Promise<void> {
  const request = await findRequestBySubmission(env, ctx.submissionId);
  if (!request) return;

  const status =
    ctx.eventType === 'submission.expired'
      ? 'expired'
      : ctx.eventType === 'submission.archived'
      ? 'archived'
      : 'declined';

  await env.DB.prepare(
    `UPDATE signing_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(status, request.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', NULL, 'SIGNING_STATUS_CHANGE', 'signing_requests', ?, ?)`
  )
    .bind(`aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, request.id, JSON.stringify({ status }))
    .run();

  await notifyRequester(env, request, status as any);
}

async function handleFormEvent(env: Bindings, ctx: WebhookEventContext): Promise<void> {
  const request = await findRequestBySubmission(env, ctx.submissionId);
  if (!request) return;

  const submitterId = ctx.data?.submitter_id ?? ctx.data?.submitter?.id ?? null;
  const status = ctx.eventType === 'form.declined' ? 'declined' : 'completed';

  if (submitterId !== null && submitterId !== undefined) {
    await env.DB.prepare(
      `UPDATE signing_request_signers
       SET status = ?,
           completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
           declined_at = CASE WHEN ? = 'declined' THEN CURRENT_TIMESTAMP ELSE declined_at END
       WHERE signing_request_id = ? AND docuseal_submitter_id = ?`
    )
      .bind(status, status, status, request.id, String(submitterId))
      .run();
  }

  // A single form decline blocks the request from completing.
  if (status === 'declined') {
    await env.DB.prepare(
      `UPDATE signing_requests SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(request.id)
      .run();
    await notifyRequester(env, request, 'declined');
    return;
  }

  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM signing_request_signers
     WHERE signing_request_id = ? AND status NOT IN ('completed', 'declined')`
  )
    .bind(request.id)
    .first<{ n: number }>();

  if (Number(remaining?.n || 0) === 0) {
    await env.DB.prepare(
      `UPDATE signing_requests SET status = 'partially_signed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'sent'`
    )
      .bind(request.id)
      .run();
  }
}

export async function notifyRequester(
  env: Bindings,
  request: any,
  status: 'completed' | 'declined' | 'expired' | 'archived'
): Promise<void> {
  try {
    if (!request?.requested_by) return;

    const requester = await env.DB.prepare(
      `SELECT u.email, e.full_name
       FROM users u LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = ?`
    )
      .bind(request.requested_by)
      .first<any>();

    if (!requester?.email) return;

    const employee = await env.DB.prepare(`SELECT full_name FROM employees WHERE id = ?`)
      .bind(request.employee_id)
      .first<any>();

    const company = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(legal_name, ''), name) AS name FROM companies LIMIT 1`
    ).first<any>();

    const appUrl = (env.HR_APP_URL || env.APP_URL || 'http://localhost:8787').replace(/\/+$/, '');
    const content = getSigningStatusEmail({
      recipientName: requester.full_name || requester.email,
      documentName: request.template_code || 'Dokumen',
      employeeName: employee?.full_name || request.employee_id,
      status,
      appUrl: `${appUrl}/documents`,
      companyName: company?.name,
    });

    await sendEmail(env, {
      to: requester.email,
      subject: `Status dokumen ${request.template_code || ''}: ${status}`,
      text: content.text,
      html: content.html,
      type: 'signing_status',
    });
  } catch {
    // Notification failures must never fail the webhook.
  }
}

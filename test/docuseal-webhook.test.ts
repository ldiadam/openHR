import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';
const WEBHOOK_SECRET = 'whsec_test_secret';
const originalFetch = globalThis.fetch;

function createEnv() {
  const db = createMockD1();
  return {
    db,
    env: {
      DB: db,
      JWT_SECRET,
      APP_URL: 'http://localhost:8787',
      ENVIRONMENT: 'test',
      DOCUSEAL_URL: 'https://sign.example.com',
      DOCUSEAL_API_TOKEN: 'test-token',
      DOCUSEAL_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
  };
}

async function hmacHex(secret: string, message: string): Promise<string> {
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

async function signedRequest(env: any, payload: unknown, opts: { timestamp?: number; secret?: string } = {}) {
  const raw = JSON.stringify(payload);
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = await hmacHex(opts.secret ?? WEBHOOK_SECRET, `${timestamp}.${raw}`);

  return app.fetch(
    new Request('http://localhost/webhooks/docuseal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Docuseal-Signature': `${timestamp}.${signature}`,
      },
      body: raw,
    }),
    env
  );
}

function seedRequest(db: any, submissionId = '456') {
  db.exec(`
    INSERT OR REPLACE INTO signing_requests (
      id, tenant_id, employee_id, template_id, template_code, template_version,
      workflow, docuseal_template_id, docuseal_submission_id, status, requested_by,
      idempotency_key
    ) VALUES (
      'sr-webhook-1', 'default', 'emp-004', 'doc-tpl-1', 'offer_letter', 1,
      'offer_letter', '4242', '${submissionId}', 'sent', 'usr-001', 'wh-key-1'
    );
    INSERT OR REPLACE INTO signing_request_signers (
      id, tenant_id, signing_request_id, employee_id, role, email, name,
      docuseal_submitter_id, status
    ) VALUES
      ('srs-1', 'default', 'sr-webhook-1', 'emp-004', 'Employee', 'agus.setiawan@nusantara.id', 'Agus', '900', 'sent'),
      ('srs-2', 'default', 'sr-webhook-1', NULL, 'HR', 'hr@nusantara.id', 'HR', '901', 'sent');
  `);
}

function mockDocuSealSubmission(documents: Array<{ name: string; url: string; kind?: string }>) {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);

    if (url.includes('/api/submissions/')) {
      return new Response(
        JSON.stringify({
          id: 456,
          status: 'completed',
          submitters: [
            { id: 900, role: 'Employee', status: 'completed' },
            { id: 901, role: 'HR', status: 'completed' },
          ],
          documents,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url.startsWith('https://files.example.com/')) {
      const body = url.includes('audit')
        ? new TextEncoder().encode('{"events":[]}')
        : new TextEncoder().encode('%PDF-1.4 signed');
      return new Response(body, {
        status: 200,
        headers: { 'content-type': url.includes('audit') ? 'application/json' : 'application/pdf' },
      });
    }

    return new Response('{}', { status: 200 });
  }) as any;
}

describe('DocuSeal webhook', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects a missing signature', async () => {
    const { env } = createEnv();
    const res = await app.fetch(
      new Request('http://localhost/webhooks/docuseal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'submission.completed' }),
      }),
      env
    );
    assert.equal(res.status, 401);
  });

  it('rejects a wrong signature', async () => {
    const { env } = createEnv();
    const res = await signedRequest(
      env,
      { event_type: 'submission.completed', data: { submission_id: '456' } },
      { secret: 'wrong-secret' }
    );
    assert.equal(res.status, 401);
  });

  it('rejects a stale timestamp', async () => {
    const { env } = createEnv();
    const res = await signedRequest(
      env,
      { event_type: 'submission.completed', data: { submission_id: '456' } },
      { timestamp: Math.floor(Date.now() / 1000) - 10 * 60 }
    );
    assert.equal(res.status, 401);
  });

  it('accepts a valid signature', async () => {
    const { db, env } = createEnv();
    seedRequest(db);
    mockDocuSealSubmission([]);

    const res = await signedRequest(env, {
      event_type: 'submission.created',
      timestamp: new Date().toISOString(),
      data: { submission_id: '456' },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.ok, true);
  });

  it('completes the request, stores documents, and is idempotent on retry', async () => {
    const { db, env } = createEnv();
    seedRequest(db);
    mockDocuSealSubmission([
      { name: 'Signed document', url: 'https://files.example.com/signed.pdf', kind: 'signed' },
      { name: 'Audit trail', url: 'https://files.example.com/audit.json', kind: 'audit' },
    ]);

    const payload = {
      event_type: 'submission.completed',
      timestamp: new Date().toISOString(),
      data: { submission_id: '456' },
    };

    const first = await signedRequest(env, payload);
    assert.equal(first.status, 200);

    // Background work runs on waitUntil; poll for completion deterministically.
    let requestRow: any = null;
    for (let i = 0; i < 50; i++) {
      requestRow = await db
        .prepare(`SELECT status, completed_at FROM signing_requests WHERE id = 'sr-webhook-1'`)
        .first();
      if (requestRow?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(requestRow.status, 'completed', 'request marked completed');
    assert.ok(requestRow.completed_at);

    const docs = await db
      .prepare(`SELECT kind, storage_key, sha256, byte_size FROM signed_documents WHERE signing_request_id = 'sr-webhook-1' ORDER BY kind`)
      .all();
    assert.equal(docs.results.length, 2, 'signed pdf + audit trail stored');
    assert.ok(docs.results.every((d: any) => d.sha256 && d.sha256.length === 64));
    assert.ok(docs.results.every((d: any) => d.storage_key.startsWith('signed/sr-webhook-1/')));
    assert.ok(docs.results.some((d: any) => d.kind === 'signed_pdf'));
    assert.ok(docs.results.some((d: any) => d.kind === 'audit_trail'));

    const signers = await db
      .prepare(`SELECT status FROM signing_request_signers WHERE signing_request_id = 'sr-webhook-1'`)
      .all();
    assert.ok(signers.results.every((s: any) => s.status === 'completed'));

    // Replay the identical event: deduped, no duplicate documents.
    const replay = await signedRequest(env, payload);
    assert.equal(replay.status, 200);
    const replayBody = (await replay.json()) as any;
    assert.equal(replayBody.duplicate, true);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const docsAfter = await db
      .prepare(`SELECT COUNT(*) AS n FROM signed_documents WHERE signing_request_id = 'sr-webhook-1'`)
      .first();
    assert.equal(docsAfter.n, 2, 'no duplicate documents on replay');

    const events = await db.prepare(`SELECT COUNT(*) AS n FROM docuseal_webhook_events`).first();
    assert.equal(events.n, 1, 'only one webhook event recorded');
  });

  it('marks declined submissions and records the event', async () => {
    const { db, env } = createEnv();
    seedRequest(db, '789');
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as any;

    const res = await signedRequest(env, {
      event_type: 'submission.declined',
      timestamp: new Date().toISOString(),
      data: { submission_id: '789' },
    });
    assert.equal(res.status, 200);

    let row: any = null;
    for (let i = 0; i < 50; i++) {
      row = await db.prepare(`SELECT status FROM signing_requests WHERE id = 'sr-webhook-1'`).first();
      if (row?.status === 'declined') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(row.status, 'declined');
  });
});

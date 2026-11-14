import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';
const originalFetch = globalThis.fetch;

interface FetchCall {
  url: string;
  body: any;
}

function mockDocuSeal(options: {
  submissionId?: number;
  failSubmission?: boolean;
  failTemplate?: boolean;
} = {}) {
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, body });

    if (url.includes('/api/templates/')) {
      if (options.failTemplate) {
        return new Response(JSON.stringify({ error: 'Template rejected' }), { status: 422 });
      }
      return new Response(JSON.stringify({ id: 4242 }), { status: 200 });
    }

    if (url.includes('/api/submissions')) {
      if (options.failSubmission) {
        return new Response(JSON.stringify({ error: 'Submission rejected' }), { status: 422 });
      }
      return new Response(
        JSON.stringify({
          id: options.submissionId ?? 456,
          status: 'pending',
          submitters: (body?.submitters || []).map((s: any, index: number) => ({
            id: 900 + index,
            role: s.role,
            email: s.email,
            name: s.name,
            status: 'sent',
            slug: `slug-${index}`,
            embed_src: `https://sign.example.com/s/${index}`,
          })),
        }),
        { status: 200 }
      );
    }

    if (url.includes('/api/submissions/')) {
      return new Response(
        JSON.stringify({
          id: options.submissionId ?? 456,
          status: 'completed',
          submitters: [
            { id: 900, role: 'Employee', status: 'completed' },
            { id: 901, role: 'HR', status: 'completed' },
          ],
          documents: [],
        }),
        { status: 200 }
      );
    }

    if (url.includes('/api/submitters/')) {
      return new Response(
        JSON.stringify({ id: 900, status: 'opened', embed_src: 'https://sign.example.com/s/refreshed' }),
        { status: 200 }
      );
    }

    return new Response('{}', { status: 200 });
  }) as any;

  return calls;
}

function createEnv() {
  const db = createMockD1();
  return {
    db,
    env: {
      DB: db,
      JWT_SECRET,
      APP_URL: 'http://localhost:8787',
      HR_APP_URL: 'https://hr.example.com',
      ENVIRONMENT: 'test',
      DOCUSEAL_URL: 'https://sign.example.com',
      DOCUSEAL_API_TOKEN: 'test-token',
      DOCUSEAL_WEBHOOK_SECRET: 'whsec_test',
    },
  };
}

async function request(env: any, path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const req = new Request(`http://localhost${path}`, { ...options, headers });
  return app.fetch(req, env);
}

const adminToken = () =>
  signJwt(
    {
      userId: 'usr-001',
      email: 'budi.santoso@nusantara.id',
      role: 'owner_admin',
      tenantId: 'default',
      name: 'Budi Santoso',
    },
    JWT_SECRET
  );

const managerToken = () =>
  signJwt(
    {
      userId: 'usr-002',
      email: 'siti.rahma@nusantara.id',
      role: 'manager',
      employeeId: 'emp-002',
      tenantId: 'default',
      name: 'Siti Rahmawati',
    },
    JWT_SECRET
  );

const employeeToken = (employeeId = 'emp-004', email = 'agus.setiawan@nusantara.id') =>
  signJwt(
    { userId: 'usr-004', email, role: 'employee', employeeId, tenantId: 'default', name: 'Agus Setiawan' },
    JWT_SECRET
  );

function seedTemplate(db: any, opts: { code?: string; version?: number; active?: number } = {}) {
  db.exec(`
    INSERT OR REPLACE INTO hr_document_templates (
      id, tenant_id, code, name, version, docuseal_template_id, active, visibility, retention_months
    ) VALUES (
      'doc-tpl-1', 'default', '${opts.code || 'offer_letter'}', 'Offer Letter',
      ${opts.version ?? 1}, '4242', ${opts.active ?? 1}, 'standard', 60
    );
  `);
}

describe('Signing requests', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a request, persists signers with embed_src and returns the contract', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    const calls = mockDocuSeal({ submissionId: 456 });
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          templateVersion: 1,
          signers: [
            { role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus Setiawan' },
            { role: 'HR', email: 'hr@nusantara.id', name: 'HR Team' },
          ],
          sendEmail: false,
          prefill: { Position: 'Engineer' },
          idempotencyKey: 'offer-emp-004-v1',
        }),
      },
      token
    );

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;

    assert.match(body.signingRequestId, /^sr-/);
    assert.equal(body.docusealSubmissionId, 456);
    assert.equal(body.status, 'sent');
    assert.equal(body.signers.length, 2);
    assert.equal(body.signers[0].signingUrl, 'https://sign.example.com/s/0');
    assert.equal(body.signers[1].signingUrl, 'https://sign.example.com/s/1');

    const submissionCall = calls.find((call) => call.url.endsWith('/api/submissions'));
    assert.ok(submissionCall, 'submission was created');
    assert.equal(submissionCall!.body.template_id, '4242');
    assert.equal(submissionCall!.body.send_email, false);
    assert.equal(submissionCall!.body.order, 'preserved');
    assert.deepEqual(submissionCall!.body.submitters[0].values, { Position: 'Engineer' });

    const signers = await db
      .prepare(`SELECT role, status, signing_url FROM signing_request_signers WHERE signing_request_id = ?`)
      .bind(body.signingRequestId)
      .all();
    assert.equal(signers.results.length, 2);
    assert.ok(signers.results.every((s: any) => s.status === 'sent'));
  });

  it('fails when the template is missing or inactive', async () => {
    const { db, env } = createEnv();
    const token = await adminToken();
    mockDocuSeal();

    const missing = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'nda',
          signers: [{ role: 'Employee', email: 'a@b.co', name: 'A' }],
        }),
      },
      token
    );
    assert.equal(missing.status, 404);

    seedTemplate(db, { active: 0 });
    const inactive = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'a@b.co', name: 'A' }],
        }),
      },
      token
    );
    assert.equal(inactive.status, 409);
  });

  it('returns the same request for a duplicate idempotency key', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    const calls = mockDocuSeal();
    const token = await adminToken();

    const payload = JSON.stringify({
      employeeId: 'emp-004',
      templateCode: 'offer_letter',
      signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus Setiawan' }],
      idempotencyKey: 'dup-key-1',
    });

    const first = await request(env, '/api/hr/signing-requests', { method: 'POST', body: payload }, token);
    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as any;

    const submissionCallsAfterFirst = calls.filter((c) => c.url.endsWith('/api/submissions')).length;

    const second = await request(env, '/api/hr/signing-requests', { method: 'POST', body: payload }, token);
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as any;

    assert.equal(secondBody.signingRequestId, firstBody.signingRequestId);
    assert.equal(
      calls.filter((c) => c.url.endsWith('/api/submissions')).length,
      submissionCallsAfterFirst,
      'no second DocuSeal submission'
    );
  });

  it('marks the request failed when DocuSeal rejects the submission', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal({ failSubmission: true });
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus Setiawan' }],
          idempotencyKey: 'fail-key-1',
        }),
      },
      token
    );

    assert.equal(res.status, 422);
    const body = (await res.json()) as any;
    assert.match(body.error, /Submission rejected/);

    const row = await db
      .prepare(`SELECT status, last_error FROM signing_requests WHERE idempotency_key = ?`)
      .bind('fail-key-1')
      .first();
    assert.equal(row.status, 'failed');
    assert.ok(row.last_error);
  });
});

describe('Signing request RBAC', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('employee cannot create requests for someone else', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();

    const res = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
        }),
      },
      await employeeToken()
    );

    assert.equal(res.status, 403);
  });

  it('manager can only target direct reports', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await managerToken();

    // emp-004 is managed by emp-002 in the seed data.
    const allowed = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
          idempotencyKey: 'mgr-allowed-1',
        }),
      },
      token
    );
    assert.equal(allowed.status, 201);

    db.exec(`UPDATE employees SET manager_id = 'emp-001' WHERE id = 'emp-005';`);

    const denied = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-005',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'rina.wijaya@nusantara.id', name: 'Rina' }],
          idempotencyKey: 'mgr-denied-1',
        }),
      },
      token
    );
    assert.equal(denied.status, 403);
  });

  it('employee cannot read another employee’s signing request', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
          idempotencyKey: 'rbac-read-1',
        }),
      },
      await adminToken()
    );
    const { signingRequestId } = (await created.json()) as any;

    const own = await request(env, `/api/hr/signing-requests/${signingRequestId}`, {}, await employeeToken());
    assert.equal(own.status, 200);

    const other = await request(
      env,
      `/api/hr/signing-requests/${signingRequestId}`,
      {},
      await employeeToken('emp-005', 'rina.wijaya@nusantara.id')
    );
    assert.equal(other.status, 403);
  });

  it('only HR admins may register document templates', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const form = new FormData();
    form.append('code', 'nda');
    form.append('name', 'NDA');
    form.append('file', new File([new Uint8Array([37, 80, 68, 70])], 'nda.pdf', { type: 'application/pdf' }));

    const denied = await request(
      env,
      '/api/hr/document-templates',
      { method: 'POST', body: form },
      await managerToken()
    );
    assert.equal(denied.status, 403);
  });
});

describe('Signing CRUD', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('updates template metadata but never its version', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/document-templates/doc-tpl-1',
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Offer Letter 2027', retentionMonths: 84, active: 0 }),
      },
      token
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.template.name, 'Offer Letter 2027');
    assert.equal(body.template.retention_months, 84);
    assert.equal(body.template.active, 0);
    assert.equal(body.template.version, 1, 'version is immutable');
  });

  it('deletes an unused template', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const res = await request(env, '/api/hr/document-templates/doc-tpl-1', { method: 'DELETE' }, token);
    assert.equal(res.status, 200);

    const row = await db
      .prepare(`SELECT id FROM hr_document_templates WHERE id = 'doc-tpl-1'`)
      .first();
    assert.equal(row, null);
  });

  it('deletes a template whose requests were never signed, removing them too', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
          idempotencyKey: 'crud-del-1',
        }),
      },
      token
    );
    const { signingRequestId } = (await created.json()) as any;

    // The request is 'sent' but nobody signed it: not evidence, so both go.
    const res = await request(env, '/api/hr/document-templates/doc-tpl-1', { method: 'DELETE' }, token);
    assert.equal(res.status, 200);

    assert.equal(
      await db.prepare(`SELECT id FROM hr_document_templates WHERE id = 'doc-tpl-1'`).first(),
      null
    );
    assert.equal(
      await db.prepare(`SELECT id FROM signing_requests WHERE id = ?`).bind(signingRequestId).first(),
      null,
      'unsigned requests are removed with the template'
    );
  });

  it('refuses to delete a template once a document was signed', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
          idempotencyKey: 'crud-signed-1',
        }),
      },
      token
    );
    const { signingRequestId } = (await created.json()) as any;

    db.exec(`
      INSERT INTO signed_documents (id, tenant_id, signing_request_id, kind, storage_key, content_type, sha256)
      VALUES ('sd-1', 'default', '${signingRequestId}', 'signed_pdf', 'k/sd-1.pdf', 'application/pdf', 'abc');
    `);

    const res = await request(env, '/api/hr/document-templates/doc-tpl-1', { method: 'DELETE' }, token);
    assert.equal(res.status, 409, 'signed evidence blocks template deletion');
    const body = (await res.json()) as any;
    assert.match(body.error, /Nonaktifkan/);
  });

  it('deletes a draft signing request and its signers', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    db.exec(`
      INSERT INTO signing_requests (
        id, tenant_id, employee_id, template_id, template_code, template_version,
        workflow, docuseal_template_id, status, idempotency_key
      ) VALUES ('sr-draft-1', 'default', 'emp-004', 'doc-tpl-1', 'offer_letter', 1,
        'offer_letter', '4242', 'draft', 'crud-draft-1');
      INSERT INTO signing_request_signers (
        id, tenant_id, signing_request_id, employee_id, role, email, name, status
      ) VALUES ('srs-draft-1', 'default', 'sr-draft-1', 'emp-004', 'Employee', 'a@b.co', 'A', 'awaiting');
    `);

    const res = await request(env, '/api/hr/signing-requests/sr-draft-1', { method: 'DELETE' }, token);
    assert.equal(res.status, 200);

    const reqRow = await db.prepare(`SELECT id FROM signing_requests WHERE id = 'sr-draft-1'`).first();
    assert.equal(reqRow, null);
    const signerRow = await db
      .prepare(`SELECT id FROM signing_request_signers WHERE signing_request_id = 'sr-draft-1'`)
      .first();
    assert.equal(signerRow, null, 'signers are removed with the request');
  });

  it('deletes a sent request that was never signed', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
          idempotencyKey: 'crud-sent-1',
        }),
      },
      token
    );
    const { signingRequestId } = (await created.json()) as any;

    const res = await request(env, `/api/hr/signing-requests/${signingRequestId}`, { method: 'DELETE' }, token);
    assert.equal(res.status, 200, 'an unsigned sent request is removable');

    assert.equal(
      await db.prepare(`SELECT id FROM signing_requests WHERE id = ?`).bind(signingRequestId).first(),
      null
    );
  });

  it('refuses to delete a request that already has a signed document', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
          idempotencyKey: 'crud-sent-2',
        }),
      },
      token
    );
    const { signingRequestId } = (await created.json()) as any;

    db.exec(`
      INSERT INTO signed_documents (id, tenant_id, signing_request_id, kind, storage_key, content_type, sha256)
      VALUES ('sd-2', 'default', '${signingRequestId}', 'signed_pdf', 'k/sd-2.pdf', 'application/pdf', 'def');
    `);

    const res = await request(env, `/api/hr/signing-requests/${signingRequestId}`, { method: 'DELETE' }, token);
    assert.equal(res.status, 409, 'signed requests are evidence and cannot be deleted');
    const body = (await res.json()) as any;
    assert.match(body.error, /Gantikan/);
  });

});

describe('One-off document signing', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('signs an uploaded document without registering a template', async () => {
    const { db, env } = createEnv();
    const calls = mockDocuSeal();
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          document: {
            name: 'Employment Contract - Agus',
            code: 'offer_letter',
            pdfBase64: Buffer.from('%PDF-1.4 contract').toString('base64'),
            fields: [
              {
                name: 'Employee signature',
                type: 'signature',
                role: 'Employee',
                page: 1,
                x: 0.1,
                y: 0.8,
                w: 0.25,
                h: 0.06,
              },
            ],
          },
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus Setiawan' }],
          idempotencyKey: 'oneoff-1',
        }),
      },
      token
    );

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'sent');
    assert.equal(body.documentName, 'Employment Contract - Agus', 'document name is echoed back');
    assert.ok(body.docusealSubmissionId, 'submission id is captured');

    // DocuSeal document was created from the uploaded PDF, not resolved from the registry.
    assert.ok(
      calls.some((call) => call.url.includes('/api/templates/pdf')),
      'uploaded PDF created a DocuSeal document'
    );

    const row = await db
      .prepare(
        `SELECT template_id, template_code, template_version, docuseal_template_id, document_name
         FROM signing_requests WHERE id = ?`
      )
      .bind(body.signingRequestId)
      .first();

    assert.equal(row.template_id, null, 'no registry template is linked');
    assert.equal(row.template_version, null);
    assert.equal(row.template_code, 'offer_letter', 'workflow code is still recorded');
    assert.equal(row.document_name, 'Employment Contract - Agus', 'document name is persisted for the list');
    assert.ok(row.docuseal_template_id, 'the one-off DocuSeal document id is stored');
  });

  it('lists requests with signer progress for the documents table', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    mockDocuSeal();
    const token = await adminToken();

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          templateVersion: 1,
          sendEmail: false,
          idempotencyKey: 'list-progress-1',
        }),
      },
      token
    );
    assert.equal(created.status, 201);

    const listed = await request(env, '/api/hr/signing-requests', {}, token);
    assert.equal(listed.status, 200);
    const body = (await listed.json()) as any;

    assert.equal(body.signingRequests.length, 1);
    const row = body.signingRequests[0];
    assert.equal(row.signer_total, 3, 'all three workflow signers are counted');
    assert.equal(row.signer_signed, 0, 'none have signed yet');
    assert.equal(row.document_count, 0, 'no stored document until everyone signs');
  });

  it('rejects a one-off document without placed fields', async () => {
    const { env } = createEnv();
    mockDocuSeal();
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          document: { name: 'No fields', pdfBase64: Buffer.from('%PDF').toString('base64'), fields: [] },
          signers: [{ role: 'Employee', email: 'agus.setiawan@nusantara.id', name: 'Agus' }],
        }),
      },
      token
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.error, /field tanda tangan/);
  });

  it('derives every workflow signer: employee, manager and company HR', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    const calls = mockDocuSeal();
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offer_letter',
          templateVersion: 1,
          sendEmail: false,
        }),
      },
      token
    );

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;

    const submissionCall = calls.find((call) => call.url.endsWith('/api/submissions'));
    assert.ok(submissionCall, 'submission was created');

    const byRole = Object.fromEntries(submissionCall!.body.submitters.map((s: any) => [s.role, s]));
    assert.deepEqual(
      submissionCall!.body.submitters.map((s: any) => s.role),
      ['Employee', 'Manager', 'HR'],
      'no workflow role is dropped'
    );
    assert.equal(byRole.Employee.email, 'agus.setiawan@nusantara.id');
    assert.equal(byRole.Manager.email, 'siti.rahma@nusantara.id', 'manager comes from manager_id');
    assert.equal(byRole.Manager.name, 'Siti Rahmawati');
    assert.equal(byRole.HR.email, 'hr@nusantara.id', 'HR comes from the company record');
    assert.equal(body.signers.length, 3);
  });

  it('previews the resolved signers without creating a request', async () => {
    const { db, env } = createEnv();
    const calls = mockDocuSeal();
    const token = await adminToken();

    const res = await request(
      env,
      '/api/hr/signing-requests/preview-signers',
      { method: 'POST', body: JSON.stringify({ employeeId: 'emp-004', templateCode: 'offer_letter' }) },
      token
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.deepEqual(
      body.signers.map((s: any) => [s.role, s.resolved]),
      [
        ['Employee', true],
        ['Manager', true],
        ['HR', true],
      ]
    );
    assert.equal(body.problem, null);
    assert.equal(calls.length, 0, 'preview never calls DocuSeal');

    const rows: any = await db.prepare(`SELECT COUNT(*) AS n FROM signing_requests`).first();
    assert.equal(rows.n, 0, 'preview does not persist a request');
  });

  it('flags a required manager signer that cannot be resolved', async () => {
    const { db, env } = createEnv();
    seedTemplate(db);
    const calls = mockDocuSeal();
    const token = await adminToken();

    db.exec(`UPDATE employees SET manager_id = NULL WHERE id = 'emp-004';`);

    const preview = await request(
      env,
      '/api/hr/signing-requests/preview-signers',
      { method: 'POST', body: JSON.stringify({ employeeId: 'emp-004', templateCode: 'offboarding_clearance' }) },
      token
    );
    assert.equal(preview.status, 200);
    const previewBody = (await preview.json()) as any;
    const manager = previewBody.signers.find((s: any) => s.role === 'Manager');
    assert.equal(manager.resolved, false);
    assert.match(previewBody.problem, /Manager/);

    const created = await request(
      env,
      '/api/hr/signing-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeId: 'emp-004',
          templateCode: 'offboarding_clearance',
          templateVersion: 1,
          sendEmail: false,
        }),
      },
      token
    );
    assert.equal(created.status, 400);
    const createdBody = (await created.json()) as any;
    assert.match(createdBody.error, /atasan langsung/);
    assert.equal(calls.length, 0, 'DocuSeal is never called for an unresolvable required signer');
  });
});

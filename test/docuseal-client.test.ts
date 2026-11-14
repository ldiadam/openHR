import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DocuSealError,
  DocuSealConfigError,
  createDocuSealClient,
  resolveSigningUrl,
} from '../src/services/docuseal';

const originalFetch = globalThis.fetch;

interface CapturedCall {
  url: string;
  init: RequestInit;
  body: any;
}

function installFetch(handler: (call: CapturedCall) => Response | Promise<Response>) {
  const calls: CapturedCall[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    let body: any = null;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: CapturedCall = { url, init, body };
    calls.push(call);
    return handler(call);
  }) as any;
  return calls;
}

const env = (overrides: Record<string, unknown> = {}) =>
  ({
    DB: {} as any,
    DOCUSEAL_URL: 'https://sign.example.com/',
    DOCUSEAL_API_TOKEN: 'secret-token',
    ENVIRONMENT: 'production',
    ...overrides,
  }) as any;

describe('DocuSeal client', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('requires configuration', async () => {
    const client = createDocuSealClient({ DB: {} } as any);
    await assert.rejects(() => client.getSubmission('1'), DocuSealConfigError);
  });

  it('rejects plaintext DOCUSEAL_URL in production', async () => {
    const client = createDocuSealClient(env({ DOCUSEAL_URL: 'http://sign.example.com' }));
    await assert.rejects(() => client.getSubmission('1'), DocuSealConfigError);
  });

  it('sends the auth token, strips a trailing slash and posts a PDF template', async () => {
    const calls = installFetch(() => new Response(JSON.stringify({ id: 77 }), { status: 200 }));

    const client = createDocuSealClient(env());
    const result = await client.createTemplateFromPdf({
      name: 'Offer Letter',
      externalId: 'offer_letter-v1',
      pdfBase64: Buffer.from('%PDF-1.4 test').toString('base64'),
      fields: [{ name: 'Signature', type: 'signature', role: 'Employee', x: 0.1, y: 0.5, w: 0.2, h: 0.05, page: 1 }],
    });

    assert.equal(result.id, 77);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://sign.example.com/api/templates/pdf', 'no double slash');
    assert.equal((calls[0].init.headers as any)['X-Auth-Token'], 'secret-token');
    assert.equal((calls[0].init.headers as any)['Content-Type'], 'application/json');
    assert.equal(calls[0].body.name, 'Offer Letter');
    assert.equal(calls[0].body.external_id, 'offer_letter-v1');
    assert.equal(calls[0].body.documents[0].fields[0].role, 'Employee');
  });

  it('creates a submission with the documented field names', async () => {
    const calls = installFetch(() =>
      new Response(
        JSON.stringify({
          id: 456,
          status: 'pending',
          submitters: [{ id: 9, role: 'Employee', email: 'jane@example.com', status: 'sent', embed_src: 'https://sign.example.com/s/abc' }],
        }),
        { status: 200 }
      )
    );

    const client = createDocuSealClient(env());
    const submission = await client.createSubmission({
      templateId: '77',
      submitters: [{ role: 'Employee', email: 'jane@example.com', name: 'Jane', values: { Position: 'Engineer' } }],
      sendEmail: false,
      order: 'preserved',
      completedRedirectUrl: 'https://hr.example.com/documents',
      expireAt: '2026-12-31T17:00:00Z',
    });

    assert.equal(calls[0].url, 'https://sign.example.com/api/submissions');
    assert.equal(calls[0].body.template_id, '77');
    assert.equal(calls[0].body.send_email, false);
    assert.equal(calls[0].body.order, 'preserved');
    assert.equal(calls[0].body.completed_redirect_url, 'https://hr.example.com/documents');
    assert.equal(calls[0].body.expire_at, '2026-12-31T17:00:00Z');
    assert.deepEqual(calls[0].body.submitters[0].values, { Position: 'Engineer' });
    assert.equal(submission.submitters![0].id, 9);
    assert.equal(resolveSigningUrl(submission.submitters![0]), 'https://sign.example.com/s/abc');
  });

  it('maps non-2xx responses to a typed DocuSealError', async () => {
    installFetch(() => new Response(JSON.stringify({ error: 'Template not found' }), { status: 404 }));

    const client = createDocuSealClient(env());
    await assert.rejects(
      () => client.getSubmission('999'),
      (err: any) => {
        assert.ok(err instanceof DocuSealError);
        assert.equal(err.status, 404);
        assert.match(err.message, /Template not found/);
        return true;
      }
    );
  });

  it('rejects oversized base64 payloads', async () => {
    installFetch(() => new Response('{}', { status: 200 }));
    const client = createDocuSealClient(env());
    const huge = 'A'.repeat(21 * 1024 * 1024);

    await assert.rejects(
      () => client.createTemplateFromPdf({ name: 'Big', pdfBase64: huge }),
      (err: any) => {
        assert.ok(err instanceof DocuSealError);
        assert.equal(err.status, 413);
        return true;
      }
    );
  });
});

describe('DocuSeal field placement contract', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends fields as areas with a 0-based page', async () => {
    const calls = installFetch(() => new Response(JSON.stringify({ id: 5 }), { status: 200 }));

    const client = createDocuSealClient(env());
    await client.createTemplateFromPdf({
      name: 'Offer Letter',
      pdfBase64: Buffer.from('%PDF-1.4 x').toString('base64'),
      fields: [
        {
          name: 'Employee Signature',
          type: 'signature',
          role: 'Employee',
          required: true,
          areas: [{ x: 0.1, y: 0.8, w: 0.25, h: 0.06, page: 0 }],
        },
      ],
    });

    const field = calls[0].body.documents[0].fields[0];
    assert.ok(Array.isArray(field.areas), 'placement is sent as areas, not flat x/y/w/h');
    assert.equal(field.areas[0].page, 0, 'page is 0-based for DocuSeal');
    assert.equal(field.role, 'Employee', 'role drives the submitter name');
    assert.equal(field.x, undefined, 'no flat coordinates are sent');
  });
});

describe('DocuSeal submission response shapes', () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('normalises the fork\u2019s bare-array response into { id, submitters }', async () => {
    // This fork returns an ARRAY of submitters, not { id, submitters }.
    installFetch(() =>
      new Response(
        JSON.stringify([
          { id: 6, role: 'Employee', status: 'awaiting', submission_id: 5, embed_src: 'https://sign.example.com/s/a' },
          { id: 7, role: 'HR', status: 'awaiting', submission_id: 5, embed_src: 'https://sign.example.com/s/b' },
        ]),
        { status: 200 }
      )
    );

    const client = createDocuSealClient(env());
    const submission = await client.createSubmission({
      templateId: '9',
      submitters: [
        { role: 'Employee', email: 'e@example.com', name: 'E' },
        { role: 'HR', email: 'hr@example.com', name: 'HR' },
      ],
    });

    assert.equal(submission.id, 5, 'submission id is taken from submission_id, not array index');
    assert.equal(submission.submitters?.length, 2);
    assert.equal(submission.submitters?.[0].embed_src, 'https://sign.example.com/s/a');
  });

  it('still accepts an object-shaped response', async () => {
    installFetch(() =>
      new Response(JSON.stringify({ id: 42, submitters: [{ id: 1, role: 'Employee' }] }), { status: 200 })
    );

    const client = createDocuSealClient(env());
    const submission = await client.createSubmission({
      templateId: '9',
      submitters: [{ role: 'Employee', email: 'e@example.com', name: 'E' }],
    });

    assert.equal(submission.id, 42);
  });

  it('fails loudly when the response carries no submission id', async () => {
    installFetch(() => new Response(JSON.stringify([{ id: 1, role: 'Employee' }]), { status: 200 }));

    const client = createDocuSealClient(env());
    await assert.rejects(
      () =>
        client.createSubmission({
          templateId: '9',
          submitters: [{ role: 'Employee', email: 'e@example.com', name: 'E' }],
        }),
      (err: any) => {
        assert.ok(err instanceof DocuSealError);
        assert.equal(err.status, 502);
        return true;
      }
    );
  });
});

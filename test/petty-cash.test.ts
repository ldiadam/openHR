import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

function createEnv() {
  const db: any = createMockD1();
  return { db, env: { DB: db, JWT_SECRET, APP_URL: 'http://localhost:8787' } };
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

const employeeToken = () =>
  signJwt(
    {
      userId: 'usr-004',
      email: 'agus.setiawan@nusantara.id',
      role: 'employee',
      employeeId: 'emp-004',
      tenantId: 'default',
      name: 'Agus Setiawan',
    },
    JWT_SECRET
  );

const otherEmployeeToken = () =>
  signJwt(
    {
      userId: 'usr-005',
      email: 'rina.wijaya@nusantara.id',
      role: 'employee',
      employeeId: 'emp-005',
      tenantId: 'default',
      name: 'Rina Wijaya',
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

const financeToken = () =>
  signJwt(
    {
      userId: 'usr-003',
      email: 'dewi.lestari@nusantara.id',
      role: 'finance',
      employeeId: 'emp-003',
      tenantId: 'default',
      name: 'Dewi Lestari',
    },
    JWT_SECRET
  );

const RECEIPT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function createRequest(env: any, token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(
    env,
    '/api/petty-cash/requests',
    {
      method: 'POST',
      body: JSON.stringify({
        purpose: 'Office supplies for the Jakarta office',
        requested_amount: 500000,
        ...overrides,
      }),
    },
    token
  );
  return { res, body: (await res.json()) as any };
}

async function approveRequest(env: any, id: string, token: string) {
  const res = await request(env, `/api/petty-cash/requests/${id}/approve`, { method: 'POST' }, token);
  return { res, body: (await res.json()) as any };
}

async function addExpense(env: any, id: string, token: string, withReceipt = true) {
  const res = await request(
    env,
    `/api/petty-cash/requests/${id}/expenses`,
    {
      method: 'POST',
      body: JSON.stringify({
        expense_date: '2026-11-15',
        category: 'office_supplies',
        description: 'Printer paper and pens',
        amount: 150000,
        receipts: withReceipt
          ? [{ file_name: 'receipt.png', mime_type: 'image/png', base64: RECEIPT }]
          : [],
      }),
    },
    token
  );
  return { res, body: (await res.json()) as any };
}

describe('Petty cash request and realization', () => {
  it('creates a pending request with a PC reference number', async () => {
    const { env } = createEnv();
    const token = await employeeToken();

    const { res, body } = await createRequest(env, token);
    assert.equal(res.status, 201);
    assert.equal(body.status, 'pending');
    assert.match(body.referenceNo, /^PC-\d{4}-\d{4}$/);

    const detail = await request(env, `/api/petty-cash/requests/${body.requestId}`, {}, token);
    const detailBody = (await detail.json()) as any;
    assert.equal(detailBody.request.employee_id, 'emp-004');
    assert.equal(detailBody.request.department_name, 'Engineering');
    assert.equal(detailBody.totals.requested_amount, 500000);
    assert.equal(detailBody.totals.variance, 0);
    assert.equal(detailBody.rights.canEditExpenses, false, 'not editable before approval');
  });

  it('refuses to file on behalf of another employee', async () => {
    const { env } = createEnv();
    const { res } = await createRequest(env, await employeeToken(), { employee_id: 'emp-005' });
    assert.equal(res.status, 403);
  });

  it('only finance/admin may approve and approval disburses the cash', async () => {
    const { env } = createEnv();
    const employee = await employeeToken();
    const { body } = await createRequest(env, employee);

    const denied = await approveRequest(env, body.requestId, employee);
    assert.equal(denied.res.status, 403);

    const approved = await approveRequest(env, body.requestId, await financeToken());
    assert.equal(approved.res.status, 200);
    assert.equal(approved.body.status, 'approved');

    const detail = await request(env, `/api/petty-cash/requests/${body.requestId}`, {}, employee);
    const detailBody = (await detail.json()) as any;
    assert.equal(detailBody.request.status, 'approved');
    assert.equal(detailBody.request.disbursed_amount, 500000);
    assert.ok(detailBody.request.disbursed_at);
    assert.equal(detailBody.rights.canEditExpenses, true);
  });

  it('records expenses with receipts and blocks a report with missing receipts', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const { body } = await createRequest(env, token);
    await approveRequest(env, body.requestId, await financeToken());

    const withoutReceipt = await addExpense(env, body.requestId, token, false);
    assert.equal(withoutReceipt.res.status, 201);

    const blocked = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/submit-report`,
      { method: 'POST' },
      token
    );
    assert.equal(blocked.status, 400);
    assert.match(((await blocked.json()) as any).error, /tanpa lampiran/);

    const withReceipt = await addExpense(env, body.requestId, token, true);
    assert.equal(withReceipt.res.status, 201);
    assert.equal(withReceipt.body.receiptIds.length, 1);

    const addedReceipt = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses/${withoutReceipt.body.expenseId}/receipts`,
      {
        method: 'POST',
        body: JSON.stringify({
          file_base64: RECEIPT,
          mime_type: 'image/png',
          file_name: 'receipt-2.png',
        }),
      },
      token
    );
    assert.equal(addedReceipt.status, 201);

    const submitted = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/submit-report`,
      { method: 'POST' },
      token
    );
    assert.equal(submitted.status, 200);
    const submittedBody = (await submitted.json()) as any;
    assert.equal(submittedBody.status, 'report_submitted');
    assert.equal(submittedBody.totals.totalRealized, 300000);
    assert.equal(submittedBody.totals.variance, 200000);

    const detail = await request(env, `/api/petty-cash/requests/${body.requestId}`, {}, token);
    const detailBody = (await detail.json()) as any;
    assert.equal(detailBody.expenses.length, 2);
    assert.equal(detailBody.expenses[0].receipts.length, 1);
    assert.equal(detailBody.expenses[1].receipts.length, 1);
    assert.ok(detailBody.expenses[1].receipts[0].url.includes('/receipts/'));

    const receiptId = detailBody.expenses[1].receipts[0].id;
    const ownView = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses/${detailBody.expenses[1].id}/receipts/${receiptId}`,
      {},
      token
    );
    assert.equal(ownView.status, 200);

    const stranger = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses/${detailBody.expenses[1].id}/receipts/${receiptId}`,
      {},
      await otherEmployeeToken()
    );
    assert.equal(stranger.status, 403);
  });

  it('approves the report once and rejects repeat approval', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const finance = await financeToken();
    const { body } = await createRequest(env, token);
    await approveRequest(env, body.requestId, finance);
    await addExpense(env, body.requestId, token, true);
    await request(env, `/api/petty-cash/requests/${body.requestId}/submit-report`, { method: 'POST' }, token);

    const approved = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/report-approve`,
      { method: 'POST' },
      finance
    );
    assert.equal(approved.status, 200);
    assert.equal(((await approved.json()) as any).status, 'report_approved');

    const repeat = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/report-approve`,
      { method: 'POST' },
      finance
    );
    assert.equal(repeat.status, 409);
  });

  it('sends a report back, keeps expenses editable, and allows resubmission', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const finance = await financeToken();
    const { body } = await createRequest(env, token);
    await approveRequest(env, body.requestId, finance);
    const expense = await addExpense(env, body.requestId, token, true);
    await request(env, `/api/petty-cash/requests/${body.requestId}/submit-report`, { method: 'POST' }, token);

    const sentBack = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/report-reject`,
      { method: 'POST', body: JSON.stringify({ note: 'Receipt is unreadable' }) },
      finance
    );
    assert.equal(sentBack.status, 200);
    assert.equal(((await sentBack.json()) as any).status, 'report_rejected');

    const patched = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses/${expense.body.expenseId}`,
      { method: 'PATCH', body: JSON.stringify({ amount: 120000 }) },
      token
    );
    assert.equal(patched.status, 200);

    // Also verify PUT updates date, category, and exact amount (like 393900)
    const putUpdated = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses/${expense.body.expenseId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          expense_date: '2026-11-20',
          category: 'transport',
          description: 'Grab taxi meeting',
          amount: 393900,
          vendor: 'Grab',
        }),
      },
      token
    );
    assert.equal(putUpdated.status, 200);

    const detailAfterPut = await request(env, `/api/petty-cash/requests/${body.requestId}`, {}, token);
    const detailJson = (await detailAfterPut.json()) as any;
    const exp = detailJson.expenses.find((x: any) => x.id === expense.body.expenseId);
    assert.equal(exp.expense_date, '2026-11-20');
    assert.equal(exp.category, 'transport');
    assert.equal(exp.amount, 393900);
    assert.equal(exp.description, 'Grab taxi meeting');
    assert.equal(exp.vendor, 'Grab');

    const resubmitted = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/submit-report`,
      { method: 'POST' },
      token
    );
    assert.equal(resubmitted.status, 200);
    assert.equal(((await resubmitted.json()) as any).totals.totalRealized, 393900);
  });

  it('scopes the list to the owner, their manager, and finance', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const { body } = await createRequest(env, token);

    const own = await request(env, '/api/petty-cash/requests', {}, token);
    const ownBody = (await own.json()) as any;
    assert.ok(ownBody.requests.some((row: any) => row.id === body.requestId));

    const stranger = await request(env, '/api/petty-cash/requests', {}, await otherEmployeeToken());
    const strangerBody = (await stranger.json()) as any;
    assert.equal(strangerBody.requests.length, 0);

    const manager = await request(env, '/api/petty-cash/requests', {}, await managerToken());
    const managerBody = (await manager.json()) as any;
    assert.ok(managerBody.requests.some((row: any) => row.id === body.requestId));

    const finance = await request(env, '/api/petty-cash/requests', {}, await financeToken());
    const financeBody = (await finance.json()) as any;
    assert.ok(financeBody.requests.some((row: any) => row.id === body.requestId));
  });

  it('rejects invalid categories and amounts', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const { body } = await createRequest(env, token);
    await approveRequest(env, body.requestId, await financeToken());

    const badCategory = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses`,
      {
        method: 'POST',
        body: JSON.stringify({
          expense_date: '2026-11-15',
          category: 'gambling',
          description: 'Nope',
          amount: 1000,
        }),
      },
      token
    );
    assert.equal(badCategory.status, 400);

    const badAmount = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses`,
      {
        method: 'POST',
        body: JSON.stringify({
          expense_date: '2026-11-15',
          category: 'meals',
          description: 'Nope',
          amount: 0,
        }),
      },
      token
    );
    assert.equal(badAmount.status, 400);
  });

  it('supports attaching Excel spreadsheet (.xlsx) for transport / Grab multi-trip trips', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const { body } = await createRequest(env, token);
    await approveRequest(env, body.requestId, await financeToken());

    // Fake xlsx base64 content
    const fakeXlsxBase64 = 'UEsDBBQAAAAIAAAAAAAAAAAAAAAAAAAAAAA='; // zip header prefix

    const expRes = await request(
      env,
      `/api/petty-cash/requests/${body.requestId}/expenses`,
      {
        method: 'POST',
        body: JSON.stringify({
          expense_date: '2026-11-20',
          category: 'transport',
          description: 'Multiple Grab trips November',
          amount: 393900,
          vendor: 'Grab',
          receipts: [
            {
              file_name: 'grab_trips_november.xlsx',
              mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              base64: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${fakeXlsxBase64}`,
            },
          ],
        }),
      },
      token
    );
    assert.equal(expRes.status, 201);
    const expJson = (await expRes.json()) as any;
    assert.ok(expJson.expenseId);
    assert.equal(expJson.receiptIds.length, 1);

    const detailRes = await request(env, `/api/petty-cash/requests/${body.requestId}`, {}, token);
    const detailJson = (await detailRes.json()) as any;
    const expense = detailJson.expenses.find((x: any) => x.id === expJson.expenseId);
    assert.ok(expense);
    assert.equal(expense.receipts.length, 1);
    assert.equal(expense.receipts[0].file_name, 'grab_trips_november.xlsx');

    // Test downloading receipt returns proper Content-Disposition attachment and Cache-Control
    const getReceipt = await request(env, expense.receipts[0].url, {}, token);
    assert.equal(getReceipt.status, 200);
    assert.ok(getReceipt.headers.get('content-disposition')?.includes('attachment'));
    assert.ok(getReceipt.headers.get('content-disposition')?.includes('grab_trips_november.xlsx'));
    assert.ok(getReceipt.headers.get('cache-control')?.includes('max-age'));
  });

  it('provides a signed verification token for public QR code viewing and receipt access', async () => {
    const { env } = createEnv();
    const token = await employeeToken();
    const { body } = await createRequest(env, token);
    await approveRequest(env, body.requestId, await financeToken());
    await addExpense(env, body.requestId, token, true);

    const detailRes = await request(env, `/api/petty-cash/requests/${body.requestId}`, {}, token);
    assert.equal(detailRes.status, 200);
    const detailJson = (await detailRes.json()) as any;
    assert.ok(detailJson.verifyToken);
    assert.ok(detailJson.verifyPath.includes(`/verify/petty-cash/${body.requestId}?token=`));

    // Invalid token must be rejected
    const badPublic = await request(env, `/api/public/petty-cash/${body.requestId}?token=invalid`);
    assert.equal(badPublic.status, 403);

    // Valid token allows unauthenticated public access
    const publicRes = await request(
      env,
      `/api/public/petty-cash/${body.requestId}?token=${encodeURIComponent(detailJson.verifyToken)}`
    );
    assert.equal(publicRes.status, 200);
    const publicJson = (await publicRes.json()) as any;
    assert.equal(publicJson.verified, true);
    assert.equal(publicJson.expenses.length, 1);
    const publicReceiptUrl = publicJson.expenses[0].receipts[0].url;
    assert.ok(publicReceiptUrl.startsWith('/api/public/petty-cash/'));

    // Public receipt URL serves the file without Authorization header
    const publicReceiptRes = await request(env, publicReceiptUrl);
    assert.equal(publicReceiptRes.status, 200);
  });
});

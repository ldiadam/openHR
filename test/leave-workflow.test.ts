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

const adminToken = () =>
  signJwt(
    { userId: 'usr-001', email: 'budi.santoso@nusantara.id', role: 'owner_admin', tenantId: 'default', name: 'Budi' },
    JWT_SECRET
  );

// emp-002 (Siti) manages emp-004 (Agus) in the seeded data.
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

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

async function submit(env: any, overrides: Record<string, unknown> = {}) {
  return request(
    env,
    '/api/leave/applications',
    {
      method: 'POST',
      body: JSON.stringify({
        employee_id: 'emp-004',
        department_id: 'dept-eng',
        leave_type_id: 'lt-annual',
        start_date: '2026-09-07',
        end_date: '2026-09-09',
        reason: 'Family matters',
        applicant_signature: SIGNATURE,
        submission_date: '2026-09-07',
        ...overrides,
      }),
    },
    await employeeToken()
  );
}

describe('Multi-stage leave application', () => {
  it('exposes form configuration from the database, not literals', async () => {
    const { db, env } = createEnv();

    db.exec(`UPDATE companies SET legal_name='Acme Industrial Pte Ltd', address='1 Test Road #02-03',
             email='hr@acme.test', phone='+65 1111 2222', npwp='201234567D' WHERE id='comp-nusantara';`);

    const res = await request(env, '/api/leave/form/config', {}, await employeeToken());
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.equal(body.letterhead.name, 'Acme Industrial Pte Ltd');
    assert.equal(body.letterhead.address, '1 Test Road #02-03');
    assert.equal(body.letterhead.email, 'hr@acme.test');
    assert.equal(body.letterhead.phone, '+65 1111 2222');
    assert.equal(body.letterhead.regNo, '201234567D');

    // Departments and leave types come from their tables.
    assert.ok(body.departments.length > 0);
    assert.ok(body.departments.some((d: any) => d.id === 'dept-eng'));
    assert.ok(body.leaveTypes.length > 0);
    assert.ok(body.leaveTypes.some((t: any) => t.id === 'lt-annual'));

    // The document title is the only fixed string, and it is a form name.
    assert.equal(body.formTitle, 'LEAVE APPLICATION FORM');
  });

  it('does not invent letterhead values when the company record is empty', async () => {
    const { db, env } = createEnv();
    db.exec(`UPDATE companies SET legal_name=NULL, address=NULL, email=NULL, phone=NULL, npwp=NULL;`);

    const res = await request(env, '/api/leave/form/config', {}, await employeeToken());
    const body = (await res.json()) as any;

    // Falls back to the trading name, never to a hardcoded organisation.
    const expectedName = await db.prepare(`SELECT name FROM companies LIMIT 1`).first() as any;
    assert.equal(body.letterhead.name, expectedName.name);
    assert.equal(body.letterhead.address, '', 'a blank field stays blank');
    assert.equal(body.letterheadGaps.address, false, 'gaps are reported, not fabricated');
    assert.equal(body.letterheadGaps.regNo, false);
  });

  it('walks the full four-stage chain and deducts the balance exactly once', async () => {
    const { db, env } = createEnv();
    const admin = await adminToken();

    const created = await submit(env);
    assert.equal(created.status, 201, await created.clone().text());
    const { requestId, referenceNo } = (await created.json()) as any;
    assert.match(referenceNo, /^LA-2026-\d{4}$/);

    // Stage 2 requires the administrator.
    const stage2 = await request(
      env,
      `/api/leave/applications/${requestId}/admin-check`,
      { method: 'POST', body: JSON.stringify({ admin_clash_checks: ['Medical Leave'] }) },
      admin
    );
    assert.equal(stage2.status, 200, await stage2.clone().text());

    // Stage 3 requires the applicant's own manager.
    const stage3 = await request(
      env,
      `/api/leave/applications/${requestId}/dept-head-review`,
      { method: 'POST', body: JSON.stringify({ dept_head_decision: 'APPROVED', dept_head_issues: [] }) },
      await managerToken()
    );
    assert.equal(stage3.status, 200, await stage3.clone().text());

    // Stage 4 requires a signature.
    const stage4NoSig = await request(
      env,
      `/api/leave/applications/${requestId}/management-decision`,
      { method: 'POST', body: JSON.stringify({ management_decision: 'APPROVED' }) },
      admin
    );
    assert.equal(stage4NoSig.status, 400, 'a management decision needs a signature');

    const stage4 = await request(
      env,
      `/api/leave/applications/${requestId}/management-decision`,
      {
        method: 'POST',
        body: JSON.stringify({ management_decision: 'APPROVED', management_signature: SIGNATURE }),
      },
      admin
    );
    assert.equal(stage4.status, 200, await stage4.clone().text());

    const row = await db
      .prepare(`SELECT status, side_effects_applied_at FROM leave_requests WHERE id = ?`)
      .bind(requestId)
      .first() as any;
    assert.equal(row.status, 'approved');
    assert.ok(row.side_effects_applied_at);

    const balance = await db
      .prepare(`SELECT used_days, remaining_days FROM leave_balances WHERE employee_id='emp-004' AND leave_type_id='lt-annual'`)
      .first() as any;
    assert.equal(Number(balance.used_days), 3, 'three working days deducted once');
    assert.equal(Number(balance.remaining_days), 9);

    const attendance = await db
      .prepare(`SELECT date FROM attendance WHERE employee_id='emp-004' AND status='on_leave' ORDER BY date`)
      .all();
    assert.equal(attendance.results.length, 3, 'one attendance row per working day');

    // A second management call is refused: the status has left the stage.
    const again = await request(
      env,
      `/api/leave/applications/${requestId}/management-decision`,
      {
        method: 'POST',
        body: JSON.stringify({ management_decision: 'APPROVED', management_signature: SIGNATURE }),
      },
      admin
    );
    assert.equal(again.status, 409, 'the final decision cannot be applied twice');

    const afterDouble = await db
      .prepare(`SELECT used_days FROM leave_balances WHERE employee_id='emp-004' AND leave_type_id='lt-annual'`)
      .first() as any;
    assert.equal(Number(afterDouble.used_days), 3, 'balance was not deducted a second time');
  });

  it('refuses the department head before the administrative check', async () => {
    const { env } = createEnv();
    const created = await submit(env);
    const { requestId } = (await created.json()) as any;

    const res = await request(
      env,
      `/api/leave/applications/${requestId}/dept-head-review`,
      { method: 'POST', body: JSON.stringify({ dept_head_decision: 'APPROVED' }) },
      await managerToken()
    );

    assert.equal(res.status, 409);
    assert.match(((await res.json()) as any).error, /pemeriksaan administratif|administratif/i);
  });

  it('refuses a manager who is not the applicant’s department head', async () => {
    const { env } = createEnv();
    const created = await submit(env);
    const { requestId } = (await created.json()) as any;

    await request(
      env,
      `/api/leave/applications/${requestId}/admin-check`,
      { method: 'POST', body: JSON.stringify({ admin_clash_checks: [] }) },
      await adminToken()
    );

    // emp-003 (Dewi) reports to emp-001, not to Agus.
    const otherManager = await signJwt(
      {
        userId: 'usr-999',
        email: 'other@nusantara.id',
        role: 'manager',
        employeeId: 'emp-003',
        tenantId: 'default',
        name: 'Other',
      },
      JWT_SECRET
    );

    const res = await request(
      env,
      `/api/leave/applications/${requestId}/dept-head-review`,
      { method: 'POST', body: JSON.stringify({ dept_head_decision: 'APPROVED' }) },
      otherManager
    );
    assert.equal(res.status, 403);
  });

  it('lets management cancel at any open stage with a reason', async () => {
    const { db, env } = createEnv();
    const admin = await adminToken();

    const created = await submit(env);
    const { requestId } = (await created.json()) as any;

    const noReason = await request(
      env,
      `/api/leave/applications/${requestId}/override`,
      { method: 'POST', body: JSON.stringify({ status: 'cancelled' }) },
      admin
    );
    assert.equal(noReason.status, 400, 'an override needs a reason');

    const cancelled = await request(
      env,
      `/api/leave/applications/${requestId}/override`,
      { method: 'POST', body: JSON.stringify({ status: 'cancelled', reason: 'Duplicate application' }) },
      admin
    );
    assert.equal(cancelled.status, 200, await cancelled.clone().text());

    const row = await db
      .prepare(`SELECT status, override_reason, cancelled_at FROM leave_requests WHERE id = ?`)
      .bind(requestId)
      .first() as any;
    assert.equal(row.status, 'cancelled');
    assert.equal(row.override_reason, 'Duplicate application');
    assert.ok(row.cancelled_at);

    // A cancelled application is final.
    const after = await request(
      env,
      `/api/leave/applications/${requestId}/override`,
      { method: 'POST', body: JSON.stringify({ status: 'approved', reason: 'changed my mind' }) },
      admin
    );
    assert.equal(after.status, 409);
  });

  it('requires an explanation when the leave type is "Others"', async () => {
    const { db, env } = createEnv();
    db.exec(`INSERT OR REPLACE INTO leave_types (id, tenant_id, code, name, default_days, requires_attachment, is_paid)
             VALUES ('lt-other', 'default', 'other', 'Others', 0, 0, 0);`);

    const missing = await submit(env, { leave_type_id: 'lt-other' });
    assert.equal(missing.status, 400);
    assert.match(((await missing.json()) as any).error, /Others/i);

    const ok = await submit(env, { leave_type_id: 'lt-other', leave_type_other_note: 'Community service' });
    assert.equal(ok.status, 201, await ok.clone().text());
  });

  it('rejects an unknown department or leave type', async () => {
    const { env } = createEnv();

    const badDept = await submit(env, { department_id: 'dept-nope' });
    assert.equal(badDept.status, 400);

    const badType = await submit(env, { leave_type_id: 'lt-nope' });
    assert.equal(badType.status, 400);
  });

  it('issues distinct reference numbers', async () => {
    const { env } = createEnv();

    const first = (await (await submit(env)).json()) as any;
    const second = (await (
      await submit(env, { start_date: '2026-09-21', end_date: '2026-09-22' })
    ).json()) as any;

    assert.notEqual(first.referenceNo, second.referenceNo);
  });

  it('computes a one-working-day SLA across a weekend', async () => {
    const { env } = createEnv();

    // 2026-06-05 is a Friday; the SLA lands on Monday 2026-06-08.
    const created = await submit(env, {
      start_date: '2026-09-28',
      end_date: '2026-09-29',
      submission_date: '2026-06-05',
    });
    const body = (await created.json()) as any;
    assert.equal(body.slaDueAt, '2026-06-08');
  });

  it('lets only HR file on behalf of another employee', async () => {
    const { env } = createEnv();

    const res = await submit(env, { employee_id: 'emp-003' });
    assert.equal(res.status, 403, 'an employee cannot file for a colleague');
  });

  it('detects overlapping leave in the same department', async () => {
    const { env } = createEnv();
    const admin = await adminToken();

    const first = (await (await submit(env)).json()) as any;
    const second = (await (
      await submit(env, {
        start_date: '2026-09-08',
        end_date: '2026-09-10',
        submission_date: '2026-09-08',
      })
    ).json()) as any;

    const res = await request(
      env,
      `/api/leave/applications/conflicts?departmentId=dept-eng&start=2026-09-08&end=2026-09-09&excludeId=${second.requestId}`,
      {},
      admin
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.conflicts.length, 1);
    assert.equal(body.conflicts[0].id, first.requestId);
  });

  it('reports overdue applications for the SLA badge', async () => {
    const { env } = createEnv();

    await submit(env, { submission_date: '2020-01-06', start_date: '2020-01-07', end_date: '2020-01-08' });

    const res = await request(env, '/api/leave/sla-summary', {}, await adminToken());
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.open, 1);
    assert.equal(body.overdue, 1, 'a submission from 2020 is well past its SLA');
  });

  it('never overwrites a real clock-in when marking leave attendance', async () => {
    const { db, env } = createEnv();
    const admin = await adminToken();

    const created = await submit(env, { start_date: '2026-09-14', end_date: '2026-09-14' });
    const { requestId } = (await created.json()) as any;

    db.exec(`
      INSERT INTO attendance (id, tenant_id, employee_id, date, status, source, clock_in_time)
      VALUES ('att-real-1', 'default', 'emp-004', '2026-09-14', 'present', 'mobile', '08:02:00');
    `);

    await request(
      env,
      `/api/leave/applications/${requestId}/admin-check`,
      { method: 'POST', body: JSON.stringify({ admin_clash_checks: [] }) },
      admin
    );
    await request(
      env,
      `/api/leave/applications/${requestId}/dept-head-review`,
      { method: 'POST', body: JSON.stringify({ dept_head_decision: 'APPROVED' }) },
      await managerToken()
    );
    await request(
      env,
      `/api/leave/applications/${requestId}/management-decision`,
      {
        method: 'POST',
        body: JSON.stringify({ management_decision: 'APPROVED', management_signature: SIGNATURE }),
      },
      admin
    );

    const row = await db
      .prepare(`SELECT status, clock_in_time FROM attendance WHERE id = 'att-real-1'`)
      .first() as any;
    assert.equal(row.status, 'present', 'the clock-in record is preserved');
    assert.equal(row.clock_in_time, '08:02:00');
  });
});

describe('Leave form print payload', () => {
  it('carries every department and leave type, not just the chosen ones', async () => {
    const { env } = createEnv();
    const created = await submit(env);
    const { requestId } = (await created.json()) as any;

    const res = await request(env, `/api/leave/applications/${requestId}/print`, {}, await adminToken());
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as any;

    assert.ok(body.departments.length > 1, 'the printed form lists all departments');
    assert.ok(body.leaveTypes.length > 1, 'the printed form lists all leave types');
    assert.ok(body.departments.includes('Engineering'));
    assert.ok(body.letterhead.name, 'letterhead name comes from the company record');
    assert.equal(body.canPrint, true, 'an administrator may export');
  });

  it('refuses the print payload to an unrelated employee', async () => {
    const { env } = createEnv();
    const created = await submit(env);
    const { requestId } = (await created.json()) as any;

    const other = await signJwt(
      { userId: 'usr-x', email: 'other@x.id', role: 'employee', employeeId: 'emp-003', tenantId: 'default', name: 'Other' },
      JWT_SECRET
    );
    const res = await request(env, `/api/leave/applications/${requestId}/print`, {}, other);
    assert.equal(res.status, 403);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Per-day missing attendance and alpha deduction', () => {
  const db = createMockD1();
  const env = { DB: db, JWT_SECRET, APP_URL: 'http://localhost:8787' };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
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

  async function createRun(token: string) {
    const res = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-25',
          period_end: '2026-11-25',
          payment_date: '2026-11-25',
          title: 'November 2026',
        }),
      },
      token
    );
    assert.equal(res.status, 200);
    return ((await res.json()) as any).runId as string;
  }

  it('creates one exception per missing working day and deducts alpha', async () => {
    const token = await adminToken();

    // A long-tenured employee (not a mid-month joiner) so the window is the full
    // payroll month: 21 working days in November 2026.
    db.exec(`
      UPDATE employees SET join_date = '2024-01-01', last_working_date = NULL WHERE id = 'emp-004';
      DELETE FROM attendance WHERE employee_id = 'emp-004';
      INSERT INTO attendance (id, tenant_id, employee_id, date, status) VALUES
        ('att-a1', 'default', 'emp-004', '2026-11-02', 'present'),
        ('att-a2', 'default', 'emp-004', '2026-11-03', 'present');
    `);

    const runId = await createRun(token);
    const pull = await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, token);
    assert.equal(pull.status, 200);

    const exceptions = await db
      .prepare(
        `SELECT exception_date FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND exception_type = 'missing_attendance'
         ORDER BY exception_date`
      )
      .bind(runId)
      .all();

    const exceptionCount = exceptions.results.length;
    // Audited window is the payroll PERIOD (25 Oct – 25 Nov = 23 weekdays); 2 are
    // logged, so 21 are genuinely missing. The earlier month-clipped window wrongly
    // skipped 26–31 Oct.
    assert.equal(exceptionCount, 21, 'logged days are excluded, whole period is audited');
    assert.ok(exceptions.results.every((row: any) => row.exception_date), 'each row carries its date');
    assert.equal(
      exceptions.results[0].exception_date,
      '2026-10-26',
      'days before the payroll month are still audited'
    );

    const item = await db
      .prepare(
        `SELECT alpha_days, alpha_deduction, days_worked, expected_working_days, base_salary FROM payroll_items
         WHERE payroll_run_id = ? AND employee_id = 'emp-004'`
      )
      .bind(runId)
      .first();

    assert.ok(item.alpha_days <= item.expected_working_days, 'alpha days never exceed working days');
    assert.equal(item.alpha_days, exceptionCount, 'one alpha day per unresolved missing day');
    assert.ok(item.alpha_deduction <= item.base_salary, 'alpha deduction never exceeds one month of base salary');
  });

  it('only flags days that are genuinely missing (logged days are never exceptions)', async () => {
    const token = await adminToken();

    db.exec(`
      UPDATE employees SET join_date = '2024-01-01', last_working_date = NULL WHERE id = 'emp-004';
      DELETE FROM attendance WHERE employee_id = 'emp-004';
      INSERT INTO attendance (id, tenant_id, employee_id, date, status) VALUES
        ('att-log-1', 'default', 'emp-004', '2026-11-02', 'present'),
        ('att-log-2', 'default', 'emp-004', '2026-11-03', 'present'),
        ('att-log-3', 'default', 'emp-004', '2026-11-04', 'present'),
        ('att-log-4', 'default', 'emp-004', '2026-11-05', 'present'),
        ('att-log-5', 'default', 'emp-004', '2026-11-06', 'present');
    `);

    const runId = await createRun(token);
    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, token);

    const rows = await db
      .prepare(
        `SELECT exception_date FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND exception_type = 'missing_attendance'
         ORDER BY exception_date`
      )
      .bind(runId)
      .all();

    const flagged = rows.results.map((row: any) => row.exception_date);
    for (const logged of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) {
      assert.ok(
        !flagged.includes(logged),
        `logged attendance day ${logged} must NOT be flagged as missing`
      );
    }
    assert.ok(flagged.length > 0, 'genuinely missing days are still flagged');
  });

  it('does not deduct a day once HR resolves it (e.g. approved leave)', async () => {
    const token = await adminToken();
    const runId = await createRun(token);

    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, token);

    const before = await db
      .prepare(`SELECT alpha_days FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-004'`)
      .bind(runId)
      .first();
    const first = await db
      .prepare(
        `SELECT id, exception_date FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND exception_type = 'missing_attendance'
         ORDER BY exception_date LIMIT 1`
      )
      .bind(runId)
      .first();

    const resolved = await request(
      `/api/payroll/runs/${runId}/exceptions/${first.id}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ resolution_code: 'approved_leave', resolution_note: 'Approved annual leave' }),
      },
      token
    );
    assert.equal(resolved.status, 200);

    // Re-pull must keep the resolution and exclude that day from alpha.
    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, token);

    const stillResolved = await db
      .prepare(`SELECT resolved, resolution_code FROM payroll_exceptions WHERE id = ?`)
      .bind(first.id)
      .first();
    assert.equal(stillResolved.resolved, 1, 'resolution survives a re-pull');
    assert.equal(stillResolved.resolution_code, 'approved_leave');

    const item = await db
      .prepare(`SELECT alpha_days FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-004'`)
      .bind(runId)
      .first();
    assert.equal(item.alpha_days, before.alpha_days - 1, 'the justified day is not deducted');
  });

  it('marks an unresolved alpha day as deducted when HR picks Alpha', async () => {
    const token = await adminToken();
    const runId = await createRun(token);
    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, token);

    const missing = await db
      .prepare(
        `SELECT id FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND exception_type = 'missing_attendance'
         ORDER BY exception_date LIMIT 1`
      )
      .bind(runId)
      .first();

    const res = await request(
      `/api/payroll/runs/${runId}/exceptions/${missing.id}/resolve`,
      { method: 'POST', body: JSON.stringify({ resolution_code: 'alpha' }) },
      token
    );
    assert.equal(res.status, 200);

    const row = await db
      .prepare(`SELECT resolved, resolution_code FROM payroll_exceptions WHERE id = ?`)
      .bind(missing.id)
      .first();
    assert.equal(row.resolved, 1);
    assert.equal(row.resolution_code, 'alpha');
  });
});

describe('Bulk-resolve attendance exceptions (per employee)', () => {
  const db = createMockD1();
  const env = { DB: db, JWT_SECRET, APP_URL: 'http://localhost:8787' };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
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

  async function setupRun(token: string) {
    db.exec(`UPDATE employees SET join_date = '2024-01-01' WHERE id IN ('emp-004','emp-005');`);
    db.exec(`DELETE FROM attendance WHERE employee_id IN ('emp-004','emp-005');`);

    const createRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-25',
          period_end: '2026-11-25',
          payment_date: '2026-11-25',
          title: 'November 2026',
        }),
      },
      token
    );
    const { runId } = (await createRes.json()) as any;
    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, token);
    return runId as string;
  }

  it('resolves several dates for one employee in a single call', async () => {
    const token = await adminToken();
    const runId = await setupRun(token);

    const ids = await db
      .prepare(
        `SELECT id FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND exception_type = 'missing_attendance'
         ORDER BY exception_date LIMIT 3`
      )
      .bind(runId)
      .all();
    const exceptionIds = ids.results.map((row: any) => row.id);
    assert.equal(exceptionIds.length, 3);

    const res = await request(
      `/api/payroll/runs/${runId}/exceptions/bulk-resolve`,
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: 'emp-004',
          exception_ids: exceptionIds,
          resolution_code: 'approved_leave',
          resolution_note: 'Batch approved',
        }),
      },
      token
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.resolvedCount, 3);

    const resolved = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND resolved = 1
           AND resolution_code = 'approved_leave'`
      )
      .bind(runId)
      .first();
    assert.equal(resolved.n, 3);
  });

  it('rejects an employee_id that does not own the selected exceptions', async () => {
    const token = await adminToken();
    const runId = await setupRun(token);

    // Grab emp-004's exceptions but claim they belong to emp-005.
    const ids = await db
      .prepare(
        `SELECT id FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-004' AND exception_type = 'missing_attendance'
         ORDER BY exception_date LIMIT 2`
      )
      .bind(runId)
      .all();
    const exceptionIds = ids.results.map((row: any) => row.id);

    const res = await request(
      `/api/payroll/runs/${runId}/exceptions/bulk-resolve`,
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: 'emp-005',
          exception_ids: exceptionIds,
          resolution_code: 'alpha',
        }),
      },
      token
    );

    assert.equal(res.status, 403, 'cannot resolve another employee\'s exceptions');

    const untouched = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM payroll_exceptions
         WHERE payroll_run_id = ? AND id IN (${exceptionIds.map(() => '?').join(',')}) AND resolved = 0`
      )
      .bind(runId, ...exceptionIds)
      .first();
    assert.equal(untouched.n, exceptionIds.length, 'nothing was resolved');
  });

  it('requires an employee_id for bulk resolution', async () => {
    const token = await adminToken();
    const runId = await setupRun(token);

    const res = await request(
      `/api/payroll/runs/${runId}/exceptions/bulk-resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ exception_ids: ['x'], resolution_code: 'alpha' }),
      },
      token
    );
    assert.equal(res.status, 400);
  });
});

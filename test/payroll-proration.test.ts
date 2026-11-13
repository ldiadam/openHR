import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Payroll proration for a new joiner', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
  };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    const req = new Request(`http://localhost${path}`, { ...options, headers });
    return app.fetch(req, env as any);
  }

  it('uses the join date and the period working days instead of hardcoded 15/21', async () => {
    const adminToken = await signJwt(
      {
        userId: 'usr-001',
        email: 'budi.santoso@nusantara.id',
        role: 'owner_admin',
        tenantId: 'default',
        name: 'Budi Santoso',
      },
      JWT_SECRET
    );

    db.exec(`
      UPDATE employees
      SET join_date = '2026-11-01', last_working_date = NULL, lifecycle_status = 'active',
          base_salary = 6000000, fixed_allowances = 0
      WHERE id = 'emp-004';
      DELETE FROM attendance WHERE employee_id = 'emp-004';
    `);

    const createRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-25',
          period_end: '2026-11-25',
          payment_date: '2026-11-25',
          title: 'Payroll Period November 2026',
        }),
      },
      adminToken
    );
    assert.equal(createRes.status, 200);
    const { runId } = (await createRes.json()) as any;

    const pullRes = await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);
    assert.equal(pullRes.status, 200);

    const item = await db
      .prepare(
        `SELECT days_worked, expected_working_days, prorated_salary
         FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-004'`
      )
      .bind(runId)
      .first();

    assert.equal(item.expected_working_days, 21, 'November 2026 has 21 weekdays');
    assert.equal(item.days_worked, 18, '1 Nov - 25 Nov 2026 has 18 weekdays');
    assert.equal(item.prorated_salary, 5142857, '6,000,000 / 21 * 18');
  });
});

describe('Payroll missing attendance exceptions', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
  };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    const req = new Request(`http://localhost${path}`, { ...options, headers });
    return app.fetch(req, env as any);
  }

  it('raises a warning when only some working days are logged', async () => {
    const adminToken = await signJwt(
      {
        userId: 'usr-001',
        email: 'budi.santoso@nusantara.id',
        role: 'owner_admin',
        tenantId: 'default',
        name: 'Budi Santoso',
      },
      JWT_SECRET
    );

    db.exec(`
      DELETE FROM attendance WHERE employee_id = 'emp-002';
      INSERT INTO attendance (id, tenant_id, employee_id, date, status) VALUES
        ('att-partial-1', 'default', 'emp-002', '2026-11-09', 'present'),
        ('att-partial-2', 'default', 'emp-002', '2026-11-10', 'present');
    `);

    const createRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-25',
          period_end: '2026-11-25',
          payment_date: '2026-11-25',
          title: 'Payroll Period November 2026',
        }),
      },
      adminToken
    );
    assert.equal(createRes.status, 200);
    const { runId } = (await createRes.json()) as any;

    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);

    const exc = await db
      .prepare(
        `SELECT id, description, exception_date FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-002' AND exception_type = 'missing_attendance'
         ORDER BY exception_date
         LIMIT 1`
      )
      .bind(runId)
      .first();
    assert.ok(exc, 'Partial attendance must raise missing_attendance exceptions');
    assert.ok(exc.exception_date, 'Exceptions are raised per missing day');
    assert.match(exc.description, /Tidak ada log presensi/);

    // One row per missing working day, not one aggregate row.
    const excCount = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = 'emp-002' AND exception_type = 'missing_attendance'`
      )
      .bind(runId)
      .first();
    assert.ok(excCount.n > 1, 'every missing day gets its own exception row');

    const resolveRes = await request(
      `/api/payroll/runs/${runId}/exceptions/${exc.id}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({
          resolution_code: 'attendance_completed',
          resolution_note: 'Entered manually',
        }),
      },
      adminToken
    );
    assert.equal(resolveRes.status, 200);

    const resolved = await db
      .prepare(`SELECT resolved, resolution_code, resolution_note FROM payroll_exceptions WHERE id = ?`)
      .bind(exc.id)
      .first();
    assert.equal(resolved.resolved, 1);
    assert.equal(resolved.resolution_code, 'attendance_completed');
    assert.equal(resolved.resolution_note, 'Entered manually');

    const item = await db
      .prepare(
        `SELECT days_worked, expected_working_days, prorated_salary
         FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-002'`
      )
      .bind(runId)
      .first();
    assert.equal(item.days_worked, 21, 'Full-month employee still gets full paid days');
    assert.equal(item.expected_working_days, 21);
    assert.equal(item.prorated_salary, 12000000);
  });
});

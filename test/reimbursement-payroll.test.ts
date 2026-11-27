import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Reimbursement payroll linkage', () => {
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

  it('carries a late-month approved claim into the next run, marks it, and pays it once', async () => {
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

    // Claim dated the 27th: past the 25th payment date of its own month's run
    db.exec(`
      INSERT INTO reimbursements (
        id, tenant_id, employee_id, category, amount, description,
        payment_method, status, expense_date, approved_at, created_at
      ) VALUES (
        'reimb-jan27', 'default', 'emp-004', 'Transport', 500000, 'Late January claim',
        'payroll', 'approved', '2026-01-27', CURRENT_TIMESTAMP, '2026-01-28 09:00:00'
      );
    `);

    const createRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-02-01',
          period_end: '2026-02-28',
          payment_date: '2026-02-25',
          title: 'February 2026',
        }),
      },
      adminToken
    );
    assert.equal(createRes.status, 200);
    const { runId } = (await createRes.json()) as any;

    const pullRes = await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);
    assert.equal(pullRes.status, 200);

    const reimb = await db
      .prepare(`SELECT payroll_run_id, status FROM reimbursements WHERE id = 'reimb-jan27'`)
      .first();
    assert.equal(reimb.payroll_run_id, runId, 'Late-month claim must be attached to the next run');
    assert.equal(reimb.status, 'approved');

    const item = await db
      .prepare(
        `SELECT base_salary, fixed_allowance, overtime_pay, attendance_bonus, commission_bonus, thr_amount,
                reimbursement_amount, gross_earnings, total_deductions, take_home_pay
         FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-004'`
      )
      .bind(runId)
      .first();
    assert.equal(item.reimbursement_amount, 500000);
    assert.ok(
      item.gross_earnings <= item.base_salary + item.fixed_allowance + item.overtime_pay + item.attendance_bonus + item.commission_bonus + item.thr_amount,
      'Gross earnings must exclude reimbursement_amount'
    );
    assert.equal(
      item.take_home_pay,
      item.gross_earnings - item.total_deductions + item.reimbursement_amount,
      'Take-home pay must add non-earning reimbursement on top of net salary'
    );

    const listRes = await request('/api/kasbon/reimbursements?employee_id=emp-004', {}, adminToken);
    const list = (await listRes.json()) as any;
    const row = list.reimbursements.find((r: any) => r.id === 'reimb-jan27');
    assert.equal(row.payroll_run_id, runId);
    assert.equal(row.payroll_run_title, 'February 2026');

    // Re-pulling must not double count or lose the link
    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);
    const itemAfterRepull = await db
      .prepare(`SELECT reimbursement_amount FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-004'`)
      .bind(runId)
      .first();
    assert.equal(itemAfterRepull.reimbursement_amount, 500000);

    const lockRes = await request(`/api/payroll/runs/${runId}/lock`, { method: 'POST' }, adminToken);
    assert.equal(lockRes.status, 200);
    const payRes = await request(`/api/payroll/runs/${runId}/pay`, { method: 'POST' }, adminToken);
    assert.equal(payRes.status, 200);

    const paid = await db
      .prepare(`SELECT payroll_run_id, status FROM reimbursements WHERE id = 'reimb-jan27'`)
      .first();
    assert.equal(paid.status, 'paid');
    assert.equal(paid.payroll_run_id, runId);

    // A later run must not include the already-paid claim
    const marchRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-03-01',
          period_end: '2026-03-31',
          payment_date: '2026-03-25',
          title: 'March 2026',
        }),
      },
      adminToken
    );
    const march = (await marchRes.json()) as any;
    await request(`/api/payroll/runs/${march.runId}/pull-inputs`, { method: 'POST' }, adminToken);
    const marchItem = await db
      .prepare(`SELECT reimbursement_amount FROM payroll_items WHERE payroll_run_id = ? AND employee_id = 'emp-004'`)
      .bind(march.runId)
      .first();
    assert.equal(marchItem.reimbursement_amount, 0, 'Paid claim must not be reimbursed twice');
  });

  it('filters claims to the 25-to-25 period only', async () => {
    const empToken = await signJwt(
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

    db.exec(`
      INSERT INTO reimbursements (
        id, tenant_id, employee_id, category, amount, description,
        payment_method, status, expense_date, created_at
      ) VALUES
        ('reimb-b-jan10', 'default', 'emp-004', 'Transport', 150000, 'Before cutoff',
         'payroll', 'pending', '2026-01-10', '2026-01-10 10:00:00'),
        ('reimb-b-jan27', 'default', 'emp-004', 'Transport', 250000, 'After cutoff',
         'payroll', 'approved', '2026-01-27', '2026-01-27 10:00:00'),
        ('reimb-b-feb20', 'default', 'emp-004', 'Transport', 300000, 'Inside period',
         'payroll', 'pending', '2026-02-20', '2026-02-20 10:00:00'),
        ('reimb-b-feb26', 'default', 'emp-004', 'Transport', 350000, 'After period end',
         'payroll', 'pending', '2026-02-26', '2026-02-26 10:00:00');
    `);

    const febRes = await request('/api/kasbon/reimbursements?month=2026-02', {}, empToken);
    const feb = ((await febRes.json()) as any).reimbursements.filter(
      (r: any) => ['reimb-b-jan10', 'reimb-b-jan27', 'reimb-b-feb20', 'reimb-b-feb26'].includes(r.id)
    );
    const febIds = feb.map((r: any) => r.id).sort();
    assert.deepEqual(febIds, ['reimb-b-feb20', 'reimb-b-jan27'], 'Feb period is 25 Jan - 25 Feb');

    const marRes = await request('/api/kasbon/reimbursements?month=2026-03', {}, empToken);
    const marIds = ((await marRes.json()) as any).reimbursements
      .filter((r: any) => ['reimb-b-feb20', 'reimb-b-feb26'].includes(r.id))
      .map((r: any) => r.id);
    assert.deepEqual(marIds, ['reimb-b-feb26'], '26 Feb belongs to the March period');
  });
});

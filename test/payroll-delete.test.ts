import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Delete payroll period', () => {
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

  const createRun = async (token: string, title: string) => {
    const res = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-11-25',
          period_end: '2026-12-25',
          payment_date: '2026-12-25',
          title,
        }),
      },
      token
    );
    assert.equal(res.status, 200);
    return ((await res.json()) as any).runId as string;
  };

  it('deletes a draft run, its items, and releases linked reimbursements', async () => {
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
      INSERT INTO reimbursements (
        id, tenant_id, employee_id, category, amount, description,
        payment_method, status, expense_date, created_at
      ) VALUES (
        'reimb-del', 'default', 'emp-004', 'Transport', 100000, 'Delete test claim',
        'payroll', 'approved', '2026-12-01', '2026-12-01 10:00:00'
      );
    `);

    const runId = await createRun(adminToken, 'Delete Me');
    const pullRes = await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);
    assert.equal(pullRes.status, 200);

    const linked = await db
      .prepare(`SELECT payroll_run_id FROM reimbursements WHERE id = 'reimb-del'`)
      .first();
    assert.equal(linked.payroll_run_id, runId);

    const delRes = await request(`/api/payroll/runs/${runId}`, { method: 'DELETE' }, adminToken);
    assert.equal(delRes.status, 200);

    const run = await db.prepare(`SELECT id FROM payroll_runs WHERE id = ?`).bind(runId).first();
    assert.equal(run, null);

    const items = await db
      .prepare(`SELECT COUNT(*) AS n FROM payroll_items WHERE payroll_run_id = ?`)
      .bind(runId)
      .first();
    assert.equal(items.n, 0);

    const exceptions = await db
      .prepare(`SELECT COUNT(*) AS n FROM payroll_exceptions WHERE payroll_run_id = ?`)
      .bind(runId)
      .first();
    assert.equal(exceptions.n, 0);

    const released = await db
      .prepare(`SELECT payroll_run_id FROM reimbursements WHERE id = 'reimb-del'`)
      .first();
    assert.equal(released.payroll_run_id, null);
  });

  it('refuses to delete a locked period', async () => {
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

    const runId = await createRun(adminToken, 'Locked Period');
    const lockRes = await request(`/api/payroll/runs/${runId}/lock`, { method: 'POST' }, adminToken);
    assert.equal(lockRes.status, 200);

    const delRes = await request(`/api/payroll/runs/${runId}`, { method: 'DELETE' }, adminToken);
    assert.equal(delRes.status, 400);

    const run = await db.prepare(`SELECT id FROM payroll_runs WHERE id = ?`).bind(runId).first();
    assert.ok(run, 'Locked run must still exist');
  });
});

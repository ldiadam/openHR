import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Manager self-service scoping', () => {
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

  // emp-002 (Siti) manages emp-004 (Agus) in the seeded data
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

  it('returns only the manager’s own requests inside the ESS view', async () => {
    const token = await managerToken();

    db.exec(`
      INSERT OR IGNORE INTO leave_requests (
        id, tenant_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status
      ) VALUES
        ('lr-own', 'default', 'emp-002', 'lt-annual', '2026-12-01', '2026-12-01', 1, 'Manager own leave', 'pending'),
        ('lr-team', 'default', 'emp-004', 'lt-annual', '2026-12-02', '2026-12-02', 1, 'Team member leave', 'pending');
    `);

    const inbox = await request('/api/leave/requests', {}, token);
    const inboxBody = (await inbox.json()) as any;
    const inboxIds = inboxBody.requests.map((r: any) => r.id);
    assert.ok(inboxIds.includes('lr-own'), 'Approval inbox includes the manager own request');
    assert.ok(inboxIds.includes('lr-team'), 'Approval inbox includes team requests');

    const mine = await request('/api/leave/requests?scope=mine', {}, token);
    const mineBody = (await mine.json()) as any;
    const mineIds = mineBody.requests.map((r: any) => r.id);
    assert.deepEqual(mineIds, ['lr-own'], 'ESS view is limited to the manager own requests');
  });

  it('limits overtime and claim listings to the manager’s own records in ESS', async () => {
    const token = await managerToken();

    db.exec(`
      INSERT OR IGNORE INTO overtime_requests (
        id, tenant_id, employee_id, date, start_time, end_time, planned_hours, actual_hours, reason, status
      ) VALUES
        ('ot-own', 'default', 'emp-002', '2026-12-03', '18:00', '20:00', 2, 2, 'Own overtime', 'pending'),
        ('ot-team', 'default', 'emp-004', '2026-12-03', '18:00', '20:00', 2, 2, 'Team overtime', 'pending');

      INSERT OR IGNORE INTO reimbursements (
        id, tenant_id, employee_id, category, amount, description, payment_method, status, expense_date
      ) VALUES
        ('rb-own', 'default', 'emp-002', 'Transport', 50000, 'Own claim', 'payroll', 'pending', '2026-12-03'),
        ('rb-team', 'default', 'emp-004', 'Transport', 60000, 'Team claim', 'payroll', 'pending', '2026-12-03');
    `);

    const otMine = await request('/api/shifts/overtime/requests?scope=mine', {}, token);
    const otIds = ((await otMine.json()) as any).requests.map((r: any) => r.id);
    assert.deepEqual(otIds, ['ot-own']);

    const rbMine = await request('/api/kasbon/reimbursements?scope=mine', {}, token);
    const rbIds = ((await rbMine.json()) as any).reimbursements.map((r: any) => r.id);
    assert.deepEqual(rbIds, ['rb-own']);
  });
});

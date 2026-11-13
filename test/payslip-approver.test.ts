import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Payslip approver resolution', () => {
  const db = createMockD1();

  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
  };

  async function request(path: string, token: string) {
    return app.fetch(
      new Request(`http://localhost${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env as any
    );
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

  function seedPayrollItem(id: string, employeeId: string) {
    db.exec(`
      INSERT OR REPLACE INTO payroll_runs (
        id, tenant_id, period_start, period_end, payment_date, title, status
      ) VALUES ('prun-approver', 'default', '2026-10-25', '2026-11-25', '2026-11-25', 'November 2026', 'calculated');

      INSERT OR REPLACE INTO payroll_items (
        id, tenant_id, payroll_run_id, employee_id, employee_nik, employee_name,
        job_title, department_name, ptkp_status, bank_name, bank_account_number,
        base_salary, gross_earnings, total_deductions, take_home_pay
      ) VALUES (
        '${id}', 'default', 'prun-approver', '${employeeId}', 'EMP', 'Employee',
        'Staff', 'Operations', 'TK/0', 'BCA', '1234567890',
        5000000, 5000000, 0, 5000000
      );
    `);
  }

  it("shows the employee's direct manager as the authorizer", async () => {
    seedPayrollItem('pitem-emp', 'emp-004'); // Agus -> manager emp-002 (Siti)
    const token = await adminToken();

    const res = await request('/api/payroll/items/pitem-emp/payslip', token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.equal(body.payslip.approver_name, 'Siti Rahmawati');
    assert.equal(body.payslip.approver_title, 'HR Operations Manager');
    assert.equal(body.payslip.authorized_by_company, false);
  });

  it("shows the director as the authorizer for a manager's own payslip", async () => {
    seedPayrollItem('pitem-mgr', 'emp-002'); // Siti -> manager emp-001 (Budi)
    const token = await adminToken();

    const res = await request('/api/payroll/items/pitem-mgr/payslip', token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.equal(body.payslip.approver_name, 'Budi Santoso');
    assert.equal(body.payslip.authorized_by_company, false);
  });

  it('falls back to the company when the employee has no manager', async () => {
    db.exec(`UPDATE employees SET manager_id = NULL WHERE id = 'emp-001';`);
    seedPayrollItem('pitem-top', 'emp-001'); // Budi has no manager
    const token = await adminToken();

    const res = await request('/api/payroll/items/pitem-top/payslip', token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.equal(body.payslip.approver_name, 'PT Nusantara Digital Kreasi');
    assert.equal(body.payslip.approver_title, null);
    assert.equal(body.payslip.authorized_by_company, true);
  });
});

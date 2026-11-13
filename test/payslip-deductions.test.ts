import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEmployeePayroll } from '../src/services/payroll-calc';
import { createMockD1 } from './d1-mock';

/**
 * A payslip must never total deductions without showing where they came from:
 * every component of total_deductions has to be a labelled line item.
 */
describe('Payslip deduction breakdown', () => {
  const db = createMockD1();

  async function loadSettings() {
    return (await db
      .prepare(`SELECT * FROM payroll_settings ORDER BY effective_date DESC LIMIT 1`)
      .first()) as any;
  }

  it('exposes alpha deduction as its own line item that sums into the total', async () => {
    const settings = await loadSettings();

    const calc = calculateEmployeePayroll(
      {
        id: 'emp-x',
        nik: 'X',
        full_name: 'Employee X',
        ptkp_status: 'TK/0',
        base_salary: 6000000,
        fixed_allowances: 0,
        bank_name: 'BCA',
        bank_account_number: '1',
        days_worked: 21,
        expected_working_days: 21,
        late_minutes: 0,
        unapproved_absence_days: 0,
        alpha_days: 14,
        overtime_weekday_hours: 0,
        overtime_holiday_hours: 0,
        kasbon_deduction: 0,
        reimbursement_amount: 0,
        has_bpjs_tk: false,
        has_bpjs_kes: false,
        pays_own_tax: true,
        tax_scheme: 'self_paid',
      },
      settings
    );

    assert.equal(calc.alpha_days, 14);
    assert.equal(calc.alpha_deduction, Math.round((6000000 / 21) * 14));
    assert.ok(calc.alpha_deduction > 0, 'alpha produces a deduction');

    // The line item must be part of the total, not a hidden extra.
    const components =
      calc.late_deduction +
      calc.unpaid_leave_deduction +
      calc.alpha_deduction +
      calc.kasbon_deduction +
      calc.other_deductions +
      calc.bpjs_kes_employee +
      calc.bpjs_jht_employee +
      calc.bpjs_jp_employee +
      calc.pph21_amount;

    assert.equal(calc.total_deductions, components, 'every deduction component is a line item');
    assert.equal(calc.take_home_pay, calc.gross_earnings - calc.total_deductions);
    assert.ok(calc.take_home_pay >= 0, 'net pay is never negative from alpha alone');
  });

  it('reports zero alpha when no days are unjustified', async () => {
    const settings = await loadSettings();

    const calc = calculateEmployeePayroll(
      {
        id: 'emp-y',
        nik: 'Y',
        full_name: 'Employee Y',
        ptkp_status: 'TK/0',
        base_salary: 6000000,
        fixed_allowances: 0,
        bank_name: 'BCA',
        bank_account_number: '1',
        days_worked: 21,
        expected_working_days: 21,
        late_minutes: 0,
        unapproved_absence_days: 0,
        alpha_days: 0,
        overtime_weekday_hours: 0,
        overtime_holiday_hours: 0,
        kasbon_deduction: 0,
        reimbursement_amount: 0,
        has_bpjs_tk: false,
        has_bpjs_kes: false,
        pays_own_tax: true,
        tax_scheme: 'self_paid',
      },
      settings
    );

    assert.equal(calc.alpha_days, 0);
    assert.equal(calc.alpha_deduction, 0);
    assert.equal(calc.total_deductions, 0);
  });
});

describe('Payslip exposes alpha detail for unit-level display', () => {
  const db = createMockD1();
  const env = { DB: db, JWT_SECRET: 'openhr-secret-key-change-in-production-min-32-chars-long', APP_URL: 'http://x' };

  it('returns the alpha dates and daily rate on the payslip', async () => {
    const { signJwt } = await import('../src/middleware/auth');
    const app = (await import('../src/index')).default;

    db.exec(`
      INSERT OR REPLACE INTO payroll_runs (
        id, tenant_id, period_start, period_end, payment_date, title, status
      ) VALUES ('prun-alpha', 'default', '2026-10-25', '2026-11-25', '2026-11-25', 'Nov 2026', 'calculated');

      INSERT OR REPLACE INTO payroll_items (
        id, tenant_id, payroll_run_id, employee_id, employee_nik, employee_name,
        job_title, department_name, ptkp_status, bank_name, bank_account_number,
        base_salary, gross_earnings, total_deductions, take_home_pay,
        days_worked, expected_working_days, alpha_days, alpha_deduction
      ) VALUES (
        'pitem-alpha', 'default', 'prun-alpha', 'emp-004', 'EMP004', 'Agus Setiawan',
        'Engineer', 'Eng', 'TK/0', 'BCA', '123', 6000000, 6000000, 4000000, 2000000,
        21, 21, 14, 4000000
      );

      INSERT INTO payroll_exceptions (
        id, tenant_id, payroll_run_id, employee_id, exception_type, severity, description, exception_date, resolved
      ) VALUES
        ('exc-a1', 'default', 'prun-alpha', 'emp-004', 'missing_attendance', 'warning', 'x', '2026-11-02', 0),
        ('exc-a2', 'default', 'prun-alpha', 'emp-004', 'missing_attendance', 'warning', 'x', '2026-11-03', 0),
        ('exc-a3', 'default', 'prun-alpha', 'emp-004', 'missing_attendance', 'warning', 'x', '2026-11-04', 0);
    `);

    const token = await signJwt(
      {
        userId: 'usr-001',
        email: 'budi.santoso@nusantara.id',
        role: 'owner_admin',
        tenantId: 'default',
        name: 'Budi Santoso',
      },
      env.JWT_SECRET
    );

    const res = await app.fetch(
      new Request('http://localhost/api/payroll/items/pitem-alpha/payslip', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env as any
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.deepEqual(body.payslip.alpha_dates, ['2026-11-02', '2026-11-03', '2026-11-04']);
    assert.equal(body.payslip.alpha_daily_rate, Math.round(6000000 / 21));
    assert.equal(body.payslip.alpha_days, 14);
  });
});

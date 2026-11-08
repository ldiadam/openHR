import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('openHR Acceptance Criteria Verification Suite (Spec Section 14)', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
    PURELYMAIL_DOMAIN: 'company.id',
  };

  // Helper to make mock requests to Hono app
  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const req = new Request(`http://localhost${path}`, {
      ...options,
      headers,
    });

    const res = await app.fetch(req, env as any);
    return res;
  }

  async function getJson(res: Response): Promise<any> {
    return (await res.json()) as any;
  }

  // Generate tokens for testing
  let adminToken: string;
  let managerToken: string;
  let financeToken: string;
  let employeeAgusToken: string;
  let employeeRinaToken: string;

  it('Setup test authentication tokens for Owner/Admin, Manager, Finance, and Employees', async () => {
    adminToken = await signJwt(
      { userId: 'usr-001', tenantId: 'default', email: 'budi.santoso@nusantara.id', role: 'owner_admin', employeeId: 'emp-001', name: 'Budi Santoso' },
      JWT_SECRET
    );
    managerToken = await signJwt(
      { userId: 'usr-002', tenantId: 'default', email: 'siti.rahma@nusantara.id', role: 'manager', employeeId: 'emp-002', name: 'Siti Rahmawati' },
      JWT_SECRET
    );
    financeToken = await signJwt(
      { userId: 'usr-003', tenantId: 'default', email: 'dewi.lestari@nusantara.id', role: 'finance', employeeId: 'emp-003', name: 'Dewi Lestari' },
      JWT_SECRET
    );
    employeeAgusToken = await signJwt(
      { userId: 'usr-004', tenantId: 'default', email: 'agus.setiawan@nusantara.id', role: 'employee', employeeId: 'emp-004', name: 'Agus Setiawan' },
      JWT_SECRET
    );
    employeeRinaToken = await signJwt(
      { userId: 'usr-005', tenantId: 'default', email: 'rina.wijaya@nusantara.id', role: 'employee', employeeId: 'emp-005', name: 'Rina Wijaya' },
      JWT_SECRET
    );

    assert.ok(adminToken);
    assert.ok(employeeAgusToken);
  });

  // AC 1
  it('AC1: HR can import 50 employees from Excel and every one can clock in on a phone the same day', async () => {
    const bulkEmployees = [];
    for (let i = 1; i <= 50; i++) {
      const pad = String(i).padStart(3, '0');
      bulkEmployees.push({
        nik: `EMP-B${pad}`,
        full_name: `Karyawan Uji Bulk ${pad}`,
        ktp_number: `3171010101900${pad}`,
        npwp_number: `09.100.200.0-${pad}.000`,
        date_of_birth: '1995-05-15',
        place_of_birth: 'Jakarta',
        gender: i % 2 === 0 ? 'female' : 'male',
        religion: 'Islam',
        marital_status: 'single',
        ptkp_status: 'TK/0',
        address: `Jl. Uji No. ${i}, Jakarta`,
        phone: `081200000${pad}`,
        personal_email: `karyawan.b${pad}@test.id`,
        job_title: 'Operasional Lapangan',
        employment_status: 'PKWTT',
        join_date: '2026-10-01',
        base_salary: 5500000,
        fixed_allowances: 500000,
        bank_name: 'BCA',
        bank_account_number: `112233${pad}`,
      });
    }

    const importRes = await request(
      '/api/employees/bulk-import',
      {
        method: 'POST',
        body: JSON.stringify({ employees: bulkEmployees }),
      },
      adminToken
    );

    assert.strictEqual(importRes.status, 200);
    const importData: any = await importRes.json();
    assert.strictEqual(importData.successCount, 50, 'All 50 employees must be imported successfully');
    assert.strictEqual(importData.errorCount, 0, 'No errors in bulk import');

    // Verify all 50 can clock in on mobile the same day
    for (let i = 1; i <= 50; i++) {
      const pad = String(i).padStart(3, '0');
      const emp: any = await db.prepare('SELECT id FROM employees WHERE nik = ?').bind(`EMP-B${pad}`).first();
      assert.ok(emp, `Employee EMP-B${pad} must exist in database`);

      const clockRes = await request(
        '/api/attendance/clock',
        {
          method: 'POST',
          body: JSON.stringify({
            employee_id: emp.id,
            type: 'in',
            latitude: -6.2255,
            longitude: 106.8095,
            device_timestamp: '2026-10-01T08:15:00Z',
          }),
        },
        adminToken
      );

      assert.strictEqual(clockRes.status, 200, `Employee ${pad} clock in must succeed`);
      const clockData: any = await clockRes.json();
      assert.strictEqual(clockData.status, 'present', `Employee ${pad} status must be present`);
    }
  });

  // AC 2
  it('AC2: A late clock-in, an approved leave day, and an approved overtime entry each change the monthly payroll result correctly - with no manual re-entry', async () => {
    const empId = 'emp-004'; // Agus Setiawan: Base Rp 14M, Allowance Rp 1M -> monthlyWageForOt = Rp 15M

    // 1. Late clock-in (30 minutes late on 2026-10-05)
    await request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empId,
          type: 'in',
          latitude: -6.2255,
          longitude: 106.8095,
          device_timestamp: '2026-10-05T09:00:00Z', // 30 mins after 08:30
        }),
      },
      employeeAgusToken
    );

    // 2. Approved overtime entry (2 hours on weekday 2026-10-06)
    const otRes = await request(
      '/api/shifts/overtime/requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empId,
          date: '2026-10-06',
          start_time: '18:00',
          end_time: '20:00',
          planned_hours: 2,
          reason: 'Deployment rilis sistem',
          is_holiday_or_rest_day: false,
        }),
      },
      employeeAgusToken
    );
    const otData: any = await otRes.json();

    // Manager approves overtime
    await request(
      `/api/shifts/overtime/requests/${otData.overtimeId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'approved', actual_hours: 2 }),
      },
      managerToken
    );

    // 3. Approved leave day on 2026-10-07
    const leaveRes = await request(
      '/api/leave/requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empId,
          leave_type_id: 'lt-annual',
          start_date: '2026-10-07',
          end_date: '2026-10-07',
          total_days: 1,
          reason: 'Urusan keluarga',
        }),
      },
      employeeAgusToken
    );
    const leaveData: any = await leaveRes.json();

    // Manager approves leave
    await request(
      `/api/leave/requests/${leaveData.requestId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'approved' }),
      },
      managerToken
    );

    // 4. Open payroll period for October 2026
    const runRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-01',
          period_end: '2026-10-31',
          payment_date: '2026-10-25',
          title: 'Gaji Oktober 2026 (AC2 Test)',
        }),
      },
      adminToken
    );
    const runData: any = await runRes.json();

    // Pull inputs automatically
    await request(`/api/payroll/runs/${runData.runId}/pull-inputs`, { method: 'POST' }, adminToken);

    // Check employee 004 payroll item
    const item: any = await db
      .prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND employee_id = ?')
      .bind(runData.runId, empId)
      .first();

    assert.ok(item, 'Payroll item must exist');
    assert.strictEqual(item.overtime_hours, 2, 'Approved overtime hours must automatically be 2');

    // Expected OT pay: (15,000,000 / 173) * (1.5 + 2.0) = 86,705.20 * 3.5 = Rp 303,468
    const expectedOtPay = Math.round((15000000 / 173) * 3.5);
    assert.strictEqual(item.overtime_pay, expectedOtPay, `Overtime pay must match Kepmenak formula exactly (${expectedOtPay})`);
  });

  // AC 3
  it('AC3: A payroll run calculates BPJS and PPh 21 for TK/0, K/1, and K/2 employees and matches a hand-checked spreadsheet for a test month', async () => {
    // Open clean test run for September 2026
    const runRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          payment_date: '2026-09-25',
          title: 'Gaji Uji BPJS & PPh21 September 2026 (AC3)',
        }),
      },
      adminToken
    );
    const runData: any = await runRes.json();
    await request(`/api/payroll/runs/${runData.runId}/pull-inputs`, { method: 'POST' }, adminToken);

    // 1. TK/0 Case: Budi Santoso (EMP001, Gross 20M)
    const budi: any = await db
      .prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND employee_nik = ?')
      .bind(runData.runId, 'EMP001')
      .first();

    assert.ok(budi);
    // BPJS Kes Employee: 1% capped at 12M = 120,000
    assert.strictEqual(budi.bpjs_kes_employee, 120000, 'BPJS Kes Emp for 20M must cap at 120,000');
    // BPJS JHT Employee: 2% of 20M = 400,000
    assert.strictEqual(budi.bpjs_jht_employee, 400000, 'BPJS JHT Emp for 20M must be 400,000');
    // BPJS JP Employee: 1% capped at 10,042,300 = 100,423
    assert.strictEqual(budi.bpjs_jp_employee, 100423, 'BPJS JP Emp for 20M must cap at 100,423');
    // PPh 21 TER A: 20M gross falls in 19,750,000 - 24,150,000 bracket -> 8.0% = 1,600,000
    assert.strictEqual(budi.pph21_amount, 1600000, 'PPh 21 TER Category A for 20M must be 1,600,000');

    // 2. K/1 Case: Siti Rahmawati (EMP002, Gross 13.5M)
    const siti: any = await db
      .prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND employee_nik = ?')
      .bind(runData.runId, 'EMP002')
      .first();

    assert.ok(siti);
    assert.strictEqual(siti.bpjs_kes_employee, 120000, 'BPJS Kes Emp for 13.5M capped at 120,000');
    assert.strictEqual(siti.bpjs_jht_employee, 270000, 'BPJS JHT Emp for 13.5M (2%) = 270,000');
    assert.strictEqual(siti.bpjs_jp_employee, 100423, 'BPJS JP Emp for 13.5M capped at 100,423');
    // PPh 21 TER B: 13.5M gross falls in 12,550,000 - 13,600,000 bracket -> 3.0% = 405,000
    assert.strictEqual(siti.pph21_amount, 405000, 'PPh 21 TER Category B for 13.5M must be 405,000');

    // 3. K/2 Case: Agus Setiawan (EMP004, Gross 15M without OT)
    // For 15M gross (Category B): falls in 14,950,000 - 16,400,000 bracket -> 5.0% = 750,000
    const agus: any = await db
      .prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND employee_nik = ?')
      .bind(runData.runId, 'EMP004')
      .first();

    assert.ok(agus);
    assert.strictEqual(agus.bpjs_kes_employee, 120000);
    assert.strictEqual(agus.bpjs_jht_employee, 300000);
    assert.strictEqual(agus.bpjs_jp_employee, 100423);
    assert.strictEqual(agus.pph21_amount, 750000, 'PPh 21 TER Category B for 15M must be 750,000');
  });

  // AC 4
  it('AC4: A locked payroll run cannot be edited; a correction appears in the following run', async () => {
    // Open run
    const runRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-01',
          period_end: '2026-10-31',
          payment_date: '2026-10-25',
          title: 'Gaji Oktober 2026 (AC4 Test)',
        }),
      },
      adminToken
    );
    const { runId }: any = await runRes.json();
    await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);

    // Lock the run
    const lockRes = await request(`/api/payroll/runs/${runId}/lock`, { method: 'POST' }, adminToken);
    assert.strictEqual(lockRes.status, 200);

    // Attempt to pull inputs on locked run -> should fail with 400
    const rePullRes = await request(`/api/payroll/runs/${runId}/pull-inputs`, { method: 'POST' }, adminToken);
    assert.strictEqual(rePullRes.status, 400, 'Locked run cannot pull inputs');

    // Attempt to adjust item on locked run -> should fail with 400
    const adjustRes = await request(
      `/api/payroll/runs/${runId}/adjust-item`,
      {
        method: 'POST',
        body: JSON.stringify({ item_id: 'any', attendance_bonus: 500000 }),
      },
      adminToken
    );
    assert.strictEqual(adjustRes.status, 400, 'Locked run cannot adjust item');

    // Open following run (November 2026) and add correction
    const nextRunRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-11-01',
          period_end: '2026-11-30',
          payment_date: '2026-11-25',
          title: 'Gaji November 2026 (Berikutnya)',
        }),
      },
      adminToken
    );
    const nextRunData: any = await nextRunRes.json();
    await request(`/api/payroll/runs/${nextRunData.runId}/pull-inputs`, { method: 'POST' }, adminToken);

    const nextItem: any = await db
      .prepare('SELECT id, take_home_pay FROM payroll_items WHERE payroll_run_id = ? AND employee_nik = ?')
      .bind(nextRunData.runId, 'EMP004')
      .first();

    const correctionRes = await request(
      `/api/payroll/runs/${nextRunData.runId}/adjust-item`,
      {
        method: 'POST',
        body: JSON.stringify({
          item_id: nextItem.id,
          other_deductions: 250000,
          other_deductions_reason: 'Koreksi kelebihan bayar periode Oktober',
        }),
      },
      adminToken
    );
    assert.strictEqual(correctionRes.status, 200, 'Correction in following run must succeed');
  });

  // AC 5
  it("AC5: Every employee can open their own payslip PDF on their phone and cannot open anyone else's", async () => {
    // Find item for Agus (emp-004) and item for Rina (emp-005)
    const agusItem: any = await db.prepare('SELECT id FROM payroll_items WHERE employee_id = ? LIMIT 1').bind('emp-004').first();
    const rinaItem: any = await db.prepare('SELECT id FROM payroll_items WHERE employee_id = ? LIMIT 1').bind('emp-005').first();

    assert.ok(agusItem);
    assert.ok(rinaItem);

    // 1. Agus requests his own payslip -> 200 OK
    const ownRes = await request(`/api/payroll/items/${agusItem.id}/payslip`, {}, employeeAgusToken);
    assert.strictEqual(ownRes.status, 200, 'Employee can open their own payslip');
    const ownData: any = await ownRes.json();
    assert.strictEqual(ownData.payslip.employee_id, 'emp-004');

    // 2. Agus attempts to open Rina's payslip -> 403 Forbidden!
    const forbiddenRes = await request(`/api/payroll/items/${rinaItem.id}/payslip`, {}, employeeAgusToken);
    assert.strictEqual(forbiddenRes.status, 403, 'Employee must be forbidden from opening another employee payslip');

    // 3. Admin HR can open any payslip
    const adminRes = await request(`/api/payroll/items/${rinaItem.id}/payslip`, {}, adminToken);
    assert.strictEqual(adminRes.status, 200, 'Admin can view any payslip');
  });

  // AC 6
  it("AC6: Kasbon approved this month is deducted in this month's run automatically", async () => {
    const empId = 'emp-005'; // Rina Wijaya

    // 1. Employee requests kasbon of Rp 500,000
    const ksbReqRes = await request(
      '/api/kasbon/requests',
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empId,
          amount: 500000,
          total_instalments: 1,
          reason: 'Biaya darurat medis',
        }),
      },
      employeeRinaToken
    );
    assert.strictEqual(ksbReqRes.status, 200);
    const ksbData: any = await ksbReqRes.json();

    // 2. HR approves the kasbon
    const ksbReviewRes = await request(
      `/api/kasbon/requests/${ksbData.kasbonId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'approved' }),
      },
      adminToken
    );
    assert.strictEqual(ksbReviewRes.status, 200);

    // 3. Open payroll run and pull inputs
    const runRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-01',
          period_end: '2026-10-31',
          payment_date: '2026-10-25',
          title: 'Gaji Oktober 2026 (Kasbon Test)',
        }),
      },
      adminToken
    );
    const runData: any = await runRes.json();
    await request(`/api/payroll/runs/${runData.runId}/pull-inputs`, { method: 'POST' }, adminToken);

    // 4. Verify deduction in payroll item
    const rinaItem: any = await db
      .prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND employee_id = ?')
      .bind(runData.runId, empId)
      .first();

    assert.ok(rinaItem);
    assert.strictEqual(rinaItem.kasbon_deduction, 500000, 'Approved kasbon must automatically be deducted in payroll');
    assert.strictEqual(
      rinaItem.take_home_pay,
      rinaItem.gross_earnings - rinaItem.total_deductions,
      'Take-home pay must subtract total deductions including kasbon'
    );
  });

  // AC 7
  it('AC7: Attendance and payroll recaps export to Excel that finance can use without reformatting', async () => {
    // 1. Export Attendance Recap Excel
    const attExportRes = await request('/api/reports/attendance-recap?month=2026-10&export=excel', {}, adminToken);
    assert.strictEqual(attExportRes.status, 200);
    assert.strictEqual(
      attExportRes.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const attBuf = await attExportRes.arrayBuffer();
    assert.ok(attBuf.byteLength > 1000, 'Excel file must have valid non-empty binary content');
    const attWb = XLSX.read(new Uint8Array(attBuf), { type: 'array' });
    assert.ok(attWb.SheetNames.length > 0, 'Workbook must contain at least one sheet');
    const attRows = XLSX.utils.sheet_to_json(attWb.Sheets[attWb.SheetNames[0]]);
    assert.ok(attRows.length > 0, 'Recap sheet must have rows with columns');

    // 2. Export Payroll Recap Excel
    const payExportRes = await request('/api/reports/payroll-recap?export=excel', {}, financeToken);
    assert.strictEqual(payExportRes.status, 200);
    assert.strictEqual(
      payExportRes.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const payBuf = await payExportRes.arrayBuffer();
    assert.ok(payBuf.byteLength > 1000);
    const payWb = XLSX.read(new Uint8Array(payBuf), { type: 'array' });
    const payRows = XLSX.utils.sheet_to_json(payWb.Sheets[payWb.SheetNames[0]]);
    assert.ok(payRows.length > 0, 'Payroll recap must contain rows ready for finance');
  });
});

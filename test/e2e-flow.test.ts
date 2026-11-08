import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('openHR End-to-End Core Workflow Test (Hire -> Onboard -> Clock in -> Leave -> Approve -> Payroll -> Payslip)', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
    PURELYMAIL_DOMAIN: 'nusantara.id',
    PURELYMAIL_FROM_ADDRESS: 'hr@nusantara.id',
  };

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

    return await app.fetch(req, env as any);
  }

  async function getJson(res: Response): Promise<any> {
    return await res.json();
  }

  it('Executes the entire lifecycle seamlessly', async () => {
    // Admin Token
    const adminToken = await signJwt(
      { userId: 'usr-001', tenantId: 'default', email: 'budi.santoso@nusantara.id', role: 'owner_admin', employeeId: 'emp-001', name: 'Budi Santoso' },
      JWT_SECRET
    );

    // 1. HIRE & ONBOARD (with Purelymail Provisioning + SMTP Invite)
    const hireRes = await request(
      '/api/employees',
      {
        method: 'POST',
        body: JSON.stringify({
          nik: 'EMP999',
          full_name: 'Doni Pratama',
          ktp_number: '3171010101950999',
          npwp_number: '09.777.888.9-011.000',
          date_of_birth: '1995-04-12',
          place_of_birth: 'Surabaya',
          gender: 'male',
          religion: 'Islam',
          marital_status: 'single',
          ptkp_status: 'TK/0',
          address: 'Jl. Fatmawati No. 88, Jakarta Selatan',
          phone: '081299998888',
          personal_email: 'doni.pratama@personal.id',
          join_date: '2026-10-01',
          employment_status: 'PKWTT',
          job_title: 'Junior Backend Engineer',
          department_id: 'dept-eng',
          branch_id: 'branch-jkt',
          manager_id: 'emp-002', // Siti Rahmawati
          base_salary: 7500000,
          fixed_allowances: 500000,
          bank_name: 'BCA',
          bank_account_number: '9876543210',
          provision_company_email: true,
          company_email_username: 'doni.pratama',
        }),
      },
      adminToken
    );

    assert.strictEqual(hireRes.status, 201, 'Hire employee must return 201 Created');
    const hireData = await getJson(hireRes);
    assert.ok(hireData.employeeId);
    assert.ok(hireData.inviteLink);
    assert.ok(hireData.purelymail);
    const newEmpId = hireData.employeeId;

    // Check invitation & outbox in DB
    const invite = await db.prepare('SELECT * FROM invitations WHERE employee_id = ?').bind(newEmpId).first();
    assert.ok(invite);
    assert.strictEqual(invite.email, 'doni.pratama@nusantara.id');

    // 2. EMPLOYEE ACCEPTS INVITE & SETS PASSWORD
    const acceptRes = await request('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({
        token: invite.token,
        password: 'PasswordBaru123!',
      }),
    });
    assert.strictEqual(acceptRes.status, 200, 'Accept invite must succeed');

    // 3. EMPLOYEE LOGS IN
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'doni.pratama@nusantara.id',
        password: 'PasswordBaru123!',
      }),
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await getJson(loginRes);
    const doniToken = loginData.token;
    assert.ok(doniToken);

    // 4. CLOCK IN ON PHONE (GPS + Selfie)
    const clockInRes = await request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'in',
          latitude: -6.2255,
          longitude: 106.8095,
          device_timestamp: '2026-10-02T08:20:00Z',
          photo_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        }),
      },
      doniToken
    );
    assert.strictEqual(clockInRes.status, 200);
    const clockInData = await getJson(clockInRes);
    assert.strictEqual(clockInData.status, 'present');
    assert.strictEqual(clockInData.geofenceStatus, 'in_geofence');

    // 5. EMPLOYEE REQUESTS LEAVE (Cuti Tahunan)
    const leaveReqRes = await request(
      '/api/leave/requests',
      {
        method: 'POST',
        body: JSON.stringify({
          leave_type_id: 'lt-annual',
          start_date: '2026-10-15',
          end_date: '2026-10-15',
          total_days: 1,
          reason: 'Perpanjangan SIM & KTP',
        }),
      },
      doniToken
    );
    assert.strictEqual(leaveReqRes.status, 200);
    const leaveReqData = await getJson(leaveReqRes);

    // 6. MANAGER APPROVES LEAVE
    const managerToken = await signJwt(
      { userId: 'usr-002', tenantId: 'default', email: 'siti.rahma@nusantara.id', role: 'manager', employeeId: 'emp-002', name: 'Siti Rahmawati' },
      JWT_SECRET
    );
    const approveRes = await request(
      `/api/leave/requests/${leaveReqData.requestId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'approved', note: 'Disetujui. Selamat beristirahat.' }),
      },
      managerToken
    );
    assert.strictEqual(approveRes.status, 200);

    // Verify leave balance was reduced from 12 to 11
    const balCheck = await db
      .prepare('SELECT remaining_days, used_days FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?')
      .bind(newEmpId, 'lt-annual')
      .first();
    assert.strictEqual(balCheck.remaining_days, 11);
    assert.strictEqual(balCheck.used_days, 1);

    // 7. PAYROLL RUN FOR OCTOBER 2026
    const runRes = await request(
      '/api/payroll/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          period_start: '2026-10-01',
          period_end: '2026-10-31',
          payment_date: '2026-10-25',
          title: 'Gaji Oktober 2026 - E2E Run',
        }),
      },
      adminToken
    );
    const runData = await getJson(runRes);

    // Pull inputs
    await request(`/api/payroll/runs/${runData.runId}/pull-inputs`, { method: 'POST' }, adminToken);

    // Verify Doni is included in payroll run
    const doniItem = await db
      .prepare('SELECT * FROM payroll_items WHERE payroll_run_id = ? AND employee_id = ?')
      .bind(runData.runId, newEmpId)
      .first();
    assert.ok(doniItem);
    // Base 7.5M + Fixed 500k = 8M Gross
    assert.strictEqual(doniItem.gross_earnings, 8000000);
    // PPh 21 TER A for 8M (bracket 7.5M - 8.55M is 1.5%): 8M * 1.5% = Rp 120,000
    assert.strictEqual(doniItem.pph21_amount, 120000);

    // Lock the run
    const lockRes = await request(`/api/payroll/runs/${runData.runId}/lock`, { method: 'POST' }, adminToken);
    assert.strictEqual(lockRes.status, 200);

    // 8. PAYSLIP PDF VIEW ON PHONE
    const payslipRes = await request(`/api/payroll/items/${doniItem.id}/payslip`, {}, doniToken);
    assert.strictEqual(payslipRes.status, 200);
    const payslipData = await getJson(payslipRes);
    assert.strictEqual(payslipData.payslip.employee_name, 'Doni Pratama');
    assert.ok(payslipData.payslip.take_home_pay > 0);
  });
});

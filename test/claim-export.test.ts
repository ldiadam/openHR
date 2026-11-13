import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('openHR Claim Sheet Excel & Receipts Feature', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
    PURELYMAIL_DOMAIN: 'company.id',
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

    const res = await app.fetch(req, env as any);
    return res;
  }

  it('submits a claim with custom fields, reviews it, and exports official Claim Excel', async () => {
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

    // 1. Submit Reimbursement Claim with specific Expense Date & Remarks
    const fakePhotoBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const createRes = await request(
      '/api/kasbon/reimbursements',
      {
        method: 'POST',
        body: JSON.stringify({
          expense_date: '2026-08-01',
          category: 'Transport',
          amount: 2300000,
          description: 'Place Rent',
          remarks: 'Arround 175 SGD',
          cost_centre: 'SMTS',
          project_ref: 'PRJ-SG',
          receipt_photo_base64: fakePhotoBase64,
        }),
      },
      empToken
    );

    assert.equal(createRes.status, 200);
    const createData = (await createRes.json()) as any;
    assert.ok(createData.reimbursementId);
    const reimbId = createData.reimbursementId;

    // 2. Admin Reviews & Approves Claim
    const reviewRes = await request(
      `/api/kasbon/reimbursements/${reimbId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({
          status: 'approved',
          note: 'Approved expense',
        }),
      },
      adminToken
    );
    assert.equal(reviewRes.status, 200);

    // 3. Retrieve receipt photo
    const receiptRes = await request(`/api/kasbon/reimbursements/${reimbId}/receipt`, {}, empToken);
    assert.equal(receiptRes.status, 200);
    assert.equal(receiptRes.headers.get('content-type'), 'image/jpeg');

    // 4. Export Official Claim Excel
    const excelRes = await request('/api/kasbon/claims/export-excel?month=2026-08', {}, empToken);
    assert.equal(excelRes.status, 200);
    assert.ok(excelRes.headers.get('content-type')?.includes('spreadsheetml'));

    const arrayBuffer = await excelRes.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Assert Row 1 has Expenses title
    assert.ok(String(aoa[0][0]).includes('EXPENSES.'));
    // Assert Row 2 is CLAIMS (Col 1 as in user CSV)
    assert.ok(aoa[1][1] === 'CLAIMS' || aoa[1][0] === 'CLAIMS');
    // Assert Row 3 has Header columns
    assert.equal(aoa[2][0], 'No');
    assert.equal(aoa[2][1], 'DATE');
    assert.equal(aoa[2][2], 'DESCRIPTION');
    assert.equal(aoa[2][3], 'Transport');
    assert.equal(aoa[2][7], 'TOTAL');
    assert.equal(aoa[2][11], 'REMARKS');

    // Assert Data Row 1 (Row 4 in spreadsheet)
    assert.equal(aoa[3][0], 1);
    assert.ok(String(aoa[3][1]).includes('2026-08') || String(aoa[3][1]).includes('Aug'));
    assert.equal(aoa[3][2], 'Place Rent');
    assert.ok(aoa[3][3] === 2300000 || String(aoa[3][3]).includes('2.300.000'));
    assert.equal(aoa[3][11], 'Arround 175 SGD');

    // 5. Admin Exports Claim Excel with Salary included under UNPAID (1 Excel 1 Employee)
    const adminExcelRes = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-004&month=2026-08&include_salary=true',
      {},
      adminToken
    );
    assert.equal(adminExcelRes.status, 200);
    const adminAb = await adminExcelRes.arrayBuffer();
    const adminWb = XLSX.read(new Uint8Array(adminAb), { type: 'array' });
    // Claim_1 always; Attendance is added when the period has attendance rows.
    assert.ok(adminWb.SheetNames.length <= 2, 'At most Claim_1 + Attendance');
    assert.equal(adminWb.SheetNames[0], 'Claim_1', 'Claim sheet is always first');
    const adminWs = adminWb.Sheets[adminWb.SheetNames[0]];
    const adminAoa: any[][] = XLSX.utils.sheet_to_json(adminWs, { header: 1 });

    // Assert row 1 (Place Rent) and row 2 (Salary Agus Setiawan)
    assert.equal(adminAoa[3][2], 'Place Rent');
    assert.equal(adminAoa[4][2], 'Salary Agus Setiawan');
    assert.ok(Number(adminAoa[4][6]) > 0, 'Salary must be in UNPAID column');
    assert.ok(Number(adminAoa[4][7]) > 0, 'Salary must be in TOTAL column');
    assert.ok(!adminAoa[4][9], 'Payroll row must not carry a cost centre');

    // Salary remark carries the job title; a prorated item appends "; Prorate x/y hari"
    const remarkRow = String(adminAoa[4][11] ?? '');
    assert.match(remarkRow, /Lead Software Engineer/, 'Salary remark must include the job title');
    assert.ok(
      /Prorate \d+\/\d+ hari/.test(remarkRow) || !remarkRow.includes('Prorate'),
      'Prorate note must follow the "Prorate d/e hari" format when present'
    );

    // The salary row must not re-add reimbursements already itemised as claim rows.
    const penggantian = await db
      .prepare(
        `SELECT pi.take_home_pay, pi.reimbursement_amount, pi.base_salary
         FROM payroll_items pi
         JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
         WHERE pi.employee_id = 'emp-004' AND pr.period_end LIKE '2026-08%'
         LIMIT 1`
      )
      .first();
    if (penggantian && Number(penggantian.reimbursement_amount) > 0) {
      const expectedSalaryRow =
        Number(penggantian.take_home_pay) - Number(penggantian.reimbursement_amount);
      assert.equal(
        Number(adminAoa[4][6]),
        expectedSalaryRow,
        'Salary UNPAID row must exclude reimbursements already listed as claim rows'
      );
    }

    // Signature block: prepared by employee, checked by direct manager, approved by director (top of manager chain)
    const signatureText = adminAoa.map((row) => row.join(' ')).join('\n');
    assert.ok(signatureText.includes('PREPARED BY:   Agus Setiawan'), 'Prepared must be the employee');
    assert.ok(signatureText.includes('CHECKED BY:     Siti Rahmawati'), 'Checked must be the direct manager');
    assert.ok(signatureText.includes('APPROVED BY: Budi Santoso'), 'Approved must be the director (root of manager chain)');

    // 6. Admin Exports All Employees as ZIP (1 Excel per Employee)
    const zipRes = await request(
      '/api/kasbon/claims/export-all-zip?month=2026-08&include_salary=true',
      {},
      adminToken
    );
    assert.equal(zipRes.status, 200);
    assert.equal(zipRes.headers.get('content-type'), 'application/zip');
    assert.ok(zipRes.headers.get('content-disposition')?.includes('Claim_Expenses_All_Employees_2026-08.zip'));
    const zipAb = await zipRes.arrayBuffer();
    assert.ok(zipAb.byteLength > 0, 'ZIP file must not be empty');

    // The Director may be flagged resigned/inactive; the chain must still resolve through them
    db.exec(`UPDATE employees SET lifecycle_status = 'resigned' WHERE id = 'emp-001';`);
    const zipRes2 = await request(
      '/api/kasbon/claims/export-all-zip?month=2026-08&include_salary=true',
      {},
      adminToken
    );
    assert.equal(zipRes2.status, 200);
    const unzipped = unzipSync(new Uint8Array(await zipRes2.arrayBuffer()));
    const agusFile = Object.keys(unzipped).find((name) => name.includes('EMP004'));
    assert.ok(agusFile, 'Agus claim sheet must exist in ZIP');
    const agusWb = XLSX.read(unzipped[agusFile!], { type: 'array' });
    const agusAoa: any[][] = XLSX.utils.sheet_to_json(agusWb.Sheets[agusWb.SheetNames[0]], { header: 1 });
    const agusSignature = agusAoa.map((row) => row.join(' ')).join('\n');
    assert.ok(agusSignature.includes('CHECKED BY:     Siti Rahmawati'));
    assert.ok(agusSignature.includes('APPROVED BY: Budi Santoso'), 'Director chain must include non-active employees');
  });

  it('adjusts leave balance successfully with employee NIK or ID', async () => {
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

    // 1. Verify /reports/leave-balances returns employee_id
    const reportRes = await request('/api/reports/leave-balances', {}, adminToken);
    assert.equal(reportRes.status, 200);
    const reportData = (await reportRes.json()) as any;
    assert.ok(reportData.balances && reportData.balances.length > 0);
    const firstBal = reportData.balances[0];
    assert.ok(firstBal.employee_id, 'Report must contain employee_id');

    // 2. Adjust balance using NIK (e.g. from user input)
    const adjustRes = await request(
      '/api/leave/adjust-balance',
      {
        method: 'POST',
        body: JSON.stringify({
          employee_id: firstBal.nik,
          leave_type_id: 'lt-annual',
          adjustment_days: 1,
          reason: 'Probation',
        }),
      },
      adminToken
    );

    assert.equal(adjustRes.status, 200);
    const adjustData = (await adjustRes.json()) as any;
    assert.equal(adjustData.message, 'Saldo cuti berhasil disesuaikan');
  });

  it('supports uploading, serving, and deleting company logo', async () => {
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

    // 1x1 transparent PNG
    const tinyPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const uploadRes = await request(
      '/api/settings/company/logo',
      {
        method: 'POST',
        body: JSON.stringify({ logo_base64: tinyPngBase64 }),
      },
      adminToken
    );
    assert.equal(uploadRes.status, 200);
    const uploadData = (await uploadRes.json()) as any;
    assert.ok(uploadData.logo_url?.startsWith('/api/public/company-logo?v='));

    // Public company endpoint exposes logo_url
    const pubCompRes = await request('/api/public/company');
    assert.equal(pubCompRes.status, 200);
    const pubCompData = (await pubCompRes.json()) as any;
    assert.equal(pubCompData.company?.logo_url, uploadData.logo_url);

    // Binary logo endpoint serves PNG without auth
    const logoFetch = await request('/api/public/company-logo');
    assert.equal(logoFetch.status, 200);
    assert.equal(logoFetch.headers.get('content-type'), 'image/png');
    assert.ok((await logoFetch.arrayBuffer()).byteLength > 0);

    // Reject unsupported file format
    const badRes = await request(
      '/api/settings/company/logo',
      {
        method: 'POST',
        body: JSON.stringify({ logo_base64: 'data:text/plain;base64,SGVsbG8=' }),
      },
      adminToken
    );
    assert.equal(badRes.status, 400);

    // Delete logo clears company.logo_url
    const delRes = await request('/api/settings/company/logo', { method: 'DELETE' }, adminToken);
    assert.equal(delRes.status, 200);
    const afterDelFetch = await request('/api/public/company-logo');
    assert.equal(afterDelFetch.status, 404);
  });

  it('edits employee NIK and resolves standalone Director account in Claim Excel', async () => {
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

    // Reject duplicate NIK
    const dupRes = await request(
      '/api/employees/emp-004',
      {
        method: 'PUT',
        body: JSON.stringify({ nik: 'EMP002' }),
      },
      adminToken
    );
    assert.equal(dupRes.status, 400);

    // Update NIK to new unique value and update portal role
    const editRes = await request(
      '/api/employees/emp-004',
      {
        method: 'PUT',
        body: JSON.stringify({ nik: 'EMP004-NEW', user_role: 'manager' }),
      },
      adminToken
    );
    assert.equal(editRes.status, 200);

    const detailRes = await request('/api/employees/emp-004', {}, adminToken);
    const detailData = (await detailRes.json()) as any;
    assert.equal(detailData.employee.nik, 'EMP004-NEW');
    assert.equal(detailData.employee.user_role, 'manager');

    // Create a Director employee account and decouple supervisor's manager_id to verify standalone Director detection
    db.exec(`UPDATE employees SET manager_id = NULL WHERE id = 'emp-002';`);
    const dirCreateRes = await request(
      '/api/employees',
      {
        method: 'POST',
        body: JSON.stringify({
          nik: 'DIR001',
          full_name: 'Lawrence Tan',
          ktp_number: '3171090909800099',
          date_of_birth: '1980-05-05',
          place_of_birth: 'Singapore',
          gender: 'male',
          religion: 'Lainnya',
          marital_status: 'married',
          address: 'Jakarta',
          phone: '08111111111',
          personal_email: 'lawrence@company.id',
          join_date: '2024-01-01',
          employment_status: 'PKWTT',
          job_title: 'Director',
          user_role: 'owner_admin',
          branch_id: 'branch-jkt',
          department_id: 'dept-hr',
          base_salary: 30000000,
        }),
      },
      adminToken
    );
    assert.equal(dirCreateRes.status, 201);

    const excelRes = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-004&month=2026-08&include_salary=true',
      {},
      adminToken
    );
    assert.equal(excelRes.status, 200);
    const wb = XLSX.read(new Uint8Array(await excelRes.arrayBuffer()), { type: 'array' });
    const aoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const sigText = aoa.map((r) => r.join(' ')).join('\n');
    assert.ok(sigText.includes('CHECKED BY:     Siti Rahmawati'), 'Checked by must remain direct Supervisor');
    assert.ok(sigText.includes('APPROVED BY: Lawrence Tan'), 'Approved by must detect Director account');
  });
});

describe('Claim workbook attendance sheet', () => {
  // Isolated database so inserting attendance cannot perturb the shared suite above.
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
    PURELYMAIL_DOMAIN: 'company.id',
  };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
  }

  it('attaches attendance records as a second sheet in the exported workbook', async () => {
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
      DELETE FROM attendance WHERE employee_id = 'emp-005';
      INSERT INTO attendance (
        id, tenant_id, employee_id, date, status, clock_in_time, clock_out_time,
        late_minutes, clock_in_status, clock_in_geofence_reason, source
      ) VALUES
        ('att-cl-1', 'default', 'emp-005', '2026-08-03', 'present', '08:25:00', '17:30:00', 0, 'in_geofence', NULL, 'mobile'),
        ('att-cl-2', 'default', 'emp-005', '2026-08-04', 'late', '08:45:00', '17:35:00', 15, 'out_of_geofence', 'Work From Home', 'mobile');
    `);

    const res = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-005&month=2026-08&include_salary=false',
      {},
      adminToken
    );
    assert.equal(res.status, 200);

    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    assert.ok(wb.SheetNames.includes('Attendance'), 'workbook carries an Attendance sheet');

    const ws = wb.Sheets['Attendance'];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Calendar grid: month title, weekday header, then day cells.
    const monthRow = aoa.findIndex((row) => /August 2026/.test(String(row[0] || '')));
    assert.ok(monthRow >= 0, 'calendar month title is present');
    const weekdayRow = aoa.findIndex((row) => row[0] === 'Mon' && row[6] === 'Sun');
    assert.ok(weekdayRow >= 0, 'calendar weekday header is present');

    // Legend lists every attendance status with its colour.
    const legendRow = aoa.findIndex((row) => String(row[0] || '') === 'Attendance Status');
    assert.ok(legendRow >= 0, 'legend header exists');
    const legend = aoa[legendRow + 1].filter(Boolean).map(String);
    for (const label of ['On Time', 'Late', 'Early Leave', 'On Leave', 'Sick Leave', 'Absent']) {
      assert.ok(legend.includes(label), `legend lists ${label}`);
    }

    // Header row sits under the calendar + legend.
    const headerIndex = aoa.findIndex((row) => row[0] === 'No' && row[1] === 'Date');
    assert.ok(headerIndex >= 0, 'attendance header row exists');

    const dataRows = aoa.slice(headerIndex + 1).filter((row) => row[1]);
    assert.equal(dataRows.length, 2, 'both attendance records are exported');
    assert.equal(dataRows[0][2], 'On Time', 'status uses the friendly label');
    assert.equal(dataRows[1][2], 'Late');
    assert.equal(Number(dataRows[1][5]), 15, 'late minutes are exported');
    assert.match(String(dataRows[1][6]), /Outside/, 'geofence status and reason are exported');
  });
});

describe('Attendance calendar follows payroll resolutions', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
    PURELYMAIL_DOMAIN: 'company.id',
  };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
  }

  const cellFor = (aoa: any[][], day: number) => {
    for (const row of aoa) {
      const hit = row.find((cell: any) => String(cell || '').startsWith(`${day}\n`));
      if (hit) return String(hit);
    }
    return null;
  };

  it('shows HR-approved leave instead of Absent, and unreviewed days as Absent', async () => {
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

    db.exec(`DELETE FROM attendance WHERE employee_id = 'emp-005';`);
    db.exec(`
      INSERT OR REPLACE INTO payroll_runs (
        id, tenant_id, period_start, period_end, payment_date, title, status
      ) VALUES ('prun-cal', 'default', '2026-08-01', '2026-08-31', '2026-08-25', 'Aug 2026', 'calculated');

      DELETE FROM payroll_exceptions WHERE payroll_run_id = 'prun-cal';

      INSERT INTO payroll_exceptions (
        id, tenant_id, payroll_run_id, employee_id, exception_type, severity,
        description, exception_date, resolved, resolution_code
      ) VALUES
        ('exc-cal-1', 'default', 'prun-cal', 'emp-005', 'missing_attendance', 'warning', 'x', '2026-08-03', 1, 'approved_leave'),
        ('exc-cal-2', 'default', 'prun-cal', 'emp-005', 'missing_attendance', 'warning', 'x', '2026-08-04', 0, NULL);
    `);

    const res = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-005&month=2026-08&include_salary=false',
      {},
      adminToken
    );
    assert.equal(res.status, 200);

    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const aoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Attendance'], { header: 1 });

    const aug3 = cellFor(aoa, 3);
    const aug4 = cellFor(aoa, 4);

    assert.equal(aug3, '3\nApproved leave', 'resolved day states the actual decision, not "On Time"');
    assert.equal(aug4, '4\nAbsent', 'unresolved day stays Absent');
  });
});

describe('Attendance sheet resolution summary row', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
    PURELYMAIL_DOMAIN: 'company.id',
  };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
  }

  it('summarises resolved vs unresolved days from the payroll run', async () => {
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
      DELETE FROM attendance WHERE employee_id = 'emp-005';
      DELETE FROM payroll_exceptions WHERE payroll_run_id = 'prun-sum';
      DELETE FROM payroll_runs WHERE id = 'prun-sum';

      INSERT INTO payroll_runs (
        id, tenant_id, period_start, period_end, payment_date, title, status
      ) VALUES ('prun-sum', 'default', '2026-08-01', '2026-08-31', '2026-08-25', 'Aug 2026', 'calculated');

      INSERT INTO payroll_exceptions (
        id, tenant_id, payroll_run_id, employee_id, exception_type, severity,
        description, exception_date, resolved, resolution_code
      ) VALUES
        ('exc-sum-1', 'default', 'prun-sum', 'emp-005', 'missing_attendance', 'warning', 'x', '2026-08-03', 1, 'approved_leave'),
        ('exc-sum-2', 'default', 'prun-sum', 'emp-005', 'missing_attendance', 'warning', 'x', '2026-08-04', 1, 'approved_leave'),
        ('exc-sum-3', 'default', 'prun-sum', 'emp-005', 'missing_attendance', 'warning', 'x', '2026-08-05', 1, 'alpha'),
        ('exc-sum-4', 'default', 'prun-sum', 'emp-005', 'missing_attendance', 'warning', 'x', '2026-08-06', 0, NULL);
    `);

    const res = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-005&month=2026-08&include_salary=false',
      {},
      adminToken
    );
    assert.equal(res.status, 200);

    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const aoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Attendance'], { header: 1 });

    const summaryRow = aoa.findIndex((row) => String(row[0] || '') === 'Resolved by Payroll');
    assert.ok(summaryRow >= 0, 'resolution summary row is present');

    const cells = aoa[summaryRow + 1].filter(Boolean).map(String);
    assert.ok(cells.includes('Resolved (3)'), `resolved count present, got ${JSON.stringify(cells)}`);
    assert.ok(cells.includes('Unresolved (1)'), 'unresolved count present');
    assert.ok(cells.includes('Approved leave (2)'), 'per-reason breakdown present');
    assert.ok(cells.includes('Alpha (deducted) (1)'), 'alpha count present');
  });

  it('lists resolved days as rows in the detail table, without inventing a punch', async () => {
    const { signJwt } = await import('../src/middleware/auth');
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
      DELETE FROM attendance WHERE employee_id = 'emp-005';
      -- one real punch
      INSERT INTO attendance (id, tenant_id, employee_id, date, status, clock_in_time, clock_out_time, source)
      VALUES ('att-det-1', 'default', 'emp-005', '2026-08-03', 'present', '08:30:00', '17:30:00', 'mobile');
    `);

    const res = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-005&month=2026-08&include_salary=false',
      {},
      adminToken
    );
    assert.equal(res.status, 200);

    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const aoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Attendance'], { header: 1 });

    const headerIndex = aoa.findIndex((row) => row[0] === 'No' && row[1] === 'Date');
    const rowsByDate = new Map<string, any[]>();
    for (const row of aoa.slice(headerIndex + 1)) {
      if (!row[1]) continue;
      rowsByDate.set(String(row[1]), row);
    }

    // Real punch is present with its clock times.
    const punched = rowsByDate.get('3-Aug-26');
    assert.ok(punched, 'punched day is listed');
    assert.equal(punched[2], 'On Time');
    assert.equal(punched[3], '08:30:00');

    // Resolved-but-unpunched day is now listed too, without fabricating a clock-in.
    const attestedLeave = rowsByDate.get('4-Aug-26');
    assert.ok(attestedLeave, 'resolved day appears as a detail row');
    assert.equal(attestedLeave[2], 'Approved leave');
    assert.equal(attestedLeave[3], '-', 'no clock-in is invented for an attested day');
    assert.equal(attestedLeave[4], '-');
    assert.equal(attestedLeave[7], 'payroll resolution');

    const attestedAlpha = rowsByDate.get('5-Aug-26');
    assert.ok(attestedAlpha, 'alpha-resolved day appears too');
    assert.equal(attestedAlpha[2], 'Alpha (deducted)');
    assert.equal(attestedAlpha[3], '-');

    // Days with no resolution and no punch are still absent from the log.
    assert.ok(!rowsByDate.has('6-Aug-26'), 'unresolved missing day has no log row');
  });
});


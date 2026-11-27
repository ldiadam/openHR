import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';
import { DEFAULT_CLAIM_SHEET_TEMPLATE, DEFAULT_LEAVE_FORM_TEMPLATE } from '../shared/formTemplates';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Dynamic Form & Export Templates', () => {
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
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
  }

  it('allows admin to customize Claim Sheet builder template and exports with custom layout', async () => {
    const adminToken = await signJwt(
      { userId: 'usr-001', email: 'budi@nusantara.id', role: 'owner_admin', tenantId: 'default', name: 'Budi' },
      JWT_SECRET
    );
    const empToken = await signJwt(
      { userId: 'usr-004', email: 'agus@nusantara.id', role: 'employee', employeeId: 'emp-004', tenantId: 'default', name: 'Agus Setiawan' },
      JWT_SECRET
    );

    // Non-admin cannot update templates
    const forbiddenRes = await request(
      '/api/templates/claim_sheet',
      { method: 'PUT', body: JSON.stringify({ config: DEFAULT_CLAIM_SHEET_TEMPLATE }) },
      empToken
    );
    assert.equal(forbiddenRes.status, 403);

    // Admin saves a customized builder layout
    const customConfig = {
      ...DEFAULT_CLAIM_SHEET_TEMPLATE,
      sheetName: 'CustomClaims',
      titlePattern: '{{company_name}} CUSTOM {{month_name}} {{year}}',
      currencyLabel: 'Currency : SGD',
      currencySymbol: 'S$',
      totalSumLabel: 'Subtotal',
      grandTotalLabel: 'Net Total',
      includeAttendanceSheet: false,
      columns: [
        { id: 'col_no', header: '#', type: 'seq', visible: true, width: 5, align: 'center' },
        { id: 'col_date', header: 'TANGGAL', type: 'date', visible: true, width: 14, align: 'left' },
        { id: 'col_desc', header: 'URAIAN', type: 'description', visible: true, width: 32, align: 'left' },
        { id: 'col_med', header: 'Medical', type: 'category_bucket', visible: true, width: 15, align: 'left', keywords: ['medical', 'obat', 'clinic'] },
        { id: 'col_total', header: 'AMOUNT', type: 'row_total', visible: true, width: 16, align: 'left' },
      ],
      signatures: [
        { id: 's1', label: 'SUBMITTED BY', source: 'applicant' },
        { id: 's2', label: 'FINANCE VERIFIER', source: 'custom', customName: 'Finance Dept' },
      ],
    };

    const saveRes = await request(
      '/api/templates/claim_sheet',
      { method: 'PUT', body: JSON.stringify({ config: customConfig }) },
      adminToken
    );
    assert.equal(saveRes.status, 200);

    // Create & approve a Medical claim for emp-004
    const claimRes = await request(
      '/api/kasbon/reimbursements',
      {
        method: 'POST',
        body: JSON.stringify({
          expense_date: '2026-09-10',
          category: 'Medical Clinic',
          amount: 450000,
          description: 'Clinic consultation',
        }),
      },
      empToken
    );
    assert.equal(claimRes.status, 200);
    const { reimbursementId } = (await claimRes.json()) as any;
    await request(
      `/api/kasbon/reimbursements/${reimbursementId}/review`,
      { method: 'POST', body: JSON.stringify({ status: 'approved' }) },
      adminToken
    );

    // Export Excel and verify dynamic structure
    const exportRes = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-004&month=2026-09&include_salary=false',
      {},
      adminToken
    );
    assert.equal(exportRes.status, 200);
    const wb = XLSX.read(new Uint8Array(await exportRes.arrayBuffer()), { type: 'array' });
    assert.deepEqual(wb.SheetNames, ['CustomClaims']);

    const aoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['CustomClaims'], { header: 1 });
    assert.ok(String(aoa[0][0]).includes('CUSTOM September 2026'));
    assert.deepEqual(aoa[2], ['#', 'TANGGAL', 'URAIAN', 'Medical', 'AMOUNT']);
    assert.equal(aoa[3][2], 'Clinic consultation');
    assert.equal(aoa[3][3], 450000);
    assert.equal(aoa[3][4], 450000);
    assert.ok(aoa.some((row) => String(row[1] || '').includes('FINANCE VERIFIER:     Finance Dept')));
  });

  it('supports uploading custom .xlsx template with placeholders and cloning {{#claims}} rows', async () => {
    const adminToken = await signJwt(
      { userId: 'usr-001', email: 'budi@nusantara.id', role: 'owner_admin', tenantId: 'default', name: 'Budi' },
      JWT_SECRET
    );
    const empToken = await signJwt(
      { userId: 'usr-005', email: 'rina@nusantara.id', role: 'employee', employeeId: 'emp-005', tenantId: 'default', name: 'Rina Wijaya' },
      JWT_SECRET
    );

    // Build a custom .xlsx workbook in memory
    const tplWb = XLSX.utils.book_new();
    const tplWs = XLSX.utils.aoa_to_sheet([
      ['{{company_name}} - {{period_label}}'],
      ['Staff: {{employee_name}} ({{employee_nik}})'],
      ['No', 'Description', 'Amount'],
      ['{{#claims}}{{no}}', '{{description}}', '{{amount}}'],
      ['', 'GRAND TOTAL', '{{grand_total}}'],
      ['Prepared: {{prepared_by}}', '', 'Approved: {{approved_by}}'],
    ]);
    XLSX.utils.book_append_sheet(tplWb, tplWs, 'MyTemplate');
    const tplBytes = XLSX.write(tplWb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    const b64 = Buffer.from(tplBytes).toString('base64');

    const upRes = await request(
      '/api/templates/claim_sheet/upload',
      {
        method: 'POST',
        body: JSON.stringify({ file_name: 'company-claim.xlsx', base64: b64 }),
      },
      adminToken
    );
    assert.equal(upRes.status, 200);
    const upData = (await upRes.json()) as any;
    assert.equal(upData.mode, 'custom_xlsx');
    assert.ok(upData.placeholders.includes('{{employee_name}}'));
    assert.ok(upData.placeholders.includes('{{#claims}}'));

    // Create 2 approved claims for emp-005
    for (const [desc, amt] of [
      ['Grab Ride A', 50000],
      ['Grab Ride B', 75000],
    ] as const) {
      const cRes = await request(
        '/api/kasbon/reimbursements',
        {
          method: 'POST',
          body: JSON.stringify({ expense_date: '2026-10-05', category: 'Transport', amount: amt, description: desc }),
        },
        empToken
      );
      const { reimbursementId } = (await cRes.json()) as any;
      await request(
        `/api/kasbon/reimbursements/${reimbursementId}/review`,
        { method: 'POST', body: JSON.stringify({ status: 'approved' }) },
        adminToken
      );
    }

    const expRes = await request(
      '/api/kasbon/claims/export-excel?employee_id=emp-005&month=2026-10&include_salary=false',
      {},
      adminToken
    );
    assert.equal(expRes.status, 200);
    const outWb = XLSX.read(new Uint8Array(await expRes.arrayBuffer()), { type: 'array' });
    assert.ok(outWb.SheetNames.includes('MyTemplate'));
    const aoa: any[][] = XLSX.utils.sheet_to_json(outWb.Sheets['MyTemplate'], { header: 1 });
    assert.equal(aoa[1][0], 'Staff: Rina Wijaya (EMP005)');
    assert.equal(aoa[3][1], 'Grab Ride A');
    assert.equal(aoa[3][2], 50000);
    assert.equal(aoa[4][1], 'Grab Ride B');
    assert.equal(aoa[4][2], 75000);
    assert.equal(aoa[5][1], 'GRAND TOTAL');
    assert.equal(aoa[5][2], 125000);
    assert.equal(aoa[6][0], 'Prepared: Rina Wijaya');

    // Reset back to default
    const resetRes = await request('/api/templates/claim_sheet/reset', { method: 'POST' }, adminToken);
    assert.equal(resetRes.status, 200);
  });

  it('allows admin to customize Leave Form template, checklist flags, and policy notes', async () => {
    const adminToken = await signJwt(
      { userId: 'usr-001', email: 'budi@nusantara.id', role: 'owner_admin', tenantId: 'default', name: 'Budi' },
      JWT_SECRET
    );

    const customLeave = {
      ...DEFAULT_LEAVE_FORM_TEMPLATE,
      formTitle: 'FORMULIR PENGAJUAN CUTI RESMI',
      paperSize: 'letter' as const,
      departmentDisplay: 'text' as const,
      adminClashFlags: ['Bentrok Jadwal Tim', 'Kuota Habis', 'Other reason'],
      deptHeadFlags: ['Kekurangan Personel'],
      policyNotes: ['Wajib disetujui minimal H-3.', 'Lampirkan surat dokter bila sakit.'],
    };

    const saveRes = await request(
      '/api/templates/leave_form',
      { method: 'PUT', body: JSON.stringify({ config: customLeave }) },
      adminToken
    );
    assert.equal(saveRes.status, 200);

    const cfgRes = await request('/api/leave/form/config', {}, adminToken);
    assert.equal(cfgRes.status, 200);
    const cfg = (await cfgRes.json()) as any;
    assert.equal(cfg.formTitle, 'FORMULIR PENGAJUAN CUTI RESMI');
    assert.deepEqual(cfg.adminClashFlags, ['Bentrok Jadwal Tim', 'Kuota Habis', 'Other reason']);
    assert.deepEqual(cfg.deptHeadFlags, ['Kekurangan Personel']);
    assert.equal(cfg.formTemplate.departmentDisplay, 'text');
    assert.deepEqual(cfg.formTemplate.policyNotes, ['Wajib disetujui minimal H-3.', 'Lampirkan surat dokter bila sakit.']);

    const resetRes = await request('/api/templates/leave_form/reset', { method: 'POST' }, adminToken);
    assert.equal(resetRes.status, 200);
  });
});

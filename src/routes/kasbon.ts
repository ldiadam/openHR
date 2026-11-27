import { Hono } from 'hono';
import * as fflate from 'fflate';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { putFile, getFile } from '../services/storage';

import {
  BuildClaimSheetOptions,
  buildClaimSheetWorkbook,
  buildSalaryRemarks,
  formatClaimDate,
  listMonthKeysBetween,
  resolveDirectorName,
  writeClaimWorkbookBuffer,
} from '../services/claim-excel';
import { loadClaimSheetTemplate } from '../services/form-templates';
export const kasbonRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

kasbonRoutes.use('*', authMiddleware);

// A claim period runs from the 25th of the previous month to the 25th of the selected month.
export function getClaimPeriodRange(month: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) {
    return { start: `${month}-01`, end: `${month}-31` };
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const prev = new Date(year, monthNumber - 2, 25);
  const start = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-25`;
  return { start, end: `${month}-25` };
}

// 1. Request Kasbon (Employee Advance)
kasbonRoutes.post('/requests', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { amount, reason, total_instalments } = body;

  const employeeId = body.employee_id || user.employeeId;
  const numAmount = parseFloat(amount);
  const instalments = parseInt(total_instalments || '1', 10);

  if (!employeeId || !numAmount || numAmount <= 0 || !reason) {
    return c.json({ error: 'Jumlah kasbon dan alasan wajib diisi' }, 400);
  }

  const id = `ksb-${Date.now()}`;
  const instalmentAmount = Math.round(numAmount / instalments);

  await c.env.DB.prepare(
    `INSERT INTO kasbon (
      id, tenant_id, employee_id, amount, reason, total_instalments, remaining_amount, instalment_amount, status
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, ?, ?, 'pending'
    )`
  )
    .bind(id, employeeId, numAmount, reason, instalments, numAmount, instalmentAmount)
    .run();

  return c.json({ message: 'Pengajuan kasbon berhasil dikirim.', kasbonId: id });
});

kasbonRoutes.get('/requests', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT k.*, e.nik, e.full_name, e.job_title, d.name as department_name
    FROM kasbon k
    JOIN employees e ON k.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
  `;
  const params: any[] = [];

  if (user.role === 'employee') {
    query += ` WHERE k.employee_id = ?`;
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    query += ` WHERE e.manager_id = ? OR e.id = ?`;
    params.push(user.employeeId, user.employeeId);
  }

  query += ` ORDER BY k.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  return c.json({ kasbonList: rows.results || [] });
});

kasbonRoutes.post('/requests/:id/review', requireRole(['owner_admin', 'finance']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const { status, note } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE kasbon SET
      status = ?,
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?
     WHERE id = ?`
  )
    .bind(status, user.userId, note || null, id)
    .run();

  return c.json({ message: `Kasbon berhasil di-${status}.` });
});

// 2. Reimbursements & Claims
kasbonRoutes.post('/reimbursements', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const {
    category,
    amount,
    description,
    receipt_photo_base64,
    payment_method,
    expense_date,
    cost_centre,
    project_ref,
    remarks,
  } = body;

  const employeeId = body.employee_id || user.employeeId;
  const numAmount = parseFloat(amount);

  if (!employeeId || !category || !numAmount || numAmount <= 0 || !description) {
    return c.json({ error: 'Kategori, jumlah, dan deskripsi klaim reimbursement wajib diisi' }, 400);
  }

  let photoKey = null;
  if (receipt_photo_base64) {
    photoKey = `receipts/${employeeId}/${Date.now()}.jpg`;
    let fileData: any = receipt_photo_base64;
    let contentType = 'image/jpeg';
    if (typeof receipt_photo_base64 === 'string' && receipt_photo_base64.startsWith('data:')) {
      const parts = receipt_photo_base64.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) contentType = match[1];
      const binaryStr = atob(parts[1]);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      fileData = bytes;
    }
    await putFile(c.env, {
      key: photoKey,
      data: fileData,
      contentType,
    });
  }

  const id = `reimb-${Date.now()}`;
  const validExpenseDate = expense_date || new Date().toISOString().split('T')[0];

  await c.env.DB.prepare(
    `INSERT INTO reimbursements (
      id, tenant_id, employee_id, category, amount, description,
      receipt_photo_key, payment_method, status,
      expense_date, cost_centre, project_ref, remarks
    ) VALUES (
      ?, 'default', ?, ?, ?, ?,
      ?, ?, 'pending',
      ?, ?, ?, ?
    )`
  )
    .bind(
      id,
      employeeId,
      category,
      numAmount,
      description,
      photoKey,
      payment_method || 'payroll',
      validExpenseDate,
      cost_centre || null,
      project_ref || null,
      remarks || null
    )
    .run();

  return c.json({ message: 'Klaim reimbursement berhasil dikirim.', reimbursementId: id });
});

kasbonRoutes.get('/reimbursements', async (c) => {
  const user = c.get('user');
  const month = c.req.query('month');
  const statusFilter = c.req.query('status');

  let query = `
    SELECT r.*, e.nik, e.full_name, e.job_title, d.name as department_name,
           c.name as company_name, app.full_name as approver_name,
           pr.title as payroll_run_title, pr.status as payroll_run_status,
           pr.payment_date as payroll_payment_date
    FROM reimbursements r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN companies c ON e.company_id = c.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN users u_app ON r.approved_by = u_app.id
    LEFT JOIN employees app ON u_app.employee_id = app.id
    LEFT JOIN payroll_runs pr ON r.payroll_run_id = pr.id
  `;
  const params: any[] = [];
  const whereClauses: string[] = [];

  const onlyMine = c.req.query('scope') === 'mine';
  if (user.role === 'employee' || onlyMine) {
    whereClauses.push('r.employee_id = ?');
    params.push(user.employeeId);
  } else if (user.role === 'manager') {
    whereClauses.push('(e.manager_id = ? OR e.id = ?)');
    params.push(user.employeeId, user.employeeId);
  } else if (c.req.query('employee_id')) {
    whereClauses.push('r.employee_id = ?');
    params.push(c.req.query('employee_id'));
  }

  if (statusFilter && statusFilter !== 'all') {
    whereClauses.push('r.status = ?');
    params.push(statusFilter);
  }

  if (month) {
    const range = getClaimPeriodRange(month);
    whereClauses.push('(COALESCE(r.expense_date, substr(r.created_at, 1, 10)) BETWEEN ? AND ?)');
    params.push(range.start, range.end);
  }

  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  query += ` ORDER BY COALESCE(r.expense_date, r.created_at) DESC, r.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  const results = (rows.results || []).map((r: any) => ({
    ...r,
    has_receipt: Boolean(r.receipt_photo_key),
    receipt_url: r.receipt_photo_key ? `/api/kasbon/reimbursements/${r.id}/receipt` : null,
  }));

  return c.json({ reimbursements: results });
});

// 2b. View / Download Receipt Photo
kasbonRoutes.get('/reimbursements/:id/receipt', async (c) => {
  const id = c.req.param('id');
  const reimb = await c.env.DB.prepare('SELECT * FROM reimbursements WHERE id = ?').bind(id).first<any>();
  if (!reimb || !reimb.receipt_photo_key) {
    return c.json({ error: 'Receipt not found' }, 404);
  }

  const file = await getFile(c.env, reimb.receipt_photo_key);
  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  c.header('Content-Type', file.contentType || 'image/jpeg');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(file.data as any);
});

// 2c. Review Reimbursement
kasbonRoutes.post('/reimbursements/:id/review', requireRole(['owner_admin', 'finance', 'manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const { status, note } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE reimbursements SET
      status = ?,
      approved_by = ?,
      approved_at = CURRENT_TIMESTAMP,
      rejection_note = ?
     WHERE id = ?`
  )
    .bind(status, user.userId, note || null, id)
    .run();

  return c.json({ message: `Reimbursement berhasil di-${status}.` });
});

// Helper to export all active employees into a single ZIP file containing 1 Excel per employee
async function exportAllEmployeesZip(
  c: any,
  month: string,
  includeSalary: boolean,
  approverName: string = '',
  salaryOnly: boolean = false
) {
  const comp: any = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first();
  const defaultCompanyName = comp?.name || 'openHR';
  const range = getClaimPeriodRange(month);
  const claimTpl = await loadClaimSheetTemplate(c.env, { withBytes: true });

  const employeesRes: any = await c.env.DB.prepare(
    `SELECT e.*, d.name as department_name, c.name as comp_name, mgr.full_name as manager_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN companies c ON e.company_id = c.id
     LEFT JOIN employees mgr ON e.manager_id = mgr.id
     WHERE ${
       salaryOnly
         ? `EXISTS (
              SELECT 1 FROM payroll_items pi
              JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
              WHERE pi.employee_id = e.id AND pr.period_end LIKE ?
            )`
         : `(e.lifecycle_status IN ('active', 'probation', 'on_leave')
            OR EXISTS (
              SELECT 1 FROM payroll_items pi
              JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
              WHERE pi.employee_id = e.id AND pr.period_end LIKE ?
            ))`
     }
     ORDER BY e.nik ASC`
  )
    .bind(`${month}%`)
    .all();
  const employees = employeesRes.results || [];

  // Full org map (including resigned/inactive) so the chain still reaches the Director
  const orgRes: any = await c.env.DB.prepare(
    `SELECT e.id, e.full_name, e.job_title, e.manager_id, e.lifecycle_status, u.role as role
     FROM employees e
     LEFT JOIN users u ON u.employee_id = e.id`
  ).all();
  const orgEmployees = orgRes.results || [];

  const claimsRes: any = await c.env.DB.prepare(
    `SELECT r.*, e.id as emp_id, e.nik, e.full_name as employee_name,
            c.name as company_name, mgr.full_name as manager_name,
            approver.full_name as approver_name
     FROM reimbursements r
     JOIN employees e ON r.employee_id = e.id
     LEFT JOIN companies c ON e.company_id = c.id
     LEFT JOIN employees mgr ON e.manager_id = mgr.id
     LEFT JOIN users u_app ON r.approved_by = u_app.id
     LEFT JOIN employees approver ON u_app.employee_id = approver.id
     WHERE r.status = 'approved'
       AND COALESCE(r.expense_date, substr(r.created_at, 1, 10)) BETWEEN ? AND ?
     ORDER BY COALESCE(r.expense_date, r.created_at) ASC`
  ).bind(range.start, range.end).all();
  const allClaims = claimsRes.results || [];

  const payrollRes: any = await c.env.DB.prepare(
    `SELECT pi.employee_id, pi.take_home_pay, pi.base_salary, pi.reimbursement_amount,
            pi.prorated_salary, pi.days_worked, pi.expected_working_days, pr.payment_date
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     WHERE pr.period_end LIKE ?`
  ).bind(`${month}%`).all();
  const payrollMap = new Map<string, any>();
  (payrollRes.results || []).forEach((p: any) => {
    payrollMap.set(p.employee_id, p);
  });

  // Attendance for the whole period, grouped per employee, so each workbook can
  // carry the records that back the claim.
  const attendanceRes: any = await c.env.DB.prepare(
    `SELECT employee_id, date, status, clock_in_time, clock_out_time, late_minutes,
            clock_in_status, clock_in_geofence_reason, source
     FROM attendance
     WHERE date BETWEEN ? AND ?
     ORDER BY date ASC`
  ).bind(range.start, range.end).all();
  const attendanceByEmployee = new Map<string, any[]>();
  for (const row of attendanceRes.results || []) {
    const list = attendanceByEmployee.get(row.employee_id) || [];
    list.push(row);
    attendanceByEmployee.set(row.employee_id, list);
  }

  // Payroll attendance exceptions for the same period: HR's resolution decides
  // whether a day without a log is Absent or, say, approved leave.
  const exceptionRes: any = await c.env.DB.prepare(
    `SELECT employee_id, exception_date, resolved, resolution_code
     FROM payroll_exceptions
     WHERE exception_date BETWEEN ? AND ?`
  ).bind(range.start, range.end).all();
  const exceptionsByEmployee = new Map<string, any[]>();
  for (const row of exceptionRes.results || []) {
    const list = exceptionsByEmployee.get(row.employee_id) || [];
    list.push(row);
    exceptionsByEmployee.set(row.employee_id, list);
  }

  const zipFiles: Record<string, Uint8Array> = {};

  for (const emp of employees) {
    const empClaims = allClaims.filter((cl: any) => cl.employee_id === emp.id || cl.emp_id === emp.id);

    let salAmt = 0;
    let salDate = `${month}-25`;
    let salRemarksItem: any = null;
    const prItem = payrollMap.get(emp.id);
    if (prItem) {
      // Exclude the reimbursements already itemised as claim rows on the same sheet
      salAmt = Number(prItem.take_home_pay || prItem.base_salary || 0) - Number(prItem.reimbursement_amount || 0);
      if (salAmt < 0) salAmt = 0;
      if (prItem.payment_date) salDate = prItem.payment_date;
      salRemarksItem = prItem;
    } else {
      salAmt = Number(emp.base_salary || 0) + Number(emp.fixed_allowances || 0);
    }

    if (!includeSalary && empClaims.length === 0) continue;
    if (salAmt === 0 && empClaims.length === 0) continue;

    const directorName = resolveDirectorName(orgEmployees, emp.id);
    const empApprover = approverName || directorName || empClaims[0]?.approver_name || '';
    const empCheckedBy =
      emp.manager_name && emp.manager_name !== empApprover ? emp.manager_name : '';
    const wb = buildClaimSheetWorkbook({
      companyName: emp.comp_name || defaultCompanyName,
      month,
      employeeName: emp.full_name,
      employeeNik: emp.nik,
      employeeJobTitle: emp.job_title,
      employeeDepartment: emp.department_name,
      checkedByName: empCheckedBy,
      approverName: empApprover,
      claims: empClaims,
      includeSalary,
      salaryAmount: salAmt,
      salaryDate: salDate,
      salaryRemarks: buildSalaryRemarks(emp.job_title, salRemarksItem),
      templateConfig: claimTpl.config,
      customTemplateBytes: claimTpl.customTemplateBytes,
      attendance: attendanceByEmployee.get(emp.id) || [],
      attendancePeriod: range,
      attendanceExceptions: exceptionsByEmployee.get(emp.id) || [],
    });

    const buf = writeClaimWorkbookBuffer(wb);
    const cleanName = (emp.full_name || 'Staff').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeNik = (emp.nik || 'EMP').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `Claim_Expenses_${safeNik}_${cleanName}_${month}.xlsx`;

    zipFiles[filename] = new Uint8Array(buf);
  }

  const zipped = fflate.zipSync(zipFiles);
  const zipFilename = `Claim_Expenses_All_Employees_${month}.zip`;

  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="${zipFilename}"`);
  return c.body(zipped as any);
}

// 3. Generate Official Claim Excel Sheet (Matching Standard Expenses Template)
kasbonRoutes.get('/claims/export-excel', async (c) => {
  const user = c.get('user');
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  let employeeId = user.role === 'employee' ? user.employeeId : (c.req.query('employee_id') || null);
  const statusFilter = c.req.query('status') || 'approved';
  const includeSalaryParam = c.req.query('include_salary');

  const includeSalary = includeSalaryParam !== undefined
    ? (includeSalaryParam === 'true' || includeSalaryParam === '1')
    : (user.role !== 'employee');

  const approverParam = c.req.query('approver_name') || '';

  // If Admin requests without employee_id and format=zip is requested:
  if (!employeeId && (c.req.query('format') === 'zip' || c.req.query('zip') === 'true')) {
    return exportAllEmployeesZip(c, month, includeSalary, approverParam);
  }

  const comp = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
  const defaultCompanyName = comp?.name || 'openHR';

  let employeeInfo: any = null;
  if (employeeId) {
    employeeInfo = await c.env.DB.prepare(
      `SELECT e.*, d.name as department_name, c.name as comp_name, mgr.full_name as manager_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN companies c ON e.company_id = c.id
       LEFT JOIN employees mgr ON e.manager_id = mgr.id
       WHERE e.id = ?`
    ).bind(employeeId).first<any>();
  }

  let query = `
    SELECT r.*, e.full_name as employee_name, e.nik, c.name as company_name,
           mgr.full_name as manager_name, approver.full_name as approver_name
    FROM reimbursements r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN companies c ON e.company_id = c.id
    LEFT JOIN employees mgr ON e.manager_id = mgr.id
    LEFT JOIN users u_app ON r.approved_by = u_app.id
    LEFT JOIN employees approver ON u_app.employee_id = approver.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (statusFilter !== 'all') {
    query += ` AND r.status = ?`;
    params.push(statusFilter);
  }
  if (employeeId) {
    query += ` AND r.employee_id = ?`;
    params.push(employeeId);
  }
  if (month) {
    const range = getClaimPeriodRange(month);
    query += ` AND COALESCE(r.expense_date, substr(r.created_at, 1, 10)) BETWEEN ? AND ?`;
    params.push(range.start, range.end);
  }

  query += ` ORDER BY COALESCE(r.expense_date, r.created_at) ASC, r.created_at ASC`;
  const res = await c.env.DB.prepare(query).bind(...params).all<any>();
  const claims = res.results || [];

  let salaryAmount = 0;
  let salaryDate = `${month}-25`;
  let salaryRemarks = employeeInfo?.job_title || 'Developing App, Managing Fajri';

  if (includeSalary && employeeId) {
    const prItem = await c.env.DB.prepare(
      `SELECT pi.take_home_pay, pi.base_salary, pi.reimbursement_amount,
              pi.prorated_salary, pi.days_worked, pi.expected_working_days, pr.payment_date
       FROM payroll_items pi
       JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
       WHERE pi.employee_id = ? AND pr.period_end LIKE ?
       LIMIT 1`
    ).bind(employeeId, `${month}%`).first<any>();

    if (prItem) {
      // take_home_pay already includes the reimbursements that are listed as claim
      // rows on this same sheet, so adding both would double-count. The UNPAID row
      // is the salary portion only.
      salaryAmount = Number(prItem.take_home_pay || prItem.base_salary || 0) - Number(prItem.reimbursement_amount || 0);
      if (salaryAmount < 0) salaryAmount = 0;
      if (prItem.payment_date) salaryDate = prItem.payment_date;
      salaryRemarks = buildSalaryRemarks(employeeInfo?.job_title, prItem);
    } else if (employeeInfo) {
      salaryAmount = Number(employeeInfo.base_salary || 0) + Number(employeeInfo.fixed_allowances || 0);
    }
  }

  const employeeName = employeeInfo?.full_name || claims[0]?.employee_name || user.name || 'Adam';
  const orgRes: any = await c.env.DB.prepare(
    `SELECT e.id, e.full_name, e.job_title, e.manager_id, e.lifecycle_status, u.role as role
     FROM employees e
     LEFT JOIN users u ON u.employee_id = e.id`
  ).all();
  const orgEmployees = orgRes.results || [];
  const directorName = resolveDirectorName(orgEmployees, employeeId || claims[0]?.employee_id);
  const approverName = approverParam || directorName || claims[0]?.approver_name || '';
  const rawCheckedBy = employeeInfo?.manager_name || claims[0]?.manager_name || '';
  const checkedByName = rawCheckedBy && rawCheckedBy !== approverName ? rawCheckedBy : '';
  const companyName = employeeInfo?.comp_name || claims[0]?.company_name || defaultCompanyName;

  // Attendance backing this claim period (single-employee export).
  const claimRange = getClaimPeriodRange(month);
  let attendance: any[] = [];
  let attendanceExceptions: any[] = [];
  const attendanceEmployeeId = employeeId || claims[0]?.employee_id;
  if (attendanceEmployeeId) {
    const attendanceRes: any = await c.env.DB.prepare(
      `SELECT date, status, clock_in_time, clock_out_time, late_minutes,
              clock_in_status, clock_in_geofence_reason, source
       FROM attendance
       WHERE employee_id = ? AND date BETWEEN ? AND ?
       ORDER BY date ASC`
    )
      .bind(attendanceEmployeeId, claimRange.start, claimRange.end)
      .all();
    attendance = attendanceRes.results || [];

    // HR's payroll resolution for the same window drives the calendar status.
    const exceptionRes: any = await c.env.DB.prepare(
      `SELECT exception_date, resolved, resolution_code
       FROM payroll_exceptions
       WHERE employee_id = ? AND exception_date BETWEEN ? AND ?`
    )
      .bind(attendanceEmployeeId, claimRange.start, claimRange.end)
      .all();
    attendanceExceptions = exceptionRes.results || [];
  }

  const claimTpl = await loadClaimSheetTemplate(c.env, { withBytes: true });
  const wb = buildClaimSheetWorkbook({
    companyName,
    month,
    employeeName,
    employeeNik: employeeInfo?.nik || claims[0]?.nik,
    employeeJobTitle: employeeInfo?.job_title,
    employeeDepartment: employeeInfo?.department_name,
    checkedByName,
    approverName,
    claims,
    includeSalary,
    salaryAmount,
    salaryDate,
    salaryRemarks,
    templateConfig: claimTpl.config,
    customTemplateBytes: claimTpl.customTemplateBytes,
    attendance,
    attendancePeriod: claimRange,
    attendanceExceptions,
  });

  const buf = writeClaimWorkbookBuffer(wb);
  const cleanName = employeeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFilename = `Claim_Expenses_${cleanName}_${month || 'All'}.xlsx`;

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
  return c.body(buf as any);
});

// 4. Export All Employees Claim Excels as a single ZIP (1 Excel per Employee)
kasbonRoutes.get('/claims/export-all-zip', requireRole(['owner_admin', 'finance', 'manager']), async (c) => {
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7);
  const includeSalary = c.req.query('include_salary') !== 'false' && c.req.query('include_salary') !== '0';
  const approverParam = c.req.query('approver_name') || '';
  const salaryOnly = c.req.query('salary_only') === 'true' || c.req.query('salary_only') === '1';
  return exportAllEmployeesZip(c, month, includeSalary, approverParam, salaryOnly);
});

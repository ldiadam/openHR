import { Hono } from 'hono';
import XLSX from 'xlsx-js-style';
import * as fflate from 'fflate';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { putFile, getFile } from '../services/storage';

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

export interface BuildClaimSheetOptions {
  companyName: string;
  month: string;
  employeeName: string;
  employeeNik?: string;
  employeeJobTitle?: string;
  checkedByName?: string;
  approverName?: string;
  claims: any[];
  includeSalary?: boolean;
  salaryAmount?: number;
  salaryDate?: string;
  salaryRemarks?: string;
  /** Attendance rows for the claim period; exported as a second sheet when present. */
  attendance?: Array<{
    date: string;
    status: string;
    clock_in_time?: string | null;
    clock_out_time?: string | null;
    late_minutes?: number | null;
    clock_in_status?: string | null;
    clock_in_geofence_reason?: string | null;
    source?: string | null;
  }>;
  /** Inclusive claim-period bounds, shown in the attendance sheet header. */
  attendancePeriod?: { start: string; end: string };
  /**
   * Payroll attendance exceptions for the same period, keyed by date.
   * HR's resolution decides how a day with no attendance log is presented:
   * an unresolved day is Absent, a day resolved as leave shows as On Leave, etc.
   */
  attendanceExceptions?: Array<{
    exception_date: string;
    resolved?: number | boolean | null;
    resolution_code?: string | null;
  }>;
}

/**
 * Salary-row remark: the employee's job title, plus a proration note when the
 * payroll item was prorated (joined/left mid-period or paid for fewer days).
 * Multiple remarks are separated with "; ".
 */
function buildSalaryRemarks(
  jobTitle: string | null | undefined,
  item: {
    prorated_salary?: number | null;
    base_salary?: number | null;
    days_worked?: number | null;
    expected_working_days?: number | null;
  } | null | undefined
): string {
  const remarks: string[] = [];
  const title = (jobTitle || '').trim();
  if (title) remarks.push(title);

  if (item) {
    const prorated = Number(item.prorated_salary || 0);
    const base = Number(item.base_salary || 0);
    const days = Number(item.days_worked || 0);
    const expected = Number(item.expected_working_days || 0);

    const isProrated = base > 0 && prorated > 0 && prorated < base;
    if (isProrated) {
      remarks.push(days > 0 && expected > 0 ? `Prorate ${days}/${expected} hari` : 'Prorate');
    }
  }

  return remarks.join('; ');
}

function resolveDirectorName(
  employees: Array<{
    id: string;
    full_name: string;
    job_title?: string | null;
    manager_id?: string | null;
    lifecycle_status?: string | null;
    role?: string | null;
  }>,
  employeeId?: string | null
): string | null {
  const byId = new Map(employees.map((e) => [e.id, e]));
  let topManager: any = null;
  let depth = 0;

  if (employeeId) {
    const visited = new Set<string>([employeeId]);
    let current = byId.get(employeeId);
    while (current?.manager_id) {
      if (visited.has(current.manager_id)) break;
      const manager = byId.get(current.manager_id);
      if (!manager) break;
      visited.add(manager.id);
      topManager = manager;
      current = manager;
      depth++;
    }
  }

  const isDirectorTitle = (title?: string | null) =>
    !!title && /\b(managing\s+)?(director|direktur|ceo)\b/i.test(title);

  // 1. Multi-level org chain (Employee -> Supervisor -> Director)
  if (depth >= 2 && topManager) {
    return topManager.full_name;
  }

  // 2. Direct manager explicitly has Director title
  if (topManager && isDirectorTitle(topManager.job_title)) {
    return topManager.full_name;
  }

  // 3. Dedicated Director account / employee by job title
  const companyDirector =
    employees.find((e) => (e.lifecycle_status === 'active' || !e.lifecycle_status) && isDirectorTitle(e.job_title)) ||
    employees.find((e) => isDirectorTitle(e.job_title));
  if (companyDirector) {
    return companyDirector.full_name;
  }

  // 4. Fallback to topManager if present, or active owner_admin employee
  if (topManager) {
    return topManager.full_name;
  }

  const ownerAdminEmp = employees.find((e) => e.role === 'owner_admin');
  return ownerAdminEmp?.full_name || null;
}

/** Month keys (YYYY-MM) touched by an inclusive date range. */
function listMonthKeysBetween(start: string, end: string): string[] {
  const s = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const e = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  const keys: string[] = [];
  const cursor = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cursor <= e) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export function formatClaimDate(dateStr?: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const year = match[1].slice(-2);
  const monthIdx = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[monthIdx] || match[2];
  return `${day}-${month}-${year}`;
}

export function buildClaimSheetWorkbook(options: BuildClaimSheetOptions) {
  const {
    companyName,
    month,
    employeeName,
    employeeNik,
    employeeJobTitle,
    checkedByName = '',
    approverName = '',
    claims = [],
    includeSalary = false,
    salaryAmount = 0,
    salaryDate,
    salaryRemarks,
    attendance = [],
    attendancePeriod,
    attendanceExceptions = [],
  } = options;

  let periodTitle = 'EXPENSES.';
  if (month && month.includes('-')) {
    const [y, m] = month.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const mIdx = parseInt(m, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      periodTitle = `${y} ${monthNames[mIdx]} EXPENSES.`;
    }
  } else {
    const now = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    periodTitle = `${now.getFullYear()} ${monthNames[now.getMonth()]} EXPENSES.`;
  }

  const titleHeader = `${companyName} ${periodTitle}`;

  const wb = XLSX.utils.book_new();
  const ws: any = {};

  const thinBorder = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };

  const yellowFill = { fgColor: { rgb: 'FFFF00' } };
  const blueFont = { name: 'Times New Roman', sz: 11, color: { rgb: '003366' } };
  const boldBlue = { name: 'Times New Roman', sz: 11, bold: true, color: { rgb: '003366' } };
  const headerFont = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '002060' } };
  const totalFont = { name: 'Times New Roman', sz: 11, bold: true, color: { rgb: '003366' } };
  const totalLabelFont = { name: 'Times New Roman', sz: 11, bold: false, color: { rgb: '003366' } };
  const claimsFont = { name: 'Times New Roman', sz: 11, bold: true, underline: true, color: { rgb: '003366' } };
  const titleFont = { name: 'Times New Roman', sz: 11, color: { rgb: '000000' } };
  const sigFont = { name: 'Times New Roman', sz: 11, color: { rgb: '000000' } };

  const setCell = (r: number, c: number, val: any, s: any, t?: string, z?: string, f?: string) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    ws[addr] = {
      v: val ?? '',
      t: t || (typeof val === 'number' ? 'n' : 's'),
      s: s || { border: thinBorder },
      ...(z ? { z } : {}),
      ...(f ? { f } : {}),
    };
  };

  let sumTransport = 0;
  let sumFood = 0;
  let sumHotel = 0;
  let sumUnpaid = 0;
  let sumTotal = 0;
  let sumOthers = 0;

  const numFmt = '_-[$Rp-3809]* #,##0_-;\\-[$Rp-3809]* #,##0_-;_-[$Rp-3809]* "-"??_-;_-@_-';

  // Row 0: Company & Title | Currency : IDR
  for (let c = 0; c <= 11; c++) setCell(0, c, '', { border: thinBorder });
  setCell(0, 0, titleHeader, { font: titleFont, border: thinBorder, alignment: { vertical: 'center' } });
  setCell(0, 4, 'Currency : IDR', { font: boldBlue, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });
  setCell(0, 5, 'Currency : IDR', { font: boldBlue, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });

  // Row 1: CLAIMS (Column B)
  for (let c = 0; c <= 11; c++) setCell(1, c, '', { border: thinBorder });
  setCell(1, 1, 'CLAIMS', { font: claimsFont, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });

  // Row 2: Headers (Yellow Fill)
  const headers = ['No', 'DATE', 'DESCRIPTION', 'Transport', 'Food', 'Hotel', 'UNPAID', 'TOTAL', 'OTHERS ', 'COST CENTRE', 'PROJECT REF', 'REMARKS'];
  headers.forEach((h, c) => {
    setCell(2, c, h, {
      fill: yellowFill,
      font: headerFont,
      border: thinBorder,
      alignment: { horizontal: c <= 1 ? 'center' : 'left', vertical: 'center' },
    });
  });

  // Data rows start at index 3 (Row 4 in Excel)
  let currRow = 3;
  let claimSeq = 1;
  const firstDataRowNumber = 4; // Excel 1-indexed

  claims.forEach((cl: any) => {
    const amt = Number(cl.amount) || 0;
    const cat = (cl.category || '').toLowerCase();
    let tr = 0;
    let fd = 0;
    let ht = 0;
    let up = 0;
    let ot = 0;

    if (cat.includes('transport') || cat.includes('bensin') || cat.includes('tiket') || cat.includes('ferry') || cat.includes('travel')) {
      tr = amt;
      sumTransport += amt;
    } else if (cat.includes('food') || cat.includes('makan') || cat.includes('meal') || cat.includes('konsumsi')) {
      fd = amt;
      sumFood += amt;
    } else if (cat.includes('hotel') || cat.includes('lodging') || cat.includes('penginapan')) {
      ht = amt;
      sumHotel += amt;
    } else if (cat.includes('unpaid') || cat.includes('salary') || cat.includes('gaji')) {
      up = amt;
      sumUnpaid += amt;
    } else {
      ot = amt;
      sumOthers += amt;
    }
    sumTotal += amt;

    const rawDate = cl.expense_date ? cl.expense_date.slice(0, 10) : (cl.created_at ? cl.created_at.slice(0, 10) : '');
    const displayDate = formatClaimDate(rawDate);

    for (let c = 0; c <= 11; c++) setCell(currRow, c, '', { border: thinBorder });

    const excelRow = currRow + 1;
    const rowFormula = `D${excelRow}+E${excelRow}+F${excelRow}+G${excelRow}`;

    setCell(currRow, 0, claimSeq++, { font: blueFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } }, 'n');
    setCell(currRow, 1, displayDate, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 2, cl.description || '', { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 3, tr, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 4, fd, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 5, ht, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 6, up, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 7, amt, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, rowFormula);
    setCell(currRow, 8, ot ? ot : '', { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, ot ? 'n' : 's', ot ? numFmt : undefined);
    setCell(currRow, 9, cl.cost_centre || '', { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 10, cl.project_ref || '', { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 11, cl.remarks || '', { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });

    currRow++;
  });

  // Salary row (claimed by Admin under UNPAID for this employee)
  if (includeSalary && salaryAmount && salaryAmount > 0) {
    const nowYm = new Date().toISOString().slice(0, 7);
    const sDate = salaryDate || (month ? `${month}-25` : `${nowYm}-25`);
    const displaySalaryDate = formatClaimDate(sDate);
    const sDesc = `Salary ${employeeName}`;
    const sRemarks = salaryRemarks || employeeJobTitle || 'Developing App, Managing Fajri';
    const sCostCentre = '';
    const sProjectRef = claims[0]?.project_ref || '';

    sumUnpaid += salaryAmount;
    sumTotal += salaryAmount;

    for (let c = 0; c <= 11; c++) setCell(currRow, c, '', { border: thinBorder });

    const excelRow = currRow + 1;
    const rowFormula = `D${excelRow}+E${excelRow}+F${excelRow}+G${excelRow}`;

    setCell(currRow, 0, claimSeq++, { font: blueFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } }, 'n');
    setCell(currRow, 1, displaySalaryDate, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 2, sDesc, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 3, 0, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 4, 0, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 5, 0, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 6, salaryAmount, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt);
    setCell(currRow, 7, salaryAmount, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, rowFormula);
    setCell(currRow, 8, '', { font: blueFont, border: thinBorder });
    setCell(currRow, 9, sCostCentre, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 10, sProjectRef, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });
    setCell(currRow, 11, sRemarks, { font: blueFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } });

    currRow++;
  }

  const lastDataRowNumber = currRow; // Excel 1-indexed

  // Empty separator row
  for (let c = 0; c <= 11; c++) {
    setCell(currRow, c, '', { border: thinBorder });
  }
  currRow++;

  const totalSumRow = currRow;
  const totalSumRowNumber = totalSumRow + 1; // Excel 1-indexed

  // Total Sum row (All yellow background)
  for (let c = 0; c <= 11; c++) {
    setCell(totalSumRow, c, '', { fill: yellowFill, border: thinBorder });
  }
  setCell(totalSumRow, 2, 'Total Sum', { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
  setCell(totalSumRow, 3, sumTransport, { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, `SUM(D${firstDataRowNumber}:D${lastDataRowNumber})`);
  setCell(totalSumRow, 4, sumFood, { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, `SUM(E${firstDataRowNumber}:E${lastDataRowNumber})`);
  setCell(totalSumRow, 5, sumHotel, { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, `SUM(F${firstDataRowNumber}:F${lastDataRowNumber})`);
  setCell(totalSumRow, 6, sumUnpaid, { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, `SUM(G${firstDataRowNumber}:G${lastDataRowNumber})`);
  setCell(totalSumRow, 7, sumTotal, { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, `SUM(H${firstDataRowNumber}:H${lastDataRowNumber})`);
  setCell(totalSumRow, 8, sumOthers ? sumOthers : '', { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, sumOthers ? 'n' : 's', sumOthers ? numFmt : undefined);
  currRow++;

  const grandTotalRow = currRow;

  // Grand total row (All yellow background)
  for (let c = 0; c <= 11; c++) {
    setCell(grandTotalRow, c, '', { fill: yellowFill, border: thinBorder });
  }
  setCell(grandTotalRow, 2, 'Grand total', { fill: yellowFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
  setCell(grandTotalRow, 3, 'Rp', { fill: yellowFill, font: totalFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } });
  setCell(grandTotalRow, 4, sumTotal, { fill: yellowFill, font: totalFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } }, 'n', '#,##0', `H${totalSumRowNumber}`);
  currRow++;

  // Signatures
  const preparedBy = employeeName || 'Adam';

  const sigRow0 = currRow;
  for (let c = 0; c <= 11; c++) setCell(sigRow0, c, '', {});
  setCell(sigRow0, 1, `PREPARED BY:   ${preparedBy}`, { font: sigFont, alignment: { horizontal: 'left', vertical: 'top' } });
  currRow++;

  const sigRow1 = currRow;
  for (let c = 0; c <= 11; c++) setCell(sigRow1, c, '', {});
  currRow++;

  const sigRow2 = currRow;
  for (let c = 0; c <= 11; c++) setCell(sigRow2, c, '', {});
  setCell(sigRow2, 1, checkedByName ? `CHECKED BY:     ${checkedByName}` : 'CHECKED BY:', { font: sigFont, alignment: { horizontal: 'left', vertical: 'top' } });
  currRow++;

  const sigRow3 = currRow;
  for (let c = 0; c <= 11; c++) setCell(sigRow3, c, '', {});
  currRow++;

  const sigRow4 = currRow;
  for (let c = 0; c <= 11; c++) setCell(sigRow4, c, '', {});
  setCell(sigRow4, 1, approverName ? `APPROVED BY: ${approverName}` : 'APPROVED BY:', { font: sigFont, alignment: { horizontal: 'left', vertical: 'top' } });
  currRow++;

  // Merges
  ws['!merges'] = [
    { s: { r: 1, c: 5 }, e: { r: 1, c: 7 } }, // F2:H2
    { s: { r: grandTotalRow, c: 4 }, e: { r: grandTotalRow, c: 8 } }, // E:I in Grand total row
    { s: { r: sigRow0, c: 1 }, e: { r: sigRow0, c: 2 } }, // B:C in PREPARED BY
    { s: { r: sigRow2, c: 1 }, e: { r: sigRow2, c: 2 } }, // B:C in CHECKED BY
    { s: { r: sigRow4, c: 1 }, e: { r: sigRow4, c: 2 } }, // B:C in APPROVED BY
  ];

  // Set bounds and column widths
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: currRow - 1, c: 11 } });

  ws['!cols'] = [
    { wch: 5 },   // No
    { wch: 13 },  // DATE
    { wch: 36 },  // DESCRIPTION
    { wch: 16 },  // Transport
    { wch: 16 },  // Food
    { wch: 16 },  // Hotel
    { wch: 15 },  // UNPAID
    { wch: 18 },  // TOTAL
    { wch: 16 },  // OTHERS
    { wch: 17 },  // COST CENTRE
    { wch: 16 },  // PROJECT REF
    { wch: 53 },  // REMARKS
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Claim_1');

  // Second sheet: attendance records backing the claim period, so the approver
  // can verify the days worked without leaving the workbook. A coloured calendar
  // grid sits above the detail table.
  if (attendance.length > 0 || attendancePeriod) {
    const aws: any = {};

    const STATUS_STYLES: Record<string, { fill: string; font: string; label: string }> = {
      present: { fill: 'C6EFCE', font: '006100', label: 'On Time' },
      late: { fill: 'FFEB9C', font: '9C6500', label: 'Late' },
      early_leave: { fill: 'E4DFEC', font: '5B2C87', label: 'Early Leave' },
      on_leave: { fill: 'DDEBF7', font: '1F4E79', label: 'On Leave' },
      sick: { fill: 'D9E1F2', font: '203864', label: 'Sick Leave' },
      absent: { fill: 'FFC7CE', font: '9C0006', label: 'Absent' },
      // Resolved by payroll without a punch: attested, not clocked.
      resolved: { fill: 'E2EFDA', font: '375623', label: 'Resolved' },
      holiday: { fill: 'EDEDED', font: '7F7F7F', label: 'Holiday' },
      day_off: { fill: 'F2F2F2', font: '808080', label: 'Day Off' },
    };

    const cellStyle = (status: string | null) => {
      const style = STATUS_STYLES[String(status || '').toLowerCase()];
      return {
        fill: { fgColor: { rgb: style?.fill || 'FFFFFF' } },
        font: { name: 'Calibri', sz: 9, bold: !!style, color: { rgb: style?.font || '808080' } },
        alignment: { horizontal: 'center', vertical: 'center' as const },
        border: thinBorder,
      };
    };

    aws[XLSX.utils.encode_cell({ r: 0, c: 0 })] = {
      v: `${companyName} - ATTENDANCE RECORDS`,
      t: 's',
      s: { font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: '002060' } } },
    };
    aws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

    if (attendancePeriod) {
      aws[XLSX.utils.encode_cell({ r: 1, c: 0 })] = {
        v: `Periode: ${attendancePeriod.start} s/d ${attendancePeriod.end}`,
        t: 's',
        s: { font: { name: 'Calibri', sz: 10, color: { rgb: '555555' } } },
      };
    }

    aws[XLSX.utils.encode_cell({ r: 2, c: 0 })] = {
      v: `Karyawan: ${employeeName}${employeeNik ? ` (${employeeNik})` : ''}`,
      t: 's',
      s: { font: { name: 'Calibri', sz: 10, color: { rgb: '555555' } } },
    };

    const byDate = new Map<string, any>();
    attendance.forEach((att) => byDate.set(String(att.date).slice(0, 10), att));

    // HR's payroll decision per day overrides the raw "no log = absent" inference,
    // so the sheet matches what was actually approved in the payroll run.
    //
    // A resolution is an ATTESTATION, not a punch: it must never be rendered as
    // "On Time", which would imply a clock-in that does not exist.
    const RESOLUTION_TO_STATUS: Record<string, string> = {
      approved_leave: 'on_leave',
      attendance_completed: 'resolved',
      accepted_as_is: 'resolved',
      alpha: 'absent',
    };
    const RESOLUTION_LABELS: Record<string, string> = {
      attendance_completed: 'Attendance completed',
      approved_leave: 'Approved leave',
      accepted_as_is: 'Accepted as is',
      alpha: 'Alpha (deducted)',
      other: 'Other',
    };
    const exceptionByDate = new Map<string, { status: string; label: string; note: string; resolved: boolean }>();
    for (const exc of attendanceExceptions) {
      const iso = String(exc.exception_date || '').slice(0, 10);
      if (!iso) continue;
      const resolved = exc.resolved === 1 || exc.resolved === true;
      const code = String(exc.resolution_code || '');
      const mapped = RESOLUTION_TO_STATUS[code] || (resolved ? 'resolved' : 'absent');
      exceptionByDate.set(iso, {
        status: resolved ? mapped : 'absent',
        label: resolved ? RESOLUTION_LABELS[code] || 'Resolved' : 'Absent',
        note: resolved ? code : 'unresolved',
        resolved,
      });
    }

    // ---- Calendar grid -------------------------------------------------------
    let calendarRow = 4;
    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const monthKeys = Array.from(
      new Set(
        (attendancePeriod
          ? listMonthKeysBetween(attendancePeriod.start, attendancePeriod.end)
          : attendance.map((a) => String(a.date).slice(0, 7))
        ).filter(Boolean)
      )
    ).sort();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    for (const ym of monthKeys) {
      const [year, month] = ym.split('-').map(Number);
      if (!year || !month) continue;

      aws[XLSX.utils.encode_cell({ r: calendarRow, c: 0 })] = {
        v: `${monthNames[month - 1]} ${year}`,
        t: 's',
        s: { font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '002060' } } },
      };
      aws['!merges'].push({ s: { r: calendarRow, c: 0 }, e: { r: calendarRow, c: 6 } });
      calendarRow++;

      weekdayLabels.forEach((label, col) => {
        aws[XLSX.utils.encode_cell({ r: calendarRow, c: col })] = {
          v: label,
          t: 's',
          s: {
            font: { name: 'Calibri', sz: 8, bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '4472C4' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: thinBorder,
          },
        };
      });
      calendarRow++;

      const first = new Date(year, month - 1, 1);
      const daysInMonth = new Date(year, month, 0).getDate();
      const offset = (first.getDay() + 6) % 7; // Monday-first

      let col = offset;
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${ym}-${String(day).padStart(2, '0')}`;
        const record = byDate.get(iso);
        const inPeriod =
          !attendancePeriod || (iso >= attendancePeriod.start && iso <= attendancePeriod.end);
        const weekday = new Date(year, month - 1, day).getDay();

        let label: string = String(day);
        let styleStatus: string | null = null;

        if (record) {
          styleStatus = String(record.status || '');
          const short = STATUS_STYLES[styleStatus.toLowerCase()]?.label;
          if (short) label = `${day}\n${short}`;
        } else if (!inPeriod) {
          label = String(day);
        } else if (weekday === 0 || weekday === 6) {
          styleStatus = 'day_off';
        } else {
          // No attendance log: defer to HR's payroll resolution when one exists,
          // otherwise the day is an unexplained absence.
          const decision = exceptionByDate.get(iso);
          styleStatus = decision?.status || 'absent';
          const short = decision?.label || 'Absent';
          label = `${day}\n${short}`;
        }

        aws[XLSX.utils.encode_cell({ r: calendarRow, c: col })] = {
          v: label,
          t: 's',
          s: {
            ...cellStyle(styleStatus),
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          },
        };

        col++;
        if (col === 7) {
          col = 0;
          calendarRow++;
        }
      }
      if (col !== 0) calendarRow++;
      calendarRow++;
    }

    // ---- Legend --------------------------------------------------------------
    aws[XLSX.utils.encode_cell({ r: calendarRow, c: 0 })] = {
      v: 'Attendance Status',
      t: 's',
      s: { font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: '555555' } } },
    };
    calendarRow++;

    let legendCol = 0;
    for (const key of ['present', 'late', 'early_leave', 'on_leave', 'sick', 'absent']) {
      const style = STATUS_STYLES[key];
      aws[XLSX.utils.encode_cell({ r: calendarRow, c: legendCol })] = {
        v: style.label,
        t: 's',
        s: {
          fill: { fgColor: { rgb: style.fill } },
          font: { name: 'Calibri', sz: 8, bold: true, color: { rgb: style.font } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: thinBorder,
        },
      };
      legendCol++;
    }
    calendarRow += 2;

    // ---- Resolution summary --------------------------------------------------
    // How many days HR resolved, and with which decision, so the sheet reflects
    // (and can be reconciled against) the payroll run.
    const resolutionCounts = new Map<string, number>();
    let resolvedDays = 0;
    let unresolvedDays = 0;
    for (const exc of attendanceExceptions) {
      const resolved = exc.resolved === 1 || exc.resolved === true;
      if (resolved) {
        resolvedDays++;
        const key = String(exc.resolution_code || 'other');
        resolutionCounts.set(key, (resolutionCounts.get(key) || 0) + 1);
      } else {
        unresolvedDays++;
      }
    }

    if (attendanceExceptions.length > 0) {
      aws[XLSX.utils.encode_cell({ r: calendarRow, c: 0 })] = {
        v: 'Resolved by Payroll',
        t: 's',
        s: { font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: '555555' } } },
      };
      calendarRow++;

      const summaryCells: Array<{ label: string; count: number; fill: string; font: string }> = [
        { label: `Resolved (${resolvedDays})`, count: resolvedDays, fill: 'C6EFCE', font: '006100' },
        { label: `Unresolved (${unresolvedDays})`, count: unresolvedDays, fill: 'FFC7CE', font: '9C0006' },
        ...Array.from(resolutionCounts.entries()).map(([code, count]) => ({
          label: `${RESOLUTION_LABELS[code] || code} (${count})`,
          count,
          fill: 'EDEDED',
          font: '404040',
        })),
      ];

      let summaryCol = 0;
      for (const cell of summaryCells) {
        aws[XLSX.utils.encode_cell({ r: calendarRow, c: summaryCol })] = {
          v: cell.label,
          t: 's',
          s: {
            fill: { fgColor: { rgb: cell.fill } },
            font: { name: 'Calibri', sz: 8, bold: true, color: { rgb: cell.font } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: thinBorder,
          },
        };
        summaryCol++;
      }
      calendarRow += 2;
    }

    // ---- Detail table --------------------------------------------------------
    const headerRow = calendarRow;
    const headers = ['No', 'Date', 'Status', 'Clock In', 'Clock Out', 'Late (min)', 'Geofence', 'Source'];
    headers.forEach((label, col) => {
      aws[XLSX.utils.encode_cell({ r: headerRow, c: col })] = {
        v: label,
        t: 's',
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '002060' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: thinBorder,
        },
      };
    });

    let row = headerRow + 1;

    // Combine real punches with HR-attested days. A resolved day has no clock-in,
    // so its Status is the resolution and Clock In/Out stay "-" — the row exists
    // to document the decision, not to imply a punch.
    const loggedDates = new Set(attendance.map((att) => String(att.date).slice(0, 10)));
    const attestedRows = Array.from(exceptionByDate.entries())
      .filter(([iso, decision]) => decision.resolved && !loggedDates.has(iso))
      .map(([iso, decision]: [string, any]) => ({
        date: iso,
        statusLabel: decision.label,
        styleKey: decision.status,
        clockIn: '-',
        clockOut: '-',
        lateMinutes: 0,
        geofence: '-',
        source: 'payroll resolution',
      }));

    const punchRows = attendance.map((att) => {
      const key = String(att.status || '').toLowerCase();
      const geofence =
        att.clock_in_status === 'out_of_geofence'
          ? att.clock_in_geofence_reason
            ? `Outside (${att.clock_in_geofence_reason})`
            : 'Outside'
          : att.clock_in_status === 'in_geofence'
          ? 'Inside'
          : '-';

      return {
        date: String(att.date).slice(0, 10),
        statusLabel: STATUS_STYLES[key]?.label || att.status,
        styleKey: key,
        clockIn: att.clock_in_time || '-',
        clockOut: att.clock_out_time || '-',
        lateMinutes: Number(att.late_minutes || 0),
        geofence,
        source: att.source || '-',
      };
    });

    [...punchRows, ...attestedRows]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry, index) => {
        const values: Array<{ v: any; t: string; align?: 'center' | 'left' }> = [
          { v: index + 1, t: 'n', align: 'center' },
          { v: formatClaimDate(entry.date), t: 's', align: 'left' },
          { v: entry.statusLabel, t: 's', align: 'left' },
          { v: entry.clockIn, t: 's', align: 'center' },
          { v: entry.clockOut, t: 's', align: 'center' },
          { v: entry.lateMinutes, t: 'n', align: 'center' },
          { v: entry.geofence, t: 's', align: 'left' },
          { v: entry.source, t: 's', align: 'left' },
        ];

        values.forEach((cell, col) => {
          aws[XLSX.utils.encode_cell({ r: row, c: col })] = {
            v: cell.v,
            t: cell.t,
            s: {
              font: { name: 'Calibri', sz: 10, color: { rgb: '003366' } },
              alignment: { horizontal: cell.align || 'left', vertical: 'center' },
              border: thinBorder,
            },
          };
          const style = STATUS_STYLES[entry.styleKey];
          if (col === 2 && style) {
            aws[XLSX.utils.encode_cell({ r: row, c: col })].s.fill = { fgColor: { rgb: style.fill } };
            aws[XLSX.utils.encode_cell({ r: row, c: col })].s.font = {
              name: 'Calibri',
              sz: 10,
              bold: true,
              color: { rgb: style.font },
            };
          }
        });
        row++;
      });

    aws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 7 } });
    aws['!cols'] = [
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 11 },
      { wch: 32 },
      { wch: 12 },
    ];
    aws['!rows'] = [];

    XLSX.utils.book_append_sheet(wb, aws, 'Attendance');
  }

  return wb;
}

// Helper to export all active employees into a single ZIP file containing 1 Excel per employee
async function exportAllEmployeesZip(
  c: any,
  month: string,
  includeSalary: boolean,
  approverName: string = '',
  salaryOnly: boolean = false
) {
  const comp: any = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first();
  const defaultCompanyName = comp?.name || 'SMTS Pte Ltd';
  const range = getClaimPeriodRange(month);

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
      checkedByName: empCheckedBy,
      approverName: empApprover,
      claims: empClaims,
      includeSalary,
      salaryAmount: salAmt,
      salaryDate: salDate,
      salaryRemarks: buildSalaryRemarks(emp.job_title, salRemarksItem),
      attendance: attendanceByEmployee.get(emp.id) || [],
      attendancePeriod: range,
      attendanceExceptions: exceptionsByEmployee.get(emp.id) || [],
    });

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
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
  const defaultCompanyName = comp?.name || 'SMTS Pte Ltd';

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

  const wb = buildClaimSheetWorkbook({
    companyName,
    month,
    employeeName,
    employeeNik: employeeInfo?.nik || claims[0]?.nik,
    employeeJobTitle: employeeInfo?.job_title,
    checkedByName,
    approverName,
    claims,
    includeSalary,
    salaryAmount,
    salaryDate,
    salaryRemarks,
    attendance,
    attendancePeriod: claimRange,
    attendanceExceptions,
  });

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
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

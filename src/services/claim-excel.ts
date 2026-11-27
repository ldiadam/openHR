import XLSX from 'xlsx-js-style';

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
export function buildSalaryRemarks(
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

export function resolveDirectorName(
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
export function listMonthKeysBetween(start: string, end: string): string[] {
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

export function writeClaimWorkbookBuffer(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}


import XLSX from 'xlsx-js-style';
import {
  ClaimSheetColumn,
  ClaimSheetTemplateConfig,
  DEFAULT_CLAIM_SHEET_TEMPLATE,
  parseClaimSheetTemplate,
} from '../../shared/formTemplates';

export interface BuildClaimSheetOptions {
  companyName: string;
  month: string;
  employeeName: string;
  employeeNik?: string;
  employeeJobTitle?: string;
  employeeDepartment?: string;
  checkedByName?: string;
  approverName?: string;
  claims: any[];
  includeSalary?: boolean;
  salaryAmount?: number;
  salaryDate?: string;
  salaryRemarks?: string;
  /** Optional dynamic builder config; defaults to DEFAULT_CLAIM_SHEET_TEMPLATE. */
  templateConfig?: ClaimSheetTemplateConfig;
  /** Optional custom uploaded .xlsx template bytes with {{placeholder}} tokens. */
  customTemplateBytes?: Uint8Array | null;
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

function resolvePeriodParts(month: string) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  if (month && month.includes('-')) {
    const [y, m] = month.split('-');
    const mIdx = parseInt(m, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return { year: y, monthNum: m, monthName: monthNames[mIdx], periodTitle: `${y} ${monthNames[mIdx]} EXPENSES.` };
    }
  }
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const mName = monthNames[now.getMonth()];
  return { year: y, monthNum: m, monthName: mName, periodTitle: `${y} ${mName} EXPENSES.` };
}

function applyTokenMap(template: string, tokens: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_:#-]+)\s*\}\}/g, (full, key) => {
    const k = String(key).toLowerCase();
    return Object.prototype.hasOwnProperty.call(tokens, k) ? String(tokens[k]) : full;
  });
}

function classifyClaimBuckets(
  claims: any[],
  columns: ClaimSheetColumn[],
  includeSalary: boolean,
  salaryAmount: number,
  salaryDate: string,
  salaryDesc: string,
  salaryRemarks: string
) {
  const bucketCols = columns.filter((c) => c.type === 'category_bucket');
  const unpaidCols = columns.filter((c) => c.type === 'unpaid_salary');
  const otherCols = columns.filter((c) => c.type === 'other_bucket');

  const items: Array<{
    seq: number;
    displayDate: string;
    description: string;
    category: string;
    amount: number;
    buckets: Record<string, number>;
    unpaid: number;
    others: number;
    cost_centre: string;
    project_ref: string;
    remarks: string;
  }> = [];

  const bucketTotals: Record<string, number> = {};
  bucketCols.forEach((b) => {
    bucketTotals[b.id] = 0;
  });
  let sumUnpaid = 0;
  let sumOthers = 0;
  let sumTotal = 0;
  let seq = 1;

  for (const cl of claims) {
    const amt = Number(cl.amount) || 0;
    const cat = String(cl.category || '').toLowerCase();
    const buckets: Record<string, number> = {};
    bucketCols.forEach((b) => {
      buckets[b.id] = 0;
    });
    let unpaid = 0;
    let others = 0;

    const matchedBucket = bucketCols.find((b) => {
      const kws = b.keywords && b.keywords.length > 0 ? b.keywords : [b.header.toLowerCase().trim()];
      return kws.some((kw) => kw && cat.includes(kw));
    });

    if (matchedBucket) {
      buckets[matchedBucket.id] = amt;
      bucketTotals[matchedBucket.id] += amt;
    } else if (
      unpaidCols.length > 0 &&
      unpaidCols.some((u) => {
        const kws = u.keywords && u.keywords.length > 0 ? u.keywords : ['unpaid', 'salary', 'gaji'];
        return kws.some((kw) => kw && cat.includes(kw));
      })
    ) {
      unpaid = amt;
      sumUnpaid += amt;
    } else if (otherCols.length > 0) {
      others = amt;
      sumOthers += amt;
    }

    sumTotal += amt;
    const rawDate = cl.expense_date
      ? String(cl.expense_date).slice(0, 10)
      : cl.created_at
      ? String(cl.created_at).slice(0, 10)
      : '';

    items.push({
      seq: seq++,
      displayDate: formatClaimDate(rawDate),
      description: cl.description || '',
      category: cl.category || '',
      amount: amt,
      buckets,
      unpaid,
      others,
      cost_centre: cl.cost_centre || '',
      project_ref: cl.project_ref || '',
      remarks: cl.remarks || '',
    });
  }

  if (includeSalary && salaryAmount > 0) {
    const emptyBuckets: Record<string, number> = {};
    bucketCols.forEach((b) => {
      emptyBuckets[b.id] = 0;
    });
    sumUnpaid += salaryAmount;
    sumTotal += salaryAmount;
    items.push({
      seq: seq++,
      displayDate: formatClaimDate(salaryDate),
      description: salaryDesc,
      category: 'Salary',
      amount: salaryAmount,
      buckets: emptyBuckets,
      unpaid: salaryAmount,
      others: 0,
      cost_centre: '',
      project_ref: claims[0]?.project_ref || '',
      remarks: salaryRemarks,
    });
  }

  return { items, bucketTotals, sumUnpaid, sumOthers, sumTotal };
}

function appendAttendanceSheet(
  wb: XLSX.WorkBook,
  options: BuildClaimSheetOptions,
  sheetName: string,
  thinBorder: any
) {
  const {
    companyName,
    employeeName,
    employeeNik,
    attendance = [],
    attendancePeriod,
    attendanceExceptions = [],
  } = options;
  if (attendance.length === 0 && !attendancePeriod) return;

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

    XLSX.utils.book_append_sheet(wb, aws, sheetName);
}

function buildDynamicClaimWorkbook(options: BuildClaimSheetOptions): XLSX.WorkBook {
  const {
    companyName,
    month,
    employeeName,
    employeeNik,
    employeeJobTitle,
    employeeDepartment,
    checkedByName = '',
    approverName = '',
    claims = [],
    includeSalary = false,
    salaryAmount = 0,
    salaryDate,
    salaryRemarks,
    templateConfig,
  } = options;

  const cfg = templateConfig ? parseClaimSheetTemplate(templateConfig as any) : DEFAULT_CLAIM_SHEET_TEMPLATE;
  const cols = cfg.columns.filter((c) => c.visible);
  const maxCol = Math.max(cols.length - 1, 0);

  const { year, monthNum, monthName } = resolvePeriodParts(month);
  const periodLabel = `${monthName} ${year}`;
  const nowYm = new Date().toISOString().slice(0, 7);
  const sDate = salaryDate || (month ? `${month}-25` : `${nowYm}-25`);
  const sRemarks = salaryRemarks || employeeJobTitle || 'Developing App, Managing Fajri';

  const globalTokens: Record<string, string | number> = {
    company_name: companyName,
    year,
    month: monthNum,
    month_name: monthName,
    period_label: periodLabel,
    employee_name: employeeName || '',
    employee_nik: employeeNik || '',
    job_title: employeeJobTitle || '',
    department: employeeDepartment || '',
  };

  const titleHeader = applyTokenMap(cfg.titlePattern, globalTokens);
  const sDesc = applyTokenMap(cfg.salaryDescriptionPattern, globalTokens);

  const wb = XLSX.utils.book_new();
  const ws: any = {};

  const thinBorder = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };

  const headerFill = { fgColor: { rgb: cfg.headerFillColor } };
  const totalFill = { fgColor: { rgb: cfg.totalFillColor } };
  const blueFont = { name: 'Times New Roman', sz: 11, color: { rgb: cfg.dataFontColor } };
  const boldBlue = { name: 'Times New Roman', sz: 11, bold: true, color: { rgb: cfg.dataFontColor } };
  const headerFont = { name: 'Calibri', sz: 11, bold: true, color: { rgb: cfg.headerFontColor } };
  const totalFont = { name: 'Times New Roman', sz: 11, bold: true, color: { rgb: cfg.totalFontColor } };
  const totalLabelFont = { name: 'Times New Roman', sz: 11, bold: false, color: { rgb: cfg.totalFontColor } };
  const claimsFont = { name: 'Times New Roman', sz: 11, bold: true, underline: true, color: { rgb: cfg.dataFontColor } };
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

  const numFmt = cfg.numberFormat;

  // Row 0: Company & Title | Currency label
  for (let c = 0; c <= maxCol; c++) setCell(0, c, '', { border: thinBorder });
  setCell(0, 0, titleHeader, { font: titleFont, border: thinBorder, alignment: { vertical: 'center' } });
  if (maxCol >= 5) {
    setCell(0, 4, cfg.currencyLabel, { font: boldBlue, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });
    setCell(0, 5, cfg.currencyLabel, { font: boldBlue, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });
  } else if (maxCol >= 1) {
    setCell(0, maxCol, cfg.currencyLabel, { font: boldBlue, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });
  }

  // Row 1: Subtitle (e.g. CLAIMS)
  for (let c = 0; c <= maxCol; c++) setCell(1, c, '', { border: thinBorder });
  setCell(1, Math.min(1, maxCol), cfg.subtitleLabel, {
    font: claimsFont,
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  });

  // Row 2: Column Headers
  cols.forEach((col, c) => {
    setCell(2, c, col.header, {
      fill: headerFill,
      font: headerFont,
      border: thinBorder,
      alignment: { horizontal: col.align || (c <= 1 ? 'center' : 'left'), vertical: 'center' },
    });
  });

  const { items, bucketTotals, sumUnpaid, sumOthers, sumTotal } = classifyClaimBuckets(
    claims,
    cols,
    Boolean(includeSalary && cfg.includeSalaryRow),
    salaryAmount,
    sDate,
    sDesc,
    sRemarks
  );

  const summableTypes = new Set(['category_bucket', 'unpaid_salary', 'amount']);
  const summableColLetters = cols
    .map((col, idx) => (summableTypes.has(col.type) ? XLSX.utils.encode_col(idx) : null))
    .filter((x): x is string => Boolean(x));

  let currRow = 3;
  const firstDataRowNumber = 4;

  for (const item of items) {
    for (let c = 0; c <= maxCol; c++) setCell(currRow, c, '', { border: thinBorder });
    const excelRow = currRow + 1;
    const rowFormula =
      summableColLetters.length > 0
        ? summableColLetters.map((ltr) => `${ltr}${excelRow}`).join('+')
        : undefined;

    cols.forEach((col, c) => {
      const align = col.align || 'left';
      const cellStyle = { font: blueFont, border: thinBorder, alignment: { horizontal: align, vertical: 'center' } };
      switch (col.type) {
        case 'seq':
          setCell(currRow, c, item.seq, cellStyle, 'n');
          break;
        case 'date':
          setCell(currRow, c, item.displayDate, cellStyle);
          break;
        case 'description':
          setCell(currRow, c, item.description, cellStyle);
          break;
        case 'category_label':
          setCell(currRow, c, item.category, cellStyle);
          break;
        case 'category_bucket': {
          const val = item.buckets[col.id] ?? 0;
          setCell(currRow, c, val, cellStyle, 'n', numFmt);
          break;
        }
        case 'unpaid_salary':
          setCell(currRow, c, item.unpaid, cellStyle, 'n', numFmt);
          break;
        case 'amount':
          setCell(currRow, c, item.amount, cellStyle, 'n', numFmt);
          break;
        case 'row_total':
          setCell(currRow, c, item.amount, cellStyle, 'n', numFmt, rowFormula);
          break;
        case 'other_bucket':
          setCell(
            currRow,
            c,
            item.others ? item.others : '',
            cellStyle,
            item.others ? 'n' : 's',
            item.others ? numFmt : undefined
          );
          break;
        case 'cost_centre':
          setCell(currRow, c, item.cost_centre, cellStyle);
          break;
        case 'project_ref':
          setCell(currRow, c, item.project_ref, cellStyle);
          break;
        case 'remarks':
          setCell(currRow, c, item.remarks, cellStyle);
          break;
      }
    });
    currRow++;
  }

  const lastDataRowNumber = Math.max(currRow, firstDataRowNumber - 1);

  // Separator row
  for (let c = 0; c <= maxCol; c++) setCell(currRow, c, '', { border: thinBorder });
  currRow++;

  // Total Sum row
  const totalSumRow = currRow;
  const totalSumRowNumber = totalSumRow + 1;
  for (let c = 0; c <= maxCol; c++) {
    setCell(totalSumRow, c, '', { fill: totalFill, border: thinBorder });
  }
  const descColIdx = cols.findIndex((c) => c.type === 'description');
  const labelColIdx = descColIdx >= 0 ? descColIdx : 0;
  setCell(totalSumRow, labelColIdx, cfg.totalSumLabel, {
    fill: totalFill,
    font: totalLabelFont,
    border: thinBorder,
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  let rowTotalColIdx = -1;
  cols.forEach((col, c) => {
    const colLtr = XLSX.utils.encode_col(c);
    const hasData = items.length > 0;
    const sumFormula = hasData ? `SUM(${colLtr}${firstDataRowNumber}:${colLtr}${lastDataRowNumber})` : undefined;
    if (col.type === 'category_bucket') {
      const val = bucketTotals[col.id] ?? 0;
      setCell(totalSumRow, c, val, { fill: totalFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, sumFormula);
    } else if (col.type === 'unpaid_salary') {
      setCell(totalSumRow, c, sumUnpaid, { fill: totalFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, sumFormula);
    } else if (col.type === 'amount') {
      setCell(totalSumRow, c, sumTotal, { fill: totalFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, sumFormula);
      if (rowTotalColIdx < 0) rowTotalColIdx = c;
    } else if (col.type === 'row_total') {
      rowTotalColIdx = c;
      setCell(totalSumRow, c, sumTotal, { fill: totalFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } }, 'n', numFmt, sumFormula);
    } else if (col.type === 'other_bucket') {
      setCell(
        totalSumRow,
        c,
        sumOthers ? sumOthers : '',
        { fill: totalFill, font: totalLabelFont, border: thinBorder, alignment: { horizontal: 'left', vertical: 'center' } },
        sumOthers ? 'n' : 's',
        sumOthers ? numFmt : undefined
      );
    }
  });
  currRow++;

  // Grand total row
  const grandTotalRow = currRow;
  for (let c = 0; c <= maxCol; c++) {
    setCell(grandTotalRow, c, '', { fill: totalFill, border: thinBorder });
  }
  setCell(grandTotalRow, labelColIdx, cfg.grandTotalLabel, {
    fill: totalFill,
    font: totalLabelFont,
    border: thinBorder,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const currSymCol = Math.min(labelColIdx + 1, maxCol);
  const grandAmtCol = Math.min(labelColIdx + 2, maxCol);
  if (currSymCol !== labelColIdx) {
    setCell(grandTotalRow, currSymCol, cfg.currencySymbol, {
      fill: totalFill,
      font: totalFont,
      border: thinBorder,
      alignment: { horizontal: 'center', vertical: 'center' },
    });
  }
  const grandFormula = rowTotalColIdx >= 0 ? `${XLSX.utils.encode_col(rowTotalColIdx)}${totalSumRowNumber}` : undefined;
  setCell(
    grandTotalRow,
    grandAmtCol,
    sumTotal,
    { fill: totalFill, font: totalFont, border: thinBorder, alignment: { horizontal: 'center', vertical: 'center' } },
    'n',
    '#,##0',
    grandFormula
  );
  currRow++;

  // Signatures
  const merges: XLSX.Range[] = [];
  if (maxCol >= 7) merges.push({ s: { r: 1, c: 5 }, e: { r: 1, c: 7 } });
  const grandMergeEnd = Math.min(grandAmtCol + 4, maxCol);
  if (grandMergeEnd > grandAmtCol) {
    merges.push({ s: { r: grandTotalRow, c: grandAmtCol }, e: { r: grandTotalRow, c: grandMergeEnd } });
  }

  const sigCol = Math.min(1, maxCol);
  const preparedBy = employeeName || 'Adam';
  cfg.signatures.forEach((sig, idx) => {
    const sigRow = currRow;
    for (let c = 0; c <= maxCol; c++) setCell(sigRow, c, '', {});
    const resolvedName =
      sig.source === 'applicant'
        ? preparedBy
        : sig.source === 'manager'
        ? checkedByName
        : sig.source === 'director'
        ? approverName
        : sig.customName || '';
    const pad = idx === 0 ? '   ' : idx === 1 ? '     ' : ' ';
    const text = resolvedName ? `${sig.label}:${pad}${resolvedName}` : `${sig.label}:`;
    setCell(sigRow, sigCol, text, { font: sigFont, alignment: { horizontal: 'left', vertical: 'top' } });
    if (maxCol >= sigCol + 1) {
      merges.push({ s: { r: sigRow, c: sigCol }, e: { r: sigRow, c: sigCol + 1 } });
    }
    currRow++;
    if (idx < cfg.signatures.length - 1) {
      const spacerRow = currRow;
      for (let c = 0; c <= maxCol; c++) setCell(spacerRow, c, '', {});
      currRow++;
    }
  });

  ws['!merges'] = merges;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: currRow - 1, c: maxCol } });
  ws['!cols'] = cols.map((col) => ({ wch: col.width }));

  XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
  if (cfg.includeAttendanceSheet) {
    appendAttendanceSheet(wb, options, cfg.attendanceSheetName, thinBorder);
  }
  return wb;
}

function shiftFormulaRowRefs(formula: string, fromRow1Based: number, delta: number): string {
  if (delta <= 0) return formula;
  return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (full, colPart, absRow, numStr) => {
    if (absRow === '$') return full;
    const n = parseInt(numStr, 10);
    if (n > fromRow1Based) return `${colPart}${n + delta}`;
    return full;
  });
}

function expandFormulaRangesOverRow(formula: string, tplRow1Based: number, delta: number): string {
  if (delta <= 0) return formula;
  return formula.replace(
    /(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/g,
    (full, leftCol, r1Str, rightCol, r2Str) => {
      const r1 = parseInt(r1Str, 10);
      const r2 = parseInt(r2Str, 10);
      if (r1 <= tplRow1Based && r2 >= tplRow1Based) {
        return `${leftCol}${r1}:${rightCol}${r2 + delta}`;
      }
      if (r1 > tplRow1Based) {
        return `${leftCol}${r1 + delta}:${rightCol}${r2 + delta}`;
      }
      return full;
    }
  );
}

const SINGLE_NUM_TOKENS = new Set(['no', 'amount', 'claim_count', 'grand_total', 'total_unpaid', 'total_others']);

function isNumericPlaceholderKey(key: string): boolean {
  const k = key.toLowerCase();
  return SINGLE_NUM_TOKENS.has(k) || k.startsWith('cat:') || k.startsWith('total_');
}

function replaceCellTokens(cell: any, tokenMap: Record<string, string | number>) {
  if (!cell || typeof cell.v !== 'string') return;
  const raw = cell.v;
  const singleMatch = raw.trim().match(/^\{\{\s*([a-zA-Z0-9_:#-]+)\s*\}\}$/);
  if (singleMatch) {
    const key = singleMatch[1].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(tokenMap, key)) {
      const val = tokenMap[key];
      if (typeof val === 'number' && isNumericPlaceholderKey(key)) {
        cell.v = val;
        cell.t = 'n';
        return;
      }
      cell.v = String(val);
      cell.t = 's';
      return;
    }
  }
  const replaced = raw.replace(/\{\{\s*([a-zA-Z0-9_:#-]+)\s*\}\}/g, (full: string, key: string) => {
    const k = String(key).toLowerCase();
    if (k === '#claims') return '';
    return Object.prototype.hasOwnProperty.call(tokenMap, k) ? String(tokenMap[k]) : full;
  });
  cell.v = replaced;
  cell.t = 's';
}

export function renderCustomClaimWorkbook(templateBytes: Uint8Array, options: BuildClaimSheetOptions): XLSX.WorkBook {
  const {
    companyName,
    month,
    employeeName,
    employeeNik,
    employeeJobTitle,
    employeeDepartment,
    checkedByName = '',
    approverName = '',
    claims = [],
    includeSalary = false,
    salaryAmount = 0,
    salaryDate,
    salaryRemarks,
    templateConfig,
  } = options;

  const cfg = templateConfig ? parseClaimSheetTemplate(templateConfig as any) : DEFAULT_CLAIM_SHEET_TEMPLATE;
  const wb = XLSX.read(templateBytes, { type: 'array', cellStyles: true, cellNF: true });
  const { year, monthNum, monthName } = resolvePeriodParts(month);
  const nowYm = new Date().toISOString().slice(0, 7);
  const sDate = salaryDate || (month ? `${month}-25` : `${nowYm}-25`);
  const sRemarks = salaryRemarks || employeeJobTitle || '';

  const globalTokens: Record<string, string | number> = {
    company_name: companyName,
    year,
    month: monthNum,
    month_name: monthName,
    period_label: `${monthName} ${year}`,
    employee_name: employeeName || '',
    employee_nik: employeeNik || '',
    job_title: employeeJobTitle || '',
    department: employeeDepartment || '',
    prepared_by: employeeName || '',
    checked_by: checkedByName || '',
    approved_by: approverName || '',
  };

  const sDesc = applyTokenMap(cfg.salaryDescriptionPattern, globalTokens);
  const { items, bucketTotals, sumUnpaid, sumOthers, sumTotal } = classifyClaimBuckets(
    claims,
    cfg.columns,
    Boolean(includeSalary && cfg.includeSalaryRow),
    salaryAmount,
    sDate,
    sDesc,
    sRemarks
  );

  globalTokens.claim_count = items.length;
  globalTokens.grand_total = sumTotal;
  globalTokens.total_unpaid = sumUnpaid;
  globalTokens.total_others = sumOthers;
  cfg.columns
    .filter((c) => c.type === 'category_bucket')
    .forEach((b) => {
      const slug = b.header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      globalTokens[`total_${slug}`] = bucketTotals[b.id] ?? 0;
    });

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Locate repeating claim row
    let tplRowIdx = -1;
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const val = typeof cell?.v === 'string' ? cell.v : '';
        if (/\{\{\s*(#claims|description|cat:[a-z0-9_ -]+)\s*\}\}/i.test(val)) {
          tplRowIdx = r;
          break;
        }
      }
      if (tplRowIdx >= 0) break;
    }

    if (tplRowIdx >= 0) {
      const delta = Math.max(0, items.length - 1);
      const tplRowCells: Record<number, any> = {};
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: tplRowIdx, c });
        if (ws[addr]) {
          tplRowCells[c] = structuredClone(ws[addr]);
          if (typeof tplRowCells[c].v === 'string') {
            tplRowCells[c].v = tplRowCells[c].v.replace(/\{\{\s*#claims\s*\}\}/gi, '').trimStart();
          }
        }
      }

      if (delta > 0) {
        // Shift cells below tplRowIdx down by delta
        for (let r = range.e.r; r > tplRowIdx; r--) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const oldAddr = XLSX.utils.encode_cell({ r, c });
            const newAddr = XLSX.utils.encode_cell({ r: r + delta, c });
            if (ws[oldAddr]) {
              const moved = ws[oldAddr];
              if (typeof moved.f === 'string') {
                moved.f = expandFormulaRangesOverRow(moved.f, tplRowIdx + 1, delta);
                moved.f = shiftFormulaRowRefs(moved.f, tplRowIdx + 1, delta);
              }
              ws[newAddr] = moved;
              delete ws[oldAddr];
            }
          }
        }

        if (Array.isArray(ws['!merges'])) {
          ws['!merges'] = ws['!merges'].map((m: XLSX.Range) => ({
            s: { r: m.s.r > tplRowIdx ? m.s.r + delta : m.s.r, c: m.s.c },
            e: { r: m.e.r >= tplRowIdx && m.s.r > tplRowIdx ? m.e.r + delta : m.e.r >= tplRowIdx && m.s.r === tplRowIdx ? m.e.r : m.e.r > tplRowIdx ? m.e.r + delta : m.e.r, c: m.e.c },
          }));
        }
        range.e.r += delta;
      }

      if (items.length === 0) {
        const emptyRowTokens: Record<string, string | number> = {
          ...globalTokens,
          no: '',
          date: '',
          description: '',
          category: '',
          amount: '',
          cost_centre: '',
          project_ref: '',
          remarks: '',
          'cat:unpaid': '',
          'cat:others': '',
        };
        cfg.columns
          .filter((col) => col.type === 'category_bucket')
          .forEach((b) => {
            const slug = b.header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
            emptyRowTokens[`cat:${slug}`] = '';
          });
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: tplRowIdx, c });
          if (tplRowCells[c]) {
            ws[addr] = structuredClone(tplRowCells[c]);
            replaceCellTokens(ws[addr], emptyRowTokens);
          }
        }
      } else {
        items.forEach((item, idx) => {
          const targetRow = tplRowIdx + idx;
          const rowTokens: Record<string, string | number> = {
            ...globalTokens,
            no: item.seq,
            date: item.displayDate,
            description: item.description,
            category: item.category,
            amount: item.amount,
            cost_centre: item.cost_centre,
            project_ref: item.project_ref,
            remarks: item.remarks,
            'cat:unpaid': item.unpaid,
            'cat:others': item.others,
          };
          cfg.columns
            .filter((col) => col.type === 'category_bucket')
            .forEach((b) => {
              const slug = b.header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
              rowTokens[`cat:${slug}`] = item.buckets[b.id] ?? 0;
            });

          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r: targetRow, c });
            if (tplRowCells[c]) {
              const cloned = structuredClone(tplRowCells[c]);
              if (typeof cloned.f === 'string' && idx > 0) {
                cloned.f = shiftFormulaRowRefs(cloned.f, tplRowIdx, idx);
              }
              replaceCellTokens(cloned, rowTokens);
              ws[addr] = cloned;
            }
          }
        });
      }
      ws['!ref'] = XLSX.utils.encode_range(range);
    }

    // Substitute global tokens on all remaining cells
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'string' && cell.v.includes('{{')) {
          replaceCellTokens(cell, globalTokens);
        }
      }
    }
  }

  if (cfg.includeAttendanceSheet && !wb.SheetNames.includes(cfg.attendanceSheetName)) {
    const thinBorder = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };
    appendAttendanceSheet(wb, options, cfg.attendanceSheetName, thinBorder);
  }

  return wb;
}

export function buildStarterClaimTemplateWorkbook(config?: ClaimSheetTemplateConfig): XLSX.WorkBook {
  const cfg = config ? parseClaimSheetTemplate(config as any) : DEFAULT_CLAIM_SHEET_TEMPLATE;
  const wb = XLSX.utils.book_new();
  const ws: any = {};
  const thinBorder = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };
  const headerFill = { fgColor: { rgb: cfg.headerFillColor } };
  const totalFill = { fgColor: { rgb: cfg.totalFillColor } };
  const headerFont = { name: 'Calibri', sz: 11, bold: true, color: { rgb: cfg.headerFontColor } };
  const numFmt = cfg.numberFormat;

  const cols = cfg.columns.filter((c) => c.visible);
  const maxCol = Math.max(cols.length - 1, 0);
  const setCell = (r: number, c: number, v: any, s: any, z?: string, f?: string) => {
    ws[XLSX.utils.encode_cell({ r, c })] = {
      v,
      t: typeof v === 'number' ? 'n' : 's',
      s,
      ...(z ? { z } : {}),
      ...(f ? { f } : {}),
    };
  };

  setCell(0, 0, '{{company_name}} — {{period_label}} EXPENSES', { font: { sz: 12, bold: true } });
  setCell(1, 0, 'Employee: {{employee_name}} ({{employee_nik}})', { font: { sz: 10 } });
  setCell(1, Math.max(1, maxCol), cfg.currencyLabel, { font: { sz: 10, bold: true } });

  cols.forEach((col, c) => {
    setCell(2, c, col.header, { fill: headerFill, font: headerFont, border: thinBorder });
  });

  // Template row (row index 3 = Excel row 4)
  cols.forEach((col, c) => {
    let token = '';
    if (col.type === 'seq') token = '{{#claims}}{{no}}';
    else if (col.type === 'date') token = '{{date}}';
    else if (col.type === 'description') token = '{{description}}';
    else if (col.type === 'category_label') token = '{{category}}';
    else if (col.type === 'category_bucket') {
      const slug = col.header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      token = `{{cat:${slug}}}`;
    } else if (col.type === 'unpaid_salary') token = '{{cat:unpaid}}';
    else if (col.type === 'other_bucket') token = '{{cat:others}}';
    else if (col.type === 'amount' || col.type === 'row_total') token = '{{amount}}';
    else if (col.type === 'cost_centre') token = '{{cost_centre}}';
    else if (col.type === 'project_ref') token = '{{project_ref}}';
    else if (col.type === 'remarks') token = '{{remarks}}';
    setCell(3, c, token, { border: thinBorder }, numFmt);
  });

  // Totals row (row index 4 = Excel row 5)
  const descIdx = Math.max(0, cols.findIndex((c) => c.type === 'description'));
  cols.forEach((col, c) => {
    const colLtr = XLSX.utils.encode_col(c);
    const isNum = ['category_bucket', 'unpaid_salary', 'amount', 'row_total', 'other_bucket'].includes(col.type);
    setCell(
      4,
      c,
      c === descIdx ? cfg.totalSumLabel : isNum ? 0 : '',
      { fill: totalFill, border: thinBorder, font: { bold: true } },
      isNum ? numFmt : undefined,
      isNum ? `SUM(${colLtr}4:${colLtr}4)` : undefined
    );
  });

  setCell(6, 0, 'PREPARED BY: {{prepared_by}}', { font: { sz: 10 } });
  setCell(7, 0, 'CHECKED BY: {{checked_by}}', { font: { sz: 10 } });
  setCell(8, 0, 'APPROVED BY: {{approved_by}}', { font: { sz: 10 } });

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 8, c: maxCol } });
  ws['!cols'] = cols.map((c) => ({ wch: c.width }));
  XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
  return wb;
}

export function detectXlsxPlaceholders(bytes: Uint8Array): { sheets: string[]; placeholders: string[] } {
  const wb = XLSX.read(bytes, { type: 'array' });
  const found = new Set<string>();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'string') {
          const matches = cell.v.matchAll(/\{\{\s*([a-zA-Z0-9_:#-]+)\s*\}\}/g);
          for (const m of matches) {
            found.add(`{{${m[1].toLowerCase()}}}`);
          }
        }
      }
    }
  }
  return { sheets: wb.SheetNames, placeholders: Array.from(found) };
}

export function buildClaimSheetWorkbook(options: BuildClaimSheetOptions) {
  if (options.customTemplateBytes && options.customTemplateBytes.byteLength > 0) {
    return renderCustomClaimWorkbook(options.customTemplateBytes, options);
  }
  return buildDynamicClaimWorkbook(options);
}

export function writeClaimWorkbookBuffer(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}


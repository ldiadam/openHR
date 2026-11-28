import { Hono } from 'hono';
import { Bindings, PayrollSettingsModel } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { calculateEmployeePayroll, calculateTerPPh21 } from '../services/payroll-calc';
import { sendEmail, runInBackground } from '../services/smtp';
import { getPayslipReadyEmail } from '../services/email-templates';
import { makeId } from '../utils/id';

export const payrollRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

payrollRoutes.use('*', authMiddleware);

function countWorkingDays(start: string, end: string, holidays: Set<string>): number {
  return listWorkingDays(start, end, holidays).length;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** Every working day (Mon–Fri, excluding holidays) inside an inclusive range. */
function listWorkingDays(start: string, end: string, holidays: Set<string>): string[] {
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const endDate = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return [];
  }
  const days: string[] = [];
  for (let day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    if (holidays.has(iso)) continue;
    days.push(iso);
  }
  return days;
}

// Helper to get active settings
async function getActivePayrollSettings(db: D1Database): Promise<PayrollSettingsModel> {
  const row = await db.prepare(
    `SELECT * FROM payroll_settings ORDER BY effective_date DESC LIMIT 1`
  ).first<any>();

  if (!row) {
    throw new Error('Konfigurasi payroll tidak ditemukan di database');
  }
  return row as PayrollSettingsModel;
}

// 1. List Payroll Runs
payrollRoutes.get('/runs', async (c) => {
  const user = c.get('user');
  if (user.role === 'employee') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const rows = await c.env.DB.prepare(
    `SELECT * FROM payroll_runs ORDER BY period_end DESC`
  ).all<any>();

  return c.json({ runs: rows.results || [] });
});

// 2. Step 1: Open Period (Create new draft payroll run)
payrollRoutes.post('/runs', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { period_start, period_end, payment_date, title } = body;

  if (!period_start || !period_end || !payment_date || !title) {
    return c.json({ error: 'Semua field wajib diisi (Periode awal, akhir, tanggal bayar, judul)' }, 400);
  }

  const runId = `prun-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  await c.env.DB.prepare(
    `INSERT INTO payroll_runs (
      id, tenant_id, period_start, period_end, payment_date, title, status, notes
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, 'draft', ?
    )`
  )
    .bind(runId, period_start, period_end, payment_date, title, body.notes || null)
    .run();

  return c.json({ message: 'Periode payroll berhasil dibuka (Draft)', runId });
});

// 2a. Delete an open payroll run (locked/paid periods are immutable)
payrollRoutes.delete('/runs/:id', requireRole(['owner_admin']), async (c) => {
  const runId = c.req.param('id');
  const user = c.get('user');
  const run = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();

  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);
  if (run.status === 'locked' || run.status === 'paid') {
    return c.json({ error: 'Payroll run yang sudah dikunci atau dibayar tidak dapat dihapus' }, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE reimbursements SET payroll_run_id = NULL WHERE payroll_run_id = ?`).bind(runId),
    c.env.DB.prepare(`DELETE FROM payroll_items WHERE payroll_run_id = ?`).bind(runId),
    c.env.DB.prepare(`DELETE FROM payroll_exceptions WHERE payroll_run_id = ?`).bind(runId),
    c.env.DB.prepare(`DELETE FROM payroll_runs WHERE id = ?`).bind(runId),
  ]);

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, old_values)
     VALUES (?, 'default', ?, 'DELETE_PAYROLL_RUN', 'payroll_runs', ?, ?)`
  )
    .bind(makeId('aud'), user.userId, runId, JSON.stringify({ title: run.title, status: run.status }))
    .run();

  return c.json({ message: 'Periode payroll berhasil dihapus.' });
});

// 2b. THR run (Tunjangan Hari Raya / 13th-month equivalent)
payrollRoutes.post('/runs/thr', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const paymentDate = body.payment_date;
  if (!paymentDate) {
    return c.json({ error: 'Tanggal pembayaran THR wajib diisi' }, 400);
  }

  const [yearStr, monthStr] = String(paymentDate).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return c.json({ error: 'Tanggal pembayaran tidak valid' }, 400);

  const periodStart = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const runId = `prun-thr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const title = body.title || `THR ${year}`;

  await c.env.DB.prepare(
    `INSERT INTO payroll_runs (
      id, tenant_id, period_start, period_end, payment_date, title, status, run_type, notes
    ) VALUES (?, 'default', ?, ?, ?, ?, 'draft', 'thr', ?)`
  )
    .bind(runId, periodStart, periodEnd, paymentDate, title, body.notes || null)
    .run();

  const settings = await getActivePayrollSettings(c.env.DB);
  const employees = await c.env.DB.prepare(
    `SELECT e.*, d.name as department_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE e.lifecycle_status IN ('active', 'probation', 'on_leave')
       AND COALESCE(e.exclude_from_payroll, 0) = 0
       AND e.join_date <= ?`
  )
    .bind(paymentDate)
    .all<any>();

  let count = 0;
  for (const emp of employees.results || []) {
    const join = new Date(`${emp.join_date}T00:00:00`);
    const pay = new Date(`${paymentDate}T00:00:00`);
    let months = (pay.getFullYear() - join.getFullYear()) * 12 + (pay.getMonth() - join.getMonth());
    if (pay.getDate() < join.getDate()) months -= 1;
    const daysRemainder = pay.getDate() >= join.getDate()
      ? pay.getDate() - join.getDate()
      : 30 - join.getDate() + pay.getDate();
    const totalMonths = Math.max(0, months) + Math.max(0, daysRemainder) / 30;
    let factor = Math.min(1, totalMonths / 12);
    if (totalMonths >= 12 && (settings as any).thr_progressive_tiers_json) {
      try {
        const tiers = JSON.parse((settings as any).thr_progressive_tiers_json);
        if (Array.isArray(tiers)) {
          const tenureYears = totalMonths / 12;
          for (const tier of tiers) {
            const minYears = Number(tier?.min_years || 0);
            const mult = Number(tier?.multiplier || 1);
            if (minYears > 0 && tenureYears >= minYears && mult > factor) {
              factor = mult;
            }
          }
        }
      } catch {
        // ignore invalid tiers JSON
      }
    }
    const wage = Number(emp.base_salary || 0) + Number(emp.fixed_allowances || 0);
    const thrAmount = Math.round(wage * factor);
    if (thrAmount <= 0) continue;

    const calc = calculateEmployeePayroll(
      {
        id: emp.id,
        nik: emp.nik,
        full_name: emp.full_name,
        ptkp_status: emp.ptkp_status,
        base_salary: 0,
        fixed_allowances: 0,
        bpjs_wage_basis: emp.bpjs_wage_basis,
        bank_name: emp.bank_name,
        bank_account_number: emp.bank_account_number,
        has_bpjs_tk: false,
        has_bpjs_kes: false,
        pays_own_tax: emp.pays_own_tax === 1 || emp.tax_scheme === 'self_paid',
        tax_scheme: emp.tax_scheme || 'company_withheld',
        days_worked: 0,
        expected_working_days: 21,
        late_minutes: 0,
        unapproved_absence_days: 0,
        overtime_weekday_hours: 0,
        overtime_holiday_hours: 0,
        kasbon_deduction: 0,
        reimbursement_amount: 0,
        thr_amount: thrAmount,
      },
      settings
    );

    await c.env.DB.prepare(
      `INSERT INTO payroll_items (
        id, tenant_id, payroll_run_id, employee_id,
        employee_nik, employee_name, job_title, department_name, ptkp_status, bank_name, bank_account_number,
        base_salary, fixed_allowance, prorated_salary, days_worked, expected_working_days,
        overtime_hours, overtime_pay, attendance_bonus, commission_bonus, reimbursement_amount, thr_amount, leave_allowance_amount,
        gross_earnings, late_deduction, unpaid_leave_deduction, kasbon_deduction, other_deductions,
        alpha_days, alpha_deduction,
        bpjs_kes_employee, bpjs_jht_employee, bpjs_jp_employee, pph21_amount, pph21_method,
        total_deductions, take_home_pay,
        bpjs_kes_employer, bpjs_jht_employer, bpjs_jp_employer, bpjs_jkk_employer, bpjs_jkm_employer,
        total_employer_cost
      ) VALUES (
        ?, 'default', ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )`
    )
      .bind(
        `pitem-${runId}-${emp.id}`,
        runId,
        emp.id,
        emp.nik,
        emp.full_name,
        emp.job_title,
        emp.department_name || '',
        emp.ptkp_status,
        emp.bank_name,
        emp.bank_account_number,
        0,
        0,
        0,
        0,
        21,
        0,
        0,
        0,
        0,
        0,
        calc.thr_amount,
        0,
        calc.gross_earnings,
        0, // late_deduction
        0, // unpaid_leave_deduction
        0, // kasbon_deduction
        0, // other_deductions
        0, // alpha_days
        0, // alpha_deduction
        calc.pph21_amount,
        calc.pph21_method,
        calc.total_deductions,
        calc.take_home_pay,
        calc.bpjs_kes_employer,
        calc.bpjs_jht_employer,
        calc.bpjs_jp_employer,
        calc.bpjs_jkk_employer,
        calc.bpjs_jkm_employer,
        calc.total_employer_cost
      )
      .run();
    count++;
  }

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) as emp_count,
            COALESCE(SUM(gross_earnings), 0) as total_gross,
            COALESCE(SUM(total_deductions), 0) as total_deductions,
            COALESCE(SUM(take_home_pay), 0) as total_take_home,
            COALESCE(SUM(total_employer_cost), 0) as total_employer_cost
     FROM payroll_items WHERE payroll_run_id = ?`
  )
    .bind(runId)
    .first<any>();

  await c.env.DB.prepare(
    `UPDATE payroll_runs SET status = 'calculated', employee_count = ?, total_gross = ?,
      total_deductions = ?, total_take_home = ?, total_employer_cost = ? WHERE id = ?`
  )
    .bind(
      totals?.emp_count || 0,
      totals?.total_gross || 0,
      totals?.total_deductions || 0,
      totals?.total_take_home || 0,
      totals?.total_employer_cost || 0,
      runId
    )
    .run();

  return c.json({
    message: `Run THR berhasil dibuat untuk ${count} karyawan`,
    runId,
    employeeCount: count,
  }, 201);
});

// 3. Step 2: Pull Inputs Automatically (Attendance, approved OT, leave, kasbon, reimbursements)
payrollRoutes.post('/runs/:id/pull-inputs', requireRole(['owner_admin']), async (c) => {
  const runId = c.req.param('id');
  const run = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();

  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);
  if (run.status === 'locked' || run.status === 'paid') {
    return c.json({ error: 'Payroll run yang sudah dikunci atau dibayar tidak dapat diubah' }, 400);
  }

  const settings = await getActivePayrollSettings(c.env.DB);

  // Active or probation employees who haven't resigned before period_start
  const employees = await c.env.DB.prepare(
    `SELECT e.*, d.name as department_name, b.name as branch_name, b.umk_amount as branch_umk
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN branches b ON e.branch_id = b.id
     WHERE (e.lifecycle_status IN ('active', 'probation', 'on_leave')
            OR (e.lifecycle_status IN ('resigned', 'terminated') AND e.last_working_date >= ?))
       AND COALESCE(e.exclude_from_payroll, 0) = 0
       AND e.join_date <= ?`
  )
    .bind(run.period_start, run.period_end)
    .all<any>();

  const empList = employees.results || [];

  // Clear existing items and exceptions for this run before re-pulling.
  // Manual/adjustment exceptions are regenerated below; resolved per-day rows are
  // kept so an HR justification is never silently lost on a re-pull.
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM payroll_items WHERE payroll_run_id = ?`).bind(runId),
    c.env.DB.prepare(`DELETE FROM payroll_exceptions WHERE payroll_run_id = ? AND resolved = 0`).bind(runId),
    c.env.DB.prepare(`UPDATE reimbursements SET payroll_run_id = NULL WHERE payroll_run_id = ?`).bind(runId),
  ]);

  // Proration divisor is the working days of the payroll month (period end), per README
  const payrollYear = Number(String(run.period_end).slice(0, 4));
  const payrollMonth = Number(String(run.period_end).slice(5, 7));
  const payrollMonthPrefix = String(run.period_end).slice(0, 7);
  const monthStart = `${payrollMonthPrefix}-01`;
  const lastDayOfMonth = new Date(payrollYear, payrollMonth, 0).getDate();
  const monthEnd = `${payrollMonthPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
  const holidayRangeEnd = monthEnd > run.period_end ? monthEnd : run.period_end;

  const holidayRows = await c.env.DB.prepare(
    `SELECT date FROM holidays WHERE date BETWEEN ? AND ?`
  )
    .bind(run.period_start, holidayRangeEnd)
    .all<any>();
  const holidaySet = new Set(
    (holidayRows.results || []).map((h: any) => String(h.date).slice(0, 10))
  );
  const expectedWorkingDays = countWorkingDays(monthStart, monthEnd, holidaySet) || 21;

  let exceptionCount = 0;

  for (const emp of empList) {
    // 1. Attendance Summary
    // `date` is required below to know which working days are actually logged.
    const attRows = await c.env.DB.prepare(
      `SELECT date, status, late_minutes, actual_work_minutes FROM attendance
       WHERE employee_id = ? AND date BETWEEN ? AND ?`
    )
      .bind(emp.id, run.period_start, run.period_end)
      .all<any>();

    const attList = attRows.results || [];
    const lateMinutesTotal = attList.reduce((acc, a) => acc + (a.late_minutes || 0), 0);
    const unapprovedAbsenceDays = attList.filter((a) => a.status === 'absent').length;

    const isNewJoiner = emp.join_date > run.period_start && emp.join_date <= run.period_end;
    const isLeaver = emp.last_working_date && emp.last_working_date >= run.period_start && emp.last_working_date < run.period_end;
    const effectiveStart = isNewJoiner && emp.join_date > run.period_start ? emp.join_date : run.period_start;
    const effectiveEnd = isLeaver && emp.last_working_date ? emp.last_working_date : run.period_end;
    const employmentDays = countWorkingDays(effectiveStart, effectiveEnd, holidaySet);
    const expectedAttendanceDays = isNewJoiner || isLeaver ? employmentDays : expectedWorkingDays;

    // Approved leave already writes an on_leave/sick attendance row, so any working
    // day WITHOUT a row is an unexplained no-show. One exception row per missing day.
    //
    // The audited window is the whole payroll PERIOD (e.g. 25 Oct → 25 Nov), not the
    // calendar month: the first days of a 25→25 period belong to this run and would
    // otherwise never be checked. It is still clipped to the employment window and to
    // period_end so future days are never treated as absences.
    //
    // The daily RATE stays base ÷ working days of the payroll month, but the count is
    // capped at that month's working days (see calculateEmployeePayroll), so a longer
    // period can never deduct more than one month of salary.
    const loggedDays = new Set(attList.map((a: any) => String(a.date).slice(0, 10)));
    const attendanceWindowStart = maxDate(effectiveStart, run.period_start);
    const attendanceWindowEnd = minDate(effectiveEnd, run.period_end);

    const requiredDays = listWorkingDays(attendanceWindowStart, attendanceWindowEnd, holidaySet);
    const missingDays = requiredDays.filter((day) => !loggedDays.has(day));
    for (const missingDate of missingDays) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO payroll_exceptions (
           id, tenant_id, payroll_run_id, employee_id, exception_type, severity,
           description, exception_date
         ) VALUES (?, 'default', ?, ?, 'missing_attendance', 'warning', ?, ?)`
      )
        .bind(
          `exc-miss-${runId}-${emp.id}-${missingDate}`,
          runId,
          emp.id,
          `Tidak ada log presensi untuk ${emp.full_name} pada ${missingDate}. Tandai alpa (potong otomatis) atau lampirkan alasan.`,
          missingDate
        )
        .run();
      exceptionCount++;
    }

    // A missing day that HR has already resolved (approved leave, manual attendance,
    // accepted, etc.) is justified and must NOT be deducted as alpha.
    const resolvedDates = new Set<string>();
    if (missingDays.length > 0) {
      const resolvedRows = await c.env.DB.prepare(
        `SELECT exception_date FROM payroll_exceptions
         WHERE payroll_run_id = ? AND employee_id = ? AND resolved = 1 AND exception_date IS NOT NULL`
      )
        .bind(runId, emp.id)
        .all<any>();
      for (const row of resolvedRows.results || []) {
        resolvedDates.add(String(row.exception_date).slice(0, 10));
      }
    }
    const alphaDays = missingDays.filter((day) => !resolvedDates.has(day)).length;

    // 2. Approved Overtime
    const otRows = await c.env.DB.prepare(
      `SELECT actual_hours, is_holiday_or_rest_day, status FROM overtime_requests
       WHERE employee_id = ? AND date BETWEEN ? AND ?`
    )
      .bind(emp.id, run.period_start, run.period_end)
      .all<any>();

    const otList = otRows.results || [];
    const approvedOt = otList.filter((o) => o.status === 'approved');
    const pendingOt = otList.filter((o) => o.status === 'pending');

    if (pendingOt.length > 0) {
      await c.env.DB.prepare(
        `INSERT INTO payroll_exceptions (id, tenant_id, payroll_run_id, employee_id, exception_type, severity, description)
         VALUES (?, 'default', ?, ?, 'unapproved_overtime', 'warning', ?)`
      )
        .bind(
          `exc-ot-${Date.now()}-${emp.id}`,
          runId,
          emp.id,
          `Terdapat ${pendingOt.length} pengajuan lembur belum disetujui untuk ${emp.full_name}`
        )
        .run();
      exceptionCount++;
    }

    const otWeekdayHours = approvedOt
      .filter((o) => !o.is_holiday_or_rest_day)
      .reduce((acc, o) => acc + o.actual_hours, 0);

    const otHolidayHours = approvedOt
      .filter((o) => o.is_holiday_or_rest_day)
      .reduce((acc, o) => acc + o.actual_hours, 0);

    // 3. Approved Kasbon Deductions
    const kasbon = await c.env.DB.prepare(
      `SELECT id, instalment_amount, remaining_amount FROM kasbon
       WHERE employee_id = ? AND status = 'approved' AND remaining_amount > 0`
    )
      .bind(emp.id)
      .first<any>();

    let kasbonDeduction = 0;
    if (kasbon) {
      kasbonDeduction = Math.min(kasbon.instalment_amount, kasbon.remaining_amount);
    }

    // 4. Approved Reimbursements not yet attached to any payroll run (carried forward)
    let reimbRows: any = { results: [] };
    if (!run.run_type || run.run_type === 'monthly') {
      reimbRows = await c.env.DB.prepare(
        `SELECT id, amount FROM reimbursements
         WHERE employee_id = ? AND status = 'approved' AND payment_method = 'payroll'
           AND payroll_run_id IS NULL`
      )
        .bind(emp.id)
        .all<any>();

      const reimbIds = (reimbRows.results || []).map((r: any) => r.id);
      if (reimbIds.length > 0) {
        await c.env.DB.prepare(
          `UPDATE reimbursements SET payroll_run_id = ? WHERE id IN (${reimbIds.map(() => '?').join(', ')})`
        )
          .bind(runId, ...reimbIds)
          .run();
      }
    }

    const reimbTotal = (reimbRows.results || []).reduce((acc: number, r: any) => acc + (r.amount || 0), 0);

    // 5. UMK Guard Exception
    if (emp.base_salary < (emp.branch_umk || 5000000)) {
      await c.env.DB.prepare(
        `INSERT INTO payroll_exceptions (id, tenant_id, payroll_run_id, employee_id, exception_type, severity, description)
         VALUES (?, 'default', ?, ?, 'below_umk', 'warning', ?)`
      )
        .bind(
          `exc-umk-${Date.now()}-${emp.id}`,
          runId,
          emp.id,
          `Gaji pokok ${emp.full_name} (Rp ${emp.base_salary.toLocaleString('id-ID')}) di bawah UMK cabang ${emp.branch_name} (Rp ${emp.branch_umk.toLocaleString('id-ID')})`
        )
        .run();
      exceptionCount++;
    }

    // Payable days follow the employment window, not raw attendance logs: partial
    // logging must not understate a full-month salary. Explicit absences and
    // unresolved alpha days are deducted separately below.
    const payableDays = isNewJoiner || isLeaver ? employmentDays : expectedWorkingDays;
    const daysWorked = Math.max(0, Math.min(payableDays, payableDays - unapprovedAbsenceDays));

    // 7. December PPh 21 annual reconciliation (Jan–Nov totals for this year)
    const runMonth = Number(String(run.period_end).slice(5, 7));
    let priorMonthsGross = 0;
    let priorMonthsTaxPaid = 0;
    let priorMonthsJhtJp = 0;
    if (runMonth === 12) {
      const yearPrefix = String(run.period_end).slice(0, 4);
      const prior = await c.env.DB.prepare(
        `SELECT COALESCE(SUM(pi.gross_earnings), 0) as gross,
                COALESCE(SUM(pi.pph21_amount), 0) as tax,
                COALESCE(SUM(pi.bpjs_jht_employee + pi.bpjs_jp_employee), 0) as jht_jp
         FROM payroll_items pi
         JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
         WHERE pi.employee_id = ?
           AND pr.period_end >= ? AND pr.period_end < ?
           AND pr.status IN ('calculated', 'locked', 'paid')`
      )
        .bind(emp.id, `${yearPrefix}-01-01`, `${yearPrefix}-12-01`)
        .first<any>();
      priorMonthsGross = Number(prior?.gross || 0);
      priorMonthsTaxPaid = Number(prior?.tax || 0);
      priorMonthsJhtJp = Number(prior?.jht_jp || 0);
    }

    // 7b. Optional Tunjangan Cuti (Leave Allowance on work anniversary month with >= 1 year tenure)
    let leaveAllowanceAmount = 0;
    if ((settings as any).leave_allowance_enabled === 1 && emp.join_date) {
      const joinDate = new Date(`${emp.join_date}T00:00:00`);
      const periodEndDate = new Date(`${run.period_end}T00:00:00`);
      const yearsCompleted =
        periodEndDate.getFullYear() -
        joinDate.getFullYear() -
        (periodEndDate.getMonth() < joinDate.getMonth() ? 1 : 0);
      if (yearsCompleted >= 1 && joinDate.getMonth() + 1 === runMonth) {
        const mult = Number((settings as any).leave_allowance_multiplier ?? 1);
        leaveAllowanceAmount = Math.max(0, Math.round((Number(emp.base_salary || 0) + Number(emp.fixed_allowances || 0)) * mult));
      }
    }

    // Calculate item using Indonesian rules
    const calc = calculateEmployeePayroll(
      {
        id: emp.id,
        nik: emp.nik,
        full_name: emp.full_name,
        ptkp_status: emp.ptkp_status,
        base_salary: emp.base_salary,
        fixed_allowances: emp.fixed_allowances,
        bpjs_wage_basis: emp.bpjs_wage_basis,
        bank_name: emp.bank_name,
        bank_account_number: emp.bank_account_number,
        has_bpjs_tk: emp.has_bpjs_tk !== undefined ? (emp.has_bpjs_tk === 1 || emp.has_bpjs_tk === true) : Boolean(emp.bpjs_tk_number),
        has_bpjs_kes: emp.has_bpjs_kes !== undefined ? (emp.has_bpjs_kes === 1 || emp.has_bpjs_kes === true) : Boolean(emp.bpjs_kesehatan_number),
        pays_own_tax: emp.pays_own_tax === 1 || emp.tax_scheme === 'self_paid',
        tax_scheme: emp.tax_scheme || 'company_withheld',
        days_worked: daysWorked,
        expected_working_days: expectedWorkingDays,
        late_minutes: lateMinutesTotal,
        unapproved_absence_days: unapprovedAbsenceDays,
        alpha_days: alphaDays,
        overtime_weekday_hours: otWeekdayHours,
        overtime_holiday_hours: otHolidayHours,
        kasbon_deduction: kasbonDeduction,
        reimbursement_amount: reimbTotal,
        leave_allowance_amount: leaveAllowanceAmount,
        is_new_joiner_mid_month: isNewJoiner,
        is_leaver_mid_month: isLeaver,
        is_december_recalc: runMonth === 12,
        prior_months_gross: priorMonthsGross,
        prior_months_tax_paid: priorMonthsTaxPaid,
        prior_months_jht_jp: priorMonthsJhtJp,
      },
      settings
    );

    const itemId = `pitem-${runId}-${emp.id}`;
    await c.env.DB.prepare(
      `INSERT INTO payroll_items (
        id, tenant_id, payroll_run_id, employee_id,
        employee_nik, employee_name, job_title, department_name, ptkp_status, bank_name, bank_account_number,
        base_salary, fixed_allowance, prorated_salary, days_worked, expected_working_days,
        overtime_hours, overtime_pay, attendance_bonus, commission_bonus, reimbursement_amount, thr_amount, leave_allowance_amount,
        gross_earnings, late_deduction, unpaid_leave_deduction, kasbon_deduction, other_deductions,
        alpha_days, alpha_deduction,
        bpjs_kes_employee, bpjs_jht_employee, bpjs_jp_employee, pph21_amount, pph21_method,
        total_deductions, take_home_pay,
        bpjs_kes_employer, bpjs_jht_employer, bpjs_jp_employer, bpjs_jkk_employer, bpjs_jkm_employer,
        total_employer_cost
      ) VALUES (
        ?, 'default', ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )`
    )
      .bind(
        itemId,
        runId,
        emp.id,
        emp.nik,
        emp.full_name,
        emp.job_title,
        emp.department_name || '',
        emp.ptkp_status,
        emp.bank_name,
        emp.bank_account_number,
        calc.base_salary,
        calc.fixed_allowance,
        calc.prorated_salary,
        calc.days_worked,
        calc.expected_working_days,
        calc.overtime_hours,
        calc.overtime_pay,
        calc.attendance_bonus,
        calc.commission_bonus,
        calc.reimbursement_amount,
        calc.thr_amount,
        calc.leave_allowance_amount,
        calc.gross_earnings,
        calc.late_deduction,
        calc.unpaid_leave_deduction,
        calc.kasbon_deduction,
        calc.other_deductions,
        calc.alpha_days,
        calc.alpha_deduction,
        calc.bpjs_kes_employee,
        calc.bpjs_jht_employee,
        calc.bpjs_jp_employee,
        calc.pph21_amount,
        calc.pph21_method,
        calc.total_deductions,
        calc.take_home_pay,
        calc.bpjs_kes_employer,
        calc.bpjs_jht_employer,
        calc.bpjs_jp_employer,
        calc.bpjs_jkk_employer,
        calc.bpjs_jkm_employer,
        calc.total_employer_cost
      )
      .run();
  }

  // Update Run status and summary totals
  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) as emp_count,
            SUM(gross_earnings) as total_gross,
            SUM(total_deductions) as total_deductions,
            SUM(take_home_pay) as total_take_home,
            SUM(total_employer_cost) as total_employer_cost
     FROM payroll_items WHERE payroll_run_id = ?`
  )
    .bind(runId)
    .first<any>();

  await c.env.DB.prepare(
    `UPDATE payroll_runs SET
      status = 'calculated',
      employee_count = ?,
      total_gross = ?,
      total_deductions = ?,
      total_take_home = ?,
      total_employer_cost = ?
     WHERE id = ?`
  )
    .bind(
      totals?.emp_count || 0,
      totals?.total_gross || 0,
      totals?.total_deductions || 0,
      totals?.total_take_home || 0,
      totals?.total_employer_cost || 0,
      runId
    )
    .run();

  return c.json({
    message: 'Data input presensi, lembur, cuti, dan kasbon berhasil ditarik dan dihitung.',
    employeeCount: empList.length,
    exceptionCount,
    totals,
  });
});

// 4. Step 3: Get Exceptions & Resolve Exception
payrollRoutes.get('/runs/:id/exceptions', async (c) => {
  const runId = c.req.param('id');
  const exceptions = await c.env.DB.prepare(
    `SELECT pe.*, e.nik, e.full_name
     FROM payroll_exceptions pe
     LEFT JOIN employees e ON pe.employee_id = e.id
     WHERE pe.payroll_run_id = ?
     ORDER BY pe.severity DESC, pe.created_at ASC`
  )
    .bind(runId)
    .all<any>();

  return c.json({ exceptions: exceptions.results || [] });
});

payrollRoutes.post('/runs/:id/exceptions/:excId/resolve', requireRole(['owner_admin']), async (c) => {
  const excId = c.req.param('excId');
  const user = c.get('user');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const RESOLUTION_CODES = [
    'attendance_completed',
    'approved_leave',
    'overtime_approved',
    'salary_adjusted',
    'accepted_as_is',
    'alpha',
    'other',
  ];

  const code = typeof body.resolution_code === 'string' ? body.resolution_code : null;
  if (code && !RESOLUTION_CODES.includes(code)) {
    return c.json({ error: 'Kode penyelesaian tidak valid' }, 400);
  }

  const note = typeof body.resolution_note === 'string' && body.resolution_note.trim()
    ? body.resolution_note.trim().slice(0, 500)
    : null;

  const exception = await c.env.DB.prepare(
    `SELECT id, payroll_run_id, employee_id, exception_type, exception_date FROM payroll_exceptions WHERE id = ?`
  )
    .bind(excId)
    .first<any>();
  if (!exception) return c.json({ error: 'Pengecualian tidak ditemukan' }, 404);

  await c.env.DB.prepare(
    `UPDATE payroll_exceptions SET
       resolved = 1,
       resolved_by = ?,
       resolved_at = CURRENT_TIMESTAMP,
       resolution_code = ?,
       resolution_note = ?
     WHERE id = ?`
  )
    .bind(user.userId, code, note, excId)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'RESOLVE_PAYROLL_EXCEPTION', 'payroll_exceptions', ?, ?)`
  )
    .bind(makeId('aud'), user.userId, excId, JSON.stringify({ resolution_code: code, resolution_note: note }))
    .run();

  return c.json({ message: 'Pengecualian berhasil diselesaikan (Resolved).' });
});

// Bulk-resolve several missing-day exceptions for ONE employee.
// Deliberately scoped to a single employee so a bulk action can never sweep
// unrelated people's attendance into one decision.
payrollRoutes.post('/runs/:id/exceptions/bulk-resolve', requireRole(['owner_admin']), async (c) => {
  const runId = c.req.param('id');
  const user = c.get('user');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const RESOLUTION_CODES = [
    'attendance_completed',
    'approved_leave',
    'overtime_approved',
    'salary_adjusted',
    'accepted_as_is',
    'alpha',
    'other',
  ];

  const code = typeof body.resolution_code === 'string' ? body.resolution_code : null;
  if (code && !RESOLUTION_CODES.includes(code)) {
    return c.json({ error: 'Kode penyelesaian tidak valid' }, 400);
  }

  const employeeId = typeof body.employee_id === 'string' ? body.employee_id.trim() : '';
  if (!employeeId) {
    return c.json({ error: 'employee_id wajib diisi untuk penyelesaian massal' }, 400);
  }

  const exceptionIds: string[] = Array.isArray(body.exception_ids)
    ? body.exception_ids.filter((id: unknown) => typeof id === 'string' && id)
    : [];
  if (exceptionIds.length === 0) {
    return c.json({ error: 'Pilih minimal satu tanggal untuk diselesaikan' }, 400);
  }
  if (exceptionIds.length > 200) {
    return c.json({ error: 'Maksimal 200 pengecualian per penyelesaian massal' }, 400);
  }

  const note = typeof body.resolution_note === 'string' && body.resolution_note.trim()
    ? body.resolution_note.trim().slice(0, 500)
    : null;

  const run = await c.env.DB.prepare(`SELECT id, status FROM payroll_runs WHERE id = ?`)
    .bind(runId)
    .first<any>();
  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);
  if (run.status === 'locked' || run.status === 'paid') {
    return c.json({ error: 'Payroll run yang sudah dikunci atau dibayar tidak dapat diubah' }, 400);
  }

  // Verify every id belongs to this run AND this employee before touching anything.
  const placeholders = exceptionIds.map(() => '?').join(', ');
  const owned = await c.env.DB.prepare(
    `SELECT id FROM payroll_exceptions
     WHERE payroll_run_id = ? AND employee_id = ? AND id IN (${placeholders})`
  )
    .bind(runId, employeeId, ...exceptionIds)
    .all<any>();

  const ownedIds = (owned.results || []).map((row: any) => row.id);
  if (ownedIds.length !== exceptionIds.length) {
    return c.json(
      { error: 'Sebagian pengecualian bukan milik karyawan atau payroll run ini' },
      403
    );
  }

  const updatePlaceholders = ownedIds.map(() => '?').join(', ');
  await c.env.DB.prepare(
    `UPDATE payroll_exceptions SET
       resolved = 1,
       resolved_by = ?,
       resolved_at = CURRENT_TIMESTAMP,
       resolution_code = ?,
       resolution_note = ?
     WHERE payroll_run_id = ? AND employee_id = ? AND id IN (${updatePlaceholders})`
  )
    .bind(user.userId, code, note, runId, employeeId, ...ownedIds)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'BULK_RESOLVE_PAYROLL_EXCEPTIONS', 'payroll_runs', ?, ?)`
  )
    .bind(
      makeId('aud'),
      user.userId,
      runId,
      JSON.stringify({
        employee_id: employeeId,
        count: ownedIds.length,
        resolution_code: code,
        resolution_note: note,
      })
    )
    .run();

  return c.json({
    message: `${ownedIds.length} pengecualian berhasil diselesaikan.`,
    resolvedCount: ownedIds.length,
  });
});

// 5. Step 4: Adjust one-off item with reason (Review per employee)
payrollRoutes.post('/runs/:id/adjust-item', requireRole(['owner_admin']), async (c) => {
  const runId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();
  const {
    item_id,
    attendance_bonus,
    commission_bonus,
    other_deductions,
    other_deductions_reason,
    pay_full_month,
  } = body;

  const run = await c.env.DB.prepare(`SELECT status FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();
  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);
  if (run.status === 'locked' || run.status === 'paid') {
    return c.json({ error: 'Payroll run sudah dikunci' }, 400);
  }

  const item = await c.env.DB.prepare(`SELECT * FROM payroll_items WHERE id = ? AND payroll_run_id = ?`)
    .bind(item_id, runId)
    .first<any>();

  if (!item) return c.json({ error: 'Item payroll tidak ditemukan' }, 404);

  const attBonus = attendance_bonus !== undefined ? parseFloat(attendance_bonus) : Number(item.attendance_bonus || 0);
  const commBonus = commission_bonus !== undefined ? parseFloat(commission_bonus) : Number(item.commission_bonus || 0);
  const otherDed = other_deductions !== undefined ? parseFloat(other_deductions) : Number(item.other_deductions || 0);

  let newProratedSalary = Number(item.prorated_salary || 0);
  if (typeof pay_full_month === 'boolean') {
    const base = Number(item.base_salary || 0);
    const expected = Number(item.expected_working_days) > 0 ? Number(item.expected_working_days) : 21;
    const worked = Math.min(Number(item.days_worked || 0), expected);
    if (pay_full_month) {
      newProratedSalary = base;
    } else {
      newProratedSalary = worked < expected ? Math.round((base / expected) * worked) : base;
    }
  }

  const newGross =
    newProratedSalary +
    Number(item.fixed_allowance || 0) +
    Number(item.overtime_pay || 0) +
    attBonus +
    commBonus +
    Number(item.thr_amount || 0);

  let newPph21 = Number(item.pph21_amount || 0);
  if (typeof pay_full_month === 'boolean' && item.pph21_method === 'TER') {
    const settingsRow = await c.env.DB.prepare(`SELECT ter_rules_json FROM payroll_settings LIMIT 1`).first<any>();
    if (settingsRow?.ter_rules_json) {
      newPph21 = calculateTerPPh21(newGross, item.ptkp_status, settingsRow.ter_rules_json).taxAmount;
    }
  }

  const newTotalDeductions =
    Number(item.late_deduction || 0) +
    Number(item.unpaid_leave_deduction || 0) +
    Number(item.kasbon_deduction || 0) +
    otherDed +
    Number(item.bpjs_kes_employee || 0) +
    Number(item.bpjs_jht_employee || 0) +
    Number(item.bpjs_jp_employee || 0) +
    newPph21;
  const newTakeHome = newGross - newTotalDeductions + Number(item.reimbursement_amount || 0);

  await c.env.DB.prepare(
    `UPDATE payroll_items SET
      prorated_salary = ?,
      attendance_bonus = ?,
      commission_bonus = ?,
      other_deductions = ?,
      other_deductions_reason = ?,
      pph21_amount = ?,
      gross_earnings = ?,
      total_deductions = ?,
      take_home_pay = ?
     WHERE id = ?`
  )
    .bind(
      newProratedSalary,
      attBonus,
      commBonus,
      otherDed,
      other_deductions_reason ?? item.other_deductions_reason,
      newPph21,
      newGross,
      newTotalDeductions,
      newTakeHome,
      item_id
    )
    .run();

  const runTotals = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(gross_earnings), 0) AS total_gross,
            COALESCE(SUM(total_deductions), 0) AS total_deductions,
            COALESCE(SUM(take_home_pay), 0) AS total_take_home
     FROM payroll_items WHERE payroll_run_id = ?`
  )
    .bind(runId)
    .first<any>();

  await c.env.DB.prepare(
    `UPDATE payroll_runs SET total_gross = ?, total_deductions = ?, total_take_home = ? WHERE id = ?`
  )
    .bind(
      runTotals?.total_gross || 0,
      runTotals?.total_deductions || 0,
      runTotals?.total_take_home || 0,
      runId
    )
    .run();

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'ADJUST_PAYROLL_ITEM', 'payroll_items', ?, ?)`
  )
    .bind(
      makeId('aud'),
      user.userId,
      item_id,
      JSON.stringify({
        pay_full_month,
        prorated_salary: newProratedSalary,
        attBonus,
        commBonus,
        otherDed,
        reason: other_deductions_reason,
      })
    )
    .run();

  return c.json({ message: 'Penyesuaian item payroll berhasil disimpan.' });
});

// 6. Step 5: Lock Run (A locked run NEVER changes. Mistakes are fixed in the following run)
payrollRoutes.post('/runs/:id/lock', requireRole(['owner_admin']), async (c) => {
  const runId = c.req.param('id');
  const user = c.get('user');

  const run = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();
  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);
  if (run.status === 'locked' || run.status === 'paid') {
    return c.json({ error: 'Payroll run sudah dikunci sebelumnya' }, 400);
  }

  // Check unresolved blocker exceptions
  const blocker = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM payroll_exceptions WHERE payroll_run_id = ? AND severity = 'blocker' AND resolved = 0`
  )
    .bind(runId)
    .first<any>();

  if (blocker && blocker.count > 0) {
    return c.json({
      error: `Tidak dapat mengunci payroll: Terdapat ${blocker.count} pengecualian kritis (blocker) yang belum diselesaikan.`,
    }, 400);
  }

  // Lock items and run
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE payroll_items SET is_locked = 1 WHERE payroll_run_id = ?`).bind(runId),
    c.env.DB.prepare(
      `UPDATE payroll_runs SET status = 'locked', locked_by = ?, locked_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(user.userId, runId),
  ]);

  // Deduct remaining balance from active kasbon
  const items = await c.env.DB.prepare(
    `SELECT employee_id, kasbon_deduction FROM payroll_items WHERE payroll_run_id = ? AND kasbon_deduction > 0`
  )
    .bind(runId)
    .all<any>();

  for (const it of items.results || []) {
    const ksb = await c.env.DB.prepare(
      `SELECT id, remaining_amount FROM kasbon WHERE employee_id = ? AND status = 'approved' AND remaining_amount > 0 LIMIT 1`
    )
      .bind(it.employee_id)
      .first<any>();

    if (ksb) {
      const newRemain = Math.max(0, ksb.remaining_amount - it.kasbon_deduction);
      await c.env.DB.prepare(
        `UPDATE kasbon SET remaining_amount = ?, status = ? WHERE id = ?`
      )
        .bind(newRemain, newRemain === 0 ? 'paid_off' : 'approved', ksb.id)
        .run();
    }
  }

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'LOCK_PAYROLL_RUN', 'payroll_runs', ?, ?)`
  )
    .bind(makeId('aud'), user.userId, runId, JSON.stringify({ locked_at: new Date().toISOString() }))
    .run();

  return c.json({ message: 'Payroll run berhasil dikunci secara permanen. Finance sekarang dapat memproses pembayaran.' });
});

// 7. Finance Pays & Sends Payslip Ready Notifications
payrollRoutes.post('/runs/:id/pay', requireRole(['owner_admin', 'finance']), async (c) => {
  const runId = c.req.param('id');
  const user = c.get('user');

  const run = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();
  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);
  if (run.status !== 'locked') {
    return c.json({ error: 'Payroll run harus dikunci terlebih dahulu sebelum dibayar' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE payroll_runs SET status = 'paid', paid_by = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(user.userId, runId)
    .run();

  // Mark reimbursements attached to this run as paid so they can never be reimbursed twice
  await c.env.DB.prepare(
    `UPDATE reimbursements SET status = 'paid'
     WHERE payroll_run_id = ? AND status = 'approved'`
  )
    .bind(runId)
    .run();

  // Send payslip notification to all employees
  const items = await c.env.DB.prepare(
    `SELECT pi.*, e.personal_email, e.company_email
     FROM payroll_items pi
     JOIN employees e ON pi.employee_id = e.id
     WHERE pi.payroll_run_id = ?`
  )
    .bind(runId)
    .all<any>();

  const companyRecord = await c.env.DB.prepare(
    `SELECT name, legal_name, custom_domain FROM companies LIMIT 1`
  ).first<any>();
  const appUrl = companyRecord?.custom_domain
    ? (companyRecord.custom_domain.startsWith('http') ? companyRecord.custom_domain : `https://${companyRecord.custom_domain}`)
    : (c.env.APP_URL || 'http://localhost:8787');
  const companyName = companyRecord?.legal_name || companyRecord?.name || 'Finance & Payroll';

  const payslipRecipients = (items.results || []).filter((it: any) => it.company_email || it.personal_email);

  // Fire-and-forget: send in small batches so we stay under the Workers
  // concurrent outbound socket limit while the response returns immediately.
  runInBackground(c, (async () => {
    const batchSize = 4;
    for (let i = 0; i < payslipRecipients.length; i += batchSize) {
      await Promise.all(
        payslipRecipients.slice(i, i + batchSize).map((it: any) => {
          const emailContent = getPayslipReadyEmail({
            employeeName: it.employee_name,
            periodTitle: run.title,
            takeHomePayFormatted: `Rp ${it.take_home_pay.toLocaleString('id-ID')}`,
            appUrl,
            companyName,
          });

          return sendEmail(c.env, {
            to: it.company_email || it.personal_email,
            subject: `Slip gaji ${run.title} tersedia (Payslip ready)`,
            text: emailContent.text,
            html: emailContent.html,
            type: 'payslip_ready',
          });
        })
      );
    }
  })());

  return c.json({ message: 'Pembayaran payroll telah dikonfirmasi dan notifikasi slip gaji sedang dikirim.' });
});

// 8. Step 6: Outputs - Payroll Recap Table
payrollRoutes.get('/runs/:id/recap', async (c) => {
  const runId = c.req.param('id');
  const user = c.get('user');

  if (user.role === 'employee' || user.role === 'manager') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const run = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();
  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);

  const items = await c.env.DB.prepare(
    `SELECT * FROM payroll_items WHERE payroll_run_id = ? ORDER BY employee_nik ASC`
  )
    .bind(runId)
    .all<any>();

  return c.json({ run, items: items.results || [] });
});

// 9. Step 6: Bank Transfer File (BCA KlikBCA Bisnis & Mandiri MCM Formats)
payrollRoutes.get('/runs/:id/bank-file', requireRole(['owner_admin', 'finance']), async (c) => {
  const runId = c.req.param('id');
  const format = c.req.query('format') || 'BCA'; // BCA | MANDIRI

  const run = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).bind(runId).first<any>();
  if (!run) return c.json({ error: 'Payroll run tidak ditemukan' }, 404);

  const items = await c.env.DB.prepare(
    `SELECT employee_nik, employee_name, bank_name, bank_account_number, take_home_pay
     FROM payroll_items WHERE payroll_run_id = ? ORDER BY employee_nik ASC`
  )
    .bind(runId)
    .all<any>();

  const list = items.results || [];
  let fileContent = '';
  let filename = '';

  if (format.toUpperCase() === 'MANDIRI') {
    // Mandiri MCM Format: Account Number,Beneficiary Name,Amount,Currency,Remark
    filename = `Mandiri_Payroll_${run.period_end.replace(/-/g, '')}.csv`;
    const lines = [
      'Account Number,Beneficiary Name,Amount,Currency,Remark',
      ...list.map(
        (it: any) =>
          `"${it.bank_account_number}","${it.employee_name}",${it.take_home_pay},"IDR","Gaji ${run.title}"`
      ),
    ];
    fileContent = lines.join('\r\n');
    c.header('Content-Type', 'text/csv');
  } else {
    // BCA KlikBCA Bisnis Format: Bank,Account,Beneficiary Name,Amount,Remark
    filename = `BCA_Payroll_${run.period_end.replace(/-/g, '')}.csv`;
    const lines = [
      'Bank,Account Number,Beneficiary Name,Amount,Remark',
      ...list.map(
        (it: any) =>
          `"${it.bank_name || 'BCA'}","${it.bank_account_number}","${it.employee_name}",${it.take_home_pay},"Gaji ${run.title}"`
      ),
    ];
    fileContent = lines.join('\r\n');
    c.header('Content-Type', 'text/csv');
  }

  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.text(fileContent);
});

// 10. Acceptance Criteria 5: Payslip Detail (Strict Isolation: Employee can only open their own payslip!)
payrollRoutes.get('/items/:id/payslip', async (c) => {
  const user = c.get('user');
  const itemId = c.req.param('id');

  const item = await c.env.DB.prepare(
    `SELECT pi.*, pr.title as run_title, pr.period_start, pr.period_end, pr.payment_date, pr.status as run_status,
            COALESCE(NULLIF(c.legal_name, ''), c.name) as company_name,
            c.address as company_address, c.npwp as company_npwp,
            m.nik as approver_nik, m.full_name as approver_name, m.job_title as approver_title
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     JOIN companies c ON pr.tenant_id = c.tenant_id
     LEFT JOIN employees e ON pi.employee_id = e.id
     LEFT JOIN employees m ON e.manager_id = m.id
     WHERE pi.id = ?`
  )
    .bind(itemId)
    .first<any>();

  if (!item) {
    return c.json({ error: 'Slip gaji tidak ditemukan' }, 404);
  }

  // Strict AC5 Check:
  // If user is employee, verify employeeId matches item.employee_id
  if (user.role === 'employee' && user.employeeId !== item.employee_id) {
    return c.json({ error: 'Forbidden: Anda tidak memiliki akses ke slip gaji karyawan lain' }, 403);
  }

  // Authorization is the employee's direct manager: a line employee's payslip is
  // authorized by their manager, and a manager's own payslip by the director above
  // them. Only when there is no manager at all does the company sign.
  const approverName = item.approver_name || item.company_name || 'HR / Finance';
  const approverTitle = item.approver_name ? item.approver_title || null : null;

  // Detail the alpha deduction so the payslip shows unit rate and exact dates,
  // not just a lump "n hari" total.
  const alphaDates: string[] = [];
  if (Number(item.alpha_days) > 0) {
    const rows = await c.env.DB.prepare(
      `SELECT exception_date FROM payroll_exceptions
       WHERE payroll_run_id = ? AND employee_id = ?
         AND exception_type = 'missing_attendance'
         AND resolved = 0 AND exception_date IS NOT NULL
       ORDER BY exception_date`
    )
      .bind(item.payroll_run_id, item.employee_id)
      .all<any>();
    for (const row of rows.results || []) alphaDates.push(String(row.exception_date));
  }

  const dailyRate =
    Number(item.expected_working_days) > 0
      ? Math.round(Number(item.base_salary) / Number(item.expected_working_days))
      : 0;

  // Exact (unrounded) daily rate so the payslip can show the precise formula
  // base ÷ working days × absences without a rounding mismatch versus the total.
  const dailyRateExact =
    Number(item.expected_working_days) > 0
      ? Number(item.base_salary) / Number(item.expected_working_days)
      : 0;

  return c.json({
    payslip: {
      ...item,
      approver_name: approverName,
      approver_title: approverTitle,
      authorized_by_company: !item.approver_name,
      alpha_dates: alphaDates,
      alpha_daily_rate: dailyRate,
      alpha_daily_rate_exact: Math.round(dailyRateExact * 100) / 100,
    },
  });
});

// 11. Employee Self-Service: My Payslips List
payrollRoutes.get('/my-payslips', async (c) => {
  const user = c.get('user');
  if (!user.employeeId) {
    return c.json({ error: 'User tidak terhubung ke karyawan' }, 400);
  }

  const items = await c.env.DB.prepare(
    `SELECT pi.id, pi.payroll_run_id, pi.take_home_pay, pi.gross_earnings, pi.total_deductions,
            pr.title as period_title, pr.period_start, pr.period_end, pr.payment_date, pr.status as run_status
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     WHERE pi.employee_id = ? AND pr.status IN ('locked', 'paid')
     ORDER BY pr.period_end DESC`
  )
    .bind(user.employeeId)
    .all<any>();

  return c.json({ payslips: items.results || [] });
});

// 12. Annual 1721-A1 Tax Withholding Summary (Bukti Potong Pajak)
payrollRoutes.get('/tax-slips', async (c) => {
  const user = c.get('user');
  const year = String(c.req.query('year') || new Date().getFullYear());
  const requestedEmpId = c.req.query('employee_id');

  const isPrivileged = user.role === 'owner_admin' || user.role === 'manager';
  const targetEmpId = isPrivileged ? requestedEmpId : user.employeeId;

  if (!isPrivileged && !targetEmpId) {
    return c.json({ error: 'User tidak terhubung ke karyawan' }, 400);
  }

  let sql = `
    SELECT e.id as employee_id, e.nik, e.full_name, e.job_title, e.npwp as employee_npwp, e.ptkp_status,
           COALESCE(te.name, c.legal_name, c.name) as company_name,
           COALESCE(te.npwp, c.npwp) as company_npwp,
           COALESCE(te.address, c.address) as company_address,
           COUNT(DISTINCT pr.id) as months_count,
           COALESCE(SUM(pi.base_salary + pi.fixed_allowance), 0) as total_base_salary,
           COALESCE(SUM(pi.overtime_pay + pi.attendance_bonus + pi.commission_bonus), 0) as total_overtime,
           COALESCE(SUM(pi.thr_amount), 0) as total_thr,
           COALESCE(SUM(pi.leave_allowance_amount), 0) as total_leave_allowance,
           COALESCE(SUM(pi.gross_earnings), 0) as total_gross,
           COALESCE(SUM(pi.bpjs_jht_employee + pi.bpjs_jp_employee), 0) as total_bpjs_tk_employee,
           COALESCE(SUM(pi.bpjs_kes_employee), 0) as total_bpjs_kes_employee,
           COALESCE(SUM(pi.pph21_amount), 0) as total_pph21,
           COALESCE(SUM(pi.take_home_pay), 0) as total_take_home_pay
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    JOIN employees e ON pi.employee_id = e.id
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN company_tax_entities te ON b.tax_entity_id = te.id
    LEFT JOIN companies c ON c.tenant_id = 'default'
    WHERE pr.status IN ('locked', 'paid')
      AND substr(pr.period_end, 1, 4) = ?
  `;
  const params: any[] = [year];
  if (targetEmpId) {
    sql += ` AND pi.employee_id = ?`;
    params.push(targetEmpId);
  }
  sql += ` GROUP BY e.id ORDER BY e.full_name ASC`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>();
  const slips = (rows.results || []).map((r: any) => ({ ...r, year }));
  return c.json({ year, slips });
});

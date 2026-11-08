import { Hono } from 'hono';
import { Bindings, PayrollSettingsModel } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { calculateEmployeePayroll } from '../services/payroll-calc';
import { getPayslipReadyEmail, sendEmail } from '../services/smtp';

export const payrollRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

payrollRoutes.use('*', authMiddleware);

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
       AND e.join_date <= ?`
  )
    .bind(run.period_start, run.period_end)
    .all<any>();

  const empList = employees.results || [];

  // Clear existing items and exceptions for this run before re-pulling
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM payroll_items WHERE payroll_run_id = ?`).bind(runId),
    c.env.DB.prepare(`DELETE FROM payroll_exceptions WHERE payroll_run_id = ?`).bind(runId),
  ]);

  let exceptionCount = 0;

  for (const emp of empList) {
    // 1. Attendance Summary
    const attRows = await c.env.DB.prepare(
      `SELECT status, late_minutes, actual_work_minutes FROM attendance
       WHERE employee_id = ? AND date BETWEEN ? AND ?`
    )
      .bind(emp.id, run.period_start, run.period_end)
      .all<any>();

    const attList = attRows.results || [];
    const daysWorked = attList.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'early_leave').length;
    const lateMinutesTotal = attList.reduce((acc, a) => acc + (a.late_minutes || 0), 0);
    const unapprovedAbsenceDays = attList.filter((a) => a.status === 'absent').length;

    // Check missing attendance (e.g. 0 records for an active employee)
    if (attList.length === 0) {
      await c.env.DB.prepare(
        `INSERT INTO payroll_exceptions (id, tenant_id, payroll_run_id, employee_id, exception_type, severity, description)
         VALUES (?, 'default', ?, ?, 'missing_attendance', 'warning', ?)`
      )
        .bind(
          `exc-${Date.now()}-${emp.id}`,
          runId,
          emp.id,
          `Tidak ada log presensi untuk ${emp.full_name} pada periode ${run.period_start} s/d ${run.period_end}`
        )
        .run();
      exceptionCount++;
    }

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

    // 4. Approved Reimbursements
    const reimbRows = await c.env.DB.prepare(
      `SELECT amount FROM reimbursements
       WHERE employee_id = ? AND status = 'approved' AND payment_method = 'payroll'`
    )
      .bind(emp.id)
      .all<any>();

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

    // 6. Check new joiner or leaver in period (mid-month)
    const isNewJoiner = emp.join_date > run.period_start && emp.join_date <= run.period_end;
    const isLeaver = emp.last_working_date && emp.last_working_date >= run.period_start && emp.last_working_date < run.period_end;

    // Expected working days in a standard month is ~21-22
    const expectedWorkingDays = 21;

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
        days_worked: daysWorked > 0 ? daysWorked : (isNewJoiner || isLeaver ? 15 : expectedWorkingDays),
        expected_working_days: expectedWorkingDays,
        late_minutes: lateMinutesTotal,
        unapproved_absence_days: unapprovedAbsenceDays,
        overtime_weekday_hours: otWeekdayHours,
        overtime_holiday_hours: otHolidayHours,
        kasbon_deduction: kasbonDeduction,
        reimbursement_amount: reimbTotal,
        is_new_joiner_mid_month: isNewJoiner,
        is_leaver_mid_month: isLeaver,
      },
      settings
    );

    const itemId = `pitem-${runId}-${emp.id}`;
    await c.env.DB.prepare(
      `INSERT INTO payroll_items (
        id, tenant_id, payroll_run_id, employee_id,
        employee_nik, employee_name, job_title, department_name, ptkp_status, bank_name, bank_account_number,
        base_salary, fixed_allowance, prorated_salary, days_worked, expected_working_days,
        overtime_hours, overtime_pay, attendance_bonus, commission_bonus, reimbursement_amount,
        gross_earnings, late_deduction, unpaid_leave_deduction, kasbon_deduction, other_deductions,
        bpjs_kes_employee, bpjs_jht_employee, bpjs_jp_employee, pph21_amount, pph21_method,
        total_deductions, take_home_pay,
        bpjs_kes_employer, bpjs_jht_employer, bpjs_jp_employer, bpjs_jkk_employer, bpjs_jkm_employer,
        total_employer_cost
      ) VALUES (
        ?, 'default', ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
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
        calc.gross_earnings,
        calc.late_deduction,
        calc.unpaid_leave_deduction,
        calc.kasbon_deduction,
        calc.other_deductions,
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

  await c.env.DB.prepare(
    `UPDATE payroll_exceptions SET resolved = 1, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(user.userId, excId)
    .run();

  return c.json({ message: 'Pengecualian berhasil diselesaikan (Resolved).' });
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

  const attBonus = attendance_bonus !== undefined ? parseFloat(attendance_bonus) : item.attendance_bonus;
  const commBonus = commission_bonus !== undefined ? parseFloat(commission_bonus) : item.commission_bonus;
  const otherDed = other_deductions !== undefined ? parseFloat(other_deductions) : item.other_deductions;

  const newGross = item.prorated_salary + item.fixed_allowance + item.overtime_pay + attBonus + commBonus + item.reimbursement_amount;
  const newTotalDeductions = item.late_deduction + item.unpaid_leave_deduction + item.kasbon_deduction + otherDed + item.bpjs_kes_employee + item.bpjs_jht_employee + item.bpjs_jp_employee + item.pph21_amount;
  const newTakeHome = newGross - newTotalDeductions;

  await c.env.DB.prepare(
    `UPDATE payroll_items SET
      attendance_bonus = ?,
      commission_bonus = ?,
      other_deductions = ?,
      other_deductions_reason = ?,
      gross_earnings = ?,
      total_deductions = ?,
      take_home_pay = ?
     WHERE id = ?`
  )
    .bind(
      attBonus,
      commBonus,
      otherDed,
      other_deductions_reason || item.other_deductions_reason,
      newGross,
      newTotalDeductions,
      newTakeHome,
      item_id
    )
    .run();

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'ADJUST_PAYROLL_ITEM', 'payroll_items', ?, ?)`
  )
    .bind(
      `aud-${Date.now()}`,
      user.userId,
      item_id,
      JSON.stringify({ attBonus, commBonus, otherDed, reason: other_deductions_reason })
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
    .bind(`aud-${Date.now()}`, user.userId, runId, JSON.stringify({ locked_at: new Date().toISOString() }))
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

  // Send payslip notification to all employees
  const items = await c.env.DB.prepare(
    `SELECT pi.*, e.personal_email, e.company_email
     FROM payroll_items pi
     JOIN employees e ON pi.employee_id = e.id
     WHERE pi.payroll_run_id = ?`
  )
    .bind(runId)
    .all<any>();

  const appUrl = c.env.APP_URL || 'http://localhost:8787';

  for (const it of items.results || []) {
    const toEmail = it.company_email || it.personal_email;
    if (toEmail) {
      const emailContent = getPayslipReadyEmail({
        employeeName: it.employee_name,
        periodTitle: run.title,
        takeHomePayFormatted: `Rp ${it.take_home_pay.toLocaleString('id-ID')}`,
        appUrl,
      });

      await sendEmail(c.env, {
        to: toEmail,
        subject: `Slip Gaji ${run.title} Telah Diterbitkan`,
        text: emailContent.text,
        html: emailContent.html,
        type: 'payslip_ready',
      });
    }
  }

  return c.json({ message: 'Pembayaran payroll telah dikonfirmasi dan notifikasi slip gaji telah dikirim.' });
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
            c.name as company_name, c.address as company_address, c.npwp as company_npwp
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     JOIN companies c ON pr.tenant_id = c.tenant_id
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

  return c.json({ payslip: item });
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

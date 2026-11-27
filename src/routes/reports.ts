import { Hono } from 'hono';
import * as XLSX from 'xlsx';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { getZonedMonthString } from '../utils/date';

export const reportRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

reportRoutes.use('*', authMiddleware);

// 1. Attendance Recap Report (Monthly per employee and department)
reportRoutes.get('/attendance-recap', async (c) => {
  const month = c.req.query('month') || getZonedMonthString(); // YYYY-MM
  const exportFormat = c.req.query('export'); // 'excel'

  const rows = await c.env.DB.prepare(
    `SELECT e.nik, e.full_name, d.name as department_name, b.name as branch_name,
            COUNT(CASE WHEN a.status IN ('present', 'late', 'early_leave') THEN 1 END) as days_present,
            COUNT(CASE WHEN a.status = 'late' THEN 1 END) as days_late,
            SUM(COALESCE(a.late_minutes, 0)) as total_late_minutes,
            COUNT(CASE WHEN a.status = 'on_leave' THEN 1 END) as days_leave,
            COUNT(CASE WHEN a.status = 'sick' THEN 1 END) as days_sick,
            COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as days_absent
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN branches b ON e.branch_id = b.id
     LEFT JOIN attendance a ON e.id = a.employee_id AND a.date LIKE ?
     WHERE e.lifecycle_status IN ('active', 'probation', 'on_leave')
     GROUP BY e.id
     ORDER BY d.name ASC, e.nik ASC`
  )
    .bind(`${month}%`)
    .all<any>();

  const data = rows.results || [];

  if (exportFormat === 'excel') {
    const formattedData = data.map((r: any) => ({
      'NIK': r.nik,
      'Nama Karyawan': r.full_name,
      'Departemen': r.department_name || '-',
      'Cabang': r.branch_name || '-',
      'Hadir (Hari)': r.days_present || 0,
      'Terlambat (Hari)': r.days_late || 0,
      'Total Menit Terlambat': r.total_late_minutes || 0,
      'Cuti (Hari)': r.days_leave || 0,
      'Sakit (Hari)': r.days_sick || 0,
      'Alpha / Tanpa Keterangan': r.days_absent || 0,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formattedData);
    XLSX.utils.book_append_sheet(wb, ws, `Presensi ${month}`);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="Rekap_Presensi_${month}.xlsx"`);
    return c.body(new Uint8Array(buf));
  }

  return c.json({ month, records: data });
});

// 2. Payroll Recap Report (Earnings, deductions, employer cost, take-home)
reportRoutes.get('/payroll-recap', requireRole(['owner_admin', 'finance']), async (c) => {
  const runId = c.req.query('run_id');
  const exportFormat = c.req.query('export');

  let query = `
    SELECT pi.*, pr.title as run_title, pr.period_start, pr.period_end
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
  `;
  const params: any[] = [];
  if (runId) {
    query += ` WHERE pi.payroll_run_id = ?`;
    params.push(runId);
  }
  query += ` ORDER BY pr.period_end DESC, pi.employee_nik ASC`;

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();
  const list = rows.results || [];

  if (exportFormat === 'excel') {
    const formatted = list.map((it: any) => ({
      'Periode': it.run_title,
      'NIK': it.employee_nik,
      'Nama Karyawan': it.employee_name,
      'Departemen': it.department_name,
      'Jabatan': it.job_title,
      'PTKP': it.ptkp_status,
      'Gaji Pokok': it.base_salary,
      'Tunjangan Tetap': it.fixed_allowance,
      'Uang Lembur': it.overtime_pay,
      'Bonus': (it.attendance_bonus || 0) + (it.commission_bonus || 0),
      'Reimbursement': it.reimbursement_amount || 0,
      'Total Penghasilan Bruto': it.gross_earnings,
      'BPJS Kes Karyawan (1%)': it.bpjs_kes_employee,
      'BPJS JHT Karyawan (2%)': it.bpjs_jht_employee,
      'BPJS JP Karyawan (1%)': it.bpjs_jp_employee,
      'PPh 21': it.pph21_amount,
      'Potongan Kasbon': it.kasbon_deduction,
      'Potongan Lainnya': it.late_deduction + it.unpaid_leave_deduction + it.other_deductions,
      'Total Potongan': it.total_deductions,
      'Gaji Bersih (Take Home Pay)': it.take_home_pay,
      'Biaya BPJS Perusahaan': it.bpjs_kes_employer + it.bpjs_jht_employer + it.bpjs_jp_employer + it.bpjs_jkk_employer + it.bpjs_jkm_employer,
      'Total Beban Perusahaan': it.total_employer_cost,
      'Bank': it.bank_name,
      'Nomor Rekening': it.bank_account_number,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted);
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Penggajian');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="Rekap_Penggajian.xlsx"`);
    return c.body(new Uint8Array(buf));
  }

  return c.json({ records: list });
});

// 3. Headcount Report (Active, joined, resigned per period)
reportRoutes.get('/headcount', requireRole(['owner_admin', 'manager', 'finance']), async (c) => {
  const exportFormat = c.req.query('export');

  const activeRows = await c.env.DB.prepare(
    `SELECT e.*, d.name as department_name, b.name as branch_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN branches b ON e.branch_id = b.id
     ORDER BY e.join_date ASC`
  ).all<any>();

  const list = activeRows.results || [];
  const activeCount = list.filter((e) => e.lifecycle_status === 'active' || e.lifecycle_status === 'probation').length;
  const resignedCount = list.filter((e) => e.lifecycle_status === 'resigned' || e.lifecycle_status === 'terminated').length;
  const probationCount = list.filter((e) => e.lifecycle_status === 'probation').length;

  if (exportFormat === 'excel') {
    const formatted = list.map((e: any) => ({
      'NIK': e.nik,
      'Nama Karyawan': e.full_name,
      'Departemen': e.department_name,
      'Cabang': e.branch_name,
      'Jabatan': e.job_title,
      'Status Kerja': e.employment_status,
      'Status Siklus Hidup': e.lifecycle_status,
      'Tanggal Bergabung': e.join_date,
      'Akhir Kontrak': e.contract_end_date || '-',
      'Tanggal Keluar': e.last_working_date || e.resignation_date || '-',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted);
    XLSX.utils.book_append_sheet(wb, ws, 'Headcount');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', 'attachment; filename="Laporan_Headcount.xlsx"');
    return c.body(new Uint8Array(buf));
  }

  return c.json({
    summary: { total: list.length, active: activeCount, probation: probationCount, resigned: resignedCount },
    employees: list,
  });
});

// 4. BPJS & PPh 21 (Form 1721 Data Export)
reportRoutes.get('/bpjs-tax-export', requireRole(['owner_admin', 'finance']), async (c) => {
  const runId = c.req.query('run_id');
  const exportFormat = c.req.query('export');

  const rows = await c.env.DB.prepare(
    `SELECT pi.employee_nik, pi.employee_name, pi.ptkp_status, e.npwp_number, e.bpjs_kesehatan_number, e.bpjs_tk_number,
            pi.gross_earnings, pi.bpjs_kes_employee, pi.bpjs_kes_employer,
            pi.bpjs_jht_employee, pi.bpjs_jht_employer,
            pi.bpjs_jp_employee, pi.bpjs_jp_employer,
            pi.bpjs_jkk_employer, pi.bpjs_jkm_employer,
            pi.pph21_amount, pi.pph21_method, pr.title as run_title
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     JOIN employees e ON pi.employee_id = e.id
     ${runId ? 'WHERE pi.payroll_run_id = ?' : ''}
     ORDER BY pi.employee_nik ASC`
  )
    .bind(...(runId ? [runId] : []))
    .all<any>();

  const list = rows.results || [];

  if (exportFormat === 'excel') {
    const formatted = list.map((it: any) => ({
      'NIK': it.employee_nik,
      'Nama Karyawan': it.employee_name,
      'NPWP': it.npwp_number || '-',
      'PTKP': it.ptkp_status,
      'No. BPJS Kesehatan': it.bpjs_kesehatan_number || '-',
      'No. BPJS Ketenagakerjaan': it.bpjs_tk_number || '-',
      'Penghasilan Bruto': it.gross_earnings,
      'BPJS Kes - Pegawai (1%)': it.bpjs_kes_employee,
      'BPJS Kes - Perusahaan (4%)': it.bpjs_kes_employer,
      'BPJS JHT - Pegawai (2%)': it.bpjs_jht_employee,
      'BPJS JHT - Perusahaan (3.7%)': it.bpjs_jht_employer,
      'BPJS JP - Pegawai (1%)': it.bpjs_jp_employee,
      'BPJS JP - Perusahaan (2%)': it.bpjs_jp_employer,
      'BPJS JKK (Perusahaan)': it.bpjs_jkk_employer,
      'BPJS JKM (Perusahaan)': it.bpjs_jkm_employer,
      'PPh 21': it.pph21_amount,
      'Metode PPh 21': it.pph21_method,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Pajak & BPJS');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', 'attachment; filename="Export_BPJS_PPh21.xlsx"');
    return c.body(new Uint8Array(buf));
  }

  return c.json({ records: list });
});

// 5. Leave Balance Report Export
reportRoutes.get('/leave-balances', async (c) => {
  const exportFormat = c.req.query('export');

  const rows = await c.env.DB.prepare(
    `SELECT e.id as employee_id, e.nik, e.full_name, d.name as department_name, 
            lt.id as leave_type_id, lt.name as leave_type_name,
            lb.id as balance_id, lb.year, lb.total_entitled, lb.used_days, lb.remaining_days, lb.adjusted_days
     FROM leave_balances lb
     JOIN employees e ON lb.employee_id = e.id
     JOIN leave_types lt ON lb.leave_type_id = lt.id
     LEFT JOIN departments d ON e.department_id = d.id
     ORDER BY d.name ASC, e.nik ASC`
  ).all<any>();

  const list = rows.results || [];

  if (exportFormat === 'excel') {
    const formatted = list.map((it: any) => ({
      'NIK': it.nik,
      'Nama Karyawan': it.full_name,
      'Departemen': it.department_name,
      'Jenis Cuti': it.leave_type_name,
      'Tahun': it.year,
      'Hak Cuti': it.total_entitled,
      'Cuti Terpakai': it.used_days,
      'Sisa Cuti': it.remaining_days,
      'Penyesuaian': it.adjusted_days,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted);
    XLSX.utils.book_append_sheet(wb, ws, 'Sisa Cuti');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', 'attachment; filename="Laporan_Sisa_Cuti.xlsx"');
    return c.body(new Uint8Array(buf));
  }

  return c.json({ balances: list });
});

// 6b. PPh 21 annual recap / Bukti Potong 1721-A1 (per employee, per year)
reportRoutes.get('/pph21-1721a1', requireRole(['owner_admin', 'finance']), async (c) => {
  const year = c.req.query('year') || String(new Date().getFullYear());

  const rows = await c.env.DB.prepare(
    `SELECT pi.employee_nik as nik, pi.employee_name as full_name, pi.ptkp_status,
            COUNT(*) as months,
            COALESCE(SUM(pi.gross_earnings), 0) as gross,
            COALESCE(SUM(pi.bpjs_jht_employee + pi.bpjs_jp_employee), 0) as pension,
            COALESCE(SUM(pi.pph21_amount), 0) as tax
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     WHERE pr.period_end LIKE ?
       AND pr.status IN ('calculated', 'locked', 'paid')
       AND COALESCE(pr.run_type, 'monthly') = 'monthly'
     GROUP BY pi.employee_id
     ORDER BY pi.employee_nik`
  )
    .bind(`${year}%`)
    .all<any>();

  const ptkpMap: Record<string, number> = {
    'TK/0': 54000000,
    'TK/1': 58500000,
    'TK/2': 63000000,
    'TK/3': 67500000,
    'K/0': 58500000,
    'K/1': 63000000,
    'K/2': 67500000,
    'K/3': 72000000,
  };
  const roundDown = (value: number) => Math.floor(value / 1000) * 1000;

  const data = (rows.results || []).map((row: any) => {
    const gross = Number(row.gross) || 0;
    const pension = Number(row.pension) || 0;
    const biayaJabatan = Math.min(Math.round(gross * 0.05), 6000000);
    const neto = Math.max(0, gross - biayaJabatan - pension);
    const ptkp = ptkpMap[row.ptkp_status] || ptkpMap['TK/0'];
    const pkp = roundDown(Math.max(0, neto - ptkp));

    return {
      NIK: row.nik,
      'Nama Karyawan': row.full_name,
      'Status PTKP': row.ptkp_status,
      'Jumlah Bulan': row.months,
      'Penghasilan Bruto': gross,
      'Biaya Jabatan (5%, maks 6jt)': biayaJabatan,
      'Iuran Pensiun/JHT': pension,
      'Penghasilan Neto': neto,
      'PTKP (Setahun)': ptkp,
      'PKP (Pembulatan)': pkp,
      'PPh 21 Terpotong': Number(row.tax) || 0,
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 26 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `1721-A1 ${year}`);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="Bukti_Potong_1721A1_${year}.xlsx"`);
  return c.body(buf as any);
});

// 6c. BPJS Indonesia per-program contribution report (Kes / JHT / JP / JKK / JKM)
reportRoutes.get('/bpjs-programs', requireRole(['owner_admin', 'finance']), async (c) => {
  const month = c.req.query('month') || getZonedMonthString();

  const rows = await c.env.DB.prepare(
    `SELECT pi.employee_nik as nik, pi.employee_name as full_name,
            pi.bpjs_kes_employee, pi.bpjs_kes_employer,
            pi.bpjs_jht_employee, pi.bpjs_jht_employer,
            pi.bpjs_jp_employee, pi.bpjs_jp_employer,
            pi.bpjs_jkk_employer, pi.bpjs_jkm_employer
     FROM payroll_items pi
     JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
     WHERE pr.period_end LIKE ?
       AND pr.status IN ('calculated', 'locked', 'paid')
       AND COALESCE(pr.run_type, 'monthly') = 'monthly'
     ORDER BY pi.employee_nik`
  )
    .bind(`${month}%`)
    .all<any>();

  const list = rows.results || [];
  const programs = [
    { name: 'BPJS Kesehatan', employee: 'bpjs_kes_employee', employer: 'bpjs_kes_employer' },
    { name: 'JHT', employee: 'bpjs_jht_employee', employer: 'bpjs_jht_employer' },
    { name: 'JP', employee: 'bpjs_jp_employee', employer: 'bpjs_jp_employer' },
    { name: 'JKK', employee: null, employer: 'bpjs_jkk_employer' },
    { name: 'JKM', employee: null, employer: 'bpjs_jkm_employer' },
  ];

  const wb = XLSX.utils.book_new();
  for (const program of programs) {
    const sheetRows = list.map((row: any) => {
      const employeeShare = program.employee ? Number(row[program.employee]) || 0 : 0;
      const employerShare = Number(row[program.employer]) || 0;
      return {
        NIK: row.nik,
        'Nama Karyawan': row.full_name,
        'Iuran Karyawan': employeeShare,
        'Iuran Perusahaan': employerShare,
        Total: employeeShare + employerShare,
      };
    });
    const totalEmployee = sheetRows.reduce((sum, row) => sum + row['Iuran Karyawan'], 0);
    const totalEmployer = sheetRows.reduce((sum, row) => sum + row['Iuran Perusahaan'], 0);
    sheetRows.push({
      NIK: '',
      'Nama Karyawan': 'TOTAL',
      'Iuran Karyawan': totalEmployee,
      'Iuran Perusahaan': totalEmployer,
      Total: totalEmployee + totalEmployer,
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, program.name);
  }

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="Laporan_BPJS_${month}.xlsx"`);
  return c.body(buf as any);
});

// 7. Full Company Data Backup Export (JSON)
reportRoutes.get('/backup-data', requireRole(['owner_admin']), async (c) => {
  const companies = await c.env.DB.prepare(`SELECT * FROM companies`).all();
  const branches = await c.env.DB.prepare(`SELECT * FROM branches`).all();
  const departments = await c.env.DB.prepare(`SELECT * FROM departments`).all();
  const employees = await c.env.DB.prepare(`SELECT * FROM employees`).all();
  const attendance = await c.env.DB.prepare(`SELECT * FROM attendance`).all();
  const leave = await c.env.DB.prepare(`SELECT * FROM leave_requests`).all();
  const payrollRuns = await c.env.DB.prepare(`SELECT * FROM payroll_runs`).all();
  const payrollItems = await c.env.DB.prepare(`SELECT * FROM payroll_items`).all();
  const settings = await c.env.DB.prepare(`SELECT * FROM payroll_settings`).all();

  const backup = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    data: {
      companies: companies.results,
      branches: branches.results,
      departments: departments.results,
      employees: employees.results,
      attendance: attendance.results,
      leave: leave.results,
      payroll_runs: payrollRuns.results,
      payroll_items: payrollItems.results,
      payroll_settings: settings.results,
    },
  };

  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', `attachment; filename="openhr_backup_${new Date().toISOString().split('T')[0]}.json"`);
  return c.json(backup);
});

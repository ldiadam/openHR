import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';

export const settingsRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

settingsRoutes.use('*', authMiddleware);

// 1. Company Profile
settingsRoutes.get('/company', async (c) => {
  const comp = await c.env.DB.prepare(`SELECT * FROM companies LIMIT 1`).first<any>();
  return c.json({ company: comp });
});

settingsRoutes.put('/company', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const user = c.get('user');

  await c.env.DB.prepare(
    `UPDATE companies SET
      name = COALESCE(?, name),
      legal_name = COALESCE(?, legal_name),
      npwp = COALESCE(?, npwp),
      bpjs_kesehatan_code = COALESCE(?, bpjs_kesehatan_code),
      bpjs_tk_code = COALESCE(?, bpjs_tk_code),
      address = COALESCE(?, address),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = 'default'`
  )
    .bind(
      body.name,
      body.legal_name,
      body.npwp,
      body.bpjs_kesehatan_code,
      body.bpjs_tk_code,
      body.address,
      body.phone,
      body.email
    )
    .run();

  return c.json({ message: 'Profil perusahaan berhasil diperbarui' });
});

// 2. Branches (with geofence lat/lng, radius, and UMK)
settingsRoutes.get('/branches', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM branches ORDER BY name ASC`).all<any>();
  return c.json({ branches: rows.results || [] });
});

settingsRoutes.post('/branches', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { name, address, latitude, longitude, radius_meters, umk_amount, timezone } = body;

  if (!name) return c.json({ error: 'Nama cabang wajib diisi' }, 400);

  const id = `branch-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO branches (
      id, tenant_id, company_id, name, address, latitude, longitude, radius_meters, umk_amount, timezone
    ) VALUES (
      ?, 'default', 'comp-nusantara', ?, ?, ?, ?, ?, ?, ?
    )`
  )
    .bind(
      id,
      name,
      address || null,
      parseFloat(latitude) || -6.2088,
      parseFloat(longitude) || 106.8456,
      parseInt(radius_meters || '100', 10),
      parseFloat(umk_amount) || 5067381,
      timezone || 'Asia/Jakarta'
    )
    .run();

  return c.json({ message: 'Cabang berhasil ditambahkan', branchId: id });
});

settingsRoutes.put('/branches/:id', requireRole(['owner_admin']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  await c.env.DB.prepare(
    `UPDATE branches SET
      name = COALESCE(?, name),
      address = COALESCE(?, address),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      radius_meters = COALESCE(?, radius_meters),
      umk_amount = COALESCE(?, umk_amount),
      timezone = COALESCE(?, timezone),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.name,
      body.address,
      body.latitude !== undefined ? parseFloat(body.latitude) : null,
      body.longitude !== undefined ? parseFloat(body.longitude) : null,
      body.radius_meters !== undefined ? parseInt(body.radius_meters, 10) : null,
      body.umk_amount !== undefined ? parseFloat(body.umk_amount) : null,
      body.timezone,
      id
    )
    .run();

  return c.json({ message: 'Cabang berhasil diperbarui' });
});

settingsRoutes.delete('/branches/:id', requireRole(['owner_admin']), async (c) => {
  const id = c.req.param('id');

  // Prevent deleting the last remaining branch
  const countRes = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM branches`).first<any>();
  if ((countRes?.total || 0) <= 1) {
    return c.json({ error: 'Tidak dapat menghapus cabang terakhir. Sistem memerlukan minimal satu cabang aktif.' }, 400);
  }

  // Check if any employees are assigned to this branch
  const empCount = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM employees WHERE branch_id = ?`).bind(id).first<any>();
  if (empCount && empCount.count > 0) {
    return c.json({
      error: `Cabang tidak dapat dihapus karena masih digunakan oleh ${empCount.count} karyawan. Pindahkan karyawan ke cabang lain terlebih dahulu.`,
    }, 400);
  }

  await c.env.DB.prepare(`DELETE FROM branches WHERE id = ?`).bind(id).run();
  return c.json({ message: 'Cabang berhasil dihapus' });
});

// 3. Departments
settingsRoutes.get('/departments', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM departments ORDER BY name ASC`).all<any>();
  return c.json({ departments: rows.results || [] });
});

settingsRoutes.post('/departments', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { name, code } = body;
  if (!name) return c.json({ error: 'Nama departemen wajib diisi' }, 400);

  const id = `dept-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO departments (id, tenant_id, company_id, name, code)
     VALUES (?, 'default', 'comp-nusantara', ?, ?)`
  )
    .bind(id, name, code || null)
    .run();

  return c.json({ message: 'Departemen berhasil ditambahkan', departmentId: id });
});

// 5. Attendance Config (Selfie & GPS Settings)
settingsRoutes.get('/attendance', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT attendance_require_selfie, attendance_require_location FROM payroll_settings LIMIT 1`
  ).first<any>();
  return c.json({
    require_selfie: row ? row.attendance_require_selfie === 1 : false,
    require_location: row ? row.attendance_require_location === 1 : true,
  });
});

settingsRoutes.put('/attendance', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const requireSelfie = body.require_selfie ? 1 : 0;
  const requireLocation = body.require_location !== undefined ? (body.require_location ? 1 : 0) : 1;

  await c.env.DB.prepare(
    `UPDATE payroll_settings SET
      attendance_require_selfie = ?,
      attendance_require_location = ?,
      updated_at = CURRENT_TIMESTAMP`
  )
    .bind(requireSelfie, requireLocation)
    .run();

  return c.json({
    message: 'Pengaturan presensi berhasil disimpan',
    require_selfie: requireSelfie === 1,
    require_location: requireLocation === 1,
  });
});
settingsRoutes.get('/payroll', requireRole(['owner_admin', 'finance']), async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT * FROM payroll_settings ORDER BY effective_date DESC LIMIT 1`
  ).first<any>();

  return c.json({ settings: row });
});

settingsRoutes.put('/payroll', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const user = c.get('user');

  const old = await c.env.DB.prepare(`SELECT * FROM payroll_settings LIMIT 1`).first<any>();

  await c.env.DB.prepare(
    `UPDATE payroll_settings SET
      effective_date = COALESCE(?, effective_date),
      bpjs_kesehatan_employer_rate = COALESCE(?, bpjs_kesehatan_employer_rate),
      bpjs_kesehatan_employee_rate = COALESCE(?, bpjs_kesehatan_employee_rate),
      bpjs_kesehatan_wage_cap = COALESCE(?, bpjs_kesehatan_wage_cap),
      bpjs_tk_jht_employer_rate = COALESCE(?, bpjs_tk_jht_employer_rate),
      bpjs_tk_jht_employee_rate = COALESCE(?, bpjs_tk_jht_employee_rate),
      bpjs_tk_jp_employer_rate = COALESCE(?, bpjs_tk_jp_employer_rate),
      bpjs_tk_jp_employee_rate = COALESCE(?, bpjs_tk_jp_employee_rate),
      bpjs_tk_jp_wage_cap = COALESCE(?, bpjs_tk_jp_wage_cap),
      bpjs_tk_jkk_rate = COALESCE(?, bpjs_tk_jkk_rate),
      bpjs_tk_jkm_rate = COALESCE(?, bpjs_tk_jkm_rate),
      overtime_divider = COALESCE(?, overtime_divider),
      overtime_weekday_first_hour_mult = COALESCE(?, overtime_weekday_first_hour_mult),
      overtime_weekday_next_hour_mult = COALESCE(?, overtime_weekday_next_hour_mult),
      overtime_holiday_tier1_mult = COALESCE(?, overtime_holiday_tier1_mult),
      overtime_holiday_tier2_mult = COALESCE(?, overtime_holiday_tier2_mult),
      overtime_holiday_tier3_mult = COALESCE(?, overtime_holiday_tier3_mult),
      late_deduction_enabled = COALESCE(?, late_deduction_enabled),
      late_deduction_rate_per_minute = COALESCE(?, late_deduction_rate_per_minute),
      absence_deduction_enabled = COALESCE(?, absence_deduction_enabled),
      absence_deduction_type = COALESCE(?, absence_deduction_type),
      cuti_bersama_deducts_annual = COALESCE(?, cuti_bersama_deducts_annual),
      prorating_method = COALESCE(?, prorating_method),
      cutoff_day = COALESCE(?, cutoff_day),
      thr_payment_rule = COALESCE(?, thr_payment_rule),
      ter_rules_json = COALESCE(?, ter_rules_json),
      pasal17_rules_json = COALESCE(?, pasal17_rules_json),
      ptkp_rates_json = COALESCE(?, ptkp_rates_json),
      updated_by = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.effective_date,
      body.bpjs_kesehatan_employer_rate,
      body.bpjs_kesehatan_employee_rate,
      body.bpjs_kesehatan_wage_cap,
      body.bpjs_tk_jht_employer_rate,
      body.bpjs_tk_jht_employee_rate,
      body.bpjs_tk_jp_employer_rate,
      body.bpjs_tk_jp_employee_rate,
      body.bpjs_tk_jp_wage_cap,
      body.bpjs_tk_jkk_rate,
      body.bpjs_tk_jkm_rate,
      body.overtime_divider,
      body.overtime_weekday_first_hour_mult,
      body.overtime_weekday_next_hour_mult,
      body.overtime_holiday_tier1_mult,
      body.overtime_holiday_tier2_mult,
      body.overtime_holiday_tier3_mult,
      body.late_deduction_enabled,
      body.late_deduction_rate_per_minute,
      body.absence_deduction_enabled,
      body.absence_deduction_type,
      body.cuti_bersama_deducts_annual,
      body.prorating_method,
      body.cutoff_day,
      body.thr_payment_rule,
      body.ter_rules_json ? JSON.stringify(body.ter_rules_json) : null,
      body.pasal17_rules_json ? JSON.stringify(body.pasal17_rules_json) : null,
      body.ptkp_rates_json ? JSON.stringify(body.ptkp_rates_json) : null,
      user.userId,
      old.id
    )
    .run();

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values)
     VALUES (?, 'default', ?, 'UPDATE_PAYROLL_SETTINGS', 'payroll_settings', ?, ?, ?)`
  )
    .bind(`aud-${Date.now()}`, user.userId, old.id, JSON.stringify(old), JSON.stringify(body))
    .run();

  return c.json({ message: 'Konfigurasi payroll Indonesia berhasil diperbarui' });
});

// 5. Audit Logs
settingsRoutes.get('/audit-logs', requireRole(['owner_admin']), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.email as user_email
     FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC LIMIT 100`
  ).all<any>();

  return c.json({ logs: rows.results || [] });
});

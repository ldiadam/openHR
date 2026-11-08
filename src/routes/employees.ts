import { Hono } from 'hono';
import { Bindings, PTKPStatus } from '../types';
import {
  AuthContext,
  authMiddleware,
  hashPassword,
  requireRole,
  sanitizeEmployeeByRole,
} from '../middleware/auth';
import { createPurelymailUser } from '../services/purelymail';
import { getWelcomeInviteEmail, sendEmail } from '../services/smtp';
import { getFile, putFile } from '../services/storage';

export const employeeRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

employeeRoutes.use('*', authMiddleware);

// 1. List Employees (Filtered by role: Managers only see their team)
employeeRoutes.get('/', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT e.*, d.name as department_name, b.name as branch_name, m.full_name as manager_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN employees m ON e.manager_id = m.id
  `;

  const params: any[] = [];

  // Managers can only see themselves and their direct subordinates
  if (user.role === 'manager') {
    query += ` WHERE e.manager_id = ? OR e.id = ?`;
    params.push(user.employeeId, user.employeeId);
  } else if (user.role === 'employee') {
    query += ` WHERE e.id = ?`;
    params.push(user.employeeId);
  }

  query += ` ORDER BY e.nik ASC`;

  const stmt = c.env.DB.prepare(query);
  const rows = await (params.length > 0 ? stmt.bind(...params) : stmt).all<any>();

  const sanitized = (rows.results || []).map((emp: any) =>
    sanitizeEmployeeByRole(emp, user.role, user.employeeId)
  );

  return c.json({ employees: sanitized });
});

// 2. Contract Expiry Alerts (30 days and 7 days)
employeeRoutes.get('/contract-alerts', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner_admin' && user.role !== 'manager') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Find employees with contract_end_date or probation end date within 30 days
  const employees = await c.env.DB.prepare(
    `SELECT e.id, e.nik, e.full_name, e.job_title, e.employment_status, e.contract_end_date,
            d.name as department_name, b.name as branch_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN branches b ON e.branch_id = b.id
     WHERE e.lifecycle_status IN ('active', 'probation')
       AND e.contract_end_date IS NOT NULL
       AND e.contract_end_date >= DATE('now')
       AND e.contract_end_date <= DATE('now', '+30 days')
     ORDER BY e.contract_end_date ASC`
  ).all<any>();

  const now = new Date();
  const alerts = (employees.results || []).map((emp: any) => {
    const end = new Date(emp.contract_end_date);
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isUrgent = diffDays <= 7;
    return {
      ...emp,
      days_left: diffDays,
      severity: isUrgent ? 'danger' : 'warning',
      alert_label: isUrgent
        ? `⚠️ Kedaluwarsa dalam ${diffDays} hari!`
        : `Pemberitahuan: Kedaluwarsa dalam ${diffDays} hari`,
    };
  });

  return c.json({ alerts });
});

// 3. Get Employee Detail
employeeRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const empId = c.req.param('id');

  const emp = await c.env.DB.prepare(
    `SELECT e.*, d.name as department_name, b.name as branch_name, m.full_name as manager_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN branches b ON e.branch_id = b.id
     LEFT JOIN employees m ON e.manager_id = m.id
     WHERE e.id = ?`
  )
    .bind(empId)
    .first<any>();

  if (!emp) {
    return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  }

  // Manager check
  if (user.role === 'manager' && emp.manager_id !== user.employeeId && emp.id !== user.employeeId) {
    return c.json({ error: 'Forbidden: Anda hanya dapat melihat anggota tim Anda' }, 403);
  }
  if (user.role === 'employee' && emp.id !== user.employeeId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const sanitized = sanitizeEmployeeByRole(emp, user.role, user.employeeId);
  return c.json({ employee: sanitized });
});

// 4. Create Employee (Onboarding with Purelymail)
employeeRoutes.post('/', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const user = c.get('user');

  // Validate required fields
  const required = [
    'nik',
    'full_name',
    'ktp_number',
    'date_of_birth',
    'place_of_birth',
    'gender',
    'religion',
    'marital_status',
    'ptkp_status',
    'address',
    'phone',
    'personal_email',
    'join_date',
    'employment_status',
    'job_title',
    'branch_id',
    'department_id',
  ];

  for (const field of required) {
    if (!body[field]) {
      return c.json({ error: `Field wajib '${field}' belum diisi` }, 400);
    }
  }

  // Check NIK uniqueness
  const existing = await c.env.DB.prepare(`SELECT id FROM employees WHERE nik = ?`).bind(body.nik).first();
  if (existing) {
    return c.json({ error: `NIK '${body.nik}' sudah digunakan oleh karyawan lain` }, 400);
  }

  const employeeId = `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const companyId = body.company_id || 'comp-nusantara';

  // Base salary & BPJS defaults
  const baseSalary = parseFloat(body.base_salary) || 0;
  const fixedAllowances = parseFloat(body.fixed_allowances) || 0;
  const fixedAllowancesDetail = JSON.stringify(body.fixed_allowances_detail || []);

  // 1. Provision Purelymail Mailbox if company email is requested or generated
  const purelymailDomain = c.env.PURELYMAIL_DOMAIN || 'company.id';
  let companyEmail = body.company_email;
  let purelymailStatusNotes = 'Not requested';
  let purelymailSuccess = false;

  if (body.provision_company_email) {
    // Generate clean username from full name (e.g., budi.santoso)
    const localPart = body.company_email_username ||
      body.full_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '.')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');
    companyEmail = `${localPart}@${purelymailDomain}`;

    const purelymailRes = await createPurelymailUser(c.env, {
      userName: localPart,
      domainName: purelymailDomain,
      recoveryEmail: body.personal_email,
      recoveryPhone: body.phone,
    });

    purelymailSuccess = purelymailRes.success;
    purelymailStatusNotes = purelymailRes.message || 'Mailbox provisioning executed';
  }

  // 2. Insert Employee Record
  await c.env.DB.prepare(
    `INSERT INTO employees (
      id, tenant_id, company_id, branch_id, department_id, manager_id,
      nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
      address, phone, personal_email, company_email,
      employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date,
      job_title, shift_pattern_id,
      base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
      bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
    ) VALUES (
      ?, 'default', ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )`
  )
    .bind(
      employeeId,
      companyId,
      body.branch_id,
      body.department_id,
      body.manager_id || null,
      body.nik.trim(),
      body.full_name.trim(),
      body.ktp_number.trim(),
      body.npwp_number || null,
      body.date_of_birth,
      body.place_of_birth,
      body.gender,
      body.religion,
      body.marital_status,
      body.ptkp_status,
      body.address,
      body.phone,
      body.personal_email.toLowerCase().trim(),
      companyEmail || null,
      body.employment_status,
      body.lifecycle_status || (body.employment_status === 'probation' ? 'probation' : 'active'),
      body.join_date,
      body.contract_start_date || body.join_date,
      body.contract_end_date || null,
      body.job_title,
      body.shift_pattern_id || 'shift-reg',
      baseSalary,
      fixedAllowances,
      fixedAllowancesDetail,
      body.bank_name || 'BCA',
      body.bank_account_number || '',
      body.bank_account_holder || body.full_name,
      body.bpjs_kesehatan_number || null,
      body.bpjs_tk_number || null,
      body.bpjs_wage_basis || null
    )
    .run();

  // Initialize Leave Balance
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
     VALUES (?, 'default', ?, 'lt-annual', 2026, 12, 0, 12)`
  )
    .bind(`bal-${employeeId}-annual`, employeeId)
    .run();

  // 3. Create Login Invitation Token & Send Welcome Email via SMTP
  const inviteToken = `inv-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  const inviteEmail = companyEmail || body.personal_email;

  await c.env.DB.prepare(
    `INSERT INTO invitations (id, tenant_id, employee_id, email, token, expires_at, purelymail_created, purelymail_notes)
     VALUES (?, 'default', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      `inv-${Date.now()}`,
      employeeId,
      inviteEmail,
      inviteToken,
      expiresAt,
      purelymailSuccess ? 1 : 0,
      purelymailStatusNotes
    )
    .run();

  // Create active user immediately with default temporary password or pending invite
  const tempPassword = `Pass${Math.random().toString(36).substring(2, 8)}!`;
  const tempHash = await hashPassword(tempPassword);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, role, employee_id, is_active)
     VALUES (?, 'default', ?, ?, 'employee', ?, 1)`
  )
    .bind(`usr-${Date.now()}`, inviteEmail, tempHash, employeeId)
    .run();

  const appUrl = c.env.APP_URL || 'http://localhost:8787';
  const inviteLink = `${appUrl}/accept-invite?token=${inviteToken}`;

  // Send SMTP Welcome Email
  const company = await c.env.DB.prepare(`SELECT name FROM companies WHERE id = ?`)
    .bind(companyId)
    .first<any>();
  const companyName = company?.name || 'PT Nusantara Digital Kreasi';

  const emailContent = getWelcomeInviteEmail({
    name: body.full_name,
    inviteLink,
    companyName,
    companyEmail,
    appUrl,
  });

  await sendEmail(c.env, {
    to: body.personal_email,
    subject: `Selamat Datang di ${companyName} - Aktivasi Akun openHR`,
    text: emailContent.text,
    html: emailContent.html,
    type: 'welcome_invite',
  });

  // Audit Log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'CREATE_EMPLOYEE', 'employees', ?, ?)`
  )
    .bind(`aud-${Date.now()}`, user.userId, employeeId, JSON.stringify({ nik: body.nik, name: body.full_name }))
    .run();

  return c.json({
    message: 'Karyawan berhasil didaftarkan dan email aktivasi telah dikirim.',
    employeeId,
    inviteLink,
    purelymail: {
      provisioned: purelymailSuccess,
      companyEmail,
      notes: purelymailStatusNotes,
    },
  }, 201);
});

// 5. Update Employee (with Audit Log for salary changes)
employeeRoutes.put('/:id', requireRole(['owner_admin']), async (c) => {
  const empId = c.req.param('id');
  const body = await c.req.json();
  const user = c.get('user');

  const oldEmp = await c.env.DB.prepare(`SELECT * FROM employees WHERE id = ?`).bind(empId).first<any>();
  if (!oldEmp) {
    return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  }

  const baseSalary = body.base_salary !== undefined ? parseFloat(body.base_salary) : oldEmp.base_salary;
  const fixedAllowances = body.fixed_allowances !== undefined ? parseFloat(body.fixed_allowances) : oldEmp.fixed_allowances;

  await c.env.DB.prepare(
    `UPDATE employees SET
      full_name = COALESCE(?, full_name),
      ktp_number = COALESCE(?, ktp_number),
      npwp_number = COALESCE(?, npwp_number),
      date_of_birth = COALESCE(?, date_of_birth),
      place_of_birth = COALESCE(?, place_of_birth),
      gender = COALESCE(?, gender),
      religion = COALESCE(?, religion),
      marital_status = COALESCE(?, marital_status),
      ptkp_status = COALESCE(?, ptkp_status),
      address = COALESCE(?, address),
      phone = COALESCE(?, phone),
      personal_email = COALESCE(?, personal_email),
      company_email = COALESCE(?, company_email),
      branch_id = COALESCE(?, branch_id),
      department_id = COALESCE(?, department_id),
      manager_id = ?,
      employment_status = COALESCE(?, employment_status),
      lifecycle_status = COALESCE(?, lifecycle_status),
      contract_start_date = COALESCE(?, contract_start_date),
      contract_end_date = ?,
      resignation_date = ?,
      last_working_date = ?,
      job_title = COALESCE(?, job_title),
      shift_pattern_id = COALESCE(?, shift_pattern_id),
      base_salary = ?,
      fixed_allowances = ?,
      bank_name = COALESCE(?, bank_name),
      bank_account_number = COALESCE(?, bank_account_number),
      bank_account_holder = COALESCE(?, bank_account_holder),
      bpjs_kesehatan_number = ?,
      bpjs_tk_number = ?,
      bpjs_wage_basis = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.full_name,
      body.ktp_number,
      body.npwp_number,
      body.date_of_birth,
      body.place_of_birth,
      body.gender,
      body.religion,
      body.marital_status,
      body.ptkp_status,
      body.address,
      body.phone,
      body.personal_email,
      body.company_email,
      body.branch_id,
      body.department_id,
      body.manager_id !== undefined ? body.manager_id : oldEmp.manager_id,
      body.employment_status,
      body.lifecycle_status,
      body.contract_start_date,
      body.contract_end_date !== undefined ? body.contract_end_date : oldEmp.contract_end_date,
      body.resignation_date !== undefined ? body.resignation_date : oldEmp.resignation_date,
      body.last_working_date !== undefined ? body.last_working_date : oldEmp.last_working_date,
      body.job_title,
      body.shift_pattern_id,
      baseSalary,
      fixedAllowances,
      body.bank_name,
      body.bank_account_number,
      body.bank_account_holder,
      body.bpjs_kesehatan_number !== undefined ? body.bpjs_kesehatan_number : oldEmp.bpjs_kesehatan_number,
      body.bpjs_tk_number !== undefined ? body.bpjs_tk_number : oldEmp.bpjs_tk_number,
      body.bpjs_wage_basis !== undefined ? body.bpjs_wage_basis : oldEmp.bpjs_wage_basis,
      empId
    )
    .run();

  // Audit Log especially for salary changes
  if (oldEmp.base_salary !== baseSalary || oldEmp.fixed_allowances !== fixedAllowances) {
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES (?, 'default', ?, 'SALARY_CHANGE', 'employees', ?, ?, ?)`
    )
      .bind(
        `aud-${Date.now()}`,
        user.userId,
        empId,
        JSON.stringify({ base: oldEmp.base_salary, allowances: oldEmp.fixed_allowances }),
        JSON.stringify({ base: baseSalary, allowances: fixedAllowances })
      )
      .run();
  }

  return c.json({ message: 'Data karyawan berhasil diperbarui' });
});

// 6. Bulk Import Employees from Excel/CSV (Acceptance Criteria 1)
employeeRoutes.post('/bulk-import', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { employees: importedList } = body;

  if (!Array.isArray(importedList) || importedList.length === 0) {
    return c.json({ error: 'Data karyawan kosong atau format tidak sesuai' }, 400);
  }

  const errors: Array<{ row: number; nik?: string; error: string }> = [];
  const validRecords: any[] = [];

  // Default lookup cache
  const branches = await c.env.DB.prepare(`SELECT id, name FROM branches`).all<any>();
  const departments = await c.env.DB.prepare(`SELECT id, name, code FROM departments`).all<any>();
  const branchMap = new Map((branches.results || []).map((b: any) => [b.name.toLowerCase(), b.id]));
  const defaultBranchId = (branches.results && branches.results[0]?.id) || 'branch-jkt';

  const deptMap = new Map((departments.results || []).map((d: any) => [d.name.toLowerCase(), d.id]));
  const defaultDeptId = (departments.results && departments.results[0]?.id) || 'dept-eng';

  const validPtkp = new Set(['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3']);
  const validStatus = new Set(['PKWTT', 'PKWT', 'probation', 'intern']);

  for (let i = 0; i < importedList.length; i++) {
    const row = importedList[i];
    const rowNum = i + 1;

    if (!row.nik) {
      errors.push({ row: rowNum, error: 'Baris ' + rowNum + ': NIK wajib diisi' });
      continue;
    }
    if (!row.full_name) {
      errors.push({ row: rowNum, nik: row.nik, error: 'Baris ' + rowNum + ': Nama lengkap wajib diisi' });
      continue;
    }
    if (!row.ktp_number) {
      errors.push({ row: rowNum, nik: row.nik, error: 'Baris ' + rowNum + ': Nomor KTP wajib diisi' });
      continue;
    }
    if (row.ptkp_status && !validPtkp.has(row.ptkp_status.toUpperCase())) {
      errors.push({
        row: rowNum,
        nik: row.nik,
        error: `Baris ${rowNum}: Status PTKP '${row.ptkp_status}' tidak valid. Pilih: TK/0, TK/1, TK/2, TK/3, K/0, K/1, K/2, K/3`,
      });
      continue;
    }

    const ptkp = (row.ptkp_status || 'TK/0').toUpperCase();
    const empStatus = validStatus.has(row.employment_status) ? row.employment_status : 'PKWTT';
    const branchId = (row.branch_name && branchMap.get(row.branch_name.toLowerCase())) || row.branch_id || defaultBranchId;
    const departmentId = (row.department_name && deptMap.get(row.department_name.toLowerCase())) || row.department_id || defaultDeptId;

    validRecords.push({
      id: `emp-bulk-${Date.now()}-${i}`,
      nik: String(row.nik).trim(),
      full_name: String(row.full_name).trim(),
      ktp_number: String(row.ktp_number).trim(),
      npwp_number: row.npwp_number ? String(row.npwp_number).trim() : null,
      date_of_birth: row.date_of_birth || '1995-01-01',
      place_of_birth: row.place_of_birth || 'Indonesia',
      gender: row.gender?.toLowerCase() === 'female' ? 'female' : 'male',
      religion: row.religion || 'Islam',
      marital_status: row.marital_status?.toLowerCase() === 'married' ? 'married' : 'single',
      ptkp_status: ptkp,
      address: row.address || 'Alamat Karyawan',
      phone: row.phone ? String(row.phone) : '0812000000',
      personal_email: row.personal_email || `${row.nik.toLowerCase()}@example.com`,
      company_email: row.company_email || null,
      branch_id: branchId,
      department_id: departmentId,
      job_title: row.job_title || 'Staff',
      employment_status: empStatus,
      lifecycle_status: 'active',
      join_date: row.join_date || new Date().toISOString().split('T')[0],
      base_salary: parseFloat(row.base_salary) || 5000000,
      fixed_allowances: parseFloat(row.fixed_allowances) || 0,
      bank_name: row.bank_name || 'BCA',
      bank_account_number: row.bank_account_number ? String(row.bank_account_number) : '',
      bank_account_holder: row.bank_account_holder || row.full_name,
      shift_pattern_id: row.shift_pattern_id || 'shift-reg',
    });
  }

  // Insert valid records in chunks/transactions
  const inserted: string[] = [];
  const defaultPwHash = await hashPassword('Password123!');

  for (const emp of validRecords) {
    try {
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO employees (
          id, tenant_id, company_id, branch_id, department_id,
          nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
          address, phone, personal_email, company_email,
          employment_status, lifecycle_status, join_date, job_title, shift_pattern_id,
          base_salary, fixed_allowances, bank_name, bank_account_number, bank_account_holder
        ) VALUES (
          ?, 'default', 'comp-nusantara', ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )`
      )
        .bind(
          emp.id,
          emp.branch_id,
          emp.department_id,
          emp.nik,
          emp.full_name,
          emp.ktp_number,
          emp.npwp_number,
          emp.date_of_birth,
          emp.place_of_birth,
          emp.gender,
          emp.religion,
          emp.marital_status,
          emp.ptkp_status,
          emp.address,
          emp.phone,
          emp.personal_email,
          emp.company_email,
          emp.employment_status,
          emp.lifecycle_status,
          emp.join_date,
          emp.job_title,
          emp.shift_pattern_id,
          emp.base_salary,
          emp.fixed_allowances,
          emp.bank_name,
          emp.bank_account_number,
          emp.bank_account_holder
        )
        .run();

      // Create login user so they can immediately clock in on phone
      const loginEmail = emp.company_email || emp.personal_email;
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, role, employee_id, is_active)
         VALUES (?, 'default', ?, ?, 'employee', ?, 1)`
      )
        .bind(`usr-${emp.id}`, loginEmail.toLowerCase(), defaultPwHash, emp.id)
        .run();

      // Seed annual leave balance
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
         VALUES (?, 'default', ?, 'lt-annual', 2026, 12, 0, 12)`
      )
        .bind(`bal-${emp.id}-annual`, emp.id)
        .run();

      inserted.push(emp.nik);
    } catch (err: any) {
      errors.push({ row: 0, nik: emp.nik, error: `Database error untuk NIK ${emp.nik}: ${err.message}` });
    }
  }

  return c.json({
    totalProcessed: importedList.length,
    successCount: inserted.length,
    errorCount: errors.length,
    errors,
  });
});

// 7. Upload Employee Document (KTP, NPWP, KK, contract, certificate)
employeeRoutes.post('/:id/documents', requireRole(['owner_admin']), async (c) => {
  const empId = c.req.param('id');
  const body = await c.req.parseBody();

  const file = body['file'] as any;
  const docType = (body['document_type'] as string) || 'other';

  if (!file) {
    return c.json({ error: 'File tidak ditemukan dalam request' }, 400);
  }

  const fileName = file.name || 'document.pdf';
  const mimeType = file.type || 'application/pdf';
  const arrayBuffer = await file.arrayBuffer();
  const fileKey = `docs/${empId}/${Date.now()}-${fileName}`;

  await putFile(c.env, {
    key: fileKey,
    data: arrayBuffer,
    contentType: mimeType,
  });

  const docId = `doc-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO employee_documents (id, tenant_id, employee_id, document_type, file_name, file_key, file_size, mime_type)
     VALUES (?, 'default', ?, ?, ?, ?, ?, ?)`
  )
    .bind(docId, empId, docType, fileName, fileKey, arrayBuffer.byteLength, mimeType)
    .run();

  return c.json({ message: 'Dokumen berhasil diunggah', docId, fileKey });
});

// 8. Download Document (HR Only)
employeeRoutes.get('/:id/documents/:docId', requireRole(['owner_admin']), async (c) => {
  const docId = c.req.param('docId');
  const doc = await c.env.DB.prepare(`SELECT * FROM employee_documents WHERE id = ?`).bind(docId).first<any>();

  if (!doc) {
    return c.json({ error: 'Dokumen tidak ditemukan' }, 404);
  }

  const stored = await getFile(c.env, doc.file_key);
  if (!stored) {
    return c.json({ error: 'File fisik tidak ditemukan' }, 404);
  }

  c.header('Content-Type', doc.mime_type || 'application/octet-stream');
  c.header('Content-Disposition', `attachment; filename="${doc.file_name}"`);
  return c.body(stored.data as any);
});

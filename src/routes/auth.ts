import { Hono } from 'hono';
import { Bindings } from '../types';
import {
  AuthContext,
  authMiddleware,
  hashPassword,
  signJwt,
  verifyPassword,
} from '../middleware/auth';
import { sendEmailInBackground } from '../services/smtp';
import { getPasswordResetEmail } from '../services/email-templates';

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

// 1. Login
authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: 'Email dan kata sandi wajib diisi' }, 400);
  }

  const identifier = email.toLowerCase().trim();
  const user = await c.env.DB.prepare(
    `SELECT u.*, e.full_name as employee_name, e.job_title, e.department_id, e.branch_id, e.company_email, e.personal_email, e.nik
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     WHERE (
       LOWER(u.email) = ? OR
       LOWER(COALESCE(e.company_email, '')) = ? OR
       LOWER(COALESCE(e.personal_email, '')) = ? OR
       LOWER(COALESCE(e.nik, '')) = ?
     ) AND u.is_active = 1`
  )
    .bind(identifier, identifier, identifier, identifier)
    .first<any>();

  if (!user) {
    return c.json({ error: 'Email atau kata sandi tidak sesuai' }, 401);
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return c.json({ error: 'Email atau kata sandi tidak sesuai' }, 401);
  }

  // Update last login
  await c.env.DB.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(user.id)
    .run();

  const token = await signJwt(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      name: user.employee_name || user.email,
    },
    c.env.JWT_SECRET
  );

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      name: user.employee_name || user.email,
      jobTitle: user.job_title,
      departmentId: user.department_id,
      branchId: user.branch_id,
    },
  });
});

// 2. Current User Profile
authRoutes.get('/me', authMiddleware, async (c) => {
  const jwtUser = c.get('user');

  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.employee_id, u.tenant_id,
            e.full_name, e.nik, e.job_title, e.department_id, e.branch_id,
            d.name as department_name, b.name as branch_name
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN branches b ON e.branch_id = b.id
     WHERE u.id = ?`
  )
    .bind(jwtUser.userId)
    .first<any>();

  if (!user) {
    return c.json({ error: 'User tidak ditemukan' }, 404);
  }

  return c.json({ user });
});

// 3. Request Password Reset
authRoutes.post('/request-reset', async (c) => {
  const { email } = await c.req.json();
  if (!email) {
    return c.json({ error: 'Email wajib diisi' }, 400);
  }

  const user = await c.env.DB.prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`)
    .bind(email.toLowerCase().trim())
    .first<any>();

  if (!user) {
    // Return generic success to prevent email enumeration
    return c.json({ message: 'Jika email terdaftar, instruksi reset akan dikirim.' });
  }

  const token = `rst-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour

  await c.env.DB.prepare(
    `INSERT INTO password_resets (id, tenant_id, user_id, token, expires_at)
     VALUES (?, 'default', ?, ?, ?)`
  )
    .bind(`pr-${Date.now()}`, user.id, token, expiresAt)
    .run();

  const comp = await c.env.DB.prepare(
    `SELECT name, legal_name, custom_domain, purelymail_domain, purelymail_from_address, purelymail_smtp_pass FROM companies LIMIT 1`
  ).first<any>();

  const appUrl = comp?.custom_domain
    ? (comp.custom_domain.startsWith('http') ? comp.custom_domain : `https://${comp.custom_domain}`)
    : (c.env.APP_URL || 'http://localhost:8787');
  const resetLink = `${appUrl}/reset-password?token=${token}`;
  const companyName = comp?.legal_name || comp?.name || 'Portal HR';

  const emailData = getPasswordResetEmail({
    name: user.full_name || undefined,
    resetLink,
    companyName,
    expiresMinutes: 60,
  });

  sendEmailInBackground(c, c.env, {
    to: user.email,
    subject: `Reset kata sandi akun kepegawaian Anda (Password reset) - ${companyName}`,
    text: emailData.text,
    html: emailData.html,
    type: 'password_reset',
    domainName: comp?.purelymail_domain,
    fromAddress: comp?.purelymail_from_address,
    smtpPass: comp?.purelymail_smtp_pass,
    senderName: companyName,
  });

  return c.json({
    message: 'Tautan reset kata sandi telah dikirim ke email Anda.',
    resetLink: c.env.ENVIRONMENT === 'development' ? resetLink : undefined,
  });
});

// 4. Confirm Password Reset
authRoutes.post('/confirm-reset', async (c) => {
  const { token, newPassword } = await c.req.json();
  if (!token || !newPassword || newPassword.length < 6) {
    return c.json({ error: 'Token dan kata sandi baru (minimal 6 karakter) diperlukan' }, 400);
  }

  const resetRecord = await c.env.DB.prepare(
    `SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
  )
    .bind(token)
    .first<any>();

  if (!resetRecord) {
    return c.json({ error: 'Tautan reset tidak valid atau sudah kedaluwarsa' }, 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
      passwordHash,
      resetRecord.user_id
    ),
    c.env.DB.prepare(`UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
      resetRecord.id
    ),
  ]);

  return c.json({ message: 'Kata sandi berhasil diperbarui. Silakan login.' });
});

// 4b. Get Invitation Information (For previewing account details on accept invite page)
authRoutes.get('/invite-info', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ valid: false, message: 'Token aktivasi tidak disertakan.' });
  }

  const invite = await c.env.DB.prepare(
    `SELECT i.*, e.full_name as employee_name, e.company_email, e.personal_email, e.nik
     FROM invitations i
     LEFT JOIN employees e ON i.employee_id = e.id
     WHERE i.token = ?`
  )
    .bind(token)
    .first<any>();

  if (!invite) {
    return c.json({ valid: false, message: 'Tautan aktivasi tidak valid atau tidak ditemukan.' });
  }

  const isExpired = new Date(invite.expires_at) < new Date();
  const isAccepted = invite.status === 'accepted';

  let message = '';
  if (isAccepted) {
    message = 'Akun untuk undangan ini sudah aktif. Anda dapat langsung masuk dengan email dan kata sandi Anda.';
  } else if (isExpired) {
    message = 'Tautan aktivasi telah kedaluwarsa. Silakan hubungi tim HR untuk mengirim ulang undangan.';
  }

  return c.json({
    valid: !isExpired && !isAccepted,
    status: invite.status,
    isExpired,
    isAccepted,
    message,
    employeeName: invite.employee_name || 'Karyawan',
    loginEmail: invite.company_email || invite.email,
    personalEmail: invite.personal_email,
    nik: invite.nik,
  });
});

// 5. Accept Invitation (New Employee Onboarding Invite)
authRoutes.post('/accept-invite', async (c) => {
  const { token, password } = await c.req.json();
  if (!token || !password || password.length < 6) {
    return c.json({ error: 'Token dan kata sandi (minimal 6 karakter) diperlukan' }, 400);
  }

  const invite = await c.env.DB.prepare(
    `SELECT * FROM invitations WHERE token = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`
  )
    .bind(token)
    .first<any>();

  if (!invite) {
    return c.json({ error: 'Undangan tidak ditemukan atau sudah kedaluwarsa' }, 400);
  }

  const passwordHash = await hashPassword(password);

  // Check if user already exists
  let user = await c.env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
    .bind(invite.email)
    .first<any>();

  if (user) {
    await c.env.DB.prepare(`UPDATE users SET password_hash = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(passwordHash, user.id)
      .run();
  } else {
    const userId = `usr-${Date.now()}`;
    await c.env.DB.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, employee_id, is_active)
       VALUES (?, 'default', ?, ?, 'employee', ?, 1)`
    )
      .bind(userId, invite.email, passwordHash, invite.employee_id)
      .run();
    user = { id: userId, email: invite.email, role: 'employee', employee_id: invite.employee_id };
  }

  await c.env.DB.prepare(`UPDATE invitations SET status = 'accepted' WHERE id = ?`)
    .bind(invite.id)
    .run();

  const authToken = await signJwt({
    userId: user.id,
    email: user.email,
    role: user.role || 'employee',
    tenantId: 'default',
    employeeId: user.employee_id || invite.employee_id,
  }, c.env.JWT_SECRET);

  return c.json({
    message: 'Akun Anda telah aktif dan kata sandi berhasil disimpan.',
    token: authToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role || 'employee',
      employee_id: user.employee_id || invite.employee_id,
    },
  });
});

// 6. List Invitations (For HR to see pending links)
authRoutes.get('/invitations', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner_admin' && user.role !== 'manager') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const invites = await c.env.DB.prepare(
    `SELECT i.*, e.full_name as employee_name, e.nik
     FROM invitations i
     LEFT JOIN employees e ON i.employee_id = e.id
     ORDER BY i.created_at DESC LIMIT 50`
  ).all<any>();

  const appUrl = c.env.APP_URL || 'http://localhost:8787';
  const results = (invites.results || []).map((inv: any) => ({
    ...inv,
    inviteLink: `${appUrl}/accept-invite?token=${inv.token}`,
  }));

  return c.json({ invitations: results });
});

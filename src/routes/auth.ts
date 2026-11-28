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
import { getEmployeeLevelContext } from '../services/employee-levels';

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

const MOBILE_ACCESS_TTL_SECS = 86400; // 24 hours
const WEB_ACCESS_TTL_SECS = 7 * 86400; // 7 days
const REFRESH_TTL_MS = 90 * 86400 * 1000; // 90 days sliding

function generateRefreshToken(): string {
  return `rt-${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

async function issueRefreshSession(
  db: D1Database,
  params: { userId: string; tenantId: string; deviceLabel?: string | null }
) {
  const rawToken = generateRefreshToken();
  const tokenHash = await hashPassword(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  const id = `rs-${crypto.randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO refresh_sessions (id, tenant_id, user_id, token_hash, device_label, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(id, params.tenantId || 'default', params.userId, tokenHash, params.deviceLabel || null, expiresAt)
    .run();

  return { refreshToken: rawToken, refreshExpiresAt: expiresAt };
}

function toUserSessionDto(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee_id,
    name: user.employee_name || user.email,
    jobTitle: user.job_title,
    departmentId: user.department_id,
    branchId: user.branch_id,
  };
}

// 1. Login
authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const { email, password, client, deviceLabel } = body;

  if (!email || !password) {
    return c.json({ error: 'Email dan kata sandi wajib diisi' }, 400);
  }

  const identifier = email.toLowerCase().trim();
  const user = await c.env.DB.prepare(
    `SELECT u.*, e.full_name as employee_name, e.job_title, e.department_id, e.branch_id, e.company_email, e.personal_email, e.nik,
            e.lifecycle_status
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

  const accessTtl = client === 'mobile' || client === 'android' ? MOBILE_ACCESS_TTL_SECS : WEB_ACCESS_TTL_SECS;
  const userDto = toUserSessionDto(user);
  const lvlCtx = await getEmployeeLevelContext(c.env.DB, {
    userId: user.id,
    tenantId: user.tenant_id || 'default',
    role: user.role,
    employeeId: user.employee_id,
  });

  const token = await signJwt(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      name: userDto.name,
    },
    c.env.JWT_SECRET,
    accessTtl
  );

  const { refreshToken, refreshExpiresAt } = await issueRefreshSession(c.env.DB, {
    userId: user.id,
    tenantId: user.tenant_id || 'default',
    deviceLabel: typeof deviceLabel === 'string' ? deviceLabel.slice(0, 120) : null,
  });

  return c.json({
    token,
    refreshToken,
    refreshExpiresAt,
    user: { ...userDto, level: lvlCtx.level },
  });
});

// 1b. Refresh Access Token (sliding rotation for persistent sessions)
authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawRefresh = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
  const deviceLabel = typeof body?.deviceLabel === 'string' ? body.deviceLabel.slice(0, 120) : null;

  if (!rawRefresh) {
    return c.json({ error: 'Refresh token wajib disertakan', code: 'INVALID_REFRESH_TOKEN' }, 401);
  }

  const tokenHash = await hashPassword(rawRefresh);
  const session = await c.env.DB.prepare(
    `SELECT * FROM refresh_sessions WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<any>();

  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return c.json({ error: 'Sesi telah berakhir. Silakan login kembali.', code: 'INVALID_REFRESH_TOKEN' }, 401);
  }

  const user = await c.env.DB.prepare(
    `SELECT u.*, e.full_name as employee_name, e.job_title, e.department_id, e.branch_id, e.lifecycle_status
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     WHERE u.id = ? AND u.is_active = 1`
  )
    .bind(session.user_id)
    .first<any>();

  if (!user || user.lifecycle_status === 'resigned' || user.lifecycle_status === 'terminated') {
    await c.env.DB.prepare(`UPDATE refresh_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(session.id)
      .run();
    return c.json({ error: 'Akun sudah tidak aktif.', code: 'INVALID_REFRESH_TOKEN' }, 401);
  }

  // Rotate refresh token atomically (prevents replay of old refresh tokens)
  const nextRefreshToken = generateRefreshToken();
  const nextHash = await hashPassword(nextRefreshToken);
  const nextExpiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();

  const updateRes = await c.env.DB.prepare(
    `UPDATE refresh_sessions
     SET token_hash = ?,
         expires_at = ?,
         last_used_at = CURRENT_TIMESTAMP,
         device_label = COALESCE(?, device_label)
     WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`
  )
    .bind(nextHash, nextExpiresAt, deviceLabel, session.id, tokenHash)
    .run();

  if (updateRes.meta?.changes === 0) {
    return c.json({ error: 'Sesi refresh tidak valid', code: 'INVALID_REFRESH_TOKEN' }, 401);
  }

  const userDto = toUserSessionDto(user);
  const lvlCtx = await getEmployeeLevelContext(c.env.DB, {
    userId: user.id,
    tenantId: user.tenant_id || 'default',
    role: user.role,
    employeeId: user.employee_id,
  });

  const token = await signJwt(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      name: userDto.name,
    },
    c.env.JWT_SECRET,
    MOBILE_ACCESS_TTL_SECS
  );

  return c.json({
    token,
    refreshToken: nextRefreshToken,
    refreshExpiresAt: nextExpiresAt,
    user: { ...userDto, level: lvlCtx.level },
  });
});

// 1c. Logout (revoke refresh token)
authRoutes.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawRefresh = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
  if (rawRefresh) {
    const tokenHash = await hashPassword(rawRefresh);
    await c.env.DB.prepare(
      `UPDATE refresh_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL`
    )
      .bind(tokenHash)
      .run();
  }
  return c.json({ message: 'Berhasil keluar' });
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

  const lvlCtx = await getEmployeeLevelContext(c.env.DB, jwtUser);
  return c.json({ user: { ...user, level: lvlCtx.level } });
});

// 3. Request Password Reset
authRoutes.post('/request-reset', async (c) => {
  const { email } = await c.req.json();
  if (!email || typeof email !== 'string' || !email.trim()) {
    return c.json({ error: 'Email atau NIK wajib diisi' }, 400);
  }

  const identifier = email.toLowerCase().trim();
  const user = await c.env.DB.prepare(
    `SELECT u.*, e.full_name as employee_name, e.company_email, e.personal_email
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

  const genericMessage = 'Jika email terdaftar, instruksi reset kata sandi telah dikirim.';

  if (!user) {
    // Return generic success to prevent email/account enumeration
    return c.json({ message: genericMessage });
  }

  const token = `rst-${crypto.randomUUID().replace(/-/g, '')}`;
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour

  // Invalidate any previous unused reset tokens for this user
  await c.env.DB.prepare(
    `UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL`
  )
    .bind(user.id)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO password_resets (id, tenant_id, user_id, token, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(`pr-${crypto.randomUUID()}`, user.tenant_id || 'default', user.id, token, expiresAt)
    .run();

  const comp = await c.env.DB.prepare(
    `SELECT name, legal_name, custom_domain, purelymail_domain, purelymail_from_address, purelymail_smtp_pass FROM companies LIMIT 1`
  ).first<any>();

  const requestOrigin = (() => {
    try {
      return new URL(c.req.url).origin;
    } catch {
      return '';
    }
  })();
  const appUrl = (
    comp?.custom_domain
      ? (comp.custom_domain.startsWith('http') ? comp.custom_domain : `https://${comp.custom_domain}`)
      : (c.env.APP_URL || requestOrigin || 'http://localhost:8787')
  ).replace(/\/+$/, '');
  const resetLink = `${appUrl}/reset-password?token=${token}`;
  const companyName = comp?.legal_name || comp?.name || 'Portal HR';
  const recipientEmail = user.email || user.company_email || user.personal_email;

  const emailData = getPasswordResetEmail({
    name: user.employee_name || undefined,
    resetLink,
    companyName,
    expiresMinutes: 60,
  });

  if (recipientEmail) {
    sendEmailInBackground(c, c.env, {
      to: recipientEmail,
      subject: `Reset kata sandi akun kepegawaian Anda (Password reset) - ${companyName}`,
      text: emailData.text,
      html: emailData.html,
      type: 'password_reset',
      domainName: comp?.purelymail_domain,
      fromAddress: comp?.purelymail_from_address,
      smtpPass: comp?.purelymail_smtp_pass,
      senderName: companyName,
    });
  }

  return c.json({
    message: genericMessage,
    resetLink: c.env.ENVIRONMENT === 'development' ? resetLink : undefined,
  });
});

// 3b. Verify Password Reset Token (For previewing/validating reset token before submitting)
authRoutes.get('/reset-info', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ valid: false, message: 'Token reset tidak disertakan.' });
  }

  const resetRecord = await c.env.DB.prepare(
    `SELECT pr.*, u.email as user_email
     FROM password_resets pr
     LEFT JOIN users u ON pr.user_id = u.id
     WHERE pr.token = ?`
  )
    .bind(token)
    .first<any>();

  if (!resetRecord) {
    return c.json({ valid: false, message: 'Tautan reset kata sandi tidak valid atau tidak ditemukan.' });
  }

  const isUsed = !!resetRecord.used_at;
  const isExpired = new Date(resetRecord.expires_at).getTime() <= Date.now();

  if (isUsed) {
    return c.json({
      valid: false,
      isUsed: true,
      message: 'Tautan reset kata sandi ini sudah pernah digunakan. Silakan ajukan permintaan reset baru.',
    });
  }

  if (isExpired) {
    return c.json({
      valid: false,
      isExpired: true,
      message: 'Tautan reset kata sandi telah kedaluwarsa. Silakan ajukan permintaan reset baru.',
    });
  }

  const rawEmail = String(resetRecord.user_email || '');
  const [localPart, domainPart] = rawEmail.split('@');
  const maskedEmail = localPart && domainPart
    ? `${localPart.slice(0, Math.min(2, localPart.length))}***@${domainPart}`
    : undefined;

  return c.json({
    valid: true,
    maskedEmail,
  });
});

// 4. Confirm Password Reset
authRoutes.post('/confirm-reset', async (c) => {
  const { token, newPassword, password } = await c.req.json();
  const nextPassword = newPassword || password;
  if (!token || !nextPassword || nextPassword.length < 6) {
    return c.json({ error: 'Token dan kata sandi baru (minimal 6 karakter) diperlukan' }, 400);
  }

  const resetRecord = await c.env.DB.prepare(
    `SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL`
  )
    .bind(token)
    .first<any>();

  if (!resetRecord || new Date(resetRecord.expires_at).getTime() <= Date.now()) {
    return c.json({ error: 'Tautan reset tidak valid atau sudah kedaluwarsa' }, 400);
  }

  const passwordHash = await hashPassword(nextPassword);

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
      passwordHash,
      resetRecord.user_id
    ),
    c.env.DB.prepare(`UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
      resetRecord.id
    ),
    c.env.DB.prepare(`UPDATE refresh_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL`).bind(
      resetRecord.user_id
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

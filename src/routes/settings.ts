import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { sendEmail } from '../services/smtp';
import { getTestEmail } from '../services/email-templates';
import { deleteFile, putFile } from '../services/storage';
import { makeId } from '../utils/id';
import { getSecurityPolicy, normalizeAntiFakeMode } from '../services/security';
import { hasPurelymailConfig, parseModulesConfig } from '../../shared/modules';

export const settingsRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

settingsRoutes.use('*', authMiddleware);

// 1. Company Profile
settingsRoutes.get('/company', async (c) => {
  const comp = await c.env.DB.prepare(`SELECT * FROM companies LIMIT 1`).first<any>();
  return c.json({ company: comp });
});

settingsRoutes.put('/company', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const smtpPortVal =
    body.smtp_port !== undefined && body.smtp_port !== '' && body.smtp_port !== null
      ? Number(body.smtp_port) || null
      : null;

  const runUpdate = async (withSmtpCols: boolean) => {
    if (withSmtpCols) {
      await c.env.DB.prepare(
        `UPDATE companies SET
          name = COALESCE(?, name),
          legal_name = COALESCE(?, legal_name),
          logo_url = CASE WHEN ? = 1 THEN ? ELSE logo_url END,
          npwp = COALESCE(?, npwp),
          bpjs_kesehatan_code = COALESCE(?, bpjs_kesehatan_code),
          bpjs_tk_code = COALESCE(?, bpjs_tk_code),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          custom_domain = COALESCE(?, custom_domain),
          purelymail_domain = COALESCE(?, purelymail_domain),
          purelymail_from_address = COALESCE(?, purelymail_from_address),
          purelymail_api_token = COALESCE(?, purelymail_api_token),
          purelymail_smtp_pass = COALESCE(?, purelymail_smtp_pass),
          smtp_host = COALESCE(?, smtp_host),
          smtp_port = COALESCE(?, smtp_port),
          smtp_user = COALESCE(?, smtp_user),
          updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = 'default'`
      )
        .bind(
          body.name,
          body.legal_name,
          body.logo_url !== undefined ? 1 : 0,
          body.logo_url !== undefined ? (body.logo_url?.trim() || null) : null,
          body.npwp,
          body.bpjs_kesehatan_code,
          body.bpjs_tk_code,
          body.address,
          body.phone,
          body.email,
          body.custom_domain !== undefined ? (body.custom_domain?.trim() || null) : null,
          body.purelymail_domain !== undefined ? (body.purelymail_domain?.trim() || null) : null,
          body.purelymail_from_address !== undefined ? (body.purelymail_from_address?.trim() || null) : null,
          body.purelymail_api_token !== undefined ? (body.purelymail_api_token?.trim() || null) : null,
          body.purelymail_smtp_pass !== undefined ? (body.purelymail_smtp_pass?.trim() || null) : null,
          body.smtp_host !== undefined ? (body.smtp_host?.trim() || null) : null,
          smtpPortVal,
          body.smtp_user !== undefined ? (body.smtp_user?.trim() || null) : null
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `UPDATE companies SET
          name = COALESCE(?, name),
          legal_name = COALESCE(?, legal_name),
          logo_url = CASE WHEN ? = 1 THEN ? ELSE logo_url END,
          npwp = COALESCE(?, npwp),
          bpjs_kesehatan_code = COALESCE(?, bpjs_kesehatan_code),
          bpjs_tk_code = COALESCE(?, bpjs_tk_code),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          custom_domain = COALESCE(?, custom_domain),
          purelymail_domain = COALESCE(?, purelymail_domain),
          purelymail_from_address = COALESCE(?, purelymail_from_address),
          purelymail_api_token = COALESCE(?, purelymail_api_token),
          purelymail_smtp_pass = COALESCE(?, purelymail_smtp_pass),
          updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = 'default'`
      )
        .bind(
          body.name,
          body.legal_name,
          body.logo_url !== undefined ? 1 : 0,
          body.logo_url !== undefined ? (body.logo_url?.trim() || null) : null,
          body.npwp,
          body.bpjs_kesehatan_code,
          body.bpjs_tk_code,
          body.address,
          body.phone,
          body.email,
          body.custom_domain !== undefined ? (body.custom_domain?.trim() || null) : null,
          body.purelymail_domain !== undefined ? (body.purelymail_domain?.trim() || null) : null,
          body.purelymail_from_address !== undefined ? (body.purelymail_from_address?.trim() || null) : null,
          body.purelymail_api_token !== undefined ? (body.purelymail_api_token?.trim() || null) : null,
          body.purelymail_smtp_pass !== undefined ? (body.purelymail_smtp_pass?.trim() || null) : null
        )
        .run();
    }
  };

  try {
    await runUpdate(true);
  } catch (err: any) {
    if (String(err?.message || '').includes('no such column')) {
      await c.env.DB.prepare(`ALTER TABLE companies ADD COLUMN smtp_host TEXT`).run().catch(() => {});
      await c.env.DB.prepare(`ALTER TABLE companies ADD COLUMN smtp_port INTEGER`).run().catch(() => {});
      await c.env.DB.prepare(`ALTER TABLE companies ADD COLUMN smtp_user TEXT`).run().catch(() => {});
      await runUpdate(true);
    } else {
      throw err;
    }
  }

  return c.json({ message: 'Profil perusahaan & konfigurasi domain/email berhasil diperbarui' });
});

// 1b. Modular Feature Toggles
settingsRoutes.get('/modules', async (c) => {
  const hasDocuSealCreds = Boolean(
    c.env.DOCUSEAL_URL?.trim() && c.env.DOCUSEAL_API_TOKEN?.trim()
  );
  try {
    const comp = await c.env.DB.prepare(
      `SELECT modules_json, purelymail_domain, purelymail_api_token, purelymail_smtp_pass FROM companies LIMIT 1`
    ).first<any>();
    const hasPurelymailCreds = hasPurelymailConfig(c.env, comp);
    return c.json({
      modules: parseModulesConfig(comp?.modules_json, { hasDocuSealCreds, hasPurelymailCreds }),
      integrations: { docusealConfigured: hasDocuSealCreds, purelymailConfigured: hasPurelymailCreds },
    });
  } catch {
    const hasPurelymailCreds = hasPurelymailConfig(c.env, null);
    return c.json({
      modules: parseModulesConfig(null, { hasDocuSealCreds, hasPurelymailCreds }),
      integrations: { docusealConfigured: hasDocuSealCreds, purelymailConfigured: hasPurelymailCreds },
    });
  }
});

settingsRoutes.put('/modules', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const hasDocuSealCreds = Boolean(
    c.env.DOCUSEAL_URL?.trim() && c.env.DOCUSEAL_API_TOKEN?.trim()
  );
  let comp: any = null;
  try {
    comp = await c.env.DB.prepare(
      `SELECT purelymail_domain, purelymail_api_token, purelymail_smtp_pass FROM companies LIMIT 1`
    ).first<any>();
  } catch {
    // ignore
  }
  const hasPurelymailCreds = hasPurelymailConfig(c.env, comp);
  const normalized = parseModulesConfig(body.modules || body, { hasDocuSealCreds, hasPurelymailCreds });
  const json = JSON.stringify(normalized);

  try {
    await c.env.DB.prepare(
      `UPDATE companies SET modules_json = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 'default'`
    )
      .bind(json)
      .run();
  } catch (err: any) {
    if (String(err?.message || '').includes('no such column')) {
      await c.env.DB.prepare(`ALTER TABLE companies ADD COLUMN modules_json TEXT`).run();
      await c.env.DB.prepare(
        `UPDATE companies SET modules_json = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 'default'`
      )
        .bind(json)
        .run();
    } else {
      throw err;
    }
  }

  return c.json({
    message: 'Konfigurasi modul berhasil diperbarui.',
    modules: normalized,
  });
});

const ALLOWED_LOGO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Upload Company Logo (supports multipart/form-data or JSON base64)
settingsRoutes.post('/company/logo', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const reqType = (c.req.header('Content-Type') || '').toLowerCase();

  let fileData: Uint8Array | null = null;
  let contentType = 'image/png';

  if (reqType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const uploaded = formData.get('file') || formData.get('logo');
    if (uploaded && typeof uploaded !== 'string') {
      const f = uploaded as unknown as File;
      contentType = (f.type || 'image/png').toLowerCase();
      fileData = new Uint8Array(await f.arrayBuffer());
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    const base64Input = body.logo_base64 || body.logoBase64 || body.file;
    if (typeof base64Input === 'string' && base64Input.trim()) {
      const parts = base64Input.split(',');
      if (parts.length === 2 && parts[0].startsWith('data:')) {
        const mimeMatch = parts[0].match(/:(.*?);/);
        if (mimeMatch) contentType = mimeMatch[1].toLowerCase();
        const bin = atob(parts[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        fileData = bytes;
      } else {
        const bin = atob(base64Input.trim());
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        fileData = bytes;
        if (body.content_type) contentType = String(body.content_type).toLowerCase();
      }
    }
  }

  if (!fileData || fileData.byteLength === 0) {
    return c.json({ error: 'File logo wajib diunggah.' }, 400);
  }
  if (!ALLOWED_LOGO_TYPES.has(contentType)) {
    return c.json({ error: 'Format logo harus PNG, JPG, WEBP, atau SVG.' }, 400);
  }
  if (fileData.byteLength > MAX_LOGO_BYTES) {
    return c.json({ error: 'Ukuran logo maksimal 2 MB.' }, 400);
  }

  await putFile(c.env, {
    key: 'company/logo',
    data: fileData,
    contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType,
  });

  const logoUrl = `/api/public/company-logo?v=${Date.now()}`;
  await c.env.DB.prepare(
    `UPDATE companies SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 'default'`
  )
    .bind(logoUrl)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'UPLOAD_COMPANY_LOGO', 'companies', 'default', ?)`
  )
    .bind(makeId('aud'), user.userId, JSON.stringify({ logo_url: logoUrl, contentType }))
    .run();

  return c.json({ message: 'Logo perusahaan berhasil diunggah.', logo_url: logoUrl });
});

// Remove Company Logo (fall back to openHR initials/branding)
settingsRoutes.delete('/company/logo', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  await deleteFile(c.env, 'company/logo');

  await c.env.DB.prepare(
    `UPDATE companies SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 'default'`
  ).run();

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', ?, 'DELETE_COMPANY_LOGO', 'companies', 'default', '{}')`
  )
    .bind(makeId('aud'), user.userId)
    .run();

  return c.json({ message: 'Logo perusahaan berhasil dihapus.', logo_url: null });
});

async function runPurelymailApiTest(c: any, apiToken: string | null) {
  if (!apiToken) {
    return {
      status: 'warning',
      message: 'API Token belum diisi. Otomatisasi pembuatan email karyawan dalam mode simulasi.',
    };
  }
  try {
    const baseUrl = c.env.PURELYMAIL_API_BASE_URL || 'https://purelymail.com';
    const apiRes = await fetch(`${baseUrl}/api/v0/checkAccountCredit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Purelymail-Api-Token': apiToken,
      },
      body: JSON.stringify({}),
    });
    const apiData: any = await apiRes.json().catch(() => null);
    if (apiRes.ok && apiData?.type === 'success') {
      const credit = apiData?.result?.credit !== undefined ? `$${apiData.result.credit}` : 'Aktif';
      return {
        status: 'ok',
        message: `Token API Purelymail VALID! Saldo Akun: ${credit}`,
        credit: apiData?.result?.credit,
      };
    }
    const errDetail = apiData?.message || apiData?.code || `HTTP ${apiRes.status}`;
    return { status: 'error', message: `Token API GAGAL: ${errDetail}` };
  } catch (err: any) {
    return { status: 'error', message: `Koneksi API Purelymail gagal: ${err.message}` };
  }
}

async function runSmtpTest(
  c: any,
  comp: any,
  params: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    fromAddress: string;
    smtpPass: string | null;
    domainName?: string;
    testRecipient: string;
  }
) {
  if (!params.smtpPass || !params.fromAddress || !params.testRecipient) {
    return {
      status: 'warning',
      message: 'Isi alamat pengirim, password SMTP, dan penerima uji coba terlebih dahulu.',
    };
  }
  try {
    const compName = comp?.legal_name || comp?.name || 'Portal HR';
    const emailData = getTestEmail({
      companyName: compName,
      fromAddress: params.fromAddress,
      smtpHost: params.smtpHost,
    });
    const sendRes = await sendEmail(c.env, {
      to: params.testRecipient,
      subject: `Uji koneksi email (Email connection test) - ${compName}`,
      text: emailData.text,
      html: emailData.html,
      type: 'general',
      fromAddress: params.fromAddress,
      smtpHost: params.smtpHost,
      smtpPort: params.smtpPort,
      smtpUser: params.smtpUser,
      smtpPass: params.smtpPass,
      domainName: params.domainName,
      senderName: compName,
    });
    if (sendRes.success && !sendRes.simulated) {
      return {
        status: 'ok',
        message: `Email uji coba berhasil dikirim ke ${params.testRecipient} via ${params.smtpHost}:${params.smtpPort}!`,
      };
    }
    if (sendRes.simulated) {
      return {
        status: 'warning',
        message: 'Password SMTP belum dikonfigurasi (pengiriman masih simulasi lokal).',
      };
    }
    return { status: 'error', message: sendRes.error || 'Gagal mengirim email melalui server SMTP.' };
  } catch (err: any) {
    return { status: 'error', message: `Error SMTP: ${err.message}` };
  }
}

// Separate Test: Purelymail API Token (Mailbox Provisioning)
settingsRoutes.post('/test-purelymail-api', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const comp = await c.env.DB.prepare(`SELECT * FROM companies LIMIT 1`).first<any>();
  const apiToken = (body.purelymail_api_token !== undefined ? body.purelymail_api_token?.trim() : null) || comp?.purelymail_api_token || c.env.PURELYMAIL_API_TOKEN || null;
  const domainName = (body.purelymail_domain !== undefined ? body.purelymail_domain?.trim() : null) || comp?.purelymail_domain || c.env.PURELYMAIL_DOMAIN || null;

  if (body.purelymail_api_token || body.purelymail_domain) {
    await c.env.DB.prepare(
      `UPDATE companies SET
        purelymail_domain = COALESCE(?, purelymail_domain),
        purelymail_api_token = COALESCE(?, purelymail_api_token),
        updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = 'default'`
    )
      .bind(domainName, apiToken)
      .run()
      .catch(() => {});
  }

  return c.json(await runPurelymailApiTest(c, apiToken));
});

// Separate Test: SMTP Email Delivery
settingsRoutes.post('/test-smtp', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const user = c.get('user');
  const comp = await c.env.DB.prepare(`SELECT * FROM companies LIMIT 1`).first<any>();

  const smtpHost = (body.smtp_host !== undefined ? body.smtp_host?.trim() : null) || comp?.smtp_host || c.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com';
  const smtpPort = Number((body.smtp_port !== undefined ? body.smtp_port : null) || comp?.smtp_port || c.env.PURELYMAIL_SMTP_PORT || 465);
  const fromAddress = (body.purelymail_from_address !== undefined ? body.purelymail_from_address?.trim() : null) || comp?.purelymail_from_address || c.env.PURELYMAIL_FROM_ADDRESS || '';
  const smtpUser = (body.smtp_user !== undefined ? body.smtp_user?.trim() : null) || comp?.smtp_user || c.env.PURELYMAIL_SMTP_USER || fromAddress;
  const smtpPass = (body.purelymail_smtp_pass !== undefined ? body.purelymail_smtp_pass?.trim() : null) || comp?.purelymail_smtp_pass || c.env.PURELYMAIL_SMTP_PASS || null;
  const domainName = comp?.purelymail_domain || c.env.PURELYMAIL_DOMAIN;
  const testRecipient = body.test_recipient?.trim() || user?.email || fromAddress;

  if (body.smtp_host || body.smtp_port || body.smtp_user || body.purelymail_from_address || body.purelymail_smtp_pass) {
    try {
      await c.env.DB.prepare(
        `UPDATE companies SET
          purelymail_from_address = COALESCE(?, purelymail_from_address),
          purelymail_smtp_pass = COALESCE(?, purelymail_smtp_pass),
          smtp_host = COALESCE(?, smtp_host),
          smtp_port = COALESCE(?, smtp_port),
          smtp_user = COALESCE(?, smtp_user),
          updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = 'default'`
      )
        .bind(
          body.purelymail_from_address?.trim() || null,
          body.purelymail_smtp_pass?.trim() || null,
          body.smtp_host?.trim() || null,
          Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : null,
          body.smtp_user?.trim() || null
        )
        .run();
    } catch {
      // fallback if smtp_* columns are not yet present
    }
  }

  return c.json(
    await runSmtpTest(c, comp, {
      smtpHost,
      smtpPort: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : 465,
      smtpUser,
      fromAddress,
      smtpPass,
      domainName,
      testRecipient,
    })
  );
});

// Combined Purelymail test endpoint (kept for backward compatibility)
settingsRoutes.post('/test-purelymail', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const user = c.get('user');
  const comp = await c.env.DB.prepare(`SELECT * FROM companies LIMIT 1`).first<any>();
  const apiToken = (body.purelymail_api_token !== undefined ? body.purelymail_api_token?.trim() : null) || comp?.purelymail_api_token || c.env.PURELYMAIL_API_TOKEN || null;
  const domainName = (body.purelymail_domain !== undefined ? body.purelymail_domain?.trim() : null) || comp?.purelymail_domain || c.env.PURELYMAIL_DOMAIN;
  const fromAddress = (body.purelymail_from_address !== undefined ? body.purelymail_from_address?.trim() : null) || comp?.purelymail_from_address || c.env.PURELYMAIL_FROM_ADDRESS || '';
  const smtpHost = (body.smtp_host !== undefined ? body.smtp_host?.trim() : null) || comp?.smtp_host || c.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com';
  const smtpPort = Number((body.smtp_port !== undefined ? body.smtp_port : null) || comp?.smtp_port || c.env.PURELYMAIL_SMTP_PORT || 465);
  const smtpUser = (body.smtp_user !== undefined ? body.smtp_user?.trim() : null) || comp?.smtp_user || c.env.PURELYMAIL_SMTP_USER || fromAddress;
  const smtpPass = (body.purelymail_smtp_pass !== undefined ? body.purelymail_smtp_pass?.trim() : null) || comp?.purelymail_smtp_pass || c.env.PURELYMAIL_SMTP_PASS || null;
  const testRecipient = body.test_recipient?.trim() || user?.email || fromAddress;

  const [api, smtp] = await Promise.all([
    runPurelymailApiTest(c, apiToken),
    runSmtpTest(c, comp, {
      smtpHost,
      smtpPort: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : 465,
      smtpUser,
      fromAddress,
      smtpPass,
      domainName,
      testRecipient,
    }),
  ]);
  return c.json({ api, smtp });
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
  const rows = await c.env.DB.prepare(
    `SELECT d.*, m.full_name AS manager_name
     FROM departments d
     LEFT JOIN employees m ON d.manager_id = m.id
     ORDER BY d.name ASC`
  )
    .all<any>()
    .catch(() => c.env.DB.prepare(`SELECT * FROM departments ORDER BY name ASC`).all<any>());
  return c.json({ departments: rows.results || [] });
});

settingsRoutes.post('/departments', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { name, code, manager_id } = body;
  if (!name) return c.json({ error: 'Nama departemen wajib diisi' }, 400);

  const id = `dept-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO departments (id, tenant_id, company_id, name, code)
     VALUES (?, 'default', 'comp-nusantara', ?, ?)`
  )
    .bind(id, name, code || null)
    .run();

  if (manager_id) {
    await c.env.DB.prepare(`UPDATE departments SET manager_id = ? WHERE id = ?`)
      .bind(manager_id, id)
      .run()
      .catch(() => {});
  }

  return c.json({ message: 'Departemen berhasil ditambahkan', departmentId: id });
});

settingsRoutes.put('/departments/:id', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const { name, code, manager_id } = body;
  if (!name) return c.json({ error: 'Nama departemen wajib diisi' }, 400);

  const deptId = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE departments SET name = ?, code = COALESCE(?, code) WHERE id = ?`
  )
    .bind(name, code || null, deptId)
    .run();

  if (manager_id !== undefined) {
    await c.env.DB.prepare(`UPDATE departments SET manager_id = ? WHERE id = ?`)
      .bind(manager_id || null, deptId)
      .run()
      .catch(() => {});
  }

  return c.json({ message: 'Departemen berhasil diperbarui' });
});

settingsRoutes.delete('/departments/:id', requireRole(['owner_admin']), async (c) => {
  const deptId = c.req.param('id');
  const used = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM employees WHERE department_id = ?`
  )
    .bind(deptId)
    .first<any>();

  if (used && used.count > 0) {
    return c.json({ error: `Departemen tidak dapat dihapus karena masih dipakai oleh ${used.count} karyawan` }, 400);
  }

  await c.env.DB.prepare(`DELETE FROM departments WHERE id = ?`).bind(deptId).run();
  return c.json({ message: 'Departemen berhasil dihapus' });
});

// 3b. Anti-Fake GPS & Security Policy + Events
settingsRoutes.get('/security', async (c) => {
  const policy = await getSecurityPolicy(c.env.DB);
  return c.json({ policy });
});

settingsRoutes.put('/security', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json();
  const mode = normalizeAntiFakeMode(body.anti_fake_gps_mode);
  const blockRooted = body.block_rooted_devices ? 1 : 0;
  const enforceBinding = body.enforce_device_binding ? 1 : 0;
  const maxSpeed = Math.max(50, Number(body.max_travel_speed_kmh || 250));

  await c.env.DB.prepare(
    `UPDATE companies
     SET anti_fake_gps_mode = ?, block_rooted_devices = ?, enforce_device_binding = ?, max_travel_speed_kmh = ?, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(mode, blockRooted, enforceBinding, maxSpeed)
    .run();

  const policy = await getSecurityPolicy(c.env.DB);
  return c.json({ policy, message: 'Kebijakan keamanan presensi diperbarui.' });
});

settingsRoutes.get('/security/events', requireRole(['owner_admin', 'manager']), async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      `SELECT se.*, e.full_name, e.nik
       FROM security_events se
       LEFT JOIN employees e ON se.employee_id = e.id
       ORDER BY se.created_at DESC
       LIMIT 50`
    ).all<any>();
    return c.json({ events: rows.results || [] });
  } catch {
    return c.json({ events: [] });
  }
});

// Notifications outbox (delivery status)
settingsRoutes.get('/notifications', requireRole(['owner_admin']), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, to_email, subject, notification_type, status, error_message, created_at, sent_at
     FROM notifications_outbox ORDER BY created_at DESC LIMIT 50`
  ).all<any>();
  return c.json({ notifications: rows.results || [] });
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
    .bind(makeId('aud'), user.userId, old.id, JSON.stringify(old), JSON.stringify(body))
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

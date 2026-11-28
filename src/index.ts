import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from './types';
import { authRoutes } from './routes/auth';
import { employeeRoutes } from './routes/employees';
import { attendanceRoutes } from './routes/attendance';
import { leaveRoutes } from './routes/leave';
import { shiftRoutes } from './routes/shifts';
import { payrollRoutes } from './routes/payroll';
import { kasbonRoutes } from './routes/kasbon';
import { pettyCashRoutes } from './routes/petty-cash';
import { reportRoutes } from './routes/reports';
import { settingsRoutes } from './routes/settings';
import { signingRoutes } from './routes/signing';
import { templateRoutes } from './routes/templates';
import { taskRoutes } from './routes/tasks';
import { announcementRoutes } from './routes/announcements';
import { assetRoutes } from './routes/assets';
import { offboardingRoutes } from './routes/offboarding';
import { performanceRoutes } from './routes/performance';
import { recruitmentRoutes } from './routes/recruitment';
import { careersRoutes } from './routes/careers';
import { webhookRoutes } from './routes/webhooks';
import { employeeLevelRoutes } from './routes/employee-levels';
import { getFile } from './services/storage';
import { verifyPettyCashToken } from './services/petty-cash-workflow';
import { requireModule } from './middleware/modules';
import { hasPurelymailConfig, parseModulesConfig } from '../shared/modules';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for API
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    app: 'openHR Indonesian SME HR & Payroll',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Public Company Profile endpoint (for branding on login & unauthenticated views)
app.get('/api/public/company', async (c) => {
  try {
    let comp: any = null;
    try {
      comp = await c.env.DB.prepare(
        `SELECT name, legal_name, logo_url, address, phone, email, custom_domain, purelymail_domain, purelymail_api_token, purelymail_smtp_pass, modules_json, anti_fake_gps_mode, block_rooted_devices, enforce_device_binding FROM companies LIMIT 1`
      ).first<any>();
    } catch {
      comp = await c.env.DB.prepare(
        `SELECT name, legal_name, logo_url, address, phone, email, custom_domain, purelymail_domain FROM companies LIMIT 1`
      ).first<any>();
    }
    const hasPurelymailCreds = hasPurelymailConfig(c.env, comp);
    if (comp) {
      delete comp.purelymail_api_token;
      delete comp.purelymail_smtp_pass;
    }
    const hasDocuSealCreds = Boolean(
      c.env.DOCUSEAL_URL?.trim() && c.env.DOCUSEAL_API_TOKEN?.trim()
    );
    const modules = parseModulesConfig(comp?.modules_json, { hasDocuSealCreds, hasPurelymailCreds });
    const securityPolicy = {
      anti_fake_gps_mode: comp?.anti_fake_gps_mode || 'block',
      block_rooted_devices: Boolean(comp?.block_rooted_devices),
      enforce_device_binding: Boolean(comp?.enforce_device_binding),
    };
    return c.json({ company: comp ? { ...comp, modules, securityPolicy } : null });
  } catch (err: any) {
    return c.json({ company: null });
  }
});

// Public Mobile App Connect Info (returns LAN URL in local dev, or configured domain in prod)
app.get('/api/public/connect-info', async (c) => {
  const devLan = c.env.DEV_LAN_URL?.trim();
  if (devLan) {
    return c.json({ url: devLan });
  }
  try {
    const comp = await c.env.DB.prepare(`SELECT custom_domain FROM companies LIMIT 1`).first<any>();
    const rawDomain = comp?.custom_domain?.trim();
    if (rawDomain) {
      const url = rawDomain.startsWith('http://') || rawDomain.startsWith('https://')
        ? rawDomain.replace(/\/+$/, '')
        : `https://${rawDomain.replace(/\/+$/, '')}`;
      return c.json({ url });
    }
  } catch {
    // ignore DB errors
  }
  return c.json({ url: null });
});

// Public Company Logo binary endpoint
app.get('/api/public/company-logo', async (c) => {
  try {
    const file = await getFile(c.env, 'company/logo');
    if (!file) {
      return c.json({ error: 'Logo not found' }, 404);
    }
    c.header('Content-Type', file.contentType || 'image/png');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(file.data as any);
  } catch {
    return c.json({ error: 'Logo not found' }, 404);
  }
});

// Public Petty Cash Report Verification & Viewing (token-signed)
app.get('/api/public/petty-cash/:id', async (c) => {
  const id = c.req.param('id');
  const token = c.req.query('token') || '';

  const valid = await verifyPettyCashToken(c.env.JWT_SECRET, id, token);
  if (!valid) {
    return c.json({ error: 'Invalid or expired verification token.' }, 403);
  }

  const [request, expensesResult, receiptsResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT p.id, p.reference_no, p.purpose, p.status, p.requested_amount,
              p.disbursed_amount, p.total_realized, p.variance,
              p.created_at, p.approved_at, p.report_submitted_at, p.report_reviewed_at,
              e.nik, e.full_name, e.job_title,
              d.name AS department_name,
              app.full_name AS approver_name,
              rev.full_name AS reviewer_name
       FROM petty_cash_requests p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN users u_app ON p.approved_by = u_app.id
       LEFT JOIN employees app ON u_app.employee_id = app.id
       LEFT JOIN users u_rev ON p.report_reviewed_by = u_rev.id
       LEFT JOIN employees rev ON u_rev.employee_id = rev.id
       WHERE p.id = ?`
    )
      .bind(id)
      .first<any>(),
    c.env.DB.prepare(
      `SELECT id, request_id, expense_date, category, description, amount, vendor, notes, created_at
       FROM petty_cash_expenses
       WHERE request_id = ?
       ORDER BY expense_date ASC, created_at ASC`
    )
      .bind(id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT id, request_id, expense_id, file_name, mime_type, file_size, uploaded_at
       FROM petty_cash_receipts
       WHERE request_id = ?
       ORDER BY uploaded_at ASC`
    )
      .bind(id)
      .all<any>(),
  ]);

  if (!request) {
    return c.json({ error: 'Petty cash report not found.' }, 404);
  }

  const encodedToken = encodeURIComponent(token);
  const receipts = (receiptsResult.results || []).map((receipt: any) => ({
    ...receipt,
    url: `/api/public/petty-cash/${id}/receipts/${receipt.id}?token=${encodedToken}`,
  }));

  const expenses = (expensesResult.results || []).map((expense: any) => ({
    ...expense,
    receipts: receipts.filter((receipt: any) => receipt.expense_id === expense.id),
  }));

  return c.json({
    verified: true,
    request,
    expenses,
    totals: {
      requested_amount: Number(request.requested_amount || 0),
      disbursed_amount: Number(request.disbursed_amount ?? request.requested_amount ?? 0),
      total_realized: Number(request.total_realized || 0),
      variance: Number(request.variance || 0),
    },
  });
});

app.get('/api/public/petty-cash/:id/receipts/:receiptId', async (c) => {
  const id = c.req.param('id');
  const receiptId = c.req.param('receiptId');
  const token = c.req.query('token') || '';

  const valid = await verifyPettyCashToken(c.env.JWT_SECRET, id, token);
  if (!valid) {
    return c.json({ error: 'Invalid or expired verification token.' }, 403);
  }

  const receipt = await c.env.DB.prepare(
    `SELECT id, file_key, file_name, mime_type FROM petty_cash_receipts
     WHERE id = ? AND request_id = ?`
  )
    .bind(receiptId, id)
    .first<any>();
  if (!receipt) return c.json({ error: 'Receipt not found.' }, 404);

  const file = await getFile(c.env, receipt.file_key);
  if (!file) return c.json({ error: 'Receipt file not found.' }, 404);

  const contentType = file.contentType || receipt.mime_type || 'application/octet-stream';
  const isDoc =
    contentType.includes('spreadsheet') ||
    contentType.includes('excel') ||
    contentType.includes('csv') ||
    String(receipt.file_name || '').match(/\.(xlsx|xls|csv)$/i);

  c.header('Content-Type', contentType);
  c.header('Content-Disposition', `${isDoc ? 'attachment' : 'inline'}; filename="${receipt.file_name || 'receipt'}"`);
  c.header('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800');
  return c.body(file.data as any);
});

// Web app manifest (company-aware, required for a valid install prompt)
app.get('/api/manifest.webmanifest', async (c) => {
  let companyName = 'HR & Payroll';
  try {
    const comp = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
    if (comp?.name && String(comp.name).trim()) companyName = String(comp.name).trim();
  } catch {
    // Fall back to the generic name when the DB is unavailable
  }

  const origin = new URL(c.req.url).origin;
  const cleaned = companyName.replace(/^(PT|CV|UD|TBK|NV|FIRMA)\.?\s+/i, '').trim();
  const shortName =
    cleaned.length <= 15 ? cleaned : (cleaned.split(/\s+/)[0] || 'HR').slice(0, 15);

  return c.json(
    {
      name: companyName,
      short_name: shortName,
      description: 'Sistem HR dan penggajian',
      lang: 'id',
      start_url: `${origin}/`,
      scope: `${origin}/`,
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#f8fafc',
      theme_color: '#2563eb',
      icons: [
        { src: `${origin}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${origin}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${origin}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    200,
    { 'Content-Type': 'application/manifest+json' }
  );
});

// Module guards
app.use('/api/attendance/*', requireModule('attendance'));
app.use('/api/leave/*', requireModule('leave'));
app.use('/api/shifts/*', requireModule('shifts'));
app.use('/api/payroll/*', requireModule('payroll'));
app.use('/api/kasbon/*', requireModule('claims'));
app.use('/api/petty-cash/*', requireModule('petty_cash'));
app.use('/api/tasks/*', requireModule('tasks'));
app.use('/api/announcements/*', requireModule('announcements'));
app.use('/api/assets/*', requireModule('assets'));
app.use('/api/offboarding/*', requireModule('offboarding'));
app.use('/api/performance/*', requireModule('performance'));
app.use('/api/recruitment/*', requireModule('recruitment'));
app.use('/api/reports/*', requireModule('reports'));
app.use('/api/hr/signing/*', requireModule('signing'));
app.use('/api/hr/documents/*', requireModule('signing'));

// Mount Routes
app.route('/api/auth', authRoutes);
app.route('/api/employees', employeeRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/leave', leaveRoutes);
app.route('/api/shifts', shiftRoutes);
app.route('/api/payroll', payrollRoutes);
app.route('/api/kasbon', kasbonRoutes);
app.route('/api/petty-cash', pettyCashRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/announcements', announcementRoutes);
app.route('/api/assets', assetRoutes);
app.route('/api/offboarding', offboardingRoutes);
app.route('/api/performance', performanceRoutes);
app.route('/api/recruitment', recruitmentRoutes);
app.route('/api/public/careers', careersRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/levels', employeeLevelRoutes);
app.route('/api/templates', templateRoutes);
app.route('/api/hr', signingRoutes);

// DocuSeal webhook (unauthenticated; verified via HMAC signature header)
app.route('/webhooks', webhookRoutes);

// Global Error Handler
app.onError((err, c) => {
  console.error('[Application Error]:', err);
  return c.json(
    {
      error: err.message || 'Terjadi kesalahan pada server',
    },
    500
  );
});

// Static Assets Handler for Cloudflare Workers
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('openHR API is running. Frontend static assets are served during build or dev server.', 200);
});

export default app;

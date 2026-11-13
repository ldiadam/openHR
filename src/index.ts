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
import { reportRoutes } from './routes/reports';
import { settingsRoutes } from './routes/settings';
import { signingRoutes } from './routes/signing';
import { webhookRoutes } from './routes/webhooks';
import { getFile } from './services/storage';

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
    const comp = await c.env.DB.prepare(
      `SELECT name, legal_name, logo_url, address, phone, email, custom_domain, purelymail_domain FROM companies LIMIT 1`
    ).first<any>();
    return c.json({ company: comp || null });
  } catch (err: any) {
    return c.json({ company: null });
  }
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

// Mount Routes
app.route('/api/auth', authRoutes);
app.route('/api/employees', employeeRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/leave', leaveRoutes);
app.route('/api/shifts', shiftRoutes);
app.route('/api/payroll', payrollRoutes);
app.route('/api/kasbon', kasbonRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/settings', settingsRoutes);
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

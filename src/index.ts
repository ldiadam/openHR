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

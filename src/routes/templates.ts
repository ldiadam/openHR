import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import {
  CLAIM_TEMPLATE_PLACEHOLDERS,
  FormTemplateKey,
  parseClaimSheetTemplate,
} from '../../shared/formTemplates';
import {
  buildClaimSheetWorkbook,
  buildStarterClaimTemplateWorkbook,
  writeClaimWorkbookBuffer,
} from '../services/claim-excel';
import {
  loadClaimSheetTemplate,
  loadLeaveFormTemplate,
  resetFormTemplate,
  saveClaimSheetCustomXlsx,
  saveFormTemplateBuilder,
} from '../services/form-templates';

export const templateRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

templateRoutes.use('*', authMiddleware);

function isTemplateKey(raw: string): raw is FormTemplateKey {
  return raw === 'claim_sheet' || raw === 'leave_form';
}

function decodeXlsxBase64(raw: string): Uint8Array | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let b64 = raw.trim();
  if (b64.startsWith('data:')) {
    const comma = b64.indexOf(',');
    if (comma < 0) return null;
    b64 = b64.slice(comma + 1);
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

templateRoutes.get('/:key', async (c) => {
  const key = c.req.param('key');
  if (!isTemplateKey(key)) {
    return c.json({ error: 'Template key tidak valid.' }, 400);
  }

  if (key === 'claim_sheet') {
    const loaded = await loadClaimSheetTemplate(c.env, { withBytes: false });
    return c.json({
      templateKey: loaded.templateKey,
      mode: loaded.mode,
      config: loaded.config,
      fileName: loaded.fileName,
      placeholders: loaded.placeholders,
      sheets: loaded.sheets,
      availablePlaceholders: CLAIM_TEMPLATE_PLACEHOLDERS,
      updatedAt: loaded.updatedAt,
    });
  }

  const loaded = await loadLeaveFormTemplate(c.env);
  return c.json({
    templateKey: loaded.templateKey,
    mode: loaded.mode,
    config: loaded.config,
    updatedAt: loaded.updatedAt,
  });
});

templateRoutes.put('/:key', requireRole(['owner_admin']), async (c) => {
  const key = c.req.param('key');
  if (!isTemplateKey(key)) {
    return c.json({ error: 'Template key tidak valid.' }, 400);
  }

  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Body JSON tidak valid.' }, 400);
  }

  const saved = await saveFormTemplateBuilder(c.env, key, (body as any).config ?? body, user.userId);
  return c.json({
    message: 'Template berhasil disimpan.',
    templateKey: key,
    mode: 'builder',
    config: saved,
  });
});

templateRoutes.post('/claim_sheet/upload', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const contentType = (c.req.header('Content-Type') || '').toLowerCase();

  let bytes: Uint8Array | null = null;
  let fileName = 'claim-template.xlsx';

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return c.json({ error: 'File .xlsx wajib diunggah.' }, 400);
    }
    const f = file as unknown as File;
    fileName = f.name || fileName;
    bytes = new Uint8Array(await f.arrayBuffer());
  } else {
    const body = await c.req.json().catch(() => ({} as any));
    fileName = String(body.file_name || body.fileName || fileName);
    bytes = decodeXlsxBase64(body.base64 || body.file_base64 || '');
  }

  if (!bytes || bytes.byteLength === 0) {
    return c.json({ error: 'File .xlsx tidak valid atau kosong.' }, 400);
  }
  if (bytes.byteLength > 5 * 1024 * 1024) {
    return c.json({ error: 'Ukuran template Excel maksimal 5 MB.' }, 400);
  }
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return c.json({ error: 'Format file harus .xlsx.' }, 400);
  }

  try {
    const result = await saveClaimSheetCustomXlsx(c.env, bytes, fileName, user.userId);
    return c.json({
      message: 'Template Excel custom berhasil diunggah.',
      mode: 'custom_xlsx',
      fileName: result.fileName,
      placeholders: result.placeholders,
      sheets: result.sheets,
    });
  } catch (err: any) {
    return c.json({ error: err?.message || 'Gagal membaca file .xlsx.' }, 400);
  }
});

templateRoutes.get('/claim_sheet/starter-xlsx', requireRole(['owner_admin']), async (c) => {
  const loaded = await loadClaimSheetTemplate(c.env, { withBytes: false });
  const wb = buildStarterClaimTemplateWorkbook(loaded.config);
  const buf = writeClaimWorkbookBuffer(wb);

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', 'attachment; filename="Claim_Template_Starter.xlsx"');
  return c.body(buf as any);
});

templateRoutes.post('/claim_sheet/preview', requireRole(['owner_admin']), async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const comp = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
  const loaded = await loadClaimSheetTemplate(c.env, { withBytes: true });

  const useCustom = body?.mode === 'custom_xlsx' || (!body?.config && loaded.mode === 'custom_xlsx');
  const templateConfig = body?.config
    ? parseClaimSheetTemplate(body.config)
    : loaded.config;

  const month = new Date().toISOString().slice(0, 7);
  const wb = buildClaimSheetWorkbook({
    companyName: comp?.name || 'PT Nusantara Maju',
    month,
    employeeName: 'Budi Santoso',
    employeeNik: 'EMP001',
    employeeJobTitle: 'Operations Lead',
    employeeDepartment: 'Operations',
    checkedByName: 'Siti Rahmawati',
    approverName: 'Direktur Utama',
    claims: [
      {
        expense_date: `${month}-03`,
        category: 'Transport',
        amount: 250000,
        description: 'Client visit transport',
        cost_centre: 'OPS-01',
        project_ref: 'PRJ-2026',
        remarks: 'Sample receipt #1',
      },
      {
        expense_date: `${month}-05`,
        category: 'Food',
        amount: 175000,
        description: 'Working lunch with vendor',
        cost_centre: 'OPS-01',
        project_ref: 'PRJ-2026',
        remarks: 'Sample receipt #2',
      },
    ],
    includeSalary: true,
    salaryAmount: 10000000,
    salaryDate: `${month}-25`,
    salaryRemarks: 'Operations Lead',
    templateConfig,
    customTemplateBytes: useCustom ? loaded.customTemplateBytes : null,
    attendance: [
      {
        date: `${month}-03`,
        status: 'present',
        clock_in_time: '08:55:00',
        clock_out_time: '17:05:00',
        late_minutes: 0,
        clock_in_status: 'in_geofence',
        source: 'mobile',
      },
    ],
    attendancePeriod: { start: `${month}-01`, end: `${month}-25` },
  });

  const buf = writeClaimWorkbookBuffer(wb);
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', 'attachment; filename="Claim_Sheet_Preview.xlsx"');
  return c.body(buf as any);
});

templateRoutes.post('/:key/reset', requireRole(['owner_admin']), async (c) => {
  const key = c.req.param('key');
  if (!isTemplateKey(key)) {
    return c.json({ error: 'Template key tidak valid.' }, 400);
  }

  await resetFormTemplate(c.env, key);
  if (key === 'claim_sheet') {
    const loaded = await loadClaimSheetTemplate(c.env, { withBytes: false });
    return c.json({
      message: 'Template Claim Sheet dikembalikan ke default.',
      templateKey: key,
      mode: loaded.mode,
      config: loaded.config,
    });
  }

  const loaded = await loadLeaveFormTemplate(c.env);
  return c.json({
    message: 'Template Leave Form dikembalikan ke default.',
    templateKey: key,
    mode: loaded.mode,
    config: loaded.config,
  });
});

import { Bindings } from '../types';
import { makeId } from '../utils/id';
import { getFile, putFile, deleteFile } from './storage';
import { parseModulesConfig } from '../../shared/modules';
import {
  ClaimSheetTemplateConfig,
  DEFAULT_CLAIM_SHEET_TEMPLATE,
  DEFAULT_LEAVE_FORM_TEMPLATE,
  FormTemplateKey,
  FormTemplateMode,
  LeaveFormTemplateConfig,
  parseClaimSheetTemplate,
  parseLeaveFormTemplate,
} from '../../shared/formTemplates';
import { detectXlsxPlaceholders } from './claim-excel';

export interface LoadedFormTemplate<T> {
  templateKey: FormTemplateKey;
  mode: FormTemplateMode;
  config: T;
  fileKey: string | null;
  fileName: string | null;
  placeholders: string[];
  sheets: string[];
  customTemplateBytes: Uint8Array | null;
  updatedAt: string | null;
}

async function loadLegacyModulesFallback(env: Bindings) {
  try {
    const comp = await env.DB.prepare(`SELECT modules_json FROM companies LIMIT 1`).first<any>();
    return parseModulesConfig(comp?.modules_json);
  } catch {
    return parseModulesConfig(null);
  }
}

async function ensureTable(env: Bindings) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS form_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      template_key TEXT NOT NULL CHECK (template_key IN ('claim_sheet', 'leave_form')),
      mode TEXT NOT NULL DEFAULT 'builder' CHECK (mode IN ('builder', 'custom_xlsx')),
      config_json TEXT NOT NULL,
      file_key TEXT,
      file_name TEXT,
      updated_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, template_key)
    )`
  ).run();
}

export async function loadClaimSheetTemplate(
  env: Bindings,
  opts: { withBytes?: boolean } = {}
): Promise<LoadedFormTemplate<ClaimSheetTemplateConfig>> {
  const legacy = await loadLegacyModulesFallback(env);
  let row: any = null;
  try {
    row = await env.DB.prepare(
      `SELECT * FROM form_templates WHERE tenant_id = 'default' AND template_key = 'claim_sheet' LIMIT 1`
    ).first<any>();
  } catch {
    row = null;
  }

  const config = row
    ? parseClaimSheetTemplate(row.config_json, legacy)
    : parseClaimSheetTemplate(null, legacy);
  const mode: FormTemplateMode = row?.mode === 'custom_xlsx' && row?.file_key ? 'custom_xlsx' : 'builder';

  let customTemplateBytes: Uint8Array | null = null;
  let placeholders: string[] = [];
  let sheets: string[] = [];

  if (mode === 'custom_xlsx' && row?.file_key) {
    const file = await getFile(env, row.file_key);
    if (file?.data) {
      customTemplateBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      if (!opts.withBytes) {
        try {
          const detected = detectXlsxPlaceholders(customTemplateBytes);
          placeholders = detected.placeholders;
          sheets = detected.sheets;
        } catch {
          // ignore inspection error
        }
      }
    }
  }

  return {
    templateKey: 'claim_sheet',
    mode: customTemplateBytes ? mode : 'builder',
    config,
    fileKey: row?.file_key || null,
    fileName: row?.file_name || null,
    placeholders,
    sheets,
    customTemplateBytes: opts.withBytes ? customTemplateBytes : null,
    updatedAt: row?.updated_at || null,
  };
}

export async function loadLeaveFormTemplate(
  env: Bindings
): Promise<LoadedFormTemplate<LeaveFormTemplateConfig>> {
  let row: any = null;
  try {
    row = await env.DB.prepare(
      `SELECT * FROM form_templates WHERE tenant_id = 'default' AND template_key = 'leave_form' LIMIT 1`
    ).first<any>();
  } catch {
    row = null;
  }

  const config = row ? parseLeaveFormTemplate(row.config_json) : structuredClone(DEFAULT_LEAVE_FORM_TEMPLATE);
  return {
    templateKey: 'leave_form',
    mode: 'builder',
    config,
    fileKey: null,
    fileName: null,
    placeholders: [],
    sheets: [],
    customTemplateBytes: null,
    updatedAt: row?.updated_at || null,
  };
}

export async function saveFormTemplateBuilder(
  env: Bindings,
  key: FormTemplateKey,
  rawConfig: unknown,
  userId: string
): Promise<ClaimSheetTemplateConfig | LeaveFormTemplateConfig> {
  await ensureTable(env);

  const normalized =
    key === 'claim_sheet'
      ? parseClaimSheetTemplate(rawConfig as any)
      : parseLeaveFormTemplate(rawConfig as any);

  const existing = await env.DB.prepare(
    `SELECT id, file_key, file_name FROM form_templates WHERE tenant_id = 'default' AND template_key = ?`
  )
    .bind(key)
    .first<any>();

  const json = JSON.stringify(normalized);
  if (existing) {
    await env.DB.prepare(
      `UPDATE form_templates
       SET mode = 'builder', config_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(json, userId, existing.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO form_templates (id, tenant_id, template_key, mode, config_json, updated_by)
       VALUES (?, 'default', ?, 'builder', ?, ?)`
    )
      .bind(makeId('tpl'), key, json, userId)
      .run();
  }

  return normalized;
}

export async function saveClaimSheetCustomXlsx(
  env: Bindings,
  bytes: Uint8Array,
  fileName: string,
  userId: string
): Promise<{ fileName: string; placeholders: string[]; sheets: string[] }> {
  await ensureTable(env);
  const detected = detectXlsxPlaceholders(bytes);
  if (detected.sheets.length === 0) {
    throw new Error('Workbook Excel tidak memiliki sheet.');
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'claim-template.xlsx';
  const fileKey = `templates/claim_sheet/${Date.now()}-${safeName}`;

  const existing = await env.DB.prepare(
    `SELECT id, file_key, config_json FROM form_templates WHERE tenant_id = 'default' AND template_key = 'claim_sheet'`
  ).first<any>();

  await putFile(env, {
    key: fileKey,
    data: bytes,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  if (existing?.file_key) {
    await deleteFile(env, existing.file_key).catch(() => {});
  }

  const configJson = existing?.config_json || JSON.stringify(DEFAULT_CLAIM_SHEET_TEMPLATE);
  if (existing) {
    await env.DB.prepare(
      `UPDATE form_templates
       SET mode = 'custom_xlsx', config_json = ?, file_key = ?, file_name = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(configJson, fileKey, safeName, userId, existing.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO form_templates (id, tenant_id, template_key, mode, config_json, file_key, file_name, updated_by)
       VALUES (?, 'default', 'claim_sheet', 'custom_xlsx', ?, ?, ?, ?)`
    )
      .bind(makeId('tpl'), configJson, fileKey, safeName, userId)
      .run();
  }

  return { fileName: safeName, placeholders: detected.placeholders, sheets: detected.sheets };
}

export async function resetFormTemplate(env: Bindings, key: FormTemplateKey): Promise<void> {
  try {
    const existing = await env.DB.prepare(
      `SELECT id, file_key FROM form_templates WHERE tenant_id = 'default' AND template_key = ?`
    )
      .bind(key)
      .first<any>();
    if (existing?.file_key) {
      await deleteFile(env, existing.file_key).catch(() => {});
    }
    await env.DB.prepare(
      `DELETE FROM form_templates WHERE tenant_id = 'default' AND template_key = ?`
    )
      .bind(key)
      .run();
  } catch {
    // ignore if table does not exist yet
  }
}

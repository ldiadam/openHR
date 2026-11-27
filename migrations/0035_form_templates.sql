-- Migration 0035: customizable form & export templates (claim_sheet, leave_form)
CREATE TABLE IF NOT EXISTS form_templates (
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
);

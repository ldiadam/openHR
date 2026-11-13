-- Migration 0014: DocuSeal e-signature integration
-- Templates, signing requests, signers, stored signed documents, webhook event log.

CREATE TABLE IF NOT EXISTS hr_document_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    docuseal_template_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    visibility TEXT NOT NULL DEFAULT 'standard' CHECK(visibility IN ('standard', 'restricted')),
    retention_months INTEGER NOT NULL DEFAULT 60,
    effective_from TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, version)
);

CREATE TABLE IF NOT EXISTS signing_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    template_id TEXT,
    template_code TEXT,
    template_version INTEGER,
    workflow TEXT,
    docuseal_template_id TEXT,
    docuseal_submission_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
        'draft', 'sent', 'partially_signed', 'completed', 'declined',
        'expired', 'archived', 'failed', 'superseded'
    )),
    requested_by TEXT,
    due_at TEXT,
    completed_at DATETIME,
    external_reference TEXT,
    idempotency_key TEXT UNIQUE,
    superseded_by TEXT,
    supersede_reason TEXT,
    prefill_json TEXT,
    completed_redirect_url TEXT,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signing_requests_submission ON signing_requests(docuseal_submission_id);
CREATE INDEX IF NOT EXISTS idx_signing_requests_employee ON signing_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_signing_requests_status ON signing_requests(status);

CREATE TABLE IF NOT EXISTS signing_request_signers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    signing_request_id TEXT NOT NULL,
    employee_id TEXT,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    docuseal_submitter_id TEXT,
    docuseal_slug TEXT,
    signing_url TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN (
        'awaiting', 'sent', 'opened', 'completed', 'declined'
    )),
    completed_at DATETIME,
    declined_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (signing_request_id) REFERENCES signing_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signing_signers_request ON signing_request_signers(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_signing_signers_submitter ON signing_request_signers(docuseal_submitter_id);

CREATE TABLE IF NOT EXISTS signed_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    signing_request_id TEXT NOT NULL,
    docuseal_submitter_id TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('signed_pdf', 'audit_trail', 'combined', 'original')),
    storage_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER,
    sha256 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    downloaded_at DATETIME,
    UNIQUE(signing_request_id, kind, docuseal_submitter_id),
    FOREIGN KEY (signing_request_id) REFERENCES signing_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signed_documents_request ON signed_documents(signing_request_id);

CREATE TABLE IF NOT EXISTS docuseal_webhook_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    event_type TEXT NOT NULL,
    docuseal_submission_id TEXT,
    event_timestamp TEXT,
    payload_sha256 TEXT NOT NULL,
    processed_at DATETIME,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(docuseal_submission_id, event_type, payload_sha256)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_submission ON docuseal_webhook_events(docuseal_submission_id);

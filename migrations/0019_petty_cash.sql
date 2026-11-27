-- Migration 0019: petty cash requests and realization reports
--
-- Two approval gates:
--   pending -> approved (cash handed over) -> report_submitted -> report_approved
-- A report can be sent back (report_rejected) so expenses stay editable and the
-- employee can resubmit. Balance is tracked as a variance only; no settlement.

CREATE TABLE IF NOT EXISTS petty_cash_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    reference_no TEXT,
    department_id TEXT,
    department_label TEXT,
    purpose TEXT NOT NULL,
    requested_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending', 'approved', 'rejected', 'cancelled',
        'report_submitted', 'report_approved', 'report_rejected'
    )),

    -- Request gate
    approved_by TEXT,
    approved_at DATETIME,
    rejection_note TEXT,
    disbursed_at DATETIME,
    disbursed_by TEXT,
    disbursed_amount REAL,

    -- Realization gate
    report_submitted_at DATETIME,
    report_reviewed_by TEXT,
    report_reviewed_at DATETIME,
    report_note TEXT,
    total_realized REAL NOT NULL DEFAULT 0,
    variance REAL NOT NULL DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS petty_cash_expenses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    request_id TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    vendor TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id) REFERENCES petty_cash_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS petty_cash_receipts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    request_id TEXT NOT NULL,
    expense_id TEXT NOT NULL,
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (expense_id) REFERENCES petty_cash_expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pc_requests_emp ON petty_cash_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_pc_requests_status ON petty_cash_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pc_reference_no ON petty_cash_requests(reference_no);
CREATE INDEX IF NOT EXISTS idx_pc_expenses_request ON petty_cash_expenses(request_id);
CREATE INDEX IF NOT EXISTS idx_pc_receipts_expense ON petty_cash_receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_pc_receipts_request ON petty_cash_receipts(request_id);

-- Migration 0018: multi-stage leave application form
--
-- The SMTS form is only a reference for the *shape* of the document. Company
-- identity (name, address, phone, email, registration no.) always comes from
-- the companies table, and the department / leave-type options come from the
-- departments and leave_types tables. Nothing tenant-specific is stored here.
--
-- leave_requests.status is guarded by a CHECK that SQLite cannot alter, so this
-- rebuilds the table. idx_leave_emp and both foreign keys are recreated below.

PRAGMA foreign_keys = OFF;

CREATE TABLE leave_requests_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    leave_type_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    total_days REAL NOT NULL,
    reason TEXT NOT NULL,
    attachment_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending', 'submitted', 'pending_administrator', 'pending_dept_head',
        'pending_management', 'approved', 'rejected', 'cancelled'
    )),
    approved_by TEXT,
    approved_at DATETIME,
    rejection_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Stage 1: applicant submission
    reference_no TEXT,
    submission_date TEXT,
    department_id TEXT,
    department_label TEXT,
    leave_type_label TEXT,
    leave_type_other_note TEXT,
    applicant_signature TEXT,
    applicant_signed_at DATETIME,
    submitted_at DATETIME,

    -- Stage 2: administrative check
    admin_clash_checks TEXT,
    admin_other_reason TEXT,
    admin_checked_by TEXT,
    admin_checked_at DATETIME,

    -- Stage 3: department head
    dept_head_issues TEXT,
    dept_head_decision TEXT,
    dept_head_decided_by TEXT,
    dept_head_decided_at DATETIME,

    -- Stage 4: management
    management_decision TEXT,
    management_signature TEXT,
    management_signed_at DATETIME,
    management_by TEXT,
    override_reason TEXT,
    cancelled_at DATETIME,
    cancelled_by TEXT,

    -- Outcome notification SLA
    sla_due_at DATETIME,
    side_effects_applied_at DATETIME,

    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
);

INSERT INTO leave_requests_new (
    id, tenant_id, employee_id, leave_type_id, start_date, end_date, total_days,
    reason, attachment_key, status, approved_by, approved_at, rejection_note, created_at
)
SELECT
    id, tenant_id, employee_id, leave_type_id, start_date, end_date, total_days,
    reason, attachment_key, status, approved_by, approved_at, rejection_note, created_at
FROM leave_requests;

DROP TABLE leave_requests;
ALTER TABLE leave_requests_new RENAME TO leave_requests;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_dept_dates ON leave_requests(department_id, start_date, end_date);

-- Reference numbers are unique per application. NULL is allowed for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_leave_reference_no ON leave_requests(reference_no);

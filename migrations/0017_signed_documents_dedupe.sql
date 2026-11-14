-- Migration: 0017_signed_documents_dedupe.sql
--
-- The original UNIQUE(signing_request_id, kind, docuseal_submitter_id) never
-- fired: SQLite treats NULLs as distinct in a unique index, and every audit
-- trail (and most signed PDFs) stores a NULL submitter id. Each sync therefore
-- inserted another identical row.
--
-- Fix: collapse the existing duplicates, then enforce uniqueness on a
-- normalized expression where the submitter id is never NULL.

-- Keep the newest row per (request, kind, normalized submitter).
DELETE FROM signed_documents
WHERE rowid NOT IN (
  SELECT MAX(rowid)
  FROM signed_documents
  GROUP BY signing_request_id, kind, COALESCE(docuseal_submitter_id, '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_signed_documents_request_kind_submitter
  ON signed_documents(signing_request_id, kind, COALESCE(docuseal_submitter_id, ''));

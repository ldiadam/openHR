-- Migration: 0016_signing_document_name.sql
--
-- One-off documents are uploaded per employee, so the human-readable document
-- name only exists at creation time. Persist it so the documents list can show
-- "Surat Penawaran Kerja" instead of the raw workflow code "offer_letter".

ALTER TABLE signing_requests ADD COLUMN document_name TEXT;

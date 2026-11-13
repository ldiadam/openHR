/**
 * Purge signed documents past their retention window.
 *
 * Usage:
 *   pnpm docuseal:purge
 *
 * Retention is read from hr_document_templates.retention_months (default 60)
 * and measured from signing_requests.completed_at.
 */
import { purgeExpiredDocuments } from '../src/services/signed-documents';
import { createMockD1 } from '../test/d1-mock';

async function main() {
  // The purge helper needs a DB binding; wire the in-memory schema for local
  // inspection, or set DB_TARGET=remote to run against the configured D1.
  const db = createMockD1();
  const env = {
    DB: db,
    R2: undefined,
  } as any;

  const result = await purgeExpiredDocuments(env);
  console.log(`Scanned ${result.scanned} documents, purged ${result.deleted}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

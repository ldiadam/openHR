/**
 * Register an HR document template with DocuSeal.
 *
 * Usage:
 *   pnpm docuseal:register:template -- --code offer_letter --name "Offer Letter" \
 *     --file ./templates/offer-letter.pdf [--version 2]
 *
 * Requires DOCUSEAL_URL and DOCUSEAL_API_TOKEN in the environment.
 * Uses the project's D1 database via wrangler (`wrangler d1 execute ... --local|--remote`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createDocuSealClient } from '../src/services/docuseal';
import { createMockD1 } from '../test/d1-mock';

interface Args {
  code: string;
  name: string;
  file: string;
  version?: number;
  remote: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.filter((arg) => arg !== '--');
  const get = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const code = get('--code');
  const name = get('--name');
  const file = get('--file');

  if (!code || !name || !file) {
    throw new Error(
      'Usage: pnpm docuseal:register:template -- --code <code> --name "<name>" --file <path.pdf|path.docx> [--version N] [--remote]'
    );
  }

  return {
    code,
    name,
    file: path.resolve(file),
    version: get('--version') ? Number(get('--version')) : undefined,
    remote: args.includes('--remote'),
  };
}

function runSql(sql: string, remote: boolean): void {
  const target = remote ? '--remote' : '--local';
  execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', target, '--command', sql], {
    stdio: 'inherit',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.file)) {
    throw new Error(`File not found: ${args.file}`);
  }

  const baseUrl = (process.env.DOCUSEAL_URL || '').replace(/\/+$/, '');
  const apiToken = process.env.DOCUSEAL_API_TOKEN || '';
  if (!baseUrl || !apiToken) {
    throw new Error('DOCUSEAL_URL and DOCUSEAL_API_TOKEN must be set.');
  }

  const buffer = fs.readFileSync(args.file);
  const base64 = buffer.toString('base64');
  const isDocx = args.file.toLowerCase().endsWith('.docx');

  const client = createDocuSealClient({
    DOCUSEAL_URL: baseUrl,
    DOCUSEAL_API_TOKEN: apiToken,
    ENVIRONMENT: process.env.ENVIRONMENT,
  } as any);

  const created = isDocx
    ? await client.createTemplateFromDocx({ name: args.name, externalId: args.code, docxBase64: base64 })
    : await client.createTemplateFromPdf({ name: args.name, externalId: args.code, pdfBase64: base64 });

  if (!created?.id) {
    throw new Error('DocuSeal did not return a template id.');
  }

  const templateId = `doc-tpl-seed-${Date.now()}`;
  const version = args.version ?? 1;

  const sql = `INSERT INTO hr_document_templates (
    id, tenant_id, code, name, version, docuseal_template_id, active, visibility, retention_months
  ) VALUES (
    '${templateId}', 'default', '${args.code}', '${args.name.replace(/'/g, "''")}', ${version},
    '${String(created.id)}', 1, 'standard', 60
  );`;

  if (args.remote) {
    runSql(sql, true);
  } else {
    // Local dry-run so the command is useful without touching remote state.
    const db = createMockD1();
    db.exec(sql);
    console.log('[local] Registered template row in in-memory database (not persisted).');
  }

  console.log(`DocuSeal template id: ${created.id}`);
  console.log(`Registered as ${args.code} v${version} (${templateId})`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

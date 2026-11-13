import { Bindings } from '../types';

/**
 * Server-only typed client for the self-hosted DocuSeal fork.
 *
 * Supported endpoints (do not add others):
 *   POST /api/templates/pdf
 *   POST /api/templates/docx
 *   POST /api/submissions
 *   GET  /api/submissions/:id
 *   GET  /api/submitters/:id
 *
 * Not supported by this fork: /api/templates/html, /api/submissions/pdf,
 * /api/submissions/html, SMS sending.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_DECODED_BYTES = 15 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;

export class DocuSealConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocuSealConfigError';
  }
}

export class DocuSealError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'DocuSealError';
    this.status = status;
    this.body = body;
  }
}

export interface DocuSealField {
  name: string;
  type: string;
  role?: string;
  required?: boolean;
  default_value?: string;
  // PDF coordinate placement (normalized 0..1, origin top-left, 1-based page)
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  page?: number;
  options?: string[];
  [key: string]: unknown;
}

export interface DocuSealDocument {
  name: string;
  file?: string;
  url?: string;
  fields?: DocuSealField[];
}

export interface DocuSealSubmitter {
  role: string;
  email?: string;
  name?: string;
  phone?: string;
  values?: Record<string, unknown>;
  completed_redirect_url?: string;
  [key: string]: unknown;
}

export interface CreateTemplateInput {
  name: string;
  externalId?: string;
  pdfBase64?: string;
  docxBase64?: string;
  fields?: DocuSealField[];
  documents?: DocuSealDocument[];
}

export interface CreateSubmissionInput {
  templateId: string | number;
  submitters: DocuSealSubmitter[];
  sendEmail?: boolean;
  order?: 'preserved' | 'random';
  message?: string;
  completedRedirectUrl?: string;
  expireAt?: string;
  variables?: Record<string, unknown>;
}

export interface DocuSealSubmitterResult {
  id: number | string;
  uuid?: string;
  slug?: string;
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  embed_src?: string;
  signing_url?: string;
  declined_at?: string | null;
  completed_at?: string | null;
  [key: string]: unknown;
}

export interface DocuSealSubmissionResult {
  id: number | string;
  status?: string;
  submitters?: DocuSealSubmitterResult[];
  documents?: Array<{
    name?: string;
    url?: string;
    kind?: string;
    [key: string]: unknown;
  }>;
  audit_log_url?: string | null;
  combined_document_url?: string | null;
  [key: string]: unknown;
}

export interface DocuSealClient {
  createTemplateFromPdf(input: CreateTemplateInput): Promise<{ id: number | string; [key: string]: unknown }>;
  createTemplateFromDocx(input: CreateTemplateInput): Promise<{ id: number | string; [key: string]: unknown }>;
  createSubmission(input: CreateSubmissionInput): Promise<DocuSealSubmissionResult>;
  getSubmission(submissionId: string | number): Promise<DocuSealSubmissionResult>;
  getSubmitter(submitterId: string | number): Promise<DocuSealSubmitterResult>;
}

function requireConfig(env: Bindings): { baseUrl: string; token: string } {
  const rawUrl = (env.DOCUSEAL_URL || '').trim().replace(/\/+$/, '');
  const token = (env.DOCUSEAL_API_TOKEN || '').trim();

  if (!rawUrl || !token) {
    throw new DocuSealConfigError(
      'DocuSeal belum dikonfigurasi. Set DOCUSEAL_URL dan DOCUSEAL_API_TOKEN pada server.'
    );
  }

  if (!/^https?:\/\//i.test(rawUrl)) {
    throw new DocuSealConfigError('DOCUSEAL_URL harus berupa URL absolut.');
  }

  // Production must never talk to DocuSeal over plaintext HTTP.
  if (env.ENVIRONMENT === 'production' && !rawUrl.toLowerCase().startsWith('https://')) {
    throw new DocuSealConfigError('DOCUSEAL_URL wajib menggunakan HTTPS pada produksi.');
  }

  return { baseUrl: rawUrl, token };
}

function assertBase64(value: string | undefined, label: string): void {
  if (!value) return;
  if (!BASE64_RE.test(value.replace(/^data:[^;]+;base64,/, ''))) {
    throw new DocuSealError(400, `${label} bukan base64 yang valid.`);
  }
  const cleaned = value.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const decodedBytes = Math.floor((cleaned.length * 3) / 4);
  if (decodedBytes > MAX_DECODED_BYTES) {
    throw new DocuSealError(
      413,
      `${label} terlalu besar (${Math.round(decodedBytes / 1024 / 1024)}MB). Maksimum 15MB.`
    );
  }
}

function stripDataUrl(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
}

export function createDocuSealClient(env: Bindings): DocuSealClient {
  let cached: { baseUrl: string; token: string } | null = null;
  const config = () => (cached ??= requireConfig(env));

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const { baseUrl, token } = config();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'X-Auth-Token': token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      // Never surface the token or URL; only method + path.
      throw new DocuSealError(
        aborted ? 504 : 502,
        aborted ? 'DocuSeal timeout setelah 30 detik.' : 'Gagal menghubungi DocuSeal.'
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const upstreamMessage =
        (parsed && (parsed.error || parsed.message || parsed.detail)) || response.statusText;
      throw new DocuSealError(
        response.status,
        `DocuSeal ${path} gagal (${response.status}): ${String(upstreamMessage).slice(0, 300)}`,
        parsed
      );
    }

    return (parsed ?? {}) as T;
  }

  const buildTemplatePayload = (input: CreateTemplateInput) => {
    const documents =
      input.documents && input.documents.length > 0
        ? input.documents
        : [
            {
              name: input.name,
              file: stripDataUrl((input.pdfBase64 || input.docxBase64) as string),
              fields: input.fields,
            },
          ];

    return {
      name: input.name,
      external_id: input.externalId,
      documents,
    };
  };

  return {
    async createTemplateFromPdf(input) {
      assertBase64(input.pdfBase64, 'PDF');
      return request('POST', '/api/templates/pdf', buildTemplatePayload(input));
    },

    async createTemplateFromDocx(input) {
      assertBase64(input.docxBase64, 'DOCX');
      return request('POST', '/api/templates/docx', buildTemplatePayload(input));
    },

    async createSubmission(input) {
      if (!input.templateId) {
        throw new DocuSealError(400, 'Template DocuSeal tidak ditemukan.');
      }
      if (!Array.isArray(input.submitters) || input.submitters.length === 0) {
        throw new DocuSealError(400, 'Minimal satu penandatangan diperlukan.');
      }

      return request('POST', '/api/submissions', {
        template_id: input.templateId,
        send_email: input.sendEmail !== false,
        order: input.order || 'preserved',
        message: input.message,
        completed_redirect_url: input.completedRedirectUrl,
        expire_at: input.expireAt,
        variables: input.variables,
        submitters: input.submitters.map((submitter) => ({
          role: submitter.role,
          email: submitter.email,
          name: submitter.name,
          phone: submitter.phone,
          values: submitter.values,
          completed_redirect_url: submitter.completed_redirect_url,
        })),
      });
    },

    async getSubmission(submissionId) {
      if (submissionId === undefined || submissionId === null || submissionId === '') {
        throw new DocuSealError(400, 'Submission id tidak valid.');
      }
      return request('GET', `/api/submissions/${encodeURIComponent(String(submissionId))}`);
    },

    async getSubmitter(submitterId) {
      if (submitterId === undefined || submitterId === null || submitterId === '') {
        throw new DocuSealError(400, 'Submitter id tidak valid.');
      }
      return request('GET', `/api/submitters/${encodeURIComponent(String(submitterId))}`);
    },
  };
}

/** Normalizes the embed URL DocuSeal returns; never build /s/:slug ourselves. */
export function resolveSigningUrl(submitter: Partial<DocuSealSubmitterResult> | null | undefined): string | null {
  const candidate = submitter?.embed_src || submitter?.signing_url;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

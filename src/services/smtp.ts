import { Bindings } from '../types';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  type: 'welcome_invite' | 'password_reset' | 'leave_status' | 'payslip_ready' | 'signing_request' | 'signing_status' | 'general';
  fromAddress?: string;
  smtpPass?: string;
  domainName?: string;
  senderName?: string;
}

export interface EmailResult {
  success: boolean;
  simulated: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends email via Purelymail SMTP (smtp.purelymail.com:587).
 * Fallback to local DB outbox logging if SMTP is not configured or in dev.
 */

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/(.{76})/g, '$1\r\n');
}

function encodeHeaderValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7E]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${base64Utf8(clean).replace(/\r\n/g, '')}?=`;
}

function buildRawMessage(options: {
  messageId: string;
  domainName: string;
  senderName: string;
  fromAddress: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `openhr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const domain = (options.domainName || 'company.id').replace(/[^a-zA-Z0-9.-]/g, '') || 'company.id';
  return [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${options.messageId.replace(/[^a-zA-Z0-9._-]/g, '')}@${domain}>`,
    `From: "${options.senderName}" <${options.fromAddress}>`,
    `To: <${options.to}>`,
    `Reply-To: <${options.fromAddress}>`,
    `Subject: ${encodeHeaderValue(options.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Utf8(options.text),
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Utf8(options.html),
    `--${boundary}--`,
  ].join('\r\n');
}
export type EmailApiProvider = 'resend' | 'sendgrid' | 'brevo' | 'mailgun' | 'cloudflare';

export interface EmailApiConfig {
  provider: EmailApiProvider;
  apiKey?: string;
  domain?: string;
  sendBinding?: { send: (payload: any) => Promise<any> };
}

/**
 * Resolves an HTTP email API from Worker secrets/bindings.
 * EMAIL_API_PROVIDER forces a provider (resend|sendgrid|brevo|mailgun|cloudflare);
 * otherwise the first configured credential wins. Returns null to fall back to SMTP.
 */
export function resolveEmailApi(env: any): EmailApiConfig | null {
  const explicit = String(env?.EMAIL_API_PROVIDER || '').trim().toLowerCase();

  const byName = (name: string): EmailApiConfig | null => {
    switch (name) {
      case 'resend':
        return env.RESEND_API_KEY ? { provider: 'resend', apiKey: env.RESEND_API_KEY } : null;
      case 'sendgrid':
        return env.SENDGRID_API_KEY ? { provider: 'sendgrid', apiKey: env.SENDGRID_API_KEY } : null;
      case 'brevo':
        return env.BREVO_API_KEY ? { provider: 'brevo', apiKey: env.BREVO_API_KEY } : null;
      case 'mailgun':
        return env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN
          ? { provider: 'mailgun', apiKey: env.MAILGUN_API_KEY, domain: env.MAILGUN_DOMAIN }
          : null;
      case 'cloudflare':
        return env.EMAIL?.send ? { provider: 'cloudflare', sendBinding: env.EMAIL } : null;
      default:
        return null;
    }
  };

  if (explicit) return byName(explicit);

  for (const name of ['resend', 'sendgrid', 'brevo', 'mailgun', 'cloudflare']) {
    const config = byName(name);
    if (config) return config;
  }
  return null;
}

async function sendViaEmailApi(
  api: EmailApiConfig,
  options: { to: string; subject: string; text: string; html: string; fromAddress: string; senderName: string }
): Promise<string | undefined> {
  const from = `${options.senderName} <${options.fromAddress}>`;

  if (api.provider === 'cloudflare') {
    await api.sendBinding!.send({
      to: options.to,
      from: options.fromAddress,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return undefined;
  }

  const dispatch = (): Promise<Response> => {
    switch (api.provider) {
      case 'resend':
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${api.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [options.to],
            subject: options.subject,
            text: options.text,
            html: options.html,
          }),
        });
      case 'sendgrid':
        return fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${api.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: options.to }] }],
            from: { email: options.fromAddress, name: options.senderName },
            subject: options.subject,
            content: [
              { type: 'text/plain', value: options.text },
              { type: 'text/html', value: options.html },
            ],
          }),
        });
      case 'brevo':
        return fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': api.apiKey || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { email: options.fromAddress, name: options.senderName },
            to: [{ email: options.to }],
            subject: options.subject,
            textContent: options.text,
            htmlContent: options.html,
          }),
        });
      case 'mailgun': {
        const form = new URLSearchParams({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        return fetch(`https://api.mailgun.net/v3/${api.domain}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`api:${api.apiKey}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });
      }
      default:
        throw new Error(`Unsupported email API provider: ${api.provider}`);
    }
  };

  // Resend (and most APIs) throttle bursts: retry 429/5xx with backoff so a
  // payroll batch of concurrent sends does not silently drop recipients.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await dispatch();
    if (res.status !== 429 && res.status < 500) break;
    if (attempt === 3) break;

    const retryAfter = Number(res.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 400 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
  }

  const raw = await res!.text();
  if (!res.ok) {
    throw new Error(`${api.provider} API ${res.status}: ${raw.slice(0, 300)}`);
  }

  try {
    const data = raw ? JSON.parse(raw) : null;
    return data?.id || data?.messageId || data?.message_id;
  } catch {
    return undefined;
  }
}

export async function sendEmail(env: Bindings, options: EmailOptions): Promise<EmailResult> {
  let domainName = options.domainName;
  let fromAddress = options.fromAddress;
  let smtpPass = options.smtpPass;
  let senderName = options.senderName;

  // Auto-lookup credentials & company name from companies table if not passed
  if (!smtpPass || !domainName || !fromAddress || !senderName) {
    try {
      const comp = await env.DB.prepare(
        `SELECT name, purelymail_domain, purelymail_from_address, purelymail_smtp_pass FROM companies LIMIT 1`
      ).first<any>();
      if (comp) {
        domainName = domainName || comp.purelymail_domain;
        fromAddress = fromAddress || comp.purelymail_from_address;
        smtpPass = smtpPass || comp.purelymail_smtp_pass;
        senderName = senderName || comp.name;
      }
    } catch {
      // ignore
    }
  }

  domainName = domainName || env.PURELYMAIL_DOMAIN || 'company.id';
  fromAddress = fromAddress || env.PURELYMAIL_FROM_ADDRESS || `hr@${domainName}`;
  senderName = senderName || 'Portal HR';
  const cleanSenderName = senderName.replace(/["\r\n]/g, '').trim();
  const smtpHost = env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com';
  const smtpPort = parseInt(env.PURELYMAIL_SMTP_PORT || '465', 10);
  const smtpUser = env.PURELYMAIL_SMTP_USER || fromAddress;
  const smtpPassFinal = smtpPass || env.PURELYMAIL_SMTP_PASS;

  const outboxId = `out-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const api = resolveEmailApi(env);
  const isSimulated = !api && !smtpPassFinal;

  // Log to outbox table in D1
  try {
    await env.DB.prepare(
      `INSERT INTO notifications_outbox (id, tenant_id, to_email, subject, body_text, body_html, notification_type, status, sent_at)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        outboxId,
        options.to,
        options.subject,
        options.text,
        options.html,
        options.type,
        isSimulated ? 'pending' : 'sent',
        isSimulated ? null : new Date().toISOString()
      )
      .run();
  } catch (err: any) {
    console.error('[SMTP Outbox DB Error]', err.message);
  }

  if (isSimulated) {
    console.log(`\n================== [EMAIL SIMULATION] ==================`);
    console.log(`To: ${options.to}`);
    console.log(`From: "${cleanSenderName}" <${fromAddress}>`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Body:\n${options.text}`);
    console.log(`========================================================\n`);

    return {
      success: true,
      simulated: true,
      messageId: outboxId,
    };
  }

  // Prefer an HTTP email API when configured (no socket limits, works with waitUntil)
  if (api) {
    try {
      const messageId = await sendViaEmailApi(api, {
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        fromAddress,
        senderName: cleanSenderName,
      });

      try {
        await env.DB.prepare(
          `UPDATE notifications_outbox SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
          .bind(outboxId)
          .run();
      } catch {
        // outbox update is best-effort
      }

      return { success: true, simulated: false, messageId: messageId || outboxId };
    } catch (err: any) {
      console.error(`[Email API Delivery Failed] (${api.provider}):`, err.message || err);
      try {
        await env.DB.prepare(
          `UPDATE notifications_outbox SET status = 'failed', error_message = ? WHERE id = ?`
        )
          .bind(err.message || `${api.provider} API failed`, outboxId)
          .run();
      } catch {
        // outbox update is best-effort
      }

      return { success: false, simulated: false, error: err.message };
    }
  }

  // If Purelymail SMTP credentials are configured:
  try {
    // Cloudflare Workers socket SMTP transmission
    // @ts-ignore
    const { connect } = await import('cloudflare:sockets');
    if (typeof connect === 'function') {
      const enc = new TextEncoder();
      const dec = new TextDecoder();

      // Support direct SMTPS (Port 465) or STARTTLS (Port 587)
      if (smtpPort === 465 || smtpPort !== 587) {
        // Direct SSL/TLS over port 465 (Recommended for Purelymail in Cloudflare Workers)
        const socket = connect(
          { hostname: smtpHost, port: 465 },
          { secureTransport: 'on', allowHalfOpen: false }
        );
        const reader = socket.readable.getReader();
        const writer = socket.writable.getWriter();

        async function readChunk(): Promise<string> {
          const { value, done } = await reader.read();
          return done ? '' : dec.decode(value);
        }

        async function writeCmd(cmd: string): Promise<string> {
          await writer.write(enc.encode(cmd + '\r\n'));
          return await readChunk();
        }

        await readChunk(); // 220 greeting
        await writeCmd(`EHLO ${domainName}`);
        await writeCmd('AUTH LOGIN');
        await writeCmd(btoa(smtpUser));
        const authRes = await writeCmd(btoa(smtpPassFinal));
        if (!authRes.startsWith('235')) {
          throw new Error(`Autentikasi SMTP Gagal: ${authRes.trim()}`);
        }

        await writeCmd(`MAIL FROM:<${fromAddress}>`);
        await writeCmd(`RCPT TO:<${options.to}>`);
        await writeCmd('DATA');

        const rawMsg = buildRawMessage({
          messageId: outboxId,
          domainName,
          senderName: cleanSenderName,
          fromAddress,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });

        await writeCmd(`${rawMsg}\r\n.`);
        await writeCmd('QUIT');

        try {
          reader.releaseLock();
          writer.releaseLock();
          socket.close?.();
        } catch {
          // ignore cleanup
        }
      } else {
        // Port 587 with STARTTLS (Requires secureTransport: 'starttls')
        const socket = connect(
          { hostname: smtpHost, port: 587 },
          { secureTransport: 'starttls', allowHalfOpen: false }
        );
        const reader = socket.readable.getReader();
        const writer = socket.writable.getWriter();

        async function readPlain(): Promise<string> {
          const { value, done } = await reader.read();
          return done ? '' : dec.decode(value);
        }

        async function writePlain(cmd: string): Promise<string> {
          await writer.write(enc.encode(cmd + '\r\n'));
          return await readPlain();
        }

        await readPlain(); // greeting
        await writePlain(`EHLO ${domainName}`);
        await writePlain('STARTTLS');

        reader.releaseLock();
        writer.releaseLock();

        const secureSocket = socket.startTls();
        const sReader = secureSocket.readable.getReader();
        const sWriter = secureSocket.writable.getWriter();

        async function readSec(): Promise<string> {
          const { value, done } = await sReader.read();
          return done ? '' : dec.decode(value);
        }

        async function writeSec(cmd: string): Promise<string> {
          await sWriter.write(enc.encode(cmd + '\r\n'));
          return await readSec();
        }

        await writeSec(`EHLO ${domainName}`);
        await writeSec('AUTH LOGIN');
        await writeSec(btoa(smtpUser));
        const authRes = await writeSec(btoa(smtpPassFinal));
        if (!authRes.startsWith('235')) {
          throw new Error(`Autentikasi SMTP Gagal: ${authRes.trim()}`);
        }

        await writeSec(`MAIL FROM:<${fromAddress}>`);
        await writeSec(`RCPT TO:<${options.to}>`);
        await writeSec('DATA');

        const rawMsg = buildRawMessage({
          messageId: outboxId,
          domainName,
          senderName: cleanSenderName,
          fromAddress,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });

        await writeSec(`${rawMsg}\r\n.`);
        await writeSec('QUIT');

        try {
          sReader.releaseLock();
          sWriter.releaseLock();
          secureSocket.close?.();
        } catch {
          // ignore cleanup
        }
      }

      // Update outbox status
      await env.DB.prepare(
        `UPDATE notifications_outbox SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
        .bind(outboxId)
        .run();

      return { success: true, simulated: false, messageId: outboxId };
    }
  } catch (err: any) {
    console.error(`[Purelymail SMTP Delivery Failed]:`, err.message || err);
    await env.DB.prepare(
      `UPDATE notifications_outbox SET status = 'failed', error_message = ? WHERE id = ?`
    )
      .bind(err.message || 'SMTP connection failed', outboxId)
      .run();

    return {
      success: false,
      simulated: false,
      error: err.message,
    };
  }

  return { success: true, simulated: true, messageId: outboxId };
}

/**
 * Keeps a promise alive after the response is returned using the Worker's
 * ExecutionContext, so email sending never blocks the HTTP response.
 * Must use waitUntil: a bare unawaited promise may be frozen with the isolate.
 */
export function runInBackground(c: any, task: Promise<unknown>): void {
  const settled = Promise.resolve(task).catch((err: any) => {
    console.error('[background] task failed:', err?.message || err);
  });
  try {
    c.executionCtx.waitUntil(settled);
  } catch {
    // No ExecutionContext (unit tests / non-Worker runtime): let it settle on its own.
  }
}

export function sendEmailInBackground(c: any, env: Bindings, options: EmailOptions): void {
  runInBackground(c, sendEmail(env, options));
}


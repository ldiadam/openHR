import { Bindings } from '../types';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  type: 'welcome_invite' | 'password_reset' | 'leave_status' | 'payslip_ready' | 'general';
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
export async function sendEmail(env: Bindings, options: EmailOptions): Promise<EmailResult> {
  const fromAddress = env.PURELYMAIL_FROM_ADDRESS || `hr@${env.PURELYMAIL_DOMAIN || 'company.id'}`;
  const smtpHost = env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com';
  const smtpPort = parseInt(env.PURELYMAIL_SMTP_PORT || '587', 10);
  const smtpUser = env.PURELYMAIL_SMTP_USER || fromAddress;
  const smtpPass = env.PURELYMAIL_SMTP_PASS;

  const outboxId = `out-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const isSimulated = !smtpPass;

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
    console.log(`From: ${fromAddress}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Body:\n${options.text}`);
    console.log(`========================================================\n`);

    return {
      success: true,
      simulated: true,
      messageId: outboxId,
    };
  }

  // If Purelymail SMTP credentials are configured:
  try {
    // Cloudflare Workers socket SMTP transmission
    // @ts-ignore
    const { connect } = await import('cloudflare:sockets');
    if (typeof connect === 'function') {
      const socket = connect({ hostname: smtpHost, port: smtpPort });
      const reader = socket.readable.getReader();
      const writer = socket.writable.getWriter();
      const enc = new TextEncoder();
      const dec = new TextDecoder();

      async function readResponse(): Promise<string> {
        const { value, done } = await reader.read();
        return done ? '' : dec.decode(value);
      }

      async function sendCommand(cmd: string): Promise<string> {
        await writer.write(enc.encode(cmd + '\r\n'));
        return await readResponse();
      }

      await readResponse(); // greeting
      await sendCommand(`EHLO ${env.PURELYMAIL_DOMAIN || 'company.id'}`);
      await sendCommand('STARTTLS');

      // Secure transport upgrade
      const secureSocket = socket.startTls();
      const sReader = secureSocket.readable.getReader();
      const sWriter = secureSocket.writable.getWriter();

      async function sendSecureCommand(cmd: string): Promise<string> {
        await sWriter.write(enc.encode(cmd + '\r\n'));
        const { value, done } = await sReader.read();
        return done ? '' : dec.decode(value);
      }

      await sendSecureCommand(`EHLO ${env.PURELYMAIL_DOMAIN || 'company.id'}`);
      await sendSecureCommand('AUTH LOGIN');
      await sendSecureCommand(btoa(smtpUser));
      await sendSecureCommand(btoa(smtpPass));
      await sendSecureCommand(`MAIL FROM:<${fromAddress}>`);
      await sendSecureCommand(`RCPT TO:<${options.to}>`);
      await sendSecureCommand('DATA');

      const rawMsg = [
        `From: "openHR Indonesia" <${fromAddress}>`,
        `To: <${options.to}>`,
        `Subject: ${options.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        options.html,
        `.`,
      ].join('\r\n');

      await sendSecureCommand(rawMsg);
      await sendSecureCommand('QUIT');

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

// Indonesian Email Templates

export function getWelcomeInviteEmail(params: {
  name: string;
  inviteLink: string;
  companyName: string;
  companyEmail?: string;
  appUrl: string;
}) {
  const text = `Halo ${params.name},

Selamat datang di ${params.companyName}! Akun openHR Anda telah dibuat.
Silakan klik tautan di bawah ini untuk mengaktifkan akun dan mengatur kata sandi Anda:
${params.inviteLink}

Tautan ini berlaku selama 7 hari.

Setelah mengatur kata sandi, Anda dapat masuk ke aplikasi openHR di:
${params.appUrl}

Salam,
Tim HR ${params.companyName}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
      <h2 style="color: #1e3a8a; margin: 0; font-size: 22px;">Selamat Datang di ${params.companyName}</h2>
    </div>
    <p>Halo <strong>${params.name}</strong>,</p>
    <p>Akun kepegawaian Anda di <strong>openHR</strong> telah berhasil disiapkan.</p>
    ${params.companyEmail ? `<p>Email Perusahaan: <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${params.companyEmail}</code></p>` : ''}
    <p>Silakan klik tombol di bawah untuk membuat kata sandi dan mengaktifkan akun Anda:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${params.inviteLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Atur Kata Sandi Akun</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">Atau salin tautan berikut ke browser Anda:<br><a href="${params.inviteLink}" style="color: #2563eb; word-break: break-all;">${params.inviteLink}</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">Email ini dikirim otomatis oleh sistem openHR ${params.companyName}.</p>
  </div>
</body>
</html>`;

  return { text, html };
}

export function getLeaveStatusEmail(params: {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: 'approved' | 'rejected';
  reviewerName: string;
  note?: string;
}) {
  const isApproved = params.status === 'approved';
  const statusIndo = isApproved ? 'DISETUJUI' : 'DITOLAK';
  const statusColor = isApproved ? '#16a34a' : '#dc2626';

  const text = `Halo ${params.employeeName},

Pengajuan cuti/izin Anda telah ${statusIndo} oleh ${params.reviewerName}.
Jenis: ${params.leaveType}
Tanggal: ${params.startDate} s/d ${params.endDate} (${params.totalDays} hari)
${params.note ? `Catatan: ${params.note}` : ''}

Silakan cek detail di aplikasi openHR.`;

  const html = `
<div style="font-family: sans-serif; padding: 20px; background: #f8fafc;">
  <div style="max-width: 500px; margin: auto; background: white; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h3 style="color: ${statusColor}; margin-top: 0;">Pengajuan Cuti ${statusIndo}</h3>
    <p>Halo <strong>${params.employeeName}</strong>,</p>
    <p>Pengajuan cuti/izin Anda untuk <strong>${params.leaveType}</strong> dari <strong>${params.startDate}</strong> s/d <strong>${params.endDate}</strong> (${params.totalDays} hari) telah <strong>${statusIndo}</strong> oleh ${params.reviewerName}.</p>
    ${params.note ? `<p style="background: #f1f5f9; padding: 10px; border-radius: 6px;"><em>Catatan:</em> ${params.note}</p>` : ''}
  </div>
</div>`;

  return { text, html };
}

export function getPayslipReadyEmail(params: {
  employeeName: string;
  periodTitle: string;
  takeHomePayFormatted: string;
  appUrl: string;
}) {
  const text = `Halo ${params.employeeName},

Slip gaji Anda untuk periode ${params.periodTitle} telah diterbitkan.
Total Take Home Pay: ${params.takeHomePayFormatted}

Anda dapat melihat dan mengunduh slip gaji resmi dalam format PDF melalui aplikasi openHR di ponsel Anda:
${params.appUrl}

Salam,
Finance & Payroll`;

  const html = `
<div style="font-family: sans-serif; padding: 20px; background: #f8fafc;">
  <div style="max-width: 500px; margin: auto; background: white; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h3 style="color: #1e3a8a; margin-top: 0;">Slip Gaji Diterbitkan</h3>
    <p>Halo <strong>${params.employeeName}</strong>,</p>
    <p>Slip gaji Anda untuk periode <strong>${params.periodTitle}</strong> sudah tersedia.</p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
      <span style="font-size: 13px; color: #1e40af;">Take Home Pay</span>
      <h2 style="margin: 4px 0; color: #1e3a8a;">${params.takeHomePayFormatted}</h2>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${params.appUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Buka Slip Gaji</a>
    </div>
  </div>
</div>`;

  return { text, html };
}

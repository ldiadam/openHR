const SERIF = "Georgia, 'Times New Roman', serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const INK = '#1c2b33';
const BODY = '#33424c';
const MUTED = '#5f6c75';
const RULE = '#ded9d0';
const HAIRLINE = '#eae6de';
const PAPER = '#f2f0ea';
const ACCENT = '#17394a';
const APPROVED = '#1f6b45';
const REJECTED = '#8a2e2e';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function letterDate(): string {
  return new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function renderShell(params: {
  companyName: string;
  preheader: string;
  title: string;
  content: string;
}): string {
  const company = esc(params.companyName);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(params.title)}</title>
<style>
  @media only screen and (max-width: 480px) {
    .sheet { border-left: 0 !important; border-right: 0 !important; }
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .head { padding-left: 20px !important; padding-right: 20px !important; }
    .title { font-size: 20px !important; }
    .btn { width: 100% !important; }
    .btn a { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" class="sheet" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${RULE};">
        <tr>
          <td class="head" style="padding:26px 32px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${SERIF};font-size:16px;font-weight:700;line-height:1.4;color:${INK};">${company}</td>
                <td align="right" style="font-family:${SANS};font-size:11px;line-height:1.4;color:${MUTED};white-space:nowrap;padding-left:12px;">${esc(letterDate())}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="border-top:1px solid ${INK};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td class="pad" style="padding:26px 32px 30px;font-family:${SANS};">
            <h1 class="title" style="margin:0 0 18px;font-family:${SERIF};font-size:22px;line-height:1.35;font-weight:700;color:${INK};">${esc(params.title)}</h1>
            ${params.content}
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:16px 32px 22px;border-top:1px solid ${RULE};}>
            <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${MUTED};">Email otomatis dari ${company}, mohon jangan dibalas. / Automated message from ${company}, please do not reply.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${SANS};font-size:14px;line-height:1.7;color:${BODY};">${html}</p>`;
}

function paragraphEn(html: string): string {
  return `<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:1.65;color:${BODY};">${html}</p>`;
}

function facts(rows: Array<{ label: string; value: string }>): string {
  if (!rows.length) return '';
  const body = rows
    .map(
      (row, index) => `<tr>
      <td width="42%" style="padding:9px 12px 9px 0;border-bottom:${index === rows.length - 1 ? '0' : `1px solid ${HAIRLINE}`};font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};vertical-align:top;">${esc(row.label)}</td>
      <td style="padding:9px 0;border-bottom:${index === rows.length - 1 ? '0' : `1px solid ${HAIRLINE}`};font-family:${SANS};font-size:13.5px;line-height:1.5;color:${INK};font-weight:600;vertical-align:top;">${esc(row.value)}</td>
    </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 20px;">${body}</table>`;
}

function action(href: string, label: string): string {
  return `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 16px;">
  <tr>
    <td style="background-color:${ACCENT};border-radius:4px;mso-padding-alt:13px 24px;">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:14px;font-weight:600;line-height:1.3;color:#ffffff;text-decoration:none;border-radius:4px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

function manualLink(href: string): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
  Tautan manual:<br>
  <a href="${esc(href)}" style="color:${ACCENT};text-decoration:underline;word-break:break-all;">${esc(href)}</a>
</p>`;
}

function finePrint(html: string): string {
  return `<p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:1.65;color:${MUTED};">${html}</p>`;
}

function englishSection(title: string, content: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-top:1px solid ${RULE};">
  <tr>
    <td style="padding:20px 0 0;">
      <div style="font-family:${SANS};font-size:11px;font-weight:700;line-height:1.4;color:${MUTED};">English</div>
      <h2 style="margin:6px 0 10px;font-family:${SERIF};font-size:16px;line-height:1.4;font-weight:700;color:${INK};">${esc(title)}</h2>
      ${content}
    </td>
  </tr>
</table>`;
}

function statusLine(id: string, en: string, approved: boolean): string {
  return `<p style="margin:0 0 18px;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">
  Status: <span style="font-family:${SERIF};font-size:18px;font-weight:700;color:${approved ? APPROVED : REJECTED};">${esc(id)}</span>
  <span style="font-size:12px;">/ ${esc(en)}</span>
</p>`;
}

export function getWelcomeInviteEmail(params: {
  name: string;
  inviteLink: string;
  companyName: string;
  companyEmail?: string;
  appUrl: string;
}) {
  const company = esc(params.companyName);
  const name = esc(params.name);
  const link = params.inviteLink;

  const text = `Yth. ${params.name},

Akun kepegawaian Anda di ${params.companyName} sudah dibuat. Atur kata sandi untuk mengaktifkannya melalui tautan berikut:

${link}

Tautan ini berlaku selama 7 hari dan hanya dapat digunakan satu kali. Jika masa berlakunya habis, minta tautan baru kepada HR.
${params.companyEmail ? `\nEmail perusahaan yang terdaftar: ${params.companyEmail}\n` : ''}
Jika Anda tidak merasa diundang ke sistem ini, abaikan email ini.

English

Dear ${params.name},

Your employee account at ${params.companyName} has been created. Set a password to activate it:

${link}

This link expires in 7 days and can be used once. If it has expired, ask HR for a new invitation.

If you were not expecting this invitation, ignore this email.`;

  const html = renderShell({
    companyName: params.companyName,
    preheader: `Atur kata sandi untuk mengaktifkan akun kepegawaian Anda di ${params.companyName}.`,
    title: 'Aktivasi akun kepegawaian',
    content: [
      paragraph(`Yth. <strong>${name}</strong>,`),
      paragraph(
        `Akun kepegawaian Anda di <strong>${company}</strong> sudah dibuat. Atur kata sandi untuk mengaktifkannya.`
      ),
      facts([
        ...(params.companyEmail
          ? [{ label: 'Email perusahaan', value: params.companyEmail }]
          : []),
        { label: 'Masa berlaku tautan', value: '7 hari' },
      ]),
      action(link, 'Atur kata sandi'),
      manualLink(link),
      finePrint(
        'Tautan ini hanya dapat digunakan satu kali. Jika masa berlakunya habis, minta tautan baru kepada HR.'
      ),
      finePrint('Jika Anda tidak merasa diundang ke sistem ini, abaikan email ini.'),
      englishSection(
        'Activate your employee account',
        [
          paragraphEn(`Dear <strong>${name}</strong>,`),
          paragraphEn(
            `Your employee account at <strong>${company}</strong> has been created. Set a password to activate it.`
          ),
          paragraphEn(
            'This link expires in 7 days and can be used once. If it has expired, ask HR for a new invitation.'
          ),
          paragraphEn('If you were not expecting this invitation, ignore this email.'),
        ].join('')
      ),
    ].join(''),
  });

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
  appUrl?: string;
  companyName?: string;
}) {
  const isApproved = params.status === 'approved';
  const statusId = isApproved ? 'Disetujui' : 'Ditolak';
  const statusEn = isApproved ? 'Approved' : 'Rejected';
  const period = `${formatDate(params.startDate)} sampai ${formatDate(params.endDate)}`;
  const name = esc(params.employeeName);

  const text = `Yth. ${params.employeeName},

Pengajuan ${params.leaveType} Anda untuk periode ${period} (${params.totalDays} hari) telah ditinjau oleh ${params.reviewerName}.

Status: ${statusId}
${params.note ? `Catatan: ${params.note}\n` : ''}
${params.appUrl ? `Rincian pengajuan dan sisa cuti tersedia di portal karyawan:\n${params.appUrl}\n` : ''}
English

Dear ${params.employeeName},

Your ${params.leaveType} request for ${formatDate(params.startDate)} to ${formatDate(params.endDate)} (${params.totalDays} days) was reviewed by ${params.reviewerName}.

Status: ${statusEn}
${params.note ? `Note: ${params.note}\n` : ''}
${params.appUrl ? `Request details and your remaining leave balance are available in the employee portal:\n${params.appUrl}\n` : ''}`;

  const html = renderShell({
    companyName: params.companyName || 'Human Resources',
    preheader: `Pengajuan ${params.leaveType} Anda ${statusId.toLowerCase()} setelah ditinjau HR.`,
    title: `Pengajuan cuti ${statusId.toLowerCase()}`,
    content: [
      paragraph(`Yth. <strong>${name}</strong>,`),
      paragraph(
        `Pengajuan <strong>${esc(params.leaveType)}</strong> Anda telah ditinjau oleh ${esc(params.reviewerName)}.`
      ),
      statusLine(statusId, statusEn, isApproved),
      facts([
        { label: 'Jenis cuti', value: params.leaveType },
        { label: 'Periode', value: period },
        { label: 'Durasi', value: `${params.totalDays} hari` },
        { label: 'Ditinjau oleh', value: params.reviewerName },
        ...(params.note ? [{ label: 'Catatan', value: params.note }] : []),
      ]),
      params.appUrl ? action(params.appUrl, 'Buka portal karyawan') : '',
      finePrint('Rincian pengajuan dan sisa cuti dapat dilihat di portal karyawan.'),
      englishSection(
        `Leave request ${statusEn.toLowerCase()}`,
        [
          paragraphEn(`Dear <strong>${name}</strong>,`),
          paragraphEn(
            `Your ${esc(params.leaveType)} request for ${formatDate(params.startDate)} to ${formatDate(params.endDate)} (${params.totalDays} days) was reviewed by ${esc(params.reviewerName)}.`
          ),
          paragraphEn(`Status: <strong>${statusEn}</strong>`),
          params.note ? paragraphEn(`Note: ${esc(params.note)}`) : '',
          params.appUrl
            ? paragraphEn('Use the button above to open your employee portal.')
            : '',
        ].join('')
      ),
    ].join(''),
  });

  return { text, html };
}

export function getPayslipReadyEmail(params: {
  employeeName: string;
  periodTitle: string;
  takeHomePayFormatted: string;
  appUrl: string;
  companyName?: string;
}) {
  const name = esc(params.employeeName);

  const text = `Yth. ${params.employeeName},

Slip gaji Anda untuk periode ${params.periodTitle} sudah diterbitkan.
Gaji bersih diterima: ${params.takeHomePayFormatted}

Buka slip gaji di portal kepegawaian:
${params.appUrl}

Slip gaji resmi tersedia dalam format PDF. Rincian penghasilan, potongan, dan BPJS tercantum di dalamnya.

English

Dear ${params.employeeName},

Your payslip for ${params.periodTitle} is available.
Net pay: ${params.takeHomePayFormatted}

Open the payslip in your employee portal:
${params.appUrl}

The official payslip is a PDF that includes earnings, deductions, and BPJS details.`;

  const html = renderShell({
    companyName: params.companyName || 'Finance & Payroll',
    preheader: `Slip gaji periode ${params.periodTitle} sudah tersedia di portal kepegawaian.`,
    title: `Slip gaji ${params.periodTitle}`,
    content: [
      paragraph(`Yth. <strong>${name}</strong>,`),
      paragraph(
        `Slip gaji Anda untuk periode <strong>${esc(params.periodTitle)}</strong> sudah diterbitkan.`
      ),
      facts([
        { label: 'Periode penggajian', value: params.periodTitle },
        { label: 'Gaji bersih diterima', value: params.takeHomePayFormatted },
      ]),
      action(params.appUrl, 'Buka slip gaji'),
      finePrint(
        'Slip gaji resmi tersedia dalam format PDF. Rincian penghasilan, potongan, dan BPJS tercantum di dalamnya.'
      ),
      englishSection(
        'Your payslip is available',
        [
          paragraphEn(`Dear <strong>${name}</strong>,`),
          paragraphEn(
            `Your payslip for <strong>${esc(params.periodTitle)}</strong> is available. Net pay: ${esc(params.takeHomePayFormatted)}.`
          ),
          paragraphEn(
            'The button above opens the payslip. The official PDF includes earnings, deductions, and BPJS details.'
          ),
        ].join('')
      ),
    ].join(''),
  });

  return { text, html };
}

export function getPasswordResetEmail(params: {
  name?: string;
  resetLink: string;
  companyName: string;
  expiresMinutes?: number;
}) {
  const minutes = params.expiresMinutes ?? 60;
  const displayName = params.name?.trim() || 'Pengguna';
  const name = esc(displayName);
  const company = esc(params.companyName);

  const text = `Yth. ${displayName},

Kami menerima permintaan untuk mereset kata sandi akun kepegawaian Anda di ${params.companyName}. Buat kata sandi baru melalui tautan berikut:

${params.resetLink}

Tautan ini berlaku selama ${minutes} menit dan hanya dapat digunakan satu kali. Jika Anda tidak meminta reset kata sandi, abaikan email ini. Kata sandi Anda tidak berubah.

English

Dear ${displayName},

We received a request to reset your employee account password at ${params.companyName}. Create a new password with this link:

${params.resetLink}

This link expires in ${minutes} minutes and can be used once. If you did not request a reset, ignore this email. Your password will not change.`;

  const html = renderShell({
    companyName: params.companyName,
    preheader: `Permintaan reset kata sandi akun kepegawaian Anda di ${params.companyName}.`,
    title: 'Reset kata sandi akun kepegawaian',
    content: [
      paragraph(`Yth. <strong>${name}</strong>,`),
      paragraph(
        `Kami menerima permintaan untuk mereset kata sandi akun kepegawaian Anda di <strong>${company}</strong>.`
      ),
      facts([{ label: 'Masa berlaku tautan', value: `${minutes} menit` }]),
      action(params.resetLink, 'Buat kata sandi baru'),
      manualLink(params.resetLink),
      finePrint(
        `Tautan ini hanya dapat digunakan satu kali dan berlaku ${minutes} menit.`
      ),
      finePrint(
        'Jika Anda tidak meminta reset kata sandi, abaikan email ini. Kata sandi Anda tidak berubah.'
      ),
      englishSection(
        'Password reset request',
        [
          paragraphEn(`Dear <strong>${name}</strong>,`),
          paragraphEn(
            `We received a request to reset your employee account password at <strong>${company}</strong>.`
          ),
          paragraphEn(
            `This link expires in ${minutes} minutes and can be used once. If you did not request a reset, ignore this email. Your password will not change.`
          ),
        ].join('')
      ),
    ].join(''),
  });

  return { text, html };
}

export function getTestEmail(params: {
  companyName: string;
  fromAddress: string;
  smtpHost?: string;
}) {
  const sentAt = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  });

  const text = `Email uji coba dari ${params.companyName}.

Pengaturan pengiriman email sudah berfungsi. Tidak ada tindakan lanjutan yang diperlukan.

Pengirim: ${params.fromAddress}
Waktu kirim: ${sentAt}
${params.smtpHost ? `Server: ${params.smtpHost}\n` : ''}
English

This is a test email from ${params.companyName}.

Email delivery is working. No further action is required.

Sender: ${params.fromAddress}
Sent: ${sentAt}
${params.smtpHost ? `Server: ${params.smtpHost}\n` : ''}`;

  const html = renderShell({
    companyName: params.companyName,
    preheader: `Email uji coba untuk memverifikasi pengiriman email ${params.companyName}.`,
    title: 'Koneksi email berhasil',
    content: [
      paragraph(
        `Email ini dikirim untuk menguji pengiriman email dari <strong>${esc(params.companyName)}</strong>. Jika Anda menerimanya, pengaturan email sudah berfungsi.`
      ),
      facts([
        { label: 'Pengirim', value: params.fromAddress },
        ...(params.smtpHost ? [{ label: 'Server', value: params.smtpHost }] : []),
        { label: 'Waktu kirim', value: sentAt },
      ]),
      finePrint('Tidak ada tindakan lanjutan yang diperlukan.'),
      englishSection(
        'Email delivery is working',
        [
          paragraphEn(
            `This email verifies email delivery for <strong>${esc(params.companyName)}</strong>. No further action is required.`
          ),
        ].join('')
      ),
    ].join(''),
  });

  return { text, html };
}

export function getSigningRequestEmail(params: {
  signerName: string;
  documentName: string;
  employeeName: string;
  requestedBy?: string;
  signingUrl: string;
  dueAt?: string;
  companyName?: string;
}) {
  const name = esc(params.signerName);
  const document = esc(params.documentName);
  const employee = esc(params.employeeName);
  const due = params.dueAt ? formatDate(params.dueAt) : '';

  const text = `Yth. ${params.signerName},

Dokumen berikut menunggu tanda tangan Anda: ${params.documentName}
Karyawan: ${params.employeeName}${due ? `\nBatas waktu: ${due}` : ''}

Buka dokumen untuk menandatangani:
${params.signingUrl}

Tautan ini bersifat pribadi. Jangan bagikan kepada orang lain.

English

Dear ${params.signerName},

The following document is awaiting your signature: ${params.documentName}
Employee: ${params.employeeName}${due ? `\nDue date: ${due}` : ''}

Open the document to sign:
${params.signingUrl}

This link is personal. Do not share it with anyone else.`;

  const html = renderShell({
    companyName: params.companyName || 'HR & Payroll',
    preheader: `Dokumen ${params.documentName} menunggu tanda tangan Anda.`,
    title: `Tanda tangan diminta: ${params.documentName}`,
    content: [
      paragraph(`Yth. <strong>${name}</strong>,`),
      paragraph(`Dokumen <strong>${document}</strong> menunggu tanda tangan Anda.`),
      facts([
        { label: 'Dokumen', value: params.documentName },
        { label: 'Karyawan', value: params.employeeName },
        ...(params.requestedBy ? [{ label: 'Diminta oleh', value: params.requestedBy }] : []),
        ...(due ? [{ label: 'Batas waktu', value: due }] : []),
      ]),
      action(params.signingUrl, 'Buka & tanda tangani'),
      manualLink(params.signingUrl),
      finePrint('Tautan bersifat pribadi. Jangan bagikan kepada orang lain.'),
      englishSection(
        'A signature is requested',
        [
          paragraphEn(`Dear <strong>${name}</strong>,`),
          paragraphEn(
            `The document <strong>${document}</strong> for ${employee} is awaiting your signature.${due ? ` Due date: ${due}.` : ''}`
          ),
          paragraphEn('Use the button above to open and sign the document.'),
        ].join('')
      ),
    ].join(''),
  });

  return { text, html };
}

export function getSigningStatusEmail(params: {
  recipientName: string;
  documentName: string;
  employeeName: string;
  status: 'completed' | 'declined' | 'expired' | 'archived';
  appUrl: string;
  companyName?: string;
}) {
  const labels: Record<string, { id: string; en: string }> = {
    completed: { id: 'selesai ditandatangani', en: 'fully signed' },
    declined: { id: 'ditolak oleh penandatangan', en: 'declined by a signer' },
    expired: { id: 'kedaluwarsa', en: 'expired' },
    archived: { id: 'diarsipkan', en: 'archived' },
  };
  const label = labels[params.status];
  const name = esc(params.recipientName);
  const document = esc(params.documentName);
  const employee = esc(params.employeeName);

  const text = `Yth. ${params.recipientName},

Status dokumen ${params.documentName} untuk ${params.employeeName}: ${label.id}.

Lihat detail di portal HR:
${params.appUrl}

English

Dear ${params.recipientName},

The document ${params.documentName} for ${params.employeeName} is ${label.en}.

View details in the HR portal:
${params.appUrl}`;

  const html = renderShell({
    companyName: params.companyName || 'HR & Payroll',
    preheader: `Status dokumen ${params.documentName}: ${label.id}.`,
    title: `Status dokumen: ${label.id}`,
    content: [
      paragraph(`Yth. <strong>${name}</strong>,`),
      paragraph(`Status dokumen <strong>${document}</strong> untuk <strong>${employee}</strong> saat ini <strong>${label.id}</strong>.`),
      facts([
        { label: 'Dokumen', value: params.documentName },
        { label: 'Karyawan', value: params.employeeName },
        { label: 'Status', value: label.id },
      ]),
      action(params.appUrl, 'Buka portal HR'),
      englishSection(
        'Document status update',
        [
          paragraphEn(`Dear <strong>${name}</strong>,`),
          paragraphEn(`The document <strong>${document}</strong> for ${employee} is ${label.en}.`),
        ].join('')
      ),
    ].join(''),
  });

  return { text, html };
}

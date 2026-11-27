import { Hono } from 'hono';
import { Bindings } from '../types';
import { getFile, putFile } from '../services/storage';
import { requireModule } from '../middleware/modules';
import { hashPassword, signJwt, verifyJwt } from '../middleware/auth';
import { sendEmailInBackground } from '../services/smtp';

export const careersRoutes = new Hono<{ Bindings: Bindings }>();

careersRoutes.use('*', requireModule('recruitment'));

const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_CV_EXT = /\.(pdf|doc|docx)$/i;
const ALLOWED_CV_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

function sanitizeFilename(name: string): string {
  const base = String(name || 'resume.pdf').split(/[/\\]/).pop() || 'resume.pdf';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return (cleaned || 'resume.pdf').slice(0, 100);
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCareersEmailHtml(opts: {
  companyName: string;
  title: string;
  greetingId: string;
  bodyId: string;
  greetingEn: string;
  bodyEn: string;
  highlightLabel?: string;
  highlightValue?: string;
  ctaLabel: string;
  ctaUrl: string;
  footnoteId: string;
  footnoteEn: string;
}): string {
  const comp = escapeHtml(opts.companyName);
  const title = escapeHtml(opts.title);
  const ctaUrl = escapeHtml(opts.ctaUrl);
  const highlightBlock = opts.highlightValue
    ? `<div style="margin:20px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
         <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">${escapeHtml(opts.highlightLabel || '')}</div>
         <div style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:800;letter-spacing:0.08em;color:#0f172a;">${escapeHtml(opts.highlightValue)}</div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f172a;padding:20px 28px;color:#ffffff;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#93c5fd;">${comp} · Careers</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;">${title}</div>
    </div>
    <div style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
      <p style="margin:0 0 12px;">${opts.greetingId}</p>
      <p style="margin:0 0 16px;">${opts.bodyId}</p>
      ${highlightBlock}
      <div style="margin:24px 0;text-align:center;">
        <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(opts.ctaLabel)}</a>
      </div>
      <p style="margin:0 0 20px;font-size:12px;color:#64748b;">${escapeHtml(opts.footnoteId)}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
      <p style="margin:0 0 10px;font-size:13px;color:#475569;">${opts.greetingEn}</p>
      <p style="margin:0 0 12px;font-size:13px;color:#475569;">${opts.bodyEn}</p>
      <p style="margin:0;font-size:12px;color:#94a3b8;">${escapeHtml(opts.footnoteEn)}</p>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      ${comp} · Recruitment &amp; Talent Team
    </div>
  </div>
</body>
</html>`;
}

function generateTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = 'APP-';
  for (let i = 0; i < bytes.length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function verifyCaptchaChallenge(
  token: string,
  answer: string,
  secret: string
): Promise<string | null> {
  if (!token || !answer) return 'Verifikasi CAPTCHA wajib diisi.';
  const verified = await verifyJwt(token, secret);
  if (!verified || !String(verified.userId || '').startsWith('captcha:')) {
    return 'CAPTCHA tidak valid atau kedaluwarsa. Muat ulang tantangan.';
  }
  const nonce = String(verified.userId).slice('captcha:'.length);
  const expectedHash = await hashPassword(`${nonce}:${answer}`);
  if (expectedHash !== verified.email) {
    return 'Jawaban CAPTCHA salah. Silakan coba lagi.';
  }
  return null;
}

// Generate stateless HMAC-signed math CAPTCHA challenge (5-minute TTL)
careersRoutes.get('/captcha', async (c) => {
  const a = Math.floor(Math.random() * 9) + 2;
  const b = Math.floor(Math.random() * 9) + 1;
  const useAdd = Math.random() > 0.35;
  const question = useAdd ? `${a} + ${b} = ?` : `${a + b} - ${b} = ?`;
  const answer = useAdd ? String(a + b) : String(a);
  const nonce = crypto.randomUUID();
  const answerHash = await hashPassword(`${nonce}:${answer}`);

  const token = await signJwt(
    { userId: `captcha:${nonce}`, email: answerHash, name: 'captcha', role: 'employee' },
    c.env.JWT_SECRET,
    300
  );

  return c.json({ question, token });
});

// Public list of open job openings + minimal company branding (no internal PII)
careersRoutes.get('/', async (c) => {
  const [company, jobsRes] = await Promise.all([
    c.env.DB.prepare(`SELECT name, legal_name, logo_url FROM companies LIMIT 1`).first<any>(),
    c.env.DB.prepare(
      `SELECT j.id, j.title, j.employment_type, j.headcount, j.work_mode, j.experience_level,
              CASE WHEN j.show_salary = 1 THEN j.salary_min ELSE NULL END AS salary_min,
              CASE WHEN j.show_salary = 1 THEN j.salary_max ELSE NULL END AS salary_max,
              j.show_salary, j.description, j.requirements, j.closing_date, j.created_at,
              d.name AS department_name, b.name AS branch_name
       FROM job_openings j
       LEFT JOIN departments d ON d.id = j.department_id
       LEFT JOIN branches b ON b.id = j.branch_id
       WHERE j.status = 'open'
         AND (j.closing_date IS NULL OR j.closing_date = '' OR j.closing_date >= date('now'))
       ORDER BY j.created_at DESC`
    ).all<any>(),
  ]);

  return c.json({
    company: company || null,
    jobs: jobsRes.results || [],
  });
});

// Public job application (CAPTCHA + honeypot + file validation + duplicate check + tracking code)
careersRoutes.post('/apply', async (c) => {
  const contentType = c.req.header('content-type') || '';
  let jobId = '';
  let fullName = '';
  let email = '';
  let phone = '';
  let coverNote = '';
  let captchaToken = '';
  let captchaAnswer = '';
  let honeypot = '';
  let file: File | null = null;

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    jobId = String(body.job_id || '').trim();
    fullName = String(body.full_name || '').trim();
    email = String(body.email || '').trim();
    phone = String(body.phone || '').trim();
    coverNote = String(body.cover_note || '').trim();
    captchaToken = String(body.captcha_token || '').trim();
    captchaAnswer = String(body.captcha_answer || '').trim();
    honeypot = String(body.website || '').trim();
    if (body.file instanceof File && body.file.size > 0) {
      file = body.file;
    }
  } else {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: 'Payload tidak valid.' }, 400);
    jobId = String(body.job_id || '').trim();
    fullName = String(body.full_name || '').trim();
    email = String(body.email || '').trim();
    phone = String(body.phone || '').trim();
    coverNote = String(body.cover_note || '').trim();
    captchaToken = String(body.captcha_token || '').trim();
    captchaAnswer = String(body.captcha_answer || '').trim();
    honeypot = String(body.website || '').trim();
  }

  if (honeypot) {
    return c.json({ error: 'Permintaan ditolak.' }, 400);
  }

  const captchaErr = await verifyCaptchaChallenge(captchaToken, captchaAnswer, c.env.JWT_SECRET);
  if (captchaErr) return c.json({ error: captchaErr }, 400);

  if (!jobId || !fullName || !email) {
    return c.json({ error: 'Lowongan, nama lengkap, dan email wajib diisi.' }, 400);
  }
  if (fullName.length > 120 || email.length > 160 || phone.length > 30 || coverNote.length > 2000) {
    return c.json({ error: 'Panjang input melebihi batas yang diizinkan.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Format email tidak valid.' }, 400);
  }

  const job = await c.env.DB.prepare(
    `SELECT id, title, status, closing_date FROM job_openings WHERE id = ?`
  )
    .bind(jobId)
    .first<any>();

  if (!job || job.status !== 'open') {
    return c.json({ error: 'Lowongan tidak ditemukan atau sudah ditutup.' }, 404);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (job.closing_date && job.closing_date < today) {
    return c.json({ error: 'Batas waktu pendaftaran lowongan ini telah berakhir.' }, 400);
  }

  const dup = await c.env.DB.prepare(
    `SELECT id FROM candidates WHERE job_id = ? AND lower(email) = lower(?) LIMIT 1`
  )
    .bind(jobId, email)
    .first<any>();
  if (dup) {
    return c.json({ error: 'Email ini sudah pernah melamar untuk posisi tersebut.' }, 409);
  }

  const id = crypto.randomUUID();
  const trackingCode = generateTrackingCode();
  let resumeKey: string | null = null;
  let resumeName: string | null = null;

  if (file) {
    if (file.size > MAX_CV_BYTES) {
      return c.json({ error: 'Ukuran file CV maksimal 5 MB.' }, 400);
    }
    const safeName = sanitizeFilename(file.name);
    if (!ALLOWED_CV_EXT.test(safeName)) {
      return c.json({ error: 'Format CV harus PDF, DOC, atau DOCX.' }, 400);
    }
    if (file.type && !ALLOWED_CV_MIME.has(file.type)) {
      return c.json({ error: 'Tipe file CV tidak diizinkan.' }, 400);
    }

    resumeKey = `recruitment/resumes/${id}/${Date.now()}-${safeName}`;
    const data = await file.arrayBuffer();
    await putFile(c.env, {
      key: resumeKey,
      data,
      contentType: file.type || 'application/pdf',
    });
    resumeName = safeName;
  }

  const notes = coverNote ? `[Public Application] ${coverNote}` : '[Public Application]';

  await c.env.DB.prepare(
    `INSERT INTO candidates (id, job_id, full_name, email, phone, stage, interview_notes, resume_key, resume_name, tracking_code)
     VALUES (?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?)`
  )
    .bind(id, jobId, fullName, email, phone || null, notes, resumeKey, resumeName, trackingCode)
    .run();

  const compRow = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
  const companyName = String(compRow?.name || 'Recruitment Team').trim();
  const origin = new URL(c.req.url).origin || c.env.APP_URL;
  const careersUrl = `${origin}/careers`;

  sendEmailInBackground(c, c.env, {
    to: email,
    subject: `[${companyName}] Lamaran Diterima: ${job.title} (${trackingCode})`,
    type: 'general',
    text: `Halo ${fullName},\n\nTerima kasih telah melamar posisi ${job.title} di ${companyName}.\nKode Pelacakan Anda: ${trackingCode}\n\nPantau status lamaran Anda di: ${careersUrl}\n\n---\nHello ${fullName},\nThank you for applying for ${job.title} at ${companyName}.\nYour Tracking Code: ${trackingCode}\nTrack your application at: ${careersUrl}`,
    html: buildCareersEmailHtml({
      companyName,
      title: `Lamaran Diterima · ${job.title}`,
      greetingId: `Halo <strong>${escapeHtml(fullName)}</strong>,`,
      bodyId: `Terima kasih telah melamar posisi <strong>${escapeHtml(job.title)}</strong> di <strong>${escapeHtml(companyName)}</strong>. Tim rekrutmen kami telah menerima berkas Anda dan akan meninjaunya.`,
      greetingEn: `Hello <strong>${escapeHtml(fullName)}</strong>,`,
      bodyEn: `Thank you for applying for <strong>${escapeHtml(job.title)}</strong> at <strong>${escapeHtml(companyName)}</strong>. Use the tracking code above anytime on our Careers portal to check your live application stage.`,
      highlightLabel: 'Kode Pelacakan / Tracking Code',
      highlightValue: trackingCode,
      ctaLabel: 'Pantau Status Lamaran / Track Application',
      ctaUrl: careersUrl,
      footnoteId: 'Simpan kode pelacakan di atas untuk memantau progres lamaran Anda kapan saja.',
      footnoteEn: 'Save this tracking code to monitor your application progress anytime.',
    }),
  });

  return c.json(
    {
      id,
      stage: 'applied',
      job_title: job.title,
      resume_name: resumeName,
      tracking_code: trackingCode,
      message: 'Lamaran berhasil dikirim.',
    },
    201
  );
});

// Track application status using Email + Tracking Code
careersRoutes.post('/track/code', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Payload tidak valid.' }, 400);

  const captchaErr = await verifyCaptchaChallenge(
    String(body.captcha_token || ''),
    String(body.captcha_answer || ''),
    c.env.JWT_SECRET
  );
  if (captchaErr) return c.json({ error: captchaErr }, 400);

  const email = String(body.email || '').trim();
  const trackingCode = String(body.tracking_code || '').trim().toUpperCase();
  if (!email || !trackingCode) {
    return c.json({ error: 'Email dan kode pelacakan wajib diisi.' }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.full_name, c.stage, c.tracking_code, c.created_at, c.updated_at,
            j.title AS job_title, d.name AS department_name, b.name AS branch_name
     FROM candidates c
     JOIN job_openings j ON j.id = c.job_id
     LEFT JOIN departments d ON d.id = j.department_id
     LEFT JOIN branches b ON b.id = j.branch_id
     WHERE lower(c.email) = lower(?) AND upper(c.tracking_code) = ?
     ORDER BY c.created_at DESC`
  )
    .bind(email, trackingCode)
    .all<any>();

  const applications = rows.results || [];
  if (applications.length === 0) {
    return c.json({ error: 'Lamaran tidak ditemukan. Periksa kembali email dan kode Anda.' }, 404);
  }

  return c.json({ applications });
});

// Request passwordless magic link via email to view all applications for that email
careersRoutes.post('/track/magic-link', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Payload tidak valid.' }, 400);

  const captchaErr = await verifyCaptchaChallenge(
    String(body.captcha_token || ''),
    String(body.captcha_answer || ''),
    c.env.JWT_SECRET
  );
  if (captchaErr) return c.json({ error: captchaErr }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Format email tidak valid.' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, full_name FROM candidates WHERE lower(email) = ? LIMIT 1`
  )
    .bind(email)
    .first<any>();

  if (existing) {
    const compRow = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
    const companyName = String(compRow?.name || 'Recruitment Team').trim();
    const token = await signJwt(
      { userId: `track:${email}`, email, name: 'track', role: 'employee' },
      c.env.JWT_SECRET,
      900
    );
    const origin = new URL(c.req.url).origin || c.env.APP_URL;
    const magicUrl = `${origin}/careers?track=${encodeURIComponent(token)}`;
    sendEmailInBackground(c, c.env, {
      to: email,
      subject: `[${companyName}] Tautan Pantau Status Lamaran / Application Tracking Link`,
      type: 'general',
      text: `Halo ${existing.full_name},\n\nBuka tautan berikut (berlaku 15 menit) untuk memantau status lamaran Anda di ${companyName}:\n${magicUrl}\n\nJika Anda tidak meminta tautan ini, abaikan email ini.\n\n---\nHello ${existing.full_name},\nOpen the link above (valid for 15 minutes) to track your application status at ${companyName}.`,
      html: buildCareersEmailHtml({
        companyName,
        title: 'Pantau Status Lamaran · Track Application',
        greetingId: `Halo <strong>${escapeHtml(existing.full_name)}</strong>,`,
        bodyId: `Klik tombol di bawah ini untuk melihat seluruh status lamaran Anda di <strong>${escapeHtml(companyName)}</strong> secara langsung tanpa kata sandi.`,
        greetingEn: `Hello <strong>${escapeHtml(existing.full_name)}</strong>,`,
        bodyEn: `Click the button above to view your live application status at <strong>${escapeHtml(companyName)}</strong> without a password.`,
        ctaLabel: 'Lihat Status Lamaran / View Status',
        ctaUrl: magicUrl,
        footnoteId: 'Tautan ini berlaku selama 15 menit. Jika Anda tidak merasa meminta tautan ini, silakan abaikan email ini.',
        footnoteEn: 'This link expires in 15 minutes. If you did not request this, you can safely ignore this email.',
      }),
    });
  }

  // Always return generic success to prevent email enumeration
  return c.json({
    sent: true,
    message: 'Jika email terdaftar dalam sistem rekrutmen kami, tautan pelacakan telah dikirim.',
  });
});

// Verify magic link token & return candidate's applications (safe fields only)
careersRoutes.get('/track/verify', async (c) => {
  const token = String(c.req.query('token') || '').trim();
  if (!token) return c.json({ error: 'Token tidak ditemukan.' }, 400);

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload || !String(payload.userId || '').startsWith('track:')) {
    return c.json({ error: 'Tautan tidak valid atau sudah kedaluwarsa.' }, 403);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.full_name, c.stage, c.tracking_code, c.created_at, c.updated_at,
            j.title AS job_title, d.name AS department_name, b.name AS branch_name
     FROM candidates c
     JOIN job_openings j ON j.id = c.job_id
     LEFT JOIN departments d ON d.id = j.department_id
     LEFT JOIN branches b ON b.id = j.branch_id
     WHERE lower(c.email) = ?
     ORDER BY c.created_at DESC`
  )
    .bind(email)
    .all<any>();

  return c.json({
    email,
    applications: rows.results || [],
  });
});

// Public signed Offer Letter PDF download for candidate
careersRoutes.get('/offer-letter', async (c) => {
  const token = String(c.req.query('token') || '').trim();
  if (!token) return c.json({ error: 'Token tidak ditemukan.' }, 400);

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload || !String(payload.userId || '').startsWith('offer:')) {
    return c.json({ error: 'Tautan Offer Letter tidak valid atau kedaluwarsa.' }, 403);
  }

  const candId = String(payload.userId).slice('offer:'.length);
  const cand = await c.env.DB.prepare(
    `SELECT offer_letter_key, offer_letter_name FROM candidates WHERE id = ?`
  )
    .bind(candId)
    .first<any>();

  if (!cand || !cand.offer_letter_key) {
    return c.json({ error: 'Offer Letter tidak ditemukan.' }, 404);
  }

  const file = await getFile(c.env, cand.offer_letter_key);
  if (!file) return c.json({ error: 'File Offer Letter tidak ditemukan.' }, 404);

  const safeName = String(cand.offer_letter_name || 'Offer_Letter.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  return new Response(file.data, {
    headers: {
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  });
});

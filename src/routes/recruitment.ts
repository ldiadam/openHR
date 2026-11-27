import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole, signJwt } from '../middleware/auth';
import { makeId } from '../utils/id';
import { putFile, getFile } from '../services/storage';
import { sendEmailInBackground } from '../services/smtp';

export const recruitmentRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

recruitmentRoutes.use('*', authMiddleware);
recruitmentRoutes.use('*', requireRole(['owner_admin', 'manager']));

// List job openings, candidates, and reference metadata
recruitmentRoutes.get('/', async (c) => {
  const [jobsRes, candidatesRes, deptsRes, branchesRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT j.*, d.name AS department_name, b.name AS branch_name,
              (SELECT COUNT(*) FROM candidates cand WHERE cand.job_id = j.id) AS candidate_count
       FROM job_openings j
       LEFT JOIN departments d ON d.id = j.department_id
       LEFT JOIN branches b ON b.id = j.branch_id
       ORDER BY j.created_at DESC`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT c.*, j.title AS job_title
       FROM candidates c
       JOIN job_openings j ON j.id = c.job_id
       ORDER BY c.updated_at DESC`
    ).all<any>(),
    c.env.DB.prepare(`SELECT id, name FROM departments ORDER BY name ASC`).all<any>(),
    c.env.DB.prepare(`SELECT id, name FROM branches ORDER BY name ASC`).all<any>(),
  ]);

  return c.json({
    jobs: jobsRes.results || [],
    candidates: candidatesRes.results || [],
    departments: deptsRes.results || [],
    branches: branchesRes.results || [],
  });
});

// Create job opening
recruitmentRoutes.post('/jobs', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const title = String(body.title || '').trim();
  if (!title) return c.json({ error: 'Judul lowongan wajib diisi.' }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO job_openings (
       id, title, department_id, branch_id, employment_type, headcount,
       work_mode, experience_level, salary_min, salary_max, show_salary,
       description, requirements, closing_date, status, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  )
    .bind(
      id,
      title,
      body.department_id ? String(body.department_id) : null,
      body.branch_id ? String(body.branch_id) : null,
      String(body.employment_type || 'PKWTT'),
      Math.max(1, Number(body.headcount || 1) || 1),
      String(body.work_mode || 'onsite'),
      String(body.experience_level || 'mid'),
      Number(body.salary_min || 0) || 0,
      Number(body.salary_max || 0) || 0,
      body.show_salary ? 1 : 0,
      body.description ? String(body.description).trim() : null,
      body.requirements ? String(body.requirements).trim() : null,
      body.closing_date ? String(body.closing_date).trim() : null,
      user.employeeId || user.userId
    )
    .run();

  return c.json({ id, status: 'open' }, 201);
});

// Update job opening
recruitmentRoutes.put('/jobs/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const validStatuses = new Set(['open', 'paused', 'closed']);
  const status = validStatuses.has(String(body.status)) ? String(body.status) : undefined;

  await c.env.DB.prepare(
    `UPDATE job_openings
     SET title = COALESCE(?, title),
         department_id = COALESCE(?, department_id),
         branch_id = COALESCE(?, branch_id),
         employment_type = COALESCE(?, employment_type),
         headcount = COALESCE(?, headcount),
         work_mode = COALESCE(?, work_mode),
         experience_level = COALESCE(?, experience_level),
         salary_min = COALESCE(?, salary_min),
         salary_max = COALESCE(?, salary_max),
         show_salary = COALESCE(?, show_salary),
         description = COALESCE(?, description),
         requirements = COALESCE(?, requirements),
         closing_date = COALESCE(?, closing_date),
         status = COALESCE(?, status)
     WHERE id = ?`
  )
    .bind(
      body.title ? String(body.title).trim() : null,
      body.department_id !== undefined ? (body.department_id ? String(body.department_id) : null) : null,
      body.branch_id !== undefined ? (body.branch_id ? String(body.branch_id) : null) : null,
      body.employment_type ? String(body.employment_type) : null,
      body.headcount !== undefined ? Math.max(1, Number(body.headcount) || 1) : null,
      body.work_mode ? String(body.work_mode) : null,
      body.experience_level ? String(body.experience_level) : null,
      body.salary_min !== undefined ? Number(body.salary_min) || 0 : null,
      body.salary_max !== undefined ? Number(body.salary_max) || 0 : null,
      body.show_salary !== undefined ? (body.show_salary ? 1 : 0) : null,
      body.description !== undefined ? String(body.description).trim() : null,
      body.requirements !== undefined ? String(body.requirements).trim() : null,
      body.closing_date !== undefined ? (body.closing_date ? String(body.closing_date).trim() : null) : null,
      status ?? null,
      id
    )
    .run();

  return c.json({ updated: true });
});

// Delete job opening
recruitmentRoutes.delete('/jobs/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM job_openings WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

// Add candidate
recruitmentRoutes.post('/candidates', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Body JSON tidak valid.' }, 400);

  const jobId = String(body.job_id || '').trim();
  const fullName = String(body.full_name || '').trim();
  if (!jobId || !fullName) return c.json({ error: 'Lowongan dan nama kandidat wajib diisi.' }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO candidates (id, job_id, full_name, email, phone, stage, interview_notes, rating, offered_salary)
     VALUES (?, ?, ?, ?, ?, 'applied', ?, ?, ?)`
  )
    .bind(
      id,
      jobId,
      fullName,
      body.email ? String(body.email).trim() : null,
      body.phone ? String(body.phone).trim() : null,
      body.interview_notes ? String(body.interview_notes).trim() : null,
      Number(body.rating || 0) || 0,
      Number(body.offered_salary || 0) || 0
    )
    .run();

  return c.json({ id, stage: 'applied' }, 201);
});

// Update candidate stage / notes / interview schedule
recruitmentRoutes.put('/candidates/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const validStages = new Set(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']);
  const stage = validStages.has(String(body.stage)) ? String(body.stage) : undefined;

  await c.env.DB.prepare(
    `UPDATE candidates
     SET full_name = COALESCE(?, full_name),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         stage = COALESCE(?, stage),
         interview_notes = COALESCE(?, interview_notes),
         rating = COALESCE(?, rating),
         offered_salary = COALESCE(?, offered_salary),
         interview_at = COALESCE(?, interview_at),
         interview_location = COALESCE(?, interview_location),
         interviewer_name = COALESCE(?, interviewer_name),
         interview_type = COALESCE(?, interview_type),
         offer_start_date = COALESCE(?, offer_start_date),
         offer_expires_at = COALESCE(?, offer_expires_at),
         offer_notes = COALESCE(?, offer_notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      body.full_name ? String(body.full_name).trim() : null,
      body.email !== undefined ? String(body.email).trim() : null,
      body.phone !== undefined ? String(body.phone).trim() : null,
      stage ?? null,
      body.interview_notes !== undefined ? String(body.interview_notes) : null,
      body.rating !== undefined ? Number(body.rating) : null,
      body.offered_salary !== undefined ? Number(body.offered_salary) : null,
      body.interview_at !== undefined ? (body.interview_at ? String(body.interview_at).trim() : null) : null,
      body.interview_location !== undefined ? (body.interview_location ? String(body.interview_location).trim() : null) : null,
      body.interviewer_name !== undefined ? (body.interviewer_name ? String(body.interviewer_name).trim() : null) : null,
      body.interview_type !== undefined ? (body.interview_type ? String(body.interview_type).trim() : null) : null,
      body.offer_start_date !== undefined ? (body.offer_start_date ? String(body.offer_start_date).trim() : null) : null,
      body.offer_expires_at !== undefined ? (body.offer_expires_at ? String(body.offer_expires_at).trim() : null) : null,
      body.offer_notes !== undefined ? (body.offer_notes ? String(body.offer_notes).trim() : null) : null,
      id
    )
    .run();

  let emailQueued = false;
  if (stage === 'interview' && body.interview_at && body.send_interview_email !== false) {
    const cand = await c.env.DB.prepare(
      `SELECT c.full_name, c.email, c.tracking_code, c.interview_at, c.interview_location,
              c.interviewer_name, c.interview_type, j.title AS job_title
       FROM candidates c
       JOIN job_openings j ON j.id = c.job_id
       WHERE c.id = ?`
    )
      .bind(id)
      .first<any>();

    if (cand?.email) {
      const comp = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
      const companyName = String(comp?.name || 'Recruitment Team').trim();
      const esc = (v: string) =>
        String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const formattedWhen = String(cand.interview_at).replace('T', ' ');
      const fmtType = cand.interview_type === 'onsite' ? 'On-site (Kantor)' : 'Online / Video Call';
      const origin = new URL(c.req.url).origin || c.env.APP_URL;
      const careersUrl = `${origin}/careers`;

      sendEmailInBackground(c, c.env, {
        to: cand.email,
        subject: `[${companyName}] Undangan Interview: ${cand.job_title}`,
        type: 'general',
        text: `Halo ${cand.full_name},\n\nSelamat! Anda dijadwalkan untuk mengikuti tahap Interview untuk posisi ${cand.job_title} di ${companyName}.\n\nJadwal: ${formattedWhen}\nFormat: ${fmtType}\nLokasi/Link: ${cand.interview_location || '-'}\nInterviewer: ${cand.interviewer_name || '-'}\n\nPantau status lamaran Anda di: ${careersUrl}`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
            <div style="background:#0f172a;padding:20px 28px;color:#fff;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#93c5fd;">${esc(companyName)} · Interview Invitation</div>
              <div style="margin-top:4px;font-size:18px;font-weight:800;">${esc(cand.job_title)}</div>
            </div>
            <div style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
              <p style="margin:0 0 12px;">Halo <strong>${esc(cand.full_name)}</strong>,</p>
              <p style="margin:0 0 16px;">Selamat! Anda diundang ke tahap <strong>Interview</strong> untuk posisi <strong>${esc(cand.job_title)}</strong> di <strong>${esc(companyName)}</strong>.</p>
              <div style="margin:18px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;">
                <div><strong>Jadwal / Date &amp; Time:</strong> ${esc(formattedWhen)}</div>
                <div style="margin-top:6px;"><strong>Format:</strong> ${esc(fmtType)}</div>
                <div style="margin-top:6px;"><strong>Lokasi / Link:</strong> ${esc(cand.interview_location || '-')}</div>
                <div style="margin-top:6px;"><strong>Interviewer:</strong> ${esc(cand.interviewer_name || '-')}</div>
              </div>
              <div style="margin:22px 0;text-align:center;">
                <a href="${esc(careersUrl)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:700;text-decoration:none;">Pantau Status Lamaran / Track Status</a>
              </div>
              <p style="margin:0;font-size:12px;color:#64748b;">Hello ${esc(cand.full_name)}, you are invited to an interview for ${esc(cand.job_title)} at ${esc(companyName)} on ${esc(formattedWhen)}.</p>
            </div>
          </div>
        </body></html>`,
      });
      emailQueued = true;
    }
  } else if (stage === 'offer' && body.send_offer_email === true) {
    const cand = await c.env.DB.prepare(
      `SELECT c.id, c.full_name, c.email, c.offered_salary, c.offer_start_date, c.offer_expires_at,
              c.offer_notes, c.offer_letter_key, c.offer_agreement_no, j.title AS job_title
       FROM candidates c
       JOIN job_openings j ON j.id = c.job_id
       WHERE c.id = ?`
    )
      .bind(id)
      .first<any>();

    if (cand?.email) {
      const comp = await c.env.DB.prepare(`SELECT name FROM companies LIMIT 1`).first<any>();
      const companyName = String(comp?.name || 'Recruitment Team').trim();
      const esc = (v: string) =>
        String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const salaryText =
        Number(cand.offered_salary || 0) > 0
          ? `Rp ${Number(cand.offered_salary).toLocaleString('id-ID')} / bulan`
          : 'Sesuai kesepakatan / As discussed';
      const origin = new URL(c.req.url).origin || c.env.APP_URL;
      const careersUrl = `${origin}/careers`;

      let offerLetterUrl = '';
      if (cand.offer_letter_key) {
        const letterToken = await signJwt(
          { userId: `offer:${cand.id}`, email: cand.email, name: 'offer', role: 'employee', tenantId: 'default' },
          c.env.JWT_SECRET,
          30 * 86400
        );
        offerLetterUrl = `${origin}/api/public/careers/offer-letter?token=${encodeURIComponent(letterToken)}`;
      }

      sendEmailInBackground(c, c.env, {
        to: cand.email,
        subject: `[${companyName}] Penawaran Kerja (Offer Letter): ${cand.job_title}`,
        type: 'general',
        text: `Halo ${cand.full_name},\n\nSelamat! Kami menyampaikan Penawaran Kerja (Offer Letter) untuk posisi ${cand.job_title} di ${companyName}.\n\nGaji Ditawarkan: ${salaryText}\nTanggal Mulai: ${cand.offer_start_date || '-'}\nBerlaku Hingga: ${cand.offer_expires_at || '-'}\n${offerLetterUrl ? `\nUnduh Surat Penawaran Resmi (PDF): ${offerLetterUrl}\n` : ''}\nPantau status lamaran Anda di: ${careersUrl}`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
            <div style="background:#0f172a;padding:20px 28px;color:#fff;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#c4b5fd;">${esc(companyName)} · Official Offer Letter</div>
              <div style="margin-top:4px;font-size:18px;font-weight:800;">${esc(cand.job_title)}</div>
            </div>
            <div style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
              <p style="margin:0 0 12px;">Halo <strong>${esc(cand.full_name)}</strong>,</p>
              <p style="margin:0 0 16px;">Selamat! Kami dengan senang hati menyampaikan <strong>Surat Penawaran Kerja (Offer Letter)</strong> untuk posisi <strong>${esc(cand.job_title)}</strong> di <strong>${esc(companyName)}</strong>.</p>
              <div style="margin:18px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;">
                ${cand.offer_agreement_no ? `<div style="margin-bottom:6px;"><strong>No. Perjanjian / Agreement No:</strong> ${esc(cand.offer_agreement_no)}</div>` : ''}
                <div><strong>Kompensasi / Offered Salary:</strong> ${esc(salaryText)}</div>
                <div style="margin-top:6px;"><strong>Tanggal Mulai / Start Date:</strong> ${esc(cand.offer_start_date || '-')}</div>
                <div style="margin-top:6px;"><strong>Berlaku Hingga / Valid Until:</strong> ${esc(cand.offer_expires_at || '-')}</div>
                ${cand.offer_notes ? `<div style="margin-top:6px;"><strong>Catatan / Benefits:</strong> ${esc(cand.offer_notes)}</div>` : ''}
              </div>
              <div style="margin:22px 0;text-align:center;">
                ${
                  offerLetterUrl
                    ? `<a href="${esc(offerLetterUrl)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#7c3aed;color:#fff;font-size:14px;font-weight:700;text-decoration:none;margin:4px;">Unduh Offer Letter (PDF)</a>`
                    : ''
                }
                <a href="${esc(careersUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f172a;color:#fff;font-size:13px;font-weight:700;text-decoration:none;margin:4px;">Pantau Status Lamaran</a>
              </div>
              <p style="margin:0;font-size:12px;color:#64748b;">Congratulations ${esc(cand.full_name)}! Please review the attached Offer Letter PDF and reply to this email to confirm your acceptance.</p>
            </div>
          </div>
        </body></html>`,
      });
      emailQueued = true;
    }
  }

  return c.json({ updated: true, email_queued: emailQueued });
});

// Delete candidate
recruitmentRoutes.delete('/candidates/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM candidates WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true });
});

// 1-Click Hire: converts candidate to an active employee + seeds onboarding tasks
recruitmentRoutes.post('/candidates/:id/hire', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const cand = await c.env.DB.prepare(
    `SELECT c.*, j.title AS job_title, j.department_id, j.branch_id, j.employment_type
     FROM candidates c
     JOIN job_openings j ON j.id = c.job_id
     WHERE c.id = ?`
  )
    .bind(id)
    .first<any>();
  if (!cand) return c.json({ error: 'Kandidat tidak ditemukan.' }, 404);
  if (cand.hired_employee_id) return c.json({ error: 'Kandidat sudah dikonversi menjadi karyawan.' }, 400);

  const [company, deptFallback, branchFallback] = await Promise.all([
    c.env.DB.prepare(`SELECT id FROM companies WHERE tenant_id = 'default' LIMIT 1`).first<any>(),
    c.env.DB.prepare(`SELECT id FROM departments LIMIT 1`).first<any>(),
    c.env.DB.prepare(`SELECT id FROM branches LIMIT 1`).first<any>(),
  ]);

  const empId = makeId('emp');
  const nik = String(body.nik || `EMP-${Date.now().toString().slice(-6)}`).trim();
  const joinDate = String(body.join_date || new Date().toISOString().slice(0, 10));
  const salary = Number(body.base_salary ?? cand.offered_salary ?? 0) || 0;

  const onboardingDefaults = [
    { title: 'Collect KTP, NPWP, BPJS & Bank Account details', role: 'HR' },
    { title: 'Provision company email & openHR login', role: 'IT' },
    { title: 'Assign laptop / access card in Assets', role: 'IT' },
    { title: 'Team orientation & probation KPI setup', role: 'Manager' },
  ];

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO employees (
        id, tenant_id, company_id, branch_id, department_id, nik, full_name,
        ktp_number, date_of_birth, place_of_birth, gender, religion, marital_status,
        ptkp_status, address, phone, personal_email,
        employment_status, lifecycle_status, join_date, job_title, base_salary
      ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, '1995-01-01', 'Jakarta', 'male', 'Other', 'single', 'TK/0', '-', ?, ?, ?, 'probation', ?, ?, ?)`
    ).bind(
      empId,
      company?.id || 'comp-001',
      cand.branch_id || branchFallback?.id || 'br-001',
      cand.department_id || deptFallback?.id || 'dept-001',
      nik,
      cand.full_name,
      String(body.ktp_number || `000000${Date.now().toString().slice(-10)}`),
      cand.phone || '-',
      cand.email || `${nik.toLowerCase()}@openhr.local`,
      cand.employment_type || 'PKWTT',
      joinDate,
      cand.job_title,
      salary
    ),
    c.env.DB.prepare(
      `UPDATE candidates SET stage = 'hired', hired_employee_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(empId, id),
    ...onboardingDefaults.map((t) =>
      c.env.DB.prepare(
        `INSERT INTO onboarding_tasks (id, employee_id, title, owner_role) VALUES (?, ?, ?, ?)`
      ).bind(makeId('onb'), empId, t.title, t.role)
    ),
  ]);

  return c.json({ employee_id: empId, nik, stage: 'hired' }, 201);
});

// Cancel Hire: reverts an accidental hire if the employee has no attendance/payroll history yet
recruitmentRoutes.post('/candidates/:id/cancel-hire', async (c) => {
  const id = c.req.param('id');
  const cand = await c.env.DB.prepare(`SELECT * FROM candidates WHERE id = ?`).bind(id).first<any>();
  if (!cand) return c.json({ error: 'Kandidat tidak ditemukan.' }, 404);
  if (cand.stage !== 'hired' || !cand.hired_employee_id) {
    return c.json({ error: 'Kandidat ini belum berstatus hired.' }, 400);
  }

  const empId = cand.hired_employee_id;
  const [attCount, payCount] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM attendance WHERE employee_id = ?`).bind(empId).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM payroll_items WHERE employee_id = ?`).bind(empId).first<any>(),
  ]);

  if ((attCount?.cnt || 0) > 0 || (payCount?.cnt || 0) > 0) {
    return c.json(
      { error: 'Karyawan sudah memiliki data absensi/payroll. Gunakan modul Offboarding untuk menonaktifkan karyawan.' },
      400
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM onboarding_tasks WHERE employee_id = ?`).bind(empId),
    c.env.DB.prepare(`DELETE FROM employees WHERE id = ?`).bind(empId),
    c.env.DB.prepare(
      `UPDATE candidates SET stage = 'offer', hired_employee_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id),
  ]);

  return c.json({ stage: 'offer', cancelled: true });
});

// Onboarding checklist for an employee
recruitmentRoutes.get('/onboarding/:employeeId', async (c) => {
  const employeeId = c.req.param('employeeId');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM onboarding_tasks WHERE employee_id = ? ORDER BY created_at ASC`
  )
    .bind(employeeId)
    .all<any>();
  return c.json({ tasks: rows.results || [] });
});

recruitmentRoutes.post('/onboarding/:taskId/toggle', async (c) => {
  const taskId = c.req.param('taskId');
  const row = await c.env.DB.prepare(`SELECT * FROM onboarding_tasks WHERE id = ?`).bind(taskId).first<any>();
  if (!row) return c.json({ error: 'Checklist tidak ditemukan.' }, 404);
  const next = row.is_completed ? 0 : 1;
  await c.env.DB.prepare(
    `UPDATE onboarding_tasks SET is_completed = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?`
  )
    .bind(next, next, taskId)
    .run();
  return c.json({ is_completed: next });
});

// Upload candidate CV / Resume to R2
recruitmentRoutes.post('/candidates/:id/resume', async (c) => {
  const id = c.req.param('id');
  const cand = await c.env.DB.prepare(`SELECT id FROM candidates WHERE id = ?`).bind(id).first<any>();
  if (!cand) return c.json({ error: 'Kandidat tidak ditemukan.' }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ error: 'File CV wajib diunggah.' }, 400);
  }

  const key = `recruitment/resumes/${id}/${Date.now()}-${file.name}`;
  const data = await file.arrayBuffer();
  await putFile(c.env, {
    key,
    data,
    contentType: file.type || 'application/octet-stream',
  });

  await c.env.DB.prepare(
    `UPDATE candidates SET resume_key = ?, resume_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(key, file.name, id)
    .run();

  return c.json({ resume_key: key, resume_name: file.name });
});

// Download candidate CV / Resume
recruitmentRoutes.get('/candidates/:id/resume', async (c) => {
  const id = c.req.param('id');
  const cand = await c.env.DB.prepare(`SELECT resume_key, resume_name FROM candidates WHERE id = ?`).bind(id).first<any>();
  if (!cand || !cand.resume_key) return c.json({ error: 'CV tidak ditemukan.' }, 404);

  const file = await getFile(c.env, cand.resume_key);
  if (!file) return c.json({ error: 'File CV tidak ditemukan di penyimpanan.' }, 404);

  const safeName = String(cand.resume_name || 'resume.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const isPdf = file.contentType === 'application/pdf' || /\.pdf$/i.test(safeName);

  return new Response(file.data as any, {
    headers: {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Content-Disposition': `${isPdf ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  });
});

// Upload candidate Offer Letter PDF to R2
recruitmentRoutes.post('/candidates/:id/offer-letter', async (c) => {
  const id = c.req.param('id');
  const cand = await c.env.DB.prepare(`SELECT id FROM candidates WHERE id = ?`).bind(id).first<any>();
  if (!cand) return c.json({ error: 'Kandidat tidak ditemukan.' }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ error: 'File Offer Letter PDF wajib diunggah.' }, 400);
  }
  const agreementNo = body.agreement_no ? String(body.agreement_no).trim() : null;
  const safeName = String(file.name || 'Offer_Letter.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `recruitment/offers/${id}/${Date.now()}-${safeName}`;
  const data = await file.arrayBuffer();
  await putFile(c.env, {
    key,
    data,
    contentType: file.type || 'application/pdf',
  });

  await c.env.DB.prepare(
    `UPDATE candidates
     SET offer_letter_key = ?,
         offer_letter_name = ?,
         offer_agreement_no = COALESCE(?, offer_agreement_no),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(key, safeName, agreementNo, id)
    .run();

  return c.json({ offer_letter_key: key, offer_letter_name: safeName });
});

// Download candidate Offer Letter PDF (HR)
recruitmentRoutes.get('/candidates/:id/offer-letter', async (c) => {
  const id = c.req.param('id');
  const cand = await c.env.DB.prepare(`SELECT offer_letter_key, offer_letter_name FROM candidates WHERE id = ?`).bind(id).first<any>();
  if (!cand || !cand.offer_letter_key) return c.json({ error: 'Offer Letter tidak ditemukan.' }, 404);

  const file = await getFile(c.env, cand.offer_letter_key);
  if (!file) return c.json({ error: 'File Offer Letter tidak ditemukan.' }, 404);

  const safeName = String(cand.offer_letter_name || 'Offer_Letter.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  return new Response(file.data as any, {
    headers: {
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  });
});

// List all employees with onboarding tasks (Onboarding Tracker)
recruitmentRoutes.get('/onboarding', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.*, e.full_name AS employee_name, e.nik, e.job_title, e.join_date
     FROM onboarding_tasks t
     JOIN employees e ON e.id = t.employee_id
     ORDER BY e.join_date DESC, t.created_at ASC`
  ).all<any>();

  const byEmp = new Map<string, any>();
  for (const row of rows.results || []) {
    if (!byEmp.has(row.employee_id)) {
      byEmp.set(row.employee_id, {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        nik: row.nik,
        job_title: row.job_title,
        join_date: row.join_date,
        tasks: [],
      });
    }
    byEmp.get(row.employee_id).tasks.push({
      id: row.id,
      title: row.title,
      owner_role: row.owner_role,
      is_completed: row.is_completed,
      completed_at: row.completed_at,
    });
  }

  return c.json({ hires: Array.from(byEmp.values()) });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const SECRET = 'openhr-test-secret-0123456789abcdef';

function createEnv() {
  const db = createMockD1();
  const env: any = { DB: db, JWT_SECRET: SECRET, ENVIRONMENT: 'test' };
  return { db, env };
}

async function req(env: any, path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
}

describe('HRIS 5-module suite (Announcements, Assets, Offboarding, Performance, Recruitment)', () => {
  it('supports end-to-end workflows and module gating across all 5 modules', async () => {
    const { env } = createEnv();

    const adminToken = await signJwt(
      { userId: 'usr-admin', employeeId: 'emp-001', email: 'admin@company.id', name: 'Admin', role: 'owner_admin', tenantId: 'default' },
      SECRET
    );
    const empToken = await signJwt(
      { userId: 'usr-emp2', employeeId: 'emp-002', email: 'emp2@company.id', name: 'Employee 2', role: 'employee', tenantId: 'default' },
      SECRET
    );

    // 1. Announcements & Policy Ack
    const annRes = await req(
      env,
      '/api/announcements',
      { method: 'POST', body: JSON.stringify({ title: '2026 Handbook', body: 'Please read.', category: 'policy', require_ack: true }) },
      adminToken
    );
    assert.equal(annRes.status, 201);
    const ann = (await annRes.json()) as any;
    assert.equal((await req(env, `/api/announcements/${ann.id}`, { method: 'PUT', body: JSON.stringify({ title: '2026 Handbook v2' }) }, adminToken)).status, 200);
    const ackRes = await req(env, `/api/announcements/${ann.id}/ack`, { method: 'POST' }, empToken);
    assert.equal(ackRes.status, 200);
    const annList = (await (await req(env, '/api/announcements', {}, empToken)).json()) as any;
    assert.equal(annList.announcements[0].acknowledged, true);
    const ackDetail = (await (await req(env, `/api/announcements/${ann.id}/acks`, {}, adminToken)).json()) as any;
    assert.equal(ackDetail.acked.length, 1);

    // 2. Assets Assign & Return
    const astRes = await req(
      env,
      '/api/assets',
      { method: 'POST', body: JSON.stringify({ asset_tag: 'AST-001', name: 'MacBook Pro', category: 'laptop' }) },
      adminToken
    );
    assert.equal(astRes.status, 201);
    const ast = (await astRes.json()) as any;
    assert.equal((await req(env, `/api/assets/${ast.id}`, { method: 'PUT', body: JSON.stringify({ name: 'MacBook Pro 14' }) }, adminToken)).status, 200);
    const assignRes = await req(
      env,
      `/api/assets/${ast.id}/assign`,
      { method: 'POST', body: JSON.stringify({ employee_id: 'emp-002' }) },
      adminToken
    );
    assert.equal(assignRes.status, 200);
    const astDetail = (await (await req(env, `/api/assets/${ast.id}`, {}, adminToken)).json()) as any;
    assert.equal(astDetail.history.length, 1);
    const mineAst = (await (await req(env, '/api/assets/mine', {}, empToken)).json()) as any;
    assert.equal(mineAst.assets.length, 1);

    // 3. Offboarding (detects unreturned asset blocker, adds custom checklist item, then returns asset & completes)
    const obRes = await req(
      env,
      '/api/offboarding',
      { method: 'POST', body: JSON.stringify({ employee_id: 'emp-002', resignation_date: '2026-11-26', last_working_day: '2026-12-26' }) },
      adminToken
    );
    assert.equal(obRes.status, 201);
    const ob = (await obRes.json()) as any;
    const obDetail = (await (await req(env, `/api/offboarding/${ob.id}`, {}, adminToken)).json()) as any;
    assert.equal(obDetail.blockers.unreturnedAssets, 1);
    assert.equal(obDetail.blockerDetails.assets.length, 1);
    const customItem = await req(env, `/api/offboarding/${ob.id}/checklist`, { method: 'POST', body: JSON.stringify({ title: 'Handover keys', owner_role: 'GA' }) }, adminToken);
    assert.equal(customItem.status, 201);
    await req(env, `/api/assets/${ast.id}/return`, { method: 'POST', body: JSON.stringify({ condition_in: 'good' }) }, adminToken);
    const obAfterReturn = (await (await req(env, `/api/offboarding/${ob.id}`, {}, adminToken)).json()) as any;
    assert.equal(obAfterReturn.blockers.unreturnedAssets, 0);
    const obComplete = await req(env, `/api/offboarding/${ob.id}/complete`, { method: 'POST', body: JSON.stringify({}) }, adminToken);
    assert.equal(obComplete.status, 200);

    // 4. Performance Cycle, Goal, Self + Manager Review + Review Detail
    const cycRes = await req(
      env,
      '/api/performance/cycles',
      { method: 'POST', body: JSON.stringify({ title: 'Q4 2026', cycle_type: 'quarterly', start_date: '2026-10-01', end_date: '2026-12-31' }) },
      adminToken
    );
    assert.equal(cycRes.status, 201);
    const cyc = (await cycRes.json()) as any;
    assert.equal((await req(env, `/api/performance/cycles/${cyc.id}`, { method: 'PUT', body: JSON.stringify({ title: 'Q4 2026 Updated' }) }, adminToken)).status, 200);
    const goalRes = await req(
      env,
      '/api/performance/goals',
      { method: 'POST', body: JSON.stringify({ cycle_id: cyc.id, employee_id: 'emp-002', title: '99% Uptime', target_value: '99%', weight: 50 }) },
      adminToken
    );
    assert.equal(goalRes.status, 201);
    const goal = (await goalRes.json()) as any;
    assert.equal((await req(env, `/api/performance/goals/${goal.id}`, { method: 'PUT', body: JSON.stringify({ actual_value: '99.5%', status: 'completed' }) }, adminToken)).status, 200);
    assert.equal((await req(env, `/api/performance/goals/${goal.id}`, { method: 'DELETE' }, adminToken)).status, 200);
    const perfData = (await (await req(env, '/api/performance', {}, adminToken)).json()) as any;
    assert.ok(perfData.reviews.length > 0);
    const rev = perfData.reviews[0];
    await req(env, `/api/performance/reviews/${rev.id}/self`, { method: 'POST', body: JSON.stringify({ rating: 4, comments: 'Solid' }) }, adminToken);
    const mgrRev = await req(env, `/api/performance/reviews/${rev.id}/manager`, { method: 'POST', body: JSON.stringify({ rating: 5, comments: 'Great' }) }, adminToken);
    assert.equal(mgrRev.status, 200);
    assert.equal(((await mgrRev.json()) as any).final_rating, 5);
    const revDetail = await req(env, `/api/performance/reviews/${rev.id}`, {}, adminToken);
    assert.equal(revDetail.status, 200);

    // 5. Recruitment Job -> Candidate -> CV Upload/Download -> 1-Click Hire -> Onboarding Tracker
    const jobRes = await req(env, '/api/recruitment/jobs', { method: 'POST', body: JSON.stringify({ title: 'Field Engineer' }) }, adminToken);
    assert.equal(jobRes.status, 201);
    const job = (await jobRes.json()) as any;
    const jobUpd = await req(env, `/api/recruitment/jobs/${job.id}`, { method: 'PUT', body: JSON.stringify({ title: 'Senior Field Engineer', status: 'open' }) }, adminToken);
    assert.equal(jobUpd.status, 200);

    // Public Careers Portal: list open jobs & submit external application with CAPTCHA + security checks
    const pubJobsRes = await req(env, '/api/public/careers');
    assert.equal(pubJobsRes.status, 200);
    const pubJobs = (await pubJobsRes.json()) as any;
    assert.ok(pubJobs.jobs.some((j: any) => j.id === job.id));
    assert.equal(pubJobs.company?.email, undefined); // No internal PII exposed

    // Reject missing CAPTCHA
    const noCapFd = new FormData();
    noCapFd.append('job_id', job.id);
    noCapFd.append('full_name', 'Bot User');
    noCapFd.append('email', 'bot@example.com');
    assert.equal((await req(env, '/api/public/careers/apply', { method: 'POST', body: noCapFd })).status, 400);

    // Fetch CAPTCHA challenge and solve it
    const capRes = await (await req(env, '/api/public/careers/captcha')).json() as any;
    assert.ok(capRes.token && capRes.question);
    const m = String(capRes.question).match(/(\d+)\s*([+-])\s*(\d+)/);
    assert.ok(m);
    const solved = m[2] === '+' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]);

    // Reject disallowed HTML file upload
    const evilFd = new FormData();
    evilFd.append('job_id', job.id);
    evilFd.append('full_name', 'XSS User');
    evilFd.append('email', 'xss@example.com');
    evilFd.append('captcha_token', capRes.token);
    evilFd.append('captcha_answer', String(solved));
    evilFd.append('file', new File(['<script>alert(1)</script>'], 'evil.html', { type: 'text/html' }));
    assert.equal((await req(env, '/api/public/careers/apply', { method: 'POST', body: evilFd })).status, 400);

    // Valid application with CAPTCHA + PDF CV
    const pubFd = new FormData();
    pubFd.append('job_id', job.id);
    pubFd.append('full_name', 'Sari Melati');
    pubFd.append('email', 'sari@example.com');
    pubFd.append('phone', '08123456789');
    pubFd.append('cover_note', '5 years experience');
    pubFd.append('captcha_token', capRes.token);
    pubFd.append('captcha_answer', String(solved));
    pubFd.append('file', new File(['%PDF-1.4 cv'], 'sari_cv.pdf', { type: 'application/pdf' }));
    const pubApplyRes = await req(env, '/api/public/careers/apply', { method: 'POST', body: pubFd });
    assert.equal(pubApplyRes.status, 201);
    const pubApplied = (await pubApplyRes.json()) as any;
    assert.equal(pubApplied.stage, 'applied');
    assert.equal(pubApplied.resume_name, 'sari_cv.pdf');
    assert.ok(String(pubApplied.tracking_code || '').startsWith('APP-'));

    // Track application via Email + Tracking Code
    const trackCodeRes = await req(env, '/api/public/careers/track/code', {
      method: 'POST',
      body: JSON.stringify({
        email: 'sari@example.com',
        tracking_code: pubApplied.tracking_code,
        captcha_token: capRes.token,
        captcha_answer: String(solved),
      }),
    });
    assert.equal(trackCodeRes.status, 200);
    const tracked = (await trackCodeRes.json()) as any;
    assert.equal(tracked.applications.length, 1);
    assert.equal(tracked.applications[0].stage, 'applied');
    assert.equal(tracked.applications[0].interview_notes, undefined); // Safe public projection

    // Request magic link (returns generic 200)
    const magicRes = await req(env, '/api/public/careers/track/magic-link', {
      method: 'POST',
      body: JSON.stringify({
        email: 'sari@example.com',
        captcha_token: capRes.token,
        captcha_answer: String(solved),
      }),
    });
    assert.equal(magicRes.status, 200);

    // Reject duplicate application for same job + email
    assert.equal((await req(env, '/api/public/careers/apply', { method: 'POST', body: pubFd })).status, 409);
    const candRes = await req(
      env,
      '/api/recruitment/candidates',
      { method: 'POST', body: JSON.stringify({ job_id: job.id, full_name: 'Budi Santoso', offered_salary: 9000000 }) },
      adminToken
    );
    assert.equal(candRes.status, 201);
    const cand = (await candRes.json()) as any;
    const fd = new FormData();
    fd.append('file', new File(['%PDF-1.4 mock'], 'budi_cv.pdf', { type: 'application/pdf' }));
    const cvUp = await req(env, `/api/recruitment/candidates/${cand.id}/resume`, { method: 'POST', body: fd }, adminToken);
    assert.equal(cvUp.status, 200);
    const cvGet = await req(env, `/api/recruitment/candidates/${cand.id}/resume`, {}, adminToken);
    assert.equal(cvGet.status, 200);
    const hireRes = await req(env, `/api/recruitment/candidates/${cand.id}/hire`, { method: 'POST', body: JSON.stringify({ nik: 'NEW-001' }) }, adminToken);
    assert.equal(hireRes.status, 201);
    const hired = (await hireRes.json()) as any;
    const onbRes = (await (await req(env, `/api/recruitment/onboarding/${hired.employee_id}`, {}, adminToken)).json()) as any;
    assert.equal(onbRes.tasks.length, 4);
    const onbAll = (await (await req(env, '/api/recruitment/onboarding', {}, adminToken)).json()) as any;
    assert.equal(onbAll.hires.length, 1);

    const cand2Res = await req(env, '/api/recruitment/candidates', { method: 'POST', body: JSON.stringify({ job_id: job.id, full_name: 'Temp Candidate', email: 'temp@example.com' }) }, adminToken);
    const cand2 = (await cand2Res.json()) as any;
    const schedRes = await req(
      env,
      `/api/recruitment/candidates/${cand2.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          stage: 'interview',
          interview_at: '2026-12-01T10:00',
          interview_type: 'online',
          interview_location: 'https://meet.google.com/abc',
          interviewer_name: 'HR Lead',
        }),
      },
      adminToken
    );
    assert.equal(schedRes.status, 200);
    assert.equal(((await schedRes.json()) as any).email_queued, true);
    const offFd = new FormData();
    offFd.append('file', new File(['%PDF-1.4 offer'], 'Offer_Letter.pdf', { type: 'application/pdf' }));
    offFd.append('agreement_no', 'SHA2611-01');
    const offUpRes = await req(env, `/api/recruitment/candidates/${cand2.id}/offer-letter`, { method: 'POST', body: offFd }, adminToken);
    assert.equal(offUpRes.status, 200);
    const offerRes = await req(
      env,
      `/api/recruitment/candidates/${cand2.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          stage: 'offer',
          offered_salary: 12000000,
          offer_start_date: '2026-12-15',
          offer_expires_at: '2026-12-08',
          offer_notes: 'BPJS + Transport allowance',
          send_offer_email: true,
        }),
      },
      adminToken
    );
    assert.equal(offerRes.status, 200);
    assert.equal(((await offerRes.json()) as any).email_queued, true);
    const hire2 = await req(env, `/api/recruitment/candidates/${cand2.id}/hire`, { method: 'POST', body: JSON.stringify({ nik: 'NEW-002' }) }, adminToken);
    assert.equal(hire2.status, 201);
    const cancelHireRes = await req(env, `/api/recruitment/candidates/${cand2.id}/cancel-hire`, { method: 'POST', body: JSON.stringify({}) }, adminToken);
    assert.equal(cancelHireRes.status, 200);
    assert.equal(((await cancelHireRes.json()) as any).stage, 'offer');
    assert.equal((await req(env, `/api/recruitment/candidates/${cand2.id}`, { method: 'DELETE' }, adminToken)).status, 200);
    assert.equal((await req(env, `/api/recruitment/jobs/${job.id}`, { method: 'DELETE' }, adminToken)).status, 200);

    // 6. Module gating returns 403 when disabled
    await req(env, '/api/settings/modules', { method: 'PUT', body: JSON.stringify({ announcements: false, assets: false }) }, adminToken);
    assert.equal((await req(env, '/api/announcements', {}, adminToken)).status, 403);
    assert.equal((await req(env, '/api/assets', {}, adminToken)).status, 403);
  });
});

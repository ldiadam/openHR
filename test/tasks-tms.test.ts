import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const SECRET = 'openhr-test-secret-0123456789abcdef';

function createEnv() {
  const db = createMockD1();
  const r2Store = new Map<string, { data: ArrayBuffer; contentType: string }>();
  const env: any = {
    DB: db,
    JWT_SECRET: SECRET,
    ENVIRONMENT: 'test',
    R2: {
      async put(key: string, value: ArrayBuffer, opts?: any) {
        r2Store.set(key, { data: value, contentType: opts?.httpMetadata?.contentType || 'application/octet-stream' });
      },
      async get(key: string) {
        const hit = r2Store.get(key);
        if (!hit) return null;
        return {
          arrayBuffer: async () => hit.data,
          httpMetadata: { contentType: hit.contentType },
        };
      },
    },
  };
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

describe('Tasks (TMS) module workflow', () => {
  it('supports full lifecycle: create -> action -> handover -> reschedule -> close -> return -> approve & module gating', async () => {
    const { env } = createEnv();

    const adminToken = await signJwt(
      { userId: 'usr-admin', employeeId: 'emp-001', email: 'admin@company.id', name: 'Admin', role: 'owner_admin' },
      SECRET
    );
    const emp2Token = await signJwt(
      { userId: 'usr-emp2', employeeId: 'emp-002', email: 'emp2@company.id', name: 'Employee 2', role: 'employee' },
      SECRET
    );
    const emp3Token = await signJwt(
      { userId: 'usr-emp3', employeeId: 'emp-003', email: 'emp3@company.id', name: 'Employee 3', role: 'employee' },
      SECRET
    );

    // 1. Configure maritime preset in Settings
    const modRes = await req(
      env,
      '/api/settings/modules',
      {
        method: 'PUT',
        body: JSON.stringify({ tasks: true, task_reference_preset: 'maritime' }),
      },
      adminToken
    );
    assert.equal(modRes.status, 200);

    const metaRes = await req(env, '/api/tasks/meta', {}, emp2Token);
    assert.equal(metaRes.status, 200);
    const meta = (await metaRes.json()) as any;
    assert.ok(meta.employees.length > 0, 'Active employees list must not be empty');
    assert.deepEqual(meta.referenceFields, ['Vessel Name', 'Company Name', 'IMO', 'Call Sign']);

    // 2. Create task (Section A)
    const createRes = await req(
      env,
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Racha Bhum - Inm C inspection',
          description: 'Inspect satcom terminal and log diagnostics',
          category: 'adhoc',
          priority: 'high',
          assignee_id: 'emp-002',
          due_at: '2026-11-26 18:00',
          reference_meta: {
            'Vessel Name': 'Racha Bhum',
            'Company Name': 'SMTS Pte Ltd',
            IMO: '9308123',
            'Call Sign': '9V1234',
          },
          reminder_minutes: 30,
          alert1_minutes: 30,
          alert2_minutes: 45,
          warning_minutes: 60,
        }),
      },
      adminToken
    );
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as any;
    assert.match(created.reference_no, /^TMS \d{6} \d{6}$/);

    // 3. Assignee sees it in inbox
    const inboxRes = await req(env, '/api/tasks?tab=inbox', {}, emp2Token);
    const inbox = (await inboxRes.json()) as any;
    assert.equal(inbox.tasks.length, 1);
    assert.equal(inbox.tasks[0].reference_meta['Vessel Name'], 'Racha Bhum');

    // 4. B1 Take Action
    const actionRes = await req(
      env,
      `/api/tasks/${created.id}/action`,
      { method: 'POST', body: JSON.stringify({ status: 'in_progress', note: 'Started diagnostics' }) },
      emp2Token
    );
    assert.equal(actionRes.status, 200);

    // 5. B2 Handover to emp-003
    const handoverRes = await req(
      env,
      `/api/tasks/${created.id}/handover`,
      {
        method: 'POST',
        body: JSON.stringify({ next_assignee_id: 'emp-003', reason: 'Need field engineer signoff' }),
      },
      emp2Token
    );
    assert.equal(handoverRes.status, 200);

    // 6. B3 Reschedule
    const reschedRes = await req(
      env,
      `/api/tasks/${created.id}/reschedule`,
      {
        method: 'POST',
        body: JSON.stringify({ due_at: '2026-11-27 12:00', reason: 'Vessel berthed late', warning_minutes: 90 }),
      },
      emp3Token
    );
    assert.equal(reschedRes.status, 200);

    // 7. Upload attachment
    const fd = new FormData();
    fd.append('file', new Blob(['ok'], { type: 'text/plain' }), 'report.txt');
    const attRes = await req(env, `/api/tasks/${created.id}/attachments`, { method: 'POST', body: fd }, emp3Token);
    assert.equal(attRes.status, 201);

    // 8. B5 Close (Submit for Approval)
    const closeRes = await req(
      env,
      `/api/tasks/${created.id}/close`,
      { method: 'POST', body: JSON.stringify({ remarks: 'Terminal operational' }) },
      emp3Token
    );
    assert.equal(closeRes.status, 200);

    // 9. C Return then Re-close then Approve
    const retRes = await req(
      env,
      `/api/tasks/${created.id}/approve`,
      { method: 'POST', body: JSON.stringify({ decision: 'return', remarks: 'Attach serial photo' }) },
      adminToken
    );
    assert.equal(retRes.status, 200);
    assert.equal(((await retRes.json()) as any).status, 'in_progress');

    await req(
      env,
      `/api/tasks/${created.id}/close`,
      { method: 'POST', body: JSON.stringify({ remarks: 'Photo attached and verified' }) },
      emp3Token
    );

    const apprRes = await req(
      env,
      `/api/tasks/${created.id}/approve`,
      { method: 'POST', body: JSON.stringify({ decision: 'approve', remarks: 'Approved' }) },
      adminToken
    );
    assert.equal(apprRes.status, 200);
    assert.equal(((await apprRes.json()) as any).status, 'approved');

    // Verify full activity timeline
    const detailRes = await req(env, `/api/tasks/${created.id}`, {}, adminToken);
    const detail = (await detailRes.json()) as any;
    assert.equal(detail.attachments.length, 1);
    assert.deepEqual(
      detail.activities.map((a: any) => a.action_type),
      ['created', 'action', 'handover', 'reschedule', 'submitted_for_approval', 'returned', 'submitted_for_approval', 'approved']
    );

    // 10. Module gating when tasks = false
    await req(env, '/api/settings/modules', { method: 'PUT', body: JSON.stringify({ tasks: false }) }, adminToken);
    const blockedRes = await req(env, '/api/tasks', {}, adminToken);
    assert.equal(blockedRes.status, 403);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';
import { DEFAULT_MODULES_CONFIG } from '../shared/modules';

const SECRET = 'openhr-test-secret-0123456789abcdef';

function createEnv() {
  const db = createMockD1();
  const env: any = {
    DB: db,
    JWT_SECRET: SECRET,
    ENVIRONMENT: 'test',
  };
  return { db, env };
}

async function adminToken() {
  return signJwt(
    {
      userId: 'usr-admin-1',
      employeeId: 'emp-01',
      email: 'admin@company.id',
      name: 'Admin',
      role: 'owner_admin',
      tenantId: 'default',
    },
    SECRET
  );
}

async function req(env: any, path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
}

describe('Modular Feature Toggles (Phase 1)', () => {
  it('defaults all modules to enabled and enforces disabled module guards', async () => {
    const { env } = createEnv();
    const token = await adminToken();

    // 1. Public company endpoint exposes default modules
    const pubRes = await req(env, '/api/public/company');
    assert.equal(pubRes.status, 200);
    const pubJson = (await pubRes.json()) as any;
    assert.deepEqual(pubJson.company.modules, DEFAULT_MODULES_CONFIG);

    // 2. Petty cash works while enabled
    const pcOk = await req(env, '/api/petty-cash/requests', {}, token);
    assert.equal(pcOk.status, 200);

    // 3. Disable petty_cash and set leave_workflow to simple
    const putRes = await req(
      env,
      '/api/settings/modules',
      {
        method: 'PUT',
        body: JSON.stringify({
          modules: {
            ...DEFAULT_MODULES_CONFIG,
            petty_cash: false,
            leave_workflow: 'simple',
          },
        }),
      },
      token
    );
    assert.equal(putRes.status, 200);
    const putJson = (await putRes.json()) as any;
    assert.equal(putJson.modules.petty_cash, false);
    assert.equal(putJson.modules.leave_workflow, 'simple');

    // 4. Disabled module API is guarded with 403
    const pcBlocked = await req(env, '/api/petty-cash/requests', {}, token);
    assert.equal(pcBlocked.status, 403);

    // 5. Enabled modules still work
    const leaveOk = await req(env, '/api/leave/applications', {}, token);
    assert.equal(leaveOk.status, 200);

    // 6. Re-enable petty_cash restores access
    const reEnable = await req(
      env,
      '/api/settings/modules',
      { method: 'PUT', body: JSON.stringify({ modules: { petty_cash: true } }) },
      token
    );
    assert.equal(reEnable.status, 200);

    const pcRestored = await req(env, '/api/petty-cash/requests', {}, token);
    assert.equal(pcRestored.status, 200);
  });

  it('treats Purelymail as an optional toggleable module and skips provisioning when disabled', async () => {
    const { env } = createEnv();
    const token = await adminToken();

    // Defaults to disabled when no Purelymail credentials exist
    const modRes = await req(env, '/api/settings/modules', {}, token);
    assert.equal(modRes.status, 200);
    const modJson = (await modRes.json()) as any;
    assert.equal(modJson.modules.purelymail, false);

    // Creating an employee even with provision_company_email=true skips Purelymail when module is disabled
    const createSkipped = await req(
      env,
      '/api/employees',
      {
        method: 'POST',
        body: JSON.stringify({
          nik: 'EMP901',
          full_name: 'No Mail Staff',
          ktp_number: '3171010101950901',
          date_of_birth: '1995-01-01',
          place_of_birth: 'Jakarta',
          gender: 'male',
          religion: 'Islam',
          marital_status: 'single',
          address: 'Jl. Merdeka No. 1, Jakarta',
          phone: '081200009999',
          personal_email: 'nomail@example.com',
          join_date: '2026-10-01',
          employment_status: 'PKWTT',
          job_title: 'Staff',
          branch_id: 'branch-jkt',
          department_id: 'dept-eng',
          provision_company_email: true,
        }),
      },
      token
    );
    assert.equal(createSkipped.status, 201);
    const skippedData = (await createSkipped.json()) as any;
    assert.equal(skippedData.purelymail.provisioned, false);
    assert.match(skippedData.purelymail.notes, /disabled/i);

    // Admin can enable Purelymail module
    const enableRes = await req(
      env,
      '/api/settings/modules',
      { method: 'PUT', body: JSON.stringify({ modules: { purelymail: true } }) },
      token
    );
    assert.equal(enableRes.status, 200);
    const enabledJson = (await enableRes.json()) as any;
    assert.equal(enabledJson.modules.purelymail, true);

    // Separate API & SMTP test endpoints
    const apiTestRes = await req(
      env,
      '/api/settings/test-purelymail-api',
      { method: 'POST', body: JSON.stringify({}) },
      token
    );
    assert.equal(apiTestRes.status, 200);
    const apiTestJson = (await apiTestRes.json()) as any;
    assert.equal(apiTestJson.status, 'warning');

    const smtpTestRes = await req(
      env,
      '/api/settings/test-smtp',
      { method: 'POST', body: JSON.stringify({ smtp_host: 'smtp.example.com', smtp_port: 587 }) },
      token
    );
    assert.equal(smtpTestRes.status, 200);
    const smtpTestJson = (await smtpTestRes.json()) as any;
    assert.equal(smtpTestJson.status, 'warning');
  });
});

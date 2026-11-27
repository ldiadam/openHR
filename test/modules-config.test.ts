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
});

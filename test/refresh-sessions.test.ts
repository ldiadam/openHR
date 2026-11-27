import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { hashPassword, signJwt } from '../src/middleware/auth';

const env = {
  JWT_SECRET: 'test-secret-for-refresh-session-suite-32chars',
} as any;

async function req(db: any, method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    { ...env, DB: db }
  );
  const data = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, data };
}

test('Refresh token lifecycle: login -> expire -> rotate refresh -> revoke logout', async () => {
  const db = createMockD1();
  const pwHash = await hashPassword('password123');
  await db.prepare(`UPDATE users SET password_hash = ? WHERE id = 'usr-004'`).bind(pwHash).run();

  // 1. Mobile login issues access JWT + 90-day refresh token
  const login = await req(db, 'POST', '/api/auth/login', {
    email: 'agus.setiawan@nusantara.id',
    password: 'password123',
    client: 'mobile',
    deviceLabel: 'Xiaomi Test',
  });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);
  assert.ok(login.data.refreshToken);
  assert.equal(login.data.user.employeeId, 'emp-004');

  // 2. Access JWT works on /api/auth/me
  const me1 = await req(db, 'GET', '/api/auth/me', undefined, login.data.token);
  assert.equal(me1.status, 200);

  // 3. Expired JWT fails with 401
  const expiredJwt = await signJwt(
    {
      userId: 'usr-004',
      tenantId: 'default',
      email: 'agus.setiawan@nusantara.id',
      role: 'employee',
      employeeId: 'emp-004',
      name: 'Agus Setiawan',
    },
    env.JWT_SECRET,
    -10
  );
  const meExpired = await req(db, 'GET', '/api/auth/me', undefined, expiredJwt);
  assert.equal(meExpired.status, 401);

  // 4. Refresh exchanges old refresh token for new JWT + rotated refresh token
  const refreshed = await req(db, 'POST', '/api/auth/refresh', {
    refreshToken: login.data.refreshToken,
    deviceLabel: 'Xiaomi Test',
  });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.data.token);
  assert.ok(refreshed.data.refreshToken);
  assert.notEqual(refreshed.data.refreshToken, login.data.refreshToken);

  const me2 = await req(db, 'GET', '/api/auth/me', undefined, refreshed.data.token);
  assert.equal(me2.status, 200);

  // 5. Replaying old rotated refresh token is rejected
  const replay = await req(db, 'POST', '/api/auth/refresh', {
    refreshToken: login.data.refreshToken,
  });
  assert.equal(replay.status, 401);
  assert.equal(replay.data.code, 'INVALID_REFRESH_TOKEN');

  // 6. Logout revokes active refresh token
  const out = await req(db, 'POST', '/api/auth/logout', {
    refreshToken: refreshed.data.refreshToken,
  });
  assert.equal(out.status, 200);

  const afterLogout = await req(db, 'POST', '/api/auth/refresh', {
    refreshToken: refreshed.data.refreshToken,
  });
  assert.equal(afterLogout.status, 401);
});

test('Refresh rejects deactivated users and revoked password-reset sessions', async () => {
  const db = createMockD1();
  const pwHash = await hashPassword('password123');
  await db.prepare(`UPDATE users SET password_hash = ? WHERE id = 'usr-005'`).bind(pwHash).run();

  const login = await req(db, 'POST', '/api/auth/login', {
    email: 'rina.wijaya@nusantara.id',
    password: 'password123',
    client: 'mobile',
  });
  assert.equal(login.status, 200);

  // Deactivate user in DB
  await db.prepare(`UPDATE users SET is_active = 0 WHERE id = 'usr-005'`).run();
  const blocked = await req(db, 'POST', '/api/auth/refresh', {
    refreshToken: login.data.refreshToken,
  });
  assert.equal(blocked.status, 401);

  // Password reset revokes active refresh sessions for that user
  await db.prepare(`UPDATE users SET is_active = 1 WHERE id = 'usr-005'`).run();
  const login2 = await req(db, 'POST', '/api/auth/login', {
    email: 'rina.wijaya@nusantara.id',
    password: 'password123',
    client: 'mobile',
  });
  assert.equal(login2.status, 200);

  await db
    .prepare(
      `INSERT INTO password_resets (id, tenant_id, user_id, token, expires_at) VALUES ('pr-test', 'default', 'usr-005', 'rst-test-123', '2099-01-01T00:00:00Z')`
    )
    .run();
  const reset = await req(db, 'POST', '/api/auth/confirm-reset', {
    token: 'rst-test-123',
    newPassword: 'newpassword123',
  });
  assert.equal(reset.status, 200);

  const afterReset = await req(db, 'POST', '/api/auth/refresh', {
    refreshToken: login2.data.refreshToken,
  });
  assert.equal(afterReset.status, 401);
});

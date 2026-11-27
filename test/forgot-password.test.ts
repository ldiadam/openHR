import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../src/index';
import { createMockD1 } from './d1-mock';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Forgot Password Flow', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'https://hr.example.com',
    ENVIRONMENT: 'development',
  };

  async function request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    const req = new Request(`http://localhost${path}`, { ...options, headers });
    return await app.fetch(req, env as any);
  }

  it('returns generic 200 for unknown email without creating a reset token', async () => {
    const res = await request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'nonexistent@example.com' }),
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.ok(data.message);
    assert.strictEqual(data.resetLink, undefined);
  });

  it('validates empty email/NIK input', async () => {
    const res = await request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email: '   ' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('creates reset token, verifies via reset-info, confirms reset, and allows login with new password', async () => {
    // 1. Request reset by email (seeded admin: budi.santoso@nusantara.id)
    const reqRes = await request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'BUDI.SANTOSO@nusantara.id' }),
    });
    assert.strictEqual(reqRes.status, 200);
    const reqData: any = await reqRes.json();
    assert.ok(reqData.resetLink, 'dev environment should return resetLink');
    const url = new URL(reqData.resetLink);
    const token = url.searchParams.get('token');
    assert.ok(token && token.startsWith('rst-'));

    // 2. Verify token via GET /api/auth/reset-info
    const infoRes = await request(`/api/auth/reset-info?token=${encodeURIComponent(token)}`);
    assert.strictEqual(infoRes.status, 200);
    const infoData: any = await infoRes.json();
    assert.strictEqual(infoData.valid, true);
    assert.ok(infoData.maskedEmail?.includes('***@nusantara.id'));

    // 3. Reject weak password
    const weakRes = await request('/api/auth/confirm-reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: '123' }),
    });
    assert.strictEqual(weakRes.status, 400);

    // 4. Confirm reset with valid password
    const confirmRes = await request('/api/auth/confirm-reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'NewSecurePassword99!' }),
    });
    assert.strictEqual(confirmRes.status, 200);

    // 5. Token cannot be reused
    const infoAfterRes = await request(`/api/auth/reset-info?token=${encodeURIComponent(token)}`);
    const infoAfterData: any = await infoAfterRes.json();
    assert.strictEqual(infoAfterData.valid, false);
    assert.strictEqual(infoAfterData.isUsed, true);

    const reuseRes = await request('/api/auth/confirm-reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'AnotherPassword123!' }),
    });
    assert.strictEqual(reuseRes.status, 400);

    // 6. Old password fails, new password succeeds
    const oldLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'budi.santoso@nusantara.id', password: 'Password123!' }),
    });
    assert.strictEqual(oldLoginRes.status, 401);

    const newLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'budi.santoso@nusantara.id', password: 'NewSecurePassword99!' }),
    });
    assert.strictEqual(newLoginRes.status, 200);
    const loginData: any = await newLoginRes.json();
    assert.ok(loginData.token);
  });

  it('invalidates previous unused tokens when a new reset is requested and rejects expired tokens', async () => {
    const firstRes = await request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'budi.santoso@nusantara.id' }),
    });
    const firstToken = new URL(((await firstRes.json()) as any).resetLink).searchParams.get('token')!;

    const secondRes = await request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'budi.santoso@nusantara.id' }),
    });
    const secondToken = new URL(((await secondRes.json()) as any).resetLink).searchParams.get('token')!;

    // First token should now be marked used
    const firstInfo = (await (await request(`/api/auth/reset-info?token=${encodeURIComponent(firstToken)}`)).json()) as any;
    assert.strictEqual(firstInfo.valid, false);

    // Second token should still be valid
    const secondInfo = (await (await request(`/api/auth/reset-info?token=${encodeURIComponent(secondToken)}`)).json()) as any;
    assert.strictEqual(secondInfo.valid, true);

    // Manually expire second token
    await db
      .prepare(`UPDATE password_resets SET expires_at = ? WHERE token = ?`)
      .bind(new Date(Date.now() - 60_000).toISOString(), secondToken)
      .run();

    const expiredInfo = (await (await request(`/api/auth/reset-info?token=${encodeURIComponent(secondToken)}`)).json()) as any;
    assert.strictEqual(expiredInfo.valid, false);
    assert.strictEqual(expiredInfo.isExpired, true);

    const expiredConfirm = await request('/api/auth/confirm-reset', {
      method: 'POST',
      body: JSON.stringify({ token: secondToken, newPassword: 'ValidPassword123!' }),
    });
    assert.strictEqual(expiredConfirm.status, 400);
  });
});

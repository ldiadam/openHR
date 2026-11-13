import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeId } from '../src/utils/id';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Record id generation', () => {
  it('never collides when generated in the same millisecond', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(makeId('aud'));
    assert.equal(ids.size, 5000, 'ids generated in a burst are all unique');
  });

  it('keeps both the timestamp and a random suffix', () => {
    const id = makeId('aud');
    assert.match(id, /^aud-\d+-\w+$/, 'id carries prefix, timestamp and random part');
  });
});

describe('Back-to-back audit writes do not collide', () => {
  const db = createMockD1();
  const env = { DB: db, JWT_SECRET, APP_URL: 'http://localhost:8787', PURELYMAIL_DOMAIN: 'company.id' };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    return app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
  }

  it('uploads and deletes the company logo repeatedly without a 500', async () => {
    const token = await signJwt(
      {
        userId: 'usr-001',
        email: 'budi.santoso@nusantara.id',
        role: 'owner_admin',
        tenantId: 'default',
        name: 'Budi Santoso',
      },
      JWT_SECRET
    );

    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    for (let i = 0; i < 5; i++) {
      const up = await request(
        '/api/settings/company/logo',
        { method: 'POST', body: JSON.stringify({ logo_base64: png }) },
        token
      );
      assert.equal(up.status, 200, `upload ${i + 1} succeeds`);

      const del = await request('/api/settings/company/logo', { method: 'DELETE' }, token);
      assert.equal(del.status, 200, `delete ${i + 1} succeeds`);
    }
  });
});

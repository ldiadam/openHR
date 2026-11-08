import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('openHR Feature Tests: Report Downloads, Foreign Workers, and Strict Attendance Rules', () => {
  const db = createMockD1();
  const env = {
    DB: db,
    JWT_SECRET,
    APP_URL: 'http://localhost:8787',
  };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const req = new Request(`http://localhost${path}`, {
      ...options,
      headers,
    });

    return await app.fetch(req, env as any);
  }

  it('Verifies authenticated report download with token header and ?token= query parameter', async () => {
    const adminToken = await signJwt(
      { userId: 'usr-001', tenantId: 'default', email: 'budi.santoso@nusantara.id', role: 'owner_admin', employeeId: 'emp-001', name: 'Budi Santoso' },
      JWT_SECRET
    );

    // 1. Unauthenticated request without token must fail (401)
    const unauthRes = await request('/api/reports/attendance-recap?month=2026-10&export=excel');
    assert.strictEqual(unauthRes.status, 401, 'Download without token must be rejected with 401');

    // 2. Authenticated request with Bearer token must succeed (200)
    const authHeaderRes = await request('/api/reports/attendance-recap?month=2026-10&export=excel', {}, adminToken);
    assert.strictEqual(authHeaderRes.status, 200);
    assert.strictEqual(
      authHeaderRes.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const buf1 = await authHeaderRes.arrayBuffer();
    assert.ok(buf1.byteLength > 500, 'Excel buffer must contain valid file bytes');

    // 3. Authenticated request with ?token= query param must also succeed (200)
    const authQueryRes = await request(`/api/reports/attendance-recap?month=2026-10&export=excel&token=${adminToken}`);
    assert.strictEqual(authQueryRes.status, 200, 'Download with ?token= query param must succeed');
    const buf2 = await authQueryRes.arrayBuffer();
    assert.ok(buf2.byteLength > 500);
  });

  it('Creates a Foreign Worker (TKA) with passport and optional tax', async () => {
    const adminToken = await signJwt(
      { userId: 'usr-001', tenantId: 'default', email: 'budi.santoso@nusantara.id', role: 'owner_admin', employeeId: 'emp-001', name: 'Budi Santoso' },
      JWT_SECRET
    );

    // Missing passport for foreigner worker should fail
    const invalidRes = await request(
      '/api/employees',
      {
        method: 'POST',
        body: JSON.stringify({
          nik: 'EXP001',
          full_name: 'John Miller',
          is_foreign_worker: 1,
          nationality: 'United States',
          date_of_birth: '1985-04-12',
          place_of_birth: 'Chicago',
          gender: 'male',
          religion: 'Lainnya',
          marital_status: 'single',
          ptkp_status: 'TK/0',
          address: 'Apartment Kuningan, Jakarta',
          phone: '081211112222',
          personal_email: 'john.miller@example.com',
          join_date: '2026-03-01',
          employment_status: 'PKWT',
          job_title: 'Senior Solutions Architect',
          branch_id: 'branch-jkt',
          department_id: 'dept-eng',
          base_salary: 30000000,
        }),
      },
      adminToken
    );
    assert.strictEqual(invalidRes.status, 400, 'Foreign worker without passport must be rejected');

    // Valid foreign worker with passport and no KTP / no NPWP (tax optional)
    const validRes = await request(
      '/api/employees',
      {
        method: 'POST',
        body: JSON.stringify({
          nik: 'EXP001',
          full_name: 'John Miller',
          is_foreign_worker: 1,
          nationality: 'United States',
          passport_number: 'US987654321',
          passport_expiry_date: '2030-05-20',
          kitas_kitap_number: 'KITAS-2026-001',
          date_of_birth: '1985-04-12',
          place_of_birth: 'Chicago',
          gender: 'male',
          religion: 'Lainnya',
          marital_status: 'single',
          ptkp_status: 'TK/0',
          address: 'Apartment Kuningan, Jakarta',
          phone: '081211112222',
          personal_email: 'john.miller@example.com',
          join_date: '2026-03-01',
          employment_status: 'PKWT',
          job_title: 'Senior Solutions Architect',
          branch_id: 'branch-jkt',
          department_id: 'dept-eng',
          base_salary: 30000000,
        }),
      },
      adminToken
    );
    assert.strictEqual(validRes.status, 201, 'Foreign worker created successfully');
    const data: any = await validRes.json();
    assert.ok(data.employeeId);

    // Verify employee record in database
    const emp = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(data.employeeId).first();
    assert.strictEqual(emp.is_foreign_worker, 1);
    assert.strictEqual(emp.passport_number, 'US987654321');
    assert.strictEqual(emp.nationality, 'United States');
  });

  it('Strictly enforces GPS location and respects optional admin selfie policy', async () => {
    const adminToken = await signJwt(
      { userId: 'usr-001', tenantId: 'default', email: 'budi.santoso@nusantara.id', role: 'owner_admin', employeeId: 'emp-001', name: 'Budi Santoso' },
      JWT_SECRET
    );

    const empToken = await signJwt(
      { userId: 'usr-004', tenantId: 'default', email: 'agus.setiawan@nusantara.id', role: 'employee', employeeId: 'emp-004', name: 'Agus Setiawan' },
      JWT_SECRET
    );

    // 1. Clock in with missing GPS (e.g. GPS blocked by user) must fail (400)
    const noGpsRes = await request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'in',
          device_timestamp: '2026-10-20T08:00:00Z',
        }),
      },
      empToken
    );
    assert.strictEqual(noGpsRes.status, 400, 'Clock in without GPS must fail');

    // 2. Set selfie policy to OPTIONAL (require_selfie = 0)
    await request(
      '/api/settings/attendance',
      {
        method: 'PUT',
        body: JSON.stringify({ require_selfie: false }),
      },
      adminToken
    );

    // Clock in with GPS and NO selfie should succeed
    const clockInNoSelfieRes = await request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'in',
          latitude: -6.2255,
          longitude: 106.8095,
          device_timestamp: '2026-10-20T08:00:00Z',
        }),
      },
      empToken
    );
    assert.strictEqual(clockInNoSelfieRes.status, 200, 'Clock in without selfie should succeed when policy is optional');

    // 3. Set selfie policy to REQUIRED (require_selfie = 1)
    await request(
      '/api/settings/attendance',
      {
        method: 'PUT',
        body: JSON.stringify({ require_selfie: true }),
      },
      adminToken
    );

    // Another employee clock in without selfie must now fail (400)
    const emp5Token = await signJwt(
      { userId: 'usr-005', tenantId: 'default', email: 'rina.wijaya@nusantara.id', role: 'employee', employeeId: 'emp-005', name: 'Rina Wijaya' },
      JWT_SECRET
    );
    const failSelfieRes = await request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'in',
          latitude: -6.9214,
          longitude: 107.6105,
          device_timestamp: '2026-10-20T08:00:00Z',
        }),
      },
      emp5Token
    );
    assert.strictEqual(failSelfieRes.status, 400, 'Clock in without selfie must fail when policy is required');

    // Clock in with selfie must succeed
    const successSelfieRes = await request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'in',
          latitude: -6.9214,
          longitude: 107.6105,
          photo_base64: 'data:image/jpeg;base64,...',
          device_timestamp: '2026-10-20T08:00:00Z',
        }),
      },
      emp5Token
    );
    assert.strictEqual(successSelfieRes.status, 200, 'Clock in with selfie succeeds');
  });
});

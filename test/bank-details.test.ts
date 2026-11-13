import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Employee bank details self-service', () => {
  const db = createMockD1();
  const env = { DB: db, JWT_SECRET, APP_URL: 'http://localhost:8787' };

  async function request(path: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
    const res = await app.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env as any);
    return res;
  }

  const employeeToken = signJwt(
    {
      userId: 'usr-004',
      email: 'agus.setiawan@nusantara.id',
      role: 'employee',
      employeeId: 'emp-004',
      tenantId: 'default',
      name: 'Agus Setiawan',
    },
    JWT_SECRET
  );

  const adminToken = signJwt(
    { userId: 'usr-001', email: 'budi.santoso@nusantara.id', role: 'owner_admin', tenantId: 'default', name: 'Budi Santoso' },
    JWT_SECRET
  );

  it('lets an employee update their own bank details', async () => {
    const res = await request(
      '/api/employees/emp-004/bank-details',
      {
        method: 'PUT',
        body: JSON.stringify({
          bank_name: 'Bank Jago',
          bank_swift_code: 'JAGBIDJA',
          bank_branch_name: 'Head Office Jakarta',
          bank_branch_code: 'XXX',
          bank_branch_address: 'FLOOR 46 JL. DR. IDE ANAK AGUNG, GDE AGUNG KAV 5.5-5.6',
          bank_account_number: '103095990095',
          bank_account_holder: 'Muhamad Fazri Kamil',
        }),
      },
      await employeeToken
    );
    assert.equal(res.status, 200);

    const row = db._rawDb
      .prepare(`SELECT bank_name, bank_swift_code, bank_branch_name, bank_branch_code, bank_branch_address, bank_account_number, bank_account_holder FROM employees WHERE id = 'emp-004'`)
      .get() as any;
    assert.equal(row.bank_name, 'Bank Jago');
    assert.equal(row.bank_swift_code, 'JAGBIDJA');
    assert.equal(row.bank_branch_name, 'Head Office Jakarta');
    assert.equal(row.bank_branch_code, 'XXX');
    assert.equal(row.bank_branch_address, 'FLOOR 46 JL. DR. IDE ANAK AGUNG, GDE AGUNG KAV 5.5-5.6');
    assert.equal(row.bank_account_number, '103095990095');
    assert.equal(row.bank_account_holder, 'Muhamad Fazri Kamil');
  });

  it('rejects an employee updating another employee bank details', async () => {
    const res = await request(
      '/api/employees/emp-005/bank-details',
      { method: 'PUT', body: JSON.stringify({ bank_name: 'BCA', bank_account_number: '1' }) },
      await employeeToken
    );
    assert.equal(res.status, 403);
  });

  it('lets an admin update any employee bank details', async () => {
    const res = await request(
      '/api/employees/emp-005/bank-details',
      { method: 'PUT', body: JSON.stringify({ bank_name: 'Mandiri', bank_account_number: '99887766' }) },
      await adminToken
    );
    assert.equal(res.status, 200);
  });
});

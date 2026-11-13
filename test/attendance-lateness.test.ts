import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { createMockD1 } from './d1-mock';
import { signJwt } from '../src/middleware/auth';

const JWT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

describe('Attendance lateness and corrections', () => {
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
    const req = new Request(`http://localhost${path}`, { ...options, headers });
    return app.fetch(req, env as any);
  }

  const clock = async (clockTime: string, date: string) => {
    const empToken = await signJwt(
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

    return request(
      '/api/attendance/clock',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'in',
          latitude: 1.12868,
          longitude: 104.04994,
          geofence_reason: 'Work From Home',
          local_date: date,
          local_time: clockTime,
        }),
      },
      empToken
    );
  };

  it('treats a few seconds of drift as on time, not 88 minutes late and not silent', async () => {
    db.exec(`DELETE FROM attendance WHERE employee_id = 'emp-004';`);

    const onTime = await clock('08:30:48', '2026-11-12');
    assert.equal(onTime.status, 200);
    const onTimeBody = (await onTime.json()) as any;
    assert.equal(onTimeBody.lateMinutes, 0, '08:30:48 is within the 60s grace window');
    assert.equal(onTimeBody.status, 'present');

    const late = await clock('09:58:59', '2026-11-13');
    assert.equal(late.status, 200);
    const lateBody = (await late.json()) as any;
    assert.equal(lateBody.lateMinutes, 88, '09:58:59 is 88 minutes late');
    assert.equal(lateBody.status, 'late');

    const justOver = await clock('08:32:30', '2026-11-14');
    const justOverBody = (await justOver.json()) as any;
    assert.equal(justOverBody.lateMinutes, 2, '08:32:30 is 2 full late minutes');
  });

  it('recomputes work minutes and status when a correction is approved', async () => {
    const empId = 'emp-004';
    const adminToken = await signJwt(
      {
        userId: 'usr-001',
        email: 'budi.santoso@nusantara.id',
        role: 'owner_admin',
        tenantId: 'default',
        name: 'Budi Santoso',
      },
      JWT_SECRET
    );

    db.exec(`
      DELETE FROM attendance WHERE employee_id = '${empId}' AND date = '2026-11-11';
      INSERT INTO attendance (id, tenant_id, employee_id, date, clock_in_time, clock_out_time, status, late_minutes, source)
      VALUES ('att-corr-test', 'default', '${empId}', '2026-11-11', '08:30', '17:30', 'present', 0, 'mobile');
      INSERT INTO attendance_corrections (
        id, tenant_id, attendance_id, employee_id, correction_date,
        requested_clock_in, requested_clock_out, reason, status
      ) VALUES (
        'corr-test', 'default', 'att-corr-test', '${empId}', '2026-11-11',
        '08:30', '17:30', 'outside', 'pending'
      );
    `);

    const reviewRes = await request(
      '/api/attendance/corrections/corr-test/review',
      { method: 'POST', body: JSON.stringify({ status: 'approved' }) },
      adminToken
    );
    assert.equal(reviewRes.status, 200);

    const row = await db
      .prepare(
        `SELECT status, late_minutes, early_minutes, actual_work_minutes
         FROM attendance WHERE id = 'att-corr-test'`
      )
      .first();
    assert.equal(row.status, 'present');
    assert.equal(row.late_minutes, 0);
    assert.equal(row.early_minutes, 0);
    assert.equal(row.actual_work_minutes, 480, '08:30-17:30 minus 60m break = 480 minutes');
  });
});

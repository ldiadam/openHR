import { Hono } from 'hono';
import { Bindings, AttendanceStatus } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { putFile } from '../services/storage';

export const attendanceRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

attendanceRoutes.use('*', authMiddleware);

// Haversine distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Helper to parse HH:MM to minutes from midnight
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// 1. Clock In / Out (Phone Mobile with GPS + Selfie Photo)
attendanceRoutes.post('/clock', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const {
    type, // 'in' | 'out'
    latitude,
    longitude,
    photo_base64,
    device_timestamp,
    is_offline_sync,
  } = body;

  const employeeId = body.employee_id || user.employeeId;
  if (!employeeId) {
    return c.json({ error: 'Data karyawan tidak ditemukan' }, 400);
  }

  // Location is strictly required: if GPS is blocked or missing, cannot clock in
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null || latitude === '' || longitude === '') {
    return c.json({ error: 'Akses GPS diblokir atau tidak aktif. Lokasi GPS wajib disertakan untuk melakukan presensi.' }, 400);
  }

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  if (isNaN(latNum) || isNaN(lngNum) || (latNum === 0 && lngNum === 0)) {
    return c.json({ error: 'Koordinat lokasi GPS tidak valid. Izin lokasi wajib diaktifkan pada browser.' }, 400);
  }

  // Check admin settings for selfie requirement (optional set by admin)
  const settings = await c.env.DB.prepare(
    `SELECT attendance_require_selfie FROM payroll_settings LIMIT 1`
  ).first<any>();
  const requireSelfie = settings ? settings.attendance_require_selfie === 1 : false;

  if (type === 'in' && requireSelfie && !photo_base64) {
    return c.json({ error: 'Admin mewajibkan pengambilan foto selfie untuk presensi masuk.' }, 400);
  }

  // Get employee and branch info for geofence and shift
  const emp = await c.env.DB.prepare(
    `SELECT e.*, b.latitude as branch_lat, b.longitude as branch_lng, b.radius_meters as branch_radius,
            sp.start_time, sp.end_time, sp.break_minutes
     FROM employees e
     LEFT JOIN branches b ON e.branch_id = b.id
     LEFT JOIN shift_patterns sp ON e.shift_pattern_id = sp.id
     WHERE e.id = ?`
  )
    .bind(employeeId)
    .first<any>();

  if (!emp) {
    return c.json({ error: 'Karyawan tidak valid' }, 404);
  }

  const todayDate = device_timestamp ? device_timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
  const clockTime = device_timestamp
    ? device_timestamp.split('T')[1].substring(0, 8)
    : new Date().toTimeString().split(' ')[0];

  // Geofence calculation
  let distanceMeters = 0;
  let geofenceStatus = 'in_geofence';
  if (emp.branch_lat && emp.branch_lng && latitude && longitude) {
    distanceMeters = calculateDistanceMeters(
      parseFloat(latitude),
      parseFloat(longitude),
      emp.branch_lat,
      emp.branch_lng
    );
    if (distanceMeters > (emp.branch_radius || 150)) {
      geofenceStatus = 'out_of_geofence';
    }
  }

  // Save photo to R2 / Storage if present
  let photoKey = null;
  if (photo_base64) {
    photoKey = `attendance/${employeeId}/${todayDate}-${type}-${Date.now()}.jpg`;
    await putFile(c.env, {
      key: photoKey,
      data: photo_base64,
      contentType: 'image/jpeg',
    });
  }

  // Check existing attendance today
  let record = await c.env.DB.prepare(
    `SELECT * FROM attendance WHERE employee_id = ? AND date = ?`
  )
    .bind(employeeId, todayDate)
    .first<any>();

  const shiftStart = emp.start_time || '08:30';
  const shiftEnd = emp.end_time || '17:30';

  if (type === 'in') {
    const clockInMinutes = timeToMinutes(clockTime);
    const shiftStartMinutes = timeToMinutes(shiftStart);
    const lateMinutes = Math.max(0, clockInMinutes - shiftStartMinutes);
    const derivedStatus: AttendanceStatus = lateMinutes > 0 ? 'late' : 'present';

    if (record) {
      // Update existing clock-in
      await c.env.DB.prepare(
        `UPDATE attendance SET
          clock_in_time = ?,
          clock_in_lat = ?,
          clock_in_lng = ?,
          clock_in_photo_key = COALESCE(?, clock_in_photo_key),
          clock_in_distance_meters = ?,
          clock_in_status = ?,
          status = ?,
          late_minutes = ?,
          is_offline_sync = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(
          clockTime,
          latitude || null,
          longitude || null,
          photoKey,
          distanceMeters,
          geofenceStatus,
          derivedStatus,
          lateMinutes,
          is_offline_sync ? 1 : 0,
          record.id
        )
        .run();
    } else {
      const attId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await c.env.DB.prepare(
        `INSERT INTO attendance (
          id, tenant_id, employee_id, date, clock_in_time,
          clock_in_lat, clock_in_lng, clock_in_photo_key, clock_in_distance_meters, clock_in_status,
          status, late_minutes, is_offline_sync, source
        ) VALUES (
          ?, 'default', ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, 'mobile'
        )`
      )
        .bind(
          attId,
          employeeId,
          todayDate,
          clockTime,
          latitude || null,
          longitude || null,
          photoKey,
          distanceMeters,
          geofenceStatus,
          derivedStatus,
          lateMinutes,
          is_offline_sync ? 1 : 0
        )
        .run();
    }

    return c.json({
      message: `Presensi Masuk berhasil pada ${clockTime}`,
      status: derivedStatus,
      lateMinutes,
      distanceMeters,
      geofenceStatus,
      isOfflineSync: !!is_offline_sync,
    });
  } else {
    // Clock out
    const clockOutMinutes = timeToMinutes(clockTime);
    const shiftEndMinutes = timeToMinutes(shiftEnd);
    const earlyMinutes = Math.max(0, shiftEndMinutes - clockOutMinutes);

    let actualWorkMinutes = 0;
    if (record && record.clock_in_time) {
      const inMins = timeToMinutes(record.clock_in_time);
      actualWorkMinutes = Math.max(0, clockOutMinutes - inMins - (emp.break_minutes || 60));
    }

    const currentStatus = record ? record.status : 'present';
    const finalStatus = earlyMinutes > 0 && currentStatus === 'present' ? 'early_leave' : currentStatus;

    if (record) {
      await c.env.DB.prepare(
        `UPDATE attendance SET
          clock_out_time = ?,
          clock_out_lat = ?,
          clock_out_lng = ?,
          clock_out_photo_key = COALESCE(?, clock_out_photo_key),
          clock_out_distance_meters = ?,
          clock_out_status = ?,
          status = ?,
          early_minutes = ?,
          actual_work_minutes = ?,
          is_offline_sync = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(
          clockTime,
          latitude || null,
          longitude || null,
          photoKey,
          distanceMeters,
          geofenceStatus,
          finalStatus,
          earlyMinutes,
          actualWorkMinutes,
          is_offline_sync ? 1 : 0,
          record.id
        )
        .run();
    } else {
      const attId = `att-${Date.now()}`;
      await c.env.DB.prepare(
        `INSERT INTO attendance (
          id, tenant_id, employee_id, date, clock_out_time,
          clock_out_lat, clock_out_lng, clock_out_photo_key, clock_out_distance_meters, clock_out_status,
          status, early_minutes, is_offline_sync, source
        ) VALUES (
          ?, 'default', ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, 'mobile'
        )`
      )
        .bind(
          attId,
          employeeId,
          todayDate,
          clockTime,
          latitude || null,
          longitude || null,
          photoKey,
          distanceMeters,
          geofenceStatus,
          'present',
          earlyMinutes,
          is_offline_sync ? 1 : 0
        )
        .run();
    }

    return c.json({
      message: `Presensi Pulang berhasil pada ${clockTime}`,
      earlyMinutes,
      actualWorkMinutes,
      distanceMeters,
      geofenceStatus,
    });
  }
});

// 2. Daily View for HR: Who is in, late, absent, or on leave today
attendanceRoutes.get('/today', async (c) => {
  const user = c.get('user');
  const targetDate = c.req.query('date') || new Date().toISOString().split('T')[0];

  let empFilter = ``;
  const params: any[] = [targetDate];

  if (user.role === 'manager') {
    empFilter = `AND (e.manager_id = ? OR e.id = ?)`;
    params.push(user.employeeId, user.employeeId);
  }

  const query = `
    SELECT e.id as employee_id, e.nik, e.full_name, e.job_title,
           d.name as department_name, b.name as branch_name,
           a.id as attendance_id, a.clock_in_time, a.clock_out_time,
           COALESCE(a.status, 'absent') as status,
           COALESCE(a.late_minutes, 0) as late_minutes,
           COALESCE(a.early_minutes, 0) as early_minutes,
           a.clock_in_status, a.is_offline_sync
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = ?
    WHERE e.lifecycle_status IN ('active', 'probation') ${empFilter}
    ORDER BY a.clock_in_time DESC, e.full_name ASC
  `;

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();
  const list = rows.results || [];

  const summary = {
    total: list.length,
    present: list.filter((r) => r.status === 'present').length,
    late: list.filter((r) => r.status === 'late').length,
    on_leave: list.filter((r) => r.status === 'on_leave' || r.status === 'sick').length,
    absent: list.filter((r) => r.status === 'absent').length,
  };

  return c.json({ date: targetDate, summary, records: list });
});

// 3. Employee Self-Service: My Attendance this month
attendanceRoutes.get('/my', async (c) => {
  const user = c.get('user');
  if (!user.employeeId) {
    return c.json({ error: 'User tidak terhubung ke karyawan' }, 400);
  }

  const month = c.req.query('month') || new Date().toISOString().substring(0, 7); // YYYY-MM

  const records = await c.env.DB.prepare(
    `SELECT * FROM attendance
     WHERE employee_id = ? AND date LIKE ?
     ORDER BY date DESC`
  )
    .bind(user.employeeId, `${month}%`)
    .all<any>();

  const list = records.results || [];
  const summary = {
    present: list.filter((r) => r.status === 'present').length,
    late: list.filter((r) => r.status === 'late').length,
    totalLateMinutes: list.reduce((acc, r) => acc + (r.late_minutes || 0), 0),
    totalWorkMinutes: list.reduce((acc, r) => acc + (r.actual_work_minutes || 0), 0),
  };

  return c.json({ month, summary, records: list });
});

// 4. Request Attendance Correction
attendanceRoutes.post('/correction', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { date, requested_clock_in, requested_clock_out, reason } = body;

  const employeeId = body.employee_id || user.employeeId;
  if (!employeeId || !date || !reason) {
    return c.json({ error: 'Tanggal dan alasan koreksi wajib diisi' }, 400);
  }

  const existingAtt = await c.env.DB.prepare(
    `SELECT id FROM attendance WHERE employee_id = ? AND date = ?`
  )
    .bind(employeeId, date)
    .first<any>();

  const corrId = `corr-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO attendance_corrections (
      id, tenant_id, attendance_id, employee_id, correction_date,
      requested_clock_in, requested_clock_out, reason, status
    ) VALUES (
      ?, 'default', ?, ?, ?,
      ?, ?, ?, 'pending'
    )`
  )
    .bind(
      corrId,
      existingAtt?.id || null,
      employeeId,
      date,
      requested_clock_in || null,
      requested_clock_out || null,
      reason
    )
    .run();

  return c.json({ message: 'Pengajuan koreksi presensi berhasil dikirim.', correctionId: corrId });
});

// 5. Corrections Inbox (For Managers and HR)
attendanceRoutes.get('/corrections', async (c) => {
  const user = c.get('user');
  let query = `
    SELECT ac.*, e.nik, e.full_name, e.job_title, d.name as department_name
    FROM attendance_corrections ac
    JOIN employees e ON ac.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
  `;
  const params: any[] = [];

  if (user.role === 'manager') {
    query += ` WHERE e.manager_id = ? OR e.id = ?`;
    params.push(user.employeeId, user.employeeId);
  } else if (user.role === 'employee') {
    query += ` WHERE ac.employee_id = ?`;
    params.push(user.employeeId);
  }

  query += ` ORDER BY ac.created_at DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();

  return c.json({ corrections: rows.results || [] });
});

// 6. Review Attendance Correction (Approve/Reject with Audit Log)
attendanceRoutes.post('/corrections/:id/review', requireRole(['owner_admin', 'manager']), async (c) => {
  const corrId = c.req.param('id');
  const user = c.get('user');
  const { status, note } = await c.req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: 'Status harus approved atau rejected' }, 400);
  }

  const corr = await c.env.DB.prepare(
    `SELECT ac.*, e.shift_pattern_id, sp.start_time, sp.end_time
     FROM attendance_corrections ac
     JOIN employees e ON ac.employee_id = e.id
     LEFT JOIN shift_patterns sp ON e.shift_pattern_id = sp.id
     WHERE ac.id = ?`
  )
    .bind(corrId)
    .first<any>();

  if (!corr) {
    return c.json({ error: 'Data koreksi tidak ditemukan' }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE attendance_corrections SET
      status = ?,
      reviewed_by = ?,
      reviewed_at = CURRENT_TIMESTAMP,
      reviewer_note = ?
     WHERE id = ?`
  )
    .bind(status, user.userId, note || null, corrId)
    .run();

  // If approved, update or insert attendance record
  if (status === 'approved') {
    const shiftStart = corr.start_time || '08:30';
    let lateMinutes = 0;
    if (corr.requested_clock_in) {
      const inMins = timeToMinutes(corr.requested_clock_in);
      const startMins = timeToMinutes(shiftStart);
      lateMinutes = Math.max(0, inMins - startMins);
    }

    if (corr.attendance_id) {
      await c.env.DB.prepare(
        `UPDATE attendance SET
          clock_in_time = COALESCE(?, clock_in_time),
          clock_out_time = COALESCE(?, clock_out_time),
          status = ?,
          late_minutes = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(corr.requested_clock_in, corr.requested_clock_out, lateMinutes > 0 ? 'late' : 'present', lateMinutes, corr.attendance_id)
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO attendance (id, tenant_id, employee_id, date, clock_in_time, clock_out_time, status, late_minutes, source)
         VALUES (?, 'default', ?, ?, ?, ?, ?, ?, 'manual')`
      )
        .bind(
          `att-${Date.now()}`,
          corr.employee_id,
          corr.correction_date,
          corr.requested_clock_in,
          corr.requested_clock_out,
          lateMinutes > 0 ? 'late' : 'present',
          lateMinutes
        )
        .run();
    }

    // Audit log
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'default', ?, 'APPROVE_ATTENDANCE_CORRECTION', 'attendance_corrections', ?, ?)`
    )
      .bind(
        `aud-${Date.now()}`,
        user.userId,
        corrId,
        JSON.stringify({ in: corr.requested_clock_in, out: corr.requested_clock_out })
      )
      .run();
  }

  return c.json({ message: `Koreksi presensi berhasil di-${status}.` });
});

// 7. Fingerprint CSV Import
attendanceRoutes.post('/import-fingerprint', requireRole(['owner_admin']), async (c) => {
  const { logs } = await c.req.json();
  if (!Array.isArray(logs) || logs.length === 0) {
    return c.json({ error: 'Data fingerprint kosong' }, 400);
  }

  // Format: [{ nik: "EMP001", date: "2026-10-05", time: "08:25:00", type: "in" }]
  let importedCount = 0;
  for (const log of logs) {
    const emp = await c.env.DB.prepare(`SELECT id, shift_pattern_id FROM employees WHERE nik = ?`)
      .bind(log.nik)
      .first<any>();

    if (emp) {
      const existing = await c.env.DB.prepare(
        `SELECT id, clock_in_time, clock_out_time FROM attendance WHERE employee_id = ? AND date = ?`
      )
        .bind(emp.id, log.date)
        .first<any>();

      if (log.type === 'in' || !existing) {
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO attendance (id, tenant_id, employee_id, date, clock_in_time, status, source)
           VALUES (?, 'default', ?, ?, ?, 'present', 'fingerprint')`
        )
          .bind(existing?.id || `att-fp-${Date.now()}-${importedCount}`, emp.id, log.date, log.time)
          .run();
      } else {
        await c.env.DB.prepare(
          `UPDATE attendance SET clock_out_time = ?, source = 'fingerprint', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
          .bind(log.time, existing.id)
          .run();
      }
      importedCount++;
    }
  }

  return c.json({ message: `Berhasil mengimpor ${importedCount} log presensi fingerprint.` });
});

import { makeId } from '../utils/id';

export type AntiFakeGpsMode = 'off' | 'warn_and_log' | 'block';

export interface SecurityPolicy {
  anti_fake_gps_mode: AntiFakeGpsMode;
  block_rooted_devices: boolean;
  enforce_device_binding: boolean;
  max_travel_speed_kmh: number;
}

export interface ClientSecurityPayload {
  is_mock_location?: boolean;
  spoof_apps?: string[];
  is_rooted?: boolean;
  is_emulator?: boolean;
  device_id?: string | null;
  device_label?: string | null;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  anti_fake_gps_mode: 'block',
  block_rooted_devices: false,
  enforce_device_binding: false,
  max_travel_speed_kmh: 250,
};

export function normalizeAntiFakeMode(raw: unknown): AntiFakeGpsMode {
  if (raw === 'off' || raw === 'warn_and_log' || raw === 'block') return raw;
  return 'block';
}

export async function getSecurityPolicy(db: D1Database): Promise<SecurityPolicy> {
  try {
    const row = await db
      .prepare(
        `SELECT anti_fake_gps_mode, block_rooted_devices, enforce_device_binding, max_travel_speed_kmh
         FROM companies LIMIT 1`
      )
      .first<any>();
    if (!row) return DEFAULT_SECURITY_POLICY;
    return {
      anti_fake_gps_mode: normalizeAntiFakeMode(row.anti_fake_gps_mode),
      block_rooted_devices: Boolean(row.block_rooted_devices),
      enforce_device_binding: Boolean(row.enforce_device_binding),
      max_travel_speed_kmh: Math.max(50, Number(row.max_travel_speed_kmh || 250)),
    };
  } catch {
    return DEFAULT_SECURITY_POLICY;
  }
}

export function detectTeleportSpeedKmh(
  prevLat: number,
  prevLng: number,
  prevTimeIsoOrHms: string,
  nextLat: number,
  nextLng: number,
  nextTimeIsoOrHms: string
): { distanceMeters: number; speedKmh: number } | null {
  const prevMs = parseFlexibleTimestampMs(prevTimeIsoOrHms);
  const nextMs = parseFlexibleTimestampMs(nextTimeIsoOrHms);
  if (prevMs === null || nextMs === null) return null;
  const elapsedHours = Math.abs(nextMs - prevMs) / 3_600_000;
  if (elapsedHours <= 0) return null;

  const R = 6371e3;
  const p1 = (prevLat * Math.PI) / 180;
  const p2 = (nextLat * Math.PI) / 180;
  const dp = ((nextLat - prevLat) * Math.PI) / 180;
  const dl = ((nextLng - prevLng) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const effectiveHours = Math.max(elapsedHours, 1 / 3600); // avoid divide-by-zero on <1s
  const speedKmh = (distanceMeters / 1000) / effectiveHours;
  return { distanceMeters, speedKmh };
}

function parseFlexibleTimestampMs(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const today = new Date().toISOString().slice(0, 10);
    const full = trimmed.length === 5 ? `${today}T${trimmed}:00` : `${today}T${trimmed}`;
    const ms = Date.parse(full);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

export async function logSecurityEvent(
  db: D1Database,
  params: {
    tenantId?: string;
    employeeId?: string | null;
    userId?: string | null;
    eventType: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    actionTaken: 'blocked' | 'flagged';
    deviceId?: string | null;
    deviceLabel?: string | null;
    ipAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await db
      .prepare(
        `INSERT INTO security_events (
          id, tenant_id, employee_id, user_id, event_type, severity, action_taken,
          device_id, device_label, ip_address, latitude, longitude, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        makeId('sec'),
        params.tenantId || 'default',
        params.employeeId ?? null,
        params.userId ?? null,
        params.eventType,
        params.severity || 'high',
        params.actionTaken,
        params.deviceId ?? null,
        params.deviceLabel ?? null,
        params.ipAddress ?? null,
        params.latitude ?? null,
        params.longitude ?? null,
        params.details ? JSON.stringify(params.details) : null
      )
      .run();
  } catch {
    // Graceful no-op if migration 0039 hasn't been applied in an isolated test DB
  }
}

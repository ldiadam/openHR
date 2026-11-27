export const API_BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem('openhr_token');
}

export function setToken(token: string) {
  localStorage.setItem('openhr_token', token);
}

export function clearToken() {
  localStorage.removeItem('openhr_token');
  localStorage.removeItem('openhr_user');
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('openhr_cache:'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore storage errors
  }
}

export function getStoredUser(): any | null {
  const data = localStorage.getItem('openhr_user');
  try {
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: any) {
  localStorage.setItem('openhr_user', JSON.stringify(user));
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    let errorMsg = '';
    try {
      const data: any = await response.json();
      errorMsg = data.error;
    } catch {
      // ignore
    }

    // For auth endpoints (login, invite, reset), throw the exact credential error from server
    if (
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/accept-invite') ||
      endpoint.includes('/auth/reset-password') ||
      endpoint.includes('/auth/request-reset') ||
      endpoint.includes('/auth/confirm-reset') ||
      endpoint.includes('/auth/reset-info') ||
      endpoint.includes('/auth/invite-info')
    ) {
      throw new Error(errorMsg || 'Akses ditolak atau kredensial tidak valid.');
    }

    // Never redirect if already on a public authentication page (login, invite activation, reset password)
    const pathname = window.location.pathname;
    const isPublicPage =
      pathname === '/login' ||
      pathname.startsWith('/accept-invite') ||
      pathname.startsWith('/reset-password');

    if (!isPublicPage) {
      window.location.href = '/login';
    }
    throw new Error(errorMsg || 'Sesi Anda telah berakhir. Silakan login kembali.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data: any = await response.json();
    if (!response.ok) {
      const error: any = new Error(data.error || data.message || 'Terjadi kesalahan pada server');
      error.code = data.code;
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data as T;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `HTTP Error ${response.status}`);
  }

  return (await response.blob()) as any;
}

// Offline Attendance Queue
export interface OfflineClockRecord {
  id: string;
  type: 'in' | 'out';
  latitude: number;
  longitude: number;
  photo_base64?: string;
  geofence_reason?: string;
  device_timestamp: string;
  local_date?: string;
  local_time?: string;
}

const OFFLINE_QUEUE_KEY = 'openhr_offline_attendance_queue';

export function getOfflineQueue(): OfflineClockRecord[] {
  try {
    const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveToOfflineQueue(record: OfflineClockRecord) {
  const queue = getOfflineQueue();
  queue.push(record);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function syncOfflineQueue(options?: {
  promptGeofenceReason?: (item: OfflineClockRecord) => string | null;
}): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: OfflineClockRecord[] = [];
  let synced = 0;
  let failed = 0;
  const nonRetryable = ['ALREADY_CLOCKED_IN', 'ALREADY_CLOCKED_OUT', 'NOT_CLOCKED_IN'];

  for (const item of queue) {
    const payload = { ...item, is_offline_sync: 1 };

    try {
      await apiFetch('/attendance/clock', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      synced++;
    } catch (error: any) {
      // Rejected because the day's in/out pair is already complete — retrying
      // forever would block the queue, so drop it.
      if (nonRetryable.includes(error?.code)) {
        failed++;
        continue;
      }

      // An out-of-geofence punch is rejected until a reason is provided. On a
      // manual sync we ask for it and retry once; automatic syncs stay quiet.
      if (options?.promptGeofenceReason && error?.code === 'OUT_OF_GEOFENCE' && !item.geofence_reason) {
        const reason = options.promptGeofenceReason(item);
        if (reason && reason.trim()) {
          try {
            await apiFetch('/attendance/clock', {
              method: 'POST',
              body: JSON.stringify({ ...payload, geofence_reason: reason.trim() }),
            });
            synced++;
            continue;
          } catch {
            // fall through and keep the item queued
          }
        }
      }
      failed++;
      remaining.push(item);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { synced, failed };
}

// Number formatting helpers for Indonesian Rupiah
export function formatRupiah(amount: number = 0): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Returns local date formatted as YYYY-MM-DD from user's local timezone.
 * Unlike new Date().toISOString().split('T')[0], this avoids UTC timezone shift bugs.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns local month formatted as YYYY-MM from user's local timezone.
 */
export function getLocalMonthString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns local time formatted as HH:mm:ss from user's local timezone.
 */
export function getLocalTimeString(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export async function downloadFile(endpoint: string, fallbackFilename: string = 'export.xlsx'): Promise<void> {
  const token = getToken();
  const url = endpoint.startsWith('http') || endpoint.startsWith('/api') ? endpoint : `${API_BASE}${endpoint}`;

  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    let msg = `Gagal mengunduh file (HTTP ${res.status})`;
    try {
      const json: any = await res.json();
      if (json && json.error) msg = json.error;
    } catch {}
    throw new Error(msg);
  }

  let filename = fallbackFilename;
  const disp = res.headers.get('Content-Disposition');
  if (disp && disp.includes('filename=')) {
    const match = disp.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
}

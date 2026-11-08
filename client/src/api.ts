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
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Terjadi kesalahan pada server');
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
  device_timestamp: string;
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

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: OfflineClockRecord[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await apiFetch('/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({
          ...item,
          is_offline_sync: 1,
        }),
      });
      synced++;
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { synced, failed: remaining.length };
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

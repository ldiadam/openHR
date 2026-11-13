import { apiFetch } from '../api';

const CACHE_PREFIX = 'openhr_cache:';

function currentUserKey(): string {
  try {
    const raw = localStorage.getItem('openhr_user');
    if (!raw) return 'anon';
    const user = JSON.parse(raw);
    return String(user?.employeeId || user?.id || 'anon');
  } catch {
    return 'anon';
  }
}

function keyFor(endpoint: string): string {
  return `${CACHE_PREFIX}${currentUserKey()}:${endpoint}`;
}

export function readCachedGet<T = any>(endpoint: string): T | null {
  try {
    const raw = localStorage.getItem(keyFor(endpoint));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed?.data as T) ?? null;
  } catch {
    return null;
  }
}

export function writeCachedGet(endpoint: string, data: unknown) {
  try {
    localStorage.setItem(keyFor(endpoint), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Storage may be full or unavailable; offline caching is best-effort.
  }
}

export function clearOfflineCache() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

/**
 * Network-first GET with a per-user cache fallback. Intended only for the
 * employee's own read-only ESS data — never for admin, payroll, or employee
 * directories.
 */
export async function apiFetchCached<T = any>(endpoint: string): Promise<T> {
  try {
    const data = await apiFetch<T>(endpoint, { method: 'GET' });
    writeCachedGet(endpoint, data);
    return data;
  } catch (error) {
    const cached = readCachedGet<T>(endpoint);
    if (cached !== null) return cached;
    throw error;
  }
}

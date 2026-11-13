/**
 * Timezone and Date utilities for openHR.
 * Default timezone: 'Asia/Jakarta' (WIB / UTC+7).
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/**
 * Returns date formatted as YYYY-MM-DD in the given timezone.
 */
export function getZonedDateString(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Returns time formatted as HH:mm:ss in the given timezone (24-hour format).
 */
export function getZonedTimeString(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || DEFAULT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toTimeString().split(' ')[0];
  }
}

/**
 * Returns month formatted as YYYY-MM in the given timezone.
 */
export function getZonedMonthString(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const dStr = getZonedDateString(date, timeZone);
    return dStr.substring(0, 7);
  } catch {
    return date.toISOString().substring(0, 7);
  }
}

/**
 * Resolves local attendance date and time based on employee branch timezone and client payload.
 */
export function resolveAttendanceDateTime(
  body: {
    device_timestamp?: string | null;
    local_date?: string | null;
    local_time?: string | null;
  },
  timeZone: string = DEFAULT_TIMEZONE
): { todayDate: string; clockTime: string } {
  const tz = timeZone || DEFAULT_TIMEZONE;

  // 1. Explicit local date and time from client
  if (body.local_date && body.local_time) {
    const cleanDate = body.local_date.trim();
    let cleanTime = body.local_time.trim();
    if (cleanTime.length === 5) cleanTime += ':00'; // HH:mm -> HH:mm:00
    return {
      todayDate: cleanDate,
      clockTime: cleanTime.substring(0, 8),
    };
  }

  // 2. device_timestamp passed
  if (body.device_timestamp) {
    const ts = body.device_timestamp.trim();
    if (ts.includes('T')) {
      const parts = ts.split('T');
      const d = parts[0];
      let t = parts[1].replace(/Z|[+-]\d{2}(:\d{2})?$/, '');
      if (t.length === 5) t += ':00';
      return {
        todayDate: d,
        clockTime: t.substring(0, 8),
      };
    }
  }

  // 3. Fallback to current server time converted to branch timezone
  const now = new Date();
  return {
    todayDate: getZonedDateString(now, tz),
    clockTime: getZonedTimeString(now, tz),
  };
}

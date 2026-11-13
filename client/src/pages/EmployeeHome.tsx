import React, { useState, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Loader2,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  apiFetch,
  saveToOfflineQueue,
  getOfflineQueue,
  getLocalDateString,
  getLocalTimeString,
} from '../api';
import { CameraModal } from '../components/CameraModal';
import { LocationMap } from '../components/LocationMap';
import { haversineMeters } from '../utils/geo';
import { apiFetchCached } from '../utils/offlineCache';

export const EmployeeHome: React.FC = () => {
  const { user } = useAuth();
  const { t, tr, lang } = useLanguage();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clockAction, setClockAction] = useState<'in' | 'out'>('in');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [geofenceDialog, setGeofenceDialog] = useState<null | {
    action: 'in' | 'out';
    photo?: string;
    distance: number;
    reason: string;
  }>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingSync, setPendingSync] = useState(() => getOfflineQueue().length);

  useEffect(() => {
    const refreshPending = () => setPendingSync(getOfflineQueue().length);
    const handleOnline = () => {
      setIsOnline(true);
      refreshPending();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshPending();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(refreshPending, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const offlineBarVisible = !isOnline || pendingSync > 0;

  // GPS & Attendance Policy Settings
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | undefined>(undefined);
  const [office, setOffice] = useState<any>(null);
  const [locationStatus, setLocationStatus] = useState<string>(tr('Mendeteksi GPS...', 'Detecting GPS...'));
  const [gpsBlocked, setGpsBlocked] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [attendanceConfig, setAttendanceConfig] = useState<{ require_selfie: boolean; require_location: boolean }>({
    require_selfie: false,
    require_location: true,
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data & config
  const loadDashboardData = async () => {
    try {
      const todayStr = getLocalDateString();
      const [todayRes, attConfig, branchRes] = await Promise.all([
        apiFetchCached(`/attendance/today?date=${todayStr}`),
        apiFetchCached('/settings/attendance').catch(() => ({ require_selfie: false, require_location: true })),
        apiFetchCached('/attendance/branch').catch(() => ({ branch: null })),
      ]);

      setAttendanceConfig(attConfig);
      setOffice(branchRes?.branch || null);

      const myRecord = (todayRes.records || []).find((r: any) => r.employee_id === user?.employeeId);
      setTodayAttendance(myRecord || null);

      if (myRecord?.clock_in_time && !myRecord?.clock_out_time) {
        setClockAction('out');
      } else {
        setClockAction('in');
      }
    } catch (err: any) {
      console.warn('Load ESS error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const detectLocation = () => {
    setDetectingGps(true);
    setGpsBlocked(false);
    setLocationStatus(tr('Mendeteksi sinyal GPS presisi...', 'Detecting precise GPS signal...'));

    if (!('geolocation' in navigator)) {
      setGpsBlocked(true);
      setCoords(null);
      setLocationStatus(tr('Perangkat tidak mendukung GPS', 'Device does not support GPS'));
      setDetectingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setLocationStatus(
          tr(
            `GPS Terkunci (Akurasi: ±${Math.round(pos.coords.accuracy)}m)`,
            `GPS Locked (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`
          )
        );
        setGpsBlocked(false);
        setDetectingGps(false);
      },
      (err) => {
        console.warn('Geolocation blocked or error:', err.message);
        // Location is STRICTLY required - do not mock or fallback
        setCoords(null);
        setAccuracy(undefined);
        setGpsBlocked(true);
        setLocationStatus(tr('Akses GPS Diblokir / Nonaktif', 'GPS Access Blocked / Disabled'));
        setDetectingGps(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    loadDashboardData();
    detectLocation();
  }, [user]);

  // Execute Clock In / Out
  const executeClock = async (action: 'in' | 'out', photoBase64?: string, geofenceReason?: string) => {
    if (!coords) {
      setFeedback({
        type: 'error',
        message: tr(
          'Akses GPS diblokir atau belum aktif. Anda wajib mengizinkan lokasi di browser untuk melakukan presensi.',
          'GPS access is blocked or not active yet. You must allow location access in your browser to clock in.'
        ),
      });
      detectLocation();
      return;
    }

    if (!geofenceReason && office) {
      const distance = haversineMeters(coords.lat, coords.lng, office.latitude, office.longitude);
      if (distance > (office.radius_meters || 100)) {
        setGeofenceDialog({ action, photo: photoBase64, distance, reason: '' });
        return;
      }
    }

    setSubmitting(true);
    setFeedback(null);
    const now = new Date();
    const localDate = getLocalDateString(now);
    const localTime = getLocalTimeString(now);
    const localTimestamp = `${localDate}T${localTime}`;

    if (!navigator.onLine) {
      // Offline mode
      saveToOfflineQueue({
        id: `off-${Date.now()}`,
        type: action,
        latitude: coords.lat,
        longitude: coords.lng,
        photo_base64: photoBase64,
        geofence_reason: geofenceReason,
        device_timestamp: localTimestamp,
        local_date: localDate,
        local_time: localTime,
      });
      setSubmitting(false);
      setFeedback({
        type: 'success',
        message: tr(
          `Offline: Presensi ${action === 'in' ? 'Masuk' : 'Pulang'} tersimpan di memori perangkat dan akan disinkron saat internet tersambung.`,
          `Offline: ${action === 'in' ? 'Clock In' : 'Clock Out'} attendance saved to device storage and will sync once internet is connected.`
        ),
      });
      return;
    }

    try {
      const res = await apiFetch('/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({
          type: action,
          latitude: coords.lat,
          longitude: coords.lng,
          photo_base64: photoBase64 || null,
          geofence_reason: geofenceReason || null,
          device_timestamp: localTimestamp,
          local_date: localDate,
          local_time: localTime,
        }),
      });

      setFeedback({
        type: 'success',
        message: `${res.message} ${
          res.lateMinutes > 0
            ? tr(`(Terlambat ${res.lateMinutes} menit)`, `(${res.lateMinutes} minutes late)`)
            : ''
        }`,
      });
      loadDashboardData();
    } catch (err: any) {
      if (err?.code === 'OUT_OF_GEOFENCE' && !geofenceReason) {
        setGeofenceDialog({
          action,
          photo: photoBase64,
          distance: Number(err.details?.distanceMeters) || 0,
          reason: '',
        });
      } else {
        setFeedback({ type: 'error', message: err.message || tr('Presensi gagal diproses', 'Attendance failed to process') });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitGeofenceReason = async () => {
    if (!geofenceDialog || !geofenceDialog.reason.trim()) return;
    const dialog = geofenceDialog;
    setGeofenceDialog(null);
    await executeClock(dialog.action, dialog.photo, dialog.reason.trim());
  };

  // Click on Clock In/Out button
  const handlePrimaryClockClick = () => {
    if (dayComplete) return;
    if (navigator.vibrate) navigator.vibrate(20);
    if (!coords) {
      detectLocation();
      return;
    }

    if (clockAction === 'in' && attendanceConfig.require_selfie) {
      setCameraOpen(true);
    } else {
      executeClock(clockAction);
    }
  };

  const handlePhotoCaptured = async (base64Photo: string) => {
    await executeClock(clockAction, base64Photo);
  };

  const timeString = currentTime.toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const shortDateString = currentTime.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const distanceToOffice =
    coords && office
      ? haversineMeters(coords.lat, coords.lng, office.latitude, office.longitude)
      : null;
  const withinOffice =
    distanceToOffice != null && office
      ? distanceToOffice <= (office.radius_meters || 100)
      : null;
  const dayComplete = Boolean(todayAttendance?.clock_in_time && todayAttendance?.clock_out_time);

  return (
    <div>
      {/* Full-screen map */}
      <div className="fixed inset-x-0 top-0 bottom-16 z-10 md:left-64 md:top-0 md:bottom-0">
        {coords ? (
          isOnline ? (
            <LocationMap
              lat={coords.lat}
              lng={coords.lng}
              accuracy={accuracy}
              office={office}
              className="h-full w-full"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-b from-slate-200 via-slate-100 to-slate-300" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-200 via-slate-100 to-slate-300 px-4">
            <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-6 text-center shadow-xl backdrop-blur">
              <div
                className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${
                  gpsBlocked ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                }`}
              >
                {detectingGps ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : gpsBlocked ? (
                  <ShieldAlert size={24} />
                ) : (
                  <MapPin size={24} />
                )}
              </div>

              <h2 className="text-sm font-bold text-slate-900">
                {gpsBlocked
                  ? tr('Lokasi Tidak Tersedia', 'Location Unavailable')
                  : tr('Mendeteksi Lokasi...', 'Detecting Location...')}
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {gpsBlocked
                  ? tr(
                      'Akses lokasi diblokir. Aktifkan GPS dan izinkan akses lokasi untuk situs ini, lalu coba lagi.',
                      'Location access is blocked. Turn on GPS and allow location access for this site, then try again.'
                    )
                  : tr(
                      'Pastikan GPS perangkat aktif dan izin lokasi diizinkan.',
                      'Make sure your device GPS is on and location permission is allowed.'
                    )}
              </p>

              {gpsBlocked && (
                <ol className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-left text-[11px] leading-relaxed text-slate-600">
                  <li>1. {tr('Aktifkan GPS / Location di perangkat.', 'Turn on GPS / Location on your device.')}</li>
                  <li>2. {tr('Izinkan akses lokasi untuk situs ini di pengaturan browser.', 'Allow location access for this site in your browser settings.')}</li>
                  <li>3. {tr('Tekan tombol di bawah untuk mencoba lagi.', 'Tap the button below to try again.')}</li>
                </ol>
              )}

              <button
                type="button"
                onClick={detectLocation}
                disabled={detectingGps}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw size={14} className={detectingGps ? 'animate-spin' : ''} />
                <span>
                  {gpsBlocked
                    ? t.attendance.gpsRetryBtn
                    : detectingGps
                    ? tr('Mendeteksi...', 'Detecting...')
                    : tr('Deteksi Lokasi', 'Detect Location')}
                </span>
              </button>
            </div>
          </div>
        )}

        {office && coords && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-lg backdrop-blur">
            <span className="h-2 w-2 rounded-full border border-blue-600 bg-blue-600/20" />
            <span className="max-w-[140px] truncate">{office.name || tr('Kantor', 'Office')}</span>
            <span className="text-slate-400">·</span>
            <span>{office.radius_meters}m</span>
          </div>
        )}

        {/* Scrims for floating UI legibility (map mode only) */}
        {coords && isOnline && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-slate-900/35 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-slate-900/50 via-slate-900/15 to-transparent" />
          </>
        )}
      </div>

      {/* Floating top status */}
      <div className="pointer-events-none fixed left-3 right-3 top-3 z-20 md:left-[calc(16rem+1rem)] md:right-4 md:top-4">
        <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/50 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{user?.name}</p>
            <p className="truncate text-[10px] font-medium text-slate-500">
              {user?.jobTitle || tr('Staff', 'Staff')}
            </p>
          </div>
          {user?.role && user.role !== 'employee' && (
            <Link
              to="/"
              className="shrink-0 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 transition hover:bg-slate-200"
              title={tr('Kembali ke HR', 'Back to HR')}
            >
              {tr('HR', 'HR')}
            </Link>
          )}
          <div className="shrink-0 text-right">
            <div className="font-mono text-sm font-bold tracking-tight text-slate-900">{timeString}</div>
            <div className="text-[9px] font-medium text-slate-500">{shortDateString}</div>
          </div>
          <button
            type="button"
            disabled={detectingGps}
            onClick={detectLocation}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50"
            aria-label={t.common.refresh}
            title={t.common.refresh}
          >
            <RefreshCw size={14} className={detectingGps ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Offline location summary */}
      {coords && !isOnline && (
        <div className="pointer-events-none fixed left-3 right-3 top-[78px] z-20 md:left-[calc(16rem+1rem)] md:right-4 md:top-[86px]">
          <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <WifiOff size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-900">{tr('Mode Offline', 'Offline Mode')}</p>
                <p className="truncate text-[10px] text-amber-700">
                  {tr('GPS tetap aktif. Presensi akan diantrekan.', 'GPS is still active. Attendance will be queued.')}
                </p>
              </div>
              <button
                type="button"
                onClick={detectLocation}
                disabled={detectingGps}
                aria-label={tr('Perbarui lokasi', 'Refresh location')}
                className="shrink-0 rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={detectingGps ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className="rounded-lg bg-white/80 px-2 py-1.5">
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-400">Lat</span>
                <span className="font-mono text-[10px] font-bold text-slate-800">{coords.lat.toFixed(5)}</span>
              </div>
              <div className="rounded-lg bg-white/80 px-2 py-1.5">
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-400">Lng</span>
                <span className="font-mono text-[10px] font-bold text-slate-800">{coords.lng.toFixed(5)}</span>
              </div>
              <div className="rounded-lg bg-white/80 px-2 py-1.5">
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-400">
                  {tr('Akurasi', 'Accuracy')}
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-800">±{Math.round(accuracy || 0)}m</span>
              </div>
            </div>

            {office && distanceToOffice != null && (
              <div
                className={`mt-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold ${
                  withinOffice ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {withinOffice
                  ? tr(
                      `Dalam radius kantor · ±${Math.round(distanceToOffice)} m`,
                      `Inside office radius · ~${Math.round(distanceToOffice)} m`
                    )
                  : tr(
                      `Di luar radius kantor · ±${Math.round(distanceToOffice)} m (radius ${office.radius_meters} m)`,
                      `Outside office radius · ~${Math.round(distanceToOffice)} m (radius ${office.radius_meters} m)`
                    )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div className="pointer-events-none fixed left-3 right-3 top-[84px] z-20 md:left-[calc(16rem+1rem)] md:right-4 md:top-24">
          <div
            className={`pointer-events-auto mx-auto flex max-w-md items-start justify-between gap-2 rounded-xl border px-3.5 py-3 text-xs shadow-lg backdrop-blur ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                : 'border-rose-200 bg-rose-50/95 text-rose-900'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              )}
              <span className="font-medium break-words">{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="shrink-0 text-xs underline opacity-80 hover:opacity-100">
              {t.common.close}
            </button>
          </div>
        </div>
      )}

      {/* Floating clock action */}
      <div
        className={`pointer-events-none fixed inset-x-0 z-20 md:left-64 ${
          offlineBarVisible ? 'bottom-[124px] md:bottom-[52px]' : 'bottom-[72px] md:bottom-6'
        }`}
      >
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4">
          <div className="pointer-events-auto flex h-44 w-44 items-center justify-center rounded-full bg-white/90 p-1.5 shadow-[inset_0_4px_10px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              disabled={!coords || submitting || dayComplete}
              onClick={handlePrimaryClockClick}
              aria-label={dayComplete ? tr('Presensi Selesai', 'Attendance Complete') : clockAction === 'in' ? t.attendance.clockInNow : t.attendance.clockOut}
              className={`clock-press flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-full font-bold text-white shadow-[0_8px_0_rgba(15,23,42,0.32),0_18px_32px_-12px_rgba(15,23,42,0.6)] transition duration-150 enabled:hover:brightness-110 cursor-pointer disabled:cursor-not-allowed ${
                dayComplete
                  ? 'bg-gradient-to-b from-emerald-500 to-emerald-700'
                  : !coords
                  ? 'bg-gradient-to-b from-slate-300 to-slate-400'
                  : clockAction === 'in'
                  ? 'bg-gradient-to-b from-slate-800 to-slate-950'
                  : 'bg-gradient-to-b from-amber-500 to-amber-700'
              }`}
            >
              {dayComplete ? (
                <CheckCircle2 size={32} strokeWidth={2.2} />
              ) : !coords ? (
                detectingGps ? (
                  <Loader2 size={30} className="animate-spin" />
                ) : gpsBlocked ? (
                  <ShieldAlert size={30} />
                ) : (
                  <MapPin size={30} />
                )
              ) : clockAction === 'in' ? (
                <LogIn size={32} strokeWidth={2.2} />
              ) : (
                <LogOut size={32} strokeWidth={2.2} />
              )}
              <span className="px-6 text-center text-[11px] leading-snug">
                {submitting
                  ? t.common.submitting
                  : dayComplete
                  ? tr('Presensi Selesai', 'Attendance Complete')
                  : !coords
                  ? detectingGps
                    ? tr('Mendeteksi...', 'Detecting...')
                    : gpsBlocked
                    ? tr('GPS Nonaktif', 'GPS Off')
                    : tr('Menunggu GPS', 'Waiting for GPS')
                  : clockAction === 'in'
                  ? attendanceConfig.require_selfie
                    ? t.attendance.clockInWithSelfie
                    : t.attendance.clockInNow
                  : t.attendance.clockOut}
              </span>
            </button>
          </div>

          {coords && isOnline && (
            <p className="rounded-full bg-slate-900/35 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
              {dayComplete
                ? tr('Presensi hari ini selesai.', 'Today’s attendance is complete.')
                : clockAction === 'in'
                ? tr('Ketuk untuk presensi masuk', 'Tap to clock in')
                : tr('Ketuk untuk presensi pulang', 'Tap to clock out')}
            </p>
          )}

          {isOnline && (
          <div className="pointer-events-auto grid w-full grid-cols-2 gap-2 rounded-2xl border border-white/50 bg-white/95 p-2 shadow-lg backdrop-blur">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t.attendance.todayMasuk}
              </span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {todayAttendance?.clock_in_time || '--:--'}
              </span>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t.attendance.todayPulang}
              </span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {todayAttendance?.clock_out_time || '--:--'}
              </span>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Outside-geofence reason prompt */}
      {geofenceDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setGeofenceDialog(null);
          }}
        >
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <MapPin size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">
                  {tr('Di Luar Radius Kantor', 'Outside Office Radius')}
                </h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  {tr(
                    `Anda berada ±${Math.round(geofenceDialog.distance)} m dari kantor (radius ${office?.radius_meters || 100} m). Mohon isi alasan presensi.`,
                    `You are about ${Math.round(geofenceDialog.distance)} m from the office (radius ${office?.radius_meters || 100} m). Please provide a reason.`
                  )}
                </p>
              </div>
            </div>

            <textarea
              rows={3}
              autoFocus
              value={geofenceDialog.reason}
              onChange={(e) => setGeofenceDialog({ ...geofenceDialog, reason: e.target.value })}
              placeholder={tr('Contoh: Kunjungan klien, tugas lapangan...', 'Example: Client visit, field assignment...')}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGeofenceDialog(null)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!geofenceDialog.reason.trim()}
                onClick={submitGeofenceReason}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {tr('Lanjutkan Presensi', 'Continue Clock')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        title={tr(
          `Foto Selfie Presensi ${clockAction === 'in' ? 'Masuk' : 'Pulang'}`,
          `Attendance Selfie Photo ${clockAction === 'in' ? 'Clock In' : 'Clock Out'}`
        )}
        facingMode="user"
      />
    </div>
  );
};

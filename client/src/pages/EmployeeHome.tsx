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
  Bell,
  Clock,
  Calendar,
  DollarSign,
  Receipt,
  Briefcase,
  CheckSquare,
  UserCircle,
  Plane,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import {
  IsoAttendanceIcon,
  IsoCalendarIcon,
  IsoClaimReceiptIcon,
  IsoKasbonIcon,
  IsoLeavePlaneIcon,
  IsoOvertimeIcon,
  IsoPettyCashIcon,
  IsoProfileIcon,
  IsoTasksIcon,
  IsoWalletIcon,
} from '../components/IsometricIcons';
import {
  apiFetch,
  getToken,
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
  const { palette, isModuleEnabled } = useCompany();
  const [showMap, setShowMap] = useState(false);

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
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss toast feedback
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3200);
    return () => clearTimeout(t);
  }, [feedback]);

  // Fetch initial data & config
  const loadDashboardData = async () => {
    try {
      const todayStr = getLocalDateString();
      const [todayRes, attConfig, branchRes, annRes, empRes] = await Promise.all([
        apiFetchCached(`/attendance/today?date=${todayStr}`),
        apiFetchCached('/settings/attendance').catch(() => ({ require_selfie: false, require_location: true })),
        apiFetchCached('/attendance/branch').catch(() => ({ branch: null })),
        isModuleEnabled('announcements')
          ? apiFetchCached('/announcements').catch(() => ({ announcements: [] }))
          : Promise.resolve({ announcements: [] }),
        user?.employeeId
          ? apiFetchCached(`/employees/${user.employeeId}`).catch(() => ({ employee: null }))
          : Promise.resolve({ employee: null }),
      ]);

      setAttendanceConfig(attConfig);
      setOffice(branchRes?.branch || null);
      setAnnouncements(annRes?.announcements || []);
      setProfilePhotoUrl(empRes?.employee?.photo_url || null);

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

  const lateMinutes = Number(todayAttendance?.late_minutes || 0);
  const earlyMinutes = Number(todayAttendance?.early_minutes || 0);
  const hasClockIn = Boolean(todayAttendance?.clock_in_time);
  const hasClockOut = Boolean(todayAttendance?.clock_out_time);
  const clockInTone = hasClockIn
    ? lateMinutes > 0 || todayAttendance?.status === 'late'
      ? 'text-rose-600'
      : 'text-emerald-600'
    : 'text-slate-900';
  const clockOutTone = hasClockOut ? (earlyMinutes > 0 ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-900';
  const shiftStart = todayAttendance?.shift_start_time || '';
  const shiftEnd = todayAttendance?.shift_end_time || '';
  const hasShift = Boolean(shiftStart && shiftEnd);

  const hour = currentTime.getHours();
  const greetingText =
    hour < 11
      ? tr('Selamat Pagi!!', 'Good Morning!!')
      : hour < 15
      ? tr('Selamat Siang!!', 'Good Afternoon!!')
      : hour < 19
      ? tr('Selamat Sore!!', 'Good Evening!!')
      : tr('Selamat Malam!!', 'Good Night!!');

  const weekdayName = currentTime.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    weekday: 'long',
  });
  const fullDateString = currentTime.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Live elapsed timer since clock_in_time ("HH:MM" or "HH:MM:SS")
  let elapsedText = '';
  if (hasClockIn && !hasClockOut && todayAttendance?.clock_in_time) {
    const parts = String(todayAttendance.clock_in_time).split(':').map(Number);
    if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      const startDate = new Date(currentTime);
      startDate.setHours(parts[0], parts[1], parts[2] || 0, 0);
      const diffSec = Math.max(0, Math.floor((currentTime.getTime() - startDate.getTime()) / 1000));
      const hh = String(Math.floor(diffSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
      const ss = String(diffSec % 60).padStart(2, '0');
      elapsedText = `${hh}:${mm}:${ss}`;
    }
  }

  const quickActions = [
    {
      label: tr('Kehadiran', 'Attendance'),
      to: '/app/attendance',
      icon: IsoAttendanceIcon,
      bg: 'bg-orange-50/70',
      show: isModuleEnabled('attendance'),
    },
    {
      label: tr('Izin Cuti', 'Leave'),
      to: '/app/requests?type=leave',
      icon: IsoLeavePlaneIcon,
      bg: 'bg-sky-50/70',
      show: isModuleEnabled('leave'),
    },
    {
      label: tr('Gaji', 'Payslips'),
      to: '/app/payslips',
      icon: IsoWalletIcon,
      bg: 'bg-lime-50/70',
      show: isModuleEnabled('payroll'),
    },
    {
      label: tr('Kalender', 'Calendar'),
      to: '/app/calendar',
      icon: IsoCalendarIcon,
      bg: 'bg-rose-50/70',
      show: true,
    },
    {
      label: tr('Klaim', 'Claims'),
      to: '/app/requests?type=reimbursement',
      icon: IsoClaimReceiptIcon,
      bg: 'bg-amber-50/70',
      show: isModuleEnabled('claims'),
    },
    {
      label: tr('Lembur', 'Overtime'),
      to: '/app/requests?type=overtime',
      icon: IsoOvertimeIcon,
      bg: 'bg-violet-50/70',
      show: isModuleEnabled('shifts'),
    },
    {
      label: tr('Petty Cash', 'Petty Cash'),
      to: '/app/requests?type=petty',
      icon: IsoPettyCashIcon,
      bg: 'bg-cyan-50/70',
      show: isModuleEnabled('petty_cash'),
    },
    {
      label: tr('Kasbon', 'Advance'),
      to: '/app/requests?type=reimbursement',
      icon: IsoKasbonIcon,
      bg: 'bg-emerald-50/70',
      show: false,
    },
    {
      label: tr('Tugas', 'Tasks'),
      to: '/app/tasks',
      icon: IsoTasksIcon,
      bg: 'bg-indigo-50/70',
      show: isModuleEnabled('tasks'),
    },
    {
      label: tr('Profil', 'Profile'),
      to: '/app/profile',
      icon: IsoProfileIcon,
      bg: 'bg-teal-50/70',
      show: true,
    },
  ].filter((a) => a.show);

  return (
    <div className="max-w-md mx-auto pb-8">
      {/* Colored Hero Header */}
      <div
        className="px-5 pt-6 pb-16 rounded-b-[28px] md:rounded-3xl relative overflow-hidden shadow-sm"
        style={{ background: palette.gradient, color: palette.onPrimary, viewTransitionName: 'ess-hero' }}
      >
        {/* Subtle decorative circles */}
        <div className="pointer-events-none absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-8 bottom-0 w-28 h-28 rounded-full bg-white/5" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/app/profile"
              viewTransition
              className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center font-black text-lg shrink-0 shadow-xs overflow-hidden"
            >
              {profilePhotoUrl ? (
                <img
                  src={`${profilePhotoUrl}&token=${encodeURIComponent(getToken() || '')}`}
                  alt={user?.name || 'Profile'}
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.name?.charAt(0) || 'U'
              )}
            </Link>
            <div className="min-w-0">
              <p className="text-xs opacity-90 font-medium">{greetingText}</p>
              <h1 className="text-lg font-bold tracking-tight truncate">{user?.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user?.role && user.role !== 'employee' && (
              <Link
                to="/"
                className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-[11px] font-bold transition"
                title={tr('Kembali ke HR', 'Back to HR')}
              >
                HR
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                loadDashboardData();
                detectLocation();
              }}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
              aria-label={tr('Muat ulang', 'Refresh')}
              title={tr('Muat ulang', 'Refresh')}
            >
              <RefreshCw size={17} className={detectingGps ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Overlapping Today Attendance Card (with Live GPS Map Background) */}
      <div className="-mt-11 px-4 relative z-20">
        <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-[0_10px_30px_rgba(15,23,42,0.08)] p-4">
          {coords && isOnline && (
            <div className="absolute inset-0 z-0 pointer-events-none">
              <LocationMap
                lat={coords.lat}
                lng={coords.lng}
                accuracy={accuracy}
                office={office}
                className="h-full w-full opacity-55"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-white/75 via-white/82 to-white/92 backdrop-blur-[1px]" />
            </div>
          )}
          <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 capitalize">{weekdayName}</span>
            <span className="text-slate-500 font-medium">{fullDateString}</span>
          </div>

          <div className="rounded-2xl border border-slate-100/90 bg-slate-50/85 backdrop-blur-xs p-3 grid grid-cols-2 divide-x divide-slate-200/80">
            {/* Clock In Column */}
            <div className="pr-3 flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1.5">
                <LogIn size={13} className="text-sky-600" />
                <span>{t.attendance.todayMasuk}</span>
              </div>
              {hasClockIn ? (
                <>
                  <span className={`font-mono text-2xl font-black tracking-tight ${clockInTone}`}>
                    {todayAttendance?.clock_in_time}
                  </span>
                  {lateMinutes > 0 && (
                    <span className="mt-0.5 text-[10px] font-semibold text-rose-600">
                      {tr(`Terlambat ${lateMinutes}m`, `Late ${lateMinutes}m`)}
                    </span>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={!coords || submitting}
                  onClick={handlePrimaryClockClick}
                  style={coords ? { backgroundColor: palette.primary, color: palette.onPrimary } : undefined}
                  className={`w-full py-2 px-3 rounded-full text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    !coords ? 'bg-slate-200 text-slate-500' : 'hover:opacity-95 active:scale-95'
                  }`}
                >
                  {submitting
                    ? t.common.submitting
                    : !coords
                    ? detectingGps
                      ? tr('GPS...', 'GPS...')
                      : tr('Tunggu GPS', 'Wait GPS')
                    : tr('Masuk', 'Clock In')}
                </button>
              )}
            </div>

            {/* Clock Out Column */}
            <div className="pl-3 flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1.5">
                <LogOut size={13} className="text-rose-500" />
                <span>{t.attendance.todayPulang}</span>
              </div>
              {hasClockOut ? (
                <>
                  <span className={`font-mono text-2xl font-black tracking-tight ${clockOutTone}`}>
                    {todayAttendance?.clock_out_time}
                  </span>
                  {earlyMinutes > 0 && (
                    <span className="mt-0.5 text-[10px] font-semibold text-rose-600">
                      {tr(`Awal ${earlyMinutes}m`, `Early ${earlyMinutes}m`)}
                    </span>
                  )}
                </>
              ) : hasClockIn ? (
                <button
                  type="button"
                  disabled={!coords || submitting}
                  onClick={handlePrimaryClockClick}
                  style={coords ? { backgroundColor: palette.primary, color: palette.onPrimary } : undefined}
                  className={`w-full py-2 px-3 rounded-full text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    !coords ? 'bg-slate-200 text-slate-500' : 'hover:opacity-95 active:scale-95'
                  }`}
                >
                  {submitting ? t.common.submitting : tr('Keluar', 'Clock Out')}
                </button>
              ) : (
                <span className="font-mono text-2xl font-black text-slate-300">--:--</span>
              )}
            </div>
          </div>

          {/* Live Status Chip */}
          <div className="flex flex-col items-center gap-1.5">
            {dayComplete ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3.5 py-1 text-[11px] font-semibold">
                <CheckCircle2 size={13} />
                <span>{tr('Presensi hari ini selesai', 'Today’s attendance is complete')}</span>
              </div>
            ) : hasClockIn && elapsedText ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3.5 py-1 text-[11px] font-semibold">
                <Clock size={13} />
                <span>
                  {tr(`Presensi masuk ${elapsedText} yang lalu`, `Clocked in ${elapsedText} ago`)}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={detectLocation}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold cursor-pointer ${
                  !coords
                    ? gpsBlocked
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-700'
                    : withinOffice
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                <MapPin size={12} />
                <span>
                  {!coords
                    ? locationStatus
                    : office && distanceToOffice != null
                    ? withinOffice
                      ? tr(`Dalam radius kantor (±${Math.round(distanceToOffice)}m)`, `Inside office (±${Math.round(distanceToOffice)}m)`)
                      : tr(`Di luar radius (±${Math.round(distanceToOffice)}m)`, `Outside radius (±${Math.round(distanceToOffice)}m)`)
                    : tr('GPS Siap · Tap untuk refresh', 'GPS Ready · Tap to refresh')}
                </span>
                <RefreshCw size={11} className={detectingGps ? 'animate-spin' : ''} />
              </button>
            )}

            {hasShift && (
              <p className="text-[10px] font-medium text-slate-500">
                {tr('Shift', 'Shift')}: <span className="font-mono text-slate-700">{shiftStart} – {shiftEnd}</span>
                {todayAttendance?.shift_name ? ` · ${todayAttendance.shift_name}` : ''}
              </p>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Floating Auto-Dismiss Toast */}
      {feedback && (
        <div
          onClick={() => setFeedback(null)}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm cursor-pointer"
        >
          <div
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs shadow-lg backdrop-blur-md ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                : 'border-rose-200 bg-rose-50/95 text-rose-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0" />
            ) : (
              <AlertTriangle size={16} className="shrink-0" />
            )}
            <span className="font-semibold break-words">{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="px-4 mt-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2.5 text-xs text-amber-900">
            <WifiOff size={16} className="shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{tr('Mode Offline', 'Offline Mode')}</p>
              <p className="text-[11px] text-amber-700">
                {tr('GPS tetap aktif. Presensi akan diantrekan otomatis.', 'GPS is active. Punches will be queued automatically.')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4-Column Quick Action Grid */}
      <div className="px-4 pt-6">
        <div className="grid grid-cols-4 gap-y-5 gap-x-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                to={action.to}
                viewTransition
                className="flex flex-col items-center text-center group"
              >
                <div
                  className={`w-15 h-15 rounded-2xl ${action.bg} flex items-center justify-center group-hover:scale-105 transition`}
                >
                  <Icon size={46} />
                </div>
                <span className="mt-1.5 text-[11px] font-semibold text-slate-700 leading-tight line-clamp-1">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Company Announcements Blog Feed (Home only) */}
      {isModuleEnabled('announcements') && announcements.length > 0 && (
        <div className="px-4 mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">
              {tr('Pengumuman Perusahaan', 'Company Announcements')}
            </h3>
            {announcements.filter((a) => !a.acknowledged).length > 0 && (
              <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
                {announcements.filter((a) => !a.acknowledged).length} {tr('baru', 'new')}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {[...announcements]
              .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
              .map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedAnnouncement(post)}
                  className={`w-full text-left rounded-3xl bg-white p-4 border shadow-2xs transition hover:shadow-xs cursor-pointer space-y-2 ${
                    post.pinned || !post.acknowledged ? 'border-sky-200' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold uppercase text-sky-700">
                        {post.category || 'general'}
                      </span>
                      {Boolean(post.pinned) && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                          PINNED
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {post.published_at ? String(post.published_at).slice(0, 10) : ''}
                    </span>
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-900 line-clamp-2">{post.title}</h4>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{post.body}</p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-sky-600">
                      {post.publisher_name || 'HR'} · {tr('Baca selengkapnya →', 'Read more →')}
                    </span>
                    {post.acknowledged ? (
                      <span className="text-[10px] font-bold text-emerald-600">{tr('✓ Dibaca', '✓ Read')}</span>
                    ) : post.require_ack ? (
                      <span className="text-[10px] font-bold text-amber-600">{tr('Perlu konfirmasi', 'Action needed')}</span>
                    ) : null}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Announcement Blog Article Reader Modal */}
      {selectedAnnouncement && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedAnnouncement(null);
          }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-sky-700">
                  {selectedAnnouncement.category || 'general'}
                </span>
                {Boolean(selectedAnnouncement.pinned) && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                    PINNED
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <h3 className="text-base font-extrabold text-slate-900">{selectedAnnouncement.title}</h3>
            <p className="text-[11px] text-slate-400">
              {selectedAnnouncement.publisher_name || 'HR'} ·{' '}
              {selectedAnnouncement.published_at ? String(selectedAnnouncement.published_at).slice(0, 10) : ''}
            </p>
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
              {selectedAnnouncement.body}
            </div>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              {!selectedAnnouncement.acknowledged ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiFetch(`/announcements/${selectedAnnouncement.id}/ack`, { method: 'POST' });
                      setAnnouncements((prev) =>
                        prev.map((a) => (a.id === selectedAnnouncement.id ? { ...a, acknowledged: true } : a))
                      );
                      setSelectedAnnouncement((prev: any) => (prev ? { ...prev, acknowledged: true } : prev));
                    } catch {}
                  }}
                  style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                  className="rounded-xl px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  {selectedAnnouncement.require_ack
                    ? tr('Konfirmasi Sudah Membaca', 'Acknowledge')
                    : tr('Tandai Sudah Dibaca', 'Mark as Read')}
                </button>
              ) : (
                <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                  {tr('✓ Sudah Dibaca', '✓ Acknowledged')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Outside-geofence reason prompt */}
      {geofenceDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setGeofenceDialog(null);
          }}
        >
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 shadow-2xl">
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
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGeofenceDialog(null)}
                className="flex-1 rounded-full bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!geofenceDialog.reason.trim()}
                onClick={submitGeofenceReason}
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                className="flex-1 rounded-full py-2.5 text-xs font-bold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
          `Presensi ${clockAction === 'in' ? 'Masuk' : 'Keluar'}`,
          `Attendance ${clockAction === 'in' ? 'Clock In' : 'Clock Out'}`
        )}
        facingMode="user"
        attendanceTime={`${currentTime.toLocaleDateString('en-GB')} ${timeString}`}
        distanceMeters={distanceToOffice}
        isOutsideOffice={withinOffice === false}
        officeName={office?.name}
        coordsText={coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${Math.round(accuracy || 0)}m)` : undefined}
      />
    </div>
  );
};

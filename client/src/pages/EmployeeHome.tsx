import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Calendar,
  DollarSign,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Receipt,
  Camera,
  RefreshCw,
  History,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  apiFetch,
  formatRupiah,
  formatDateIndo,
  saveToOfflineQueue,
} from '../api';
import { CameraModal } from '../components/CameraModal';
import { PayslipModal } from '../components/PayslipModal';

export const EmployeeHome: React.FC = () => {
  const { user } = useAuth();
  const { t, lang, formatCurrency, formatDate, language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [leaveBalance, setLeaveBalance] = useState<number>(12);
  const [latestPayslip, setLatestPayslip] = useState<any>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clockAction, setClockAction] = useState<'in' | 'out'>('in');
  const [cameraOpen, setCameraOpen] = useState(false);

  // GPS & Attendance Policy Settings
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Mendeteksi GPS...');
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
      const todayStr = new Date().toISOString().split('T')[0];
      const [todayRes, balRes, payRes, attConfig] = await Promise.all([
        apiFetch(`/attendance/today?date=${todayStr}`),
        apiFetch('/leave/balances'),
        apiFetch('/payroll/my-payslips'),
        apiFetch('/settings/attendance').catch(() => ({ require_selfie: false, require_location: true })),
      ]);

      setAttendanceConfig(attConfig);

      const myRecord = (todayRes.records || []).find((r: any) => r.employee_id === user?.employeeId);
      setTodayAttendance(myRecord || null);

      if (myRecord?.clock_in_time && !myRecord?.clock_out_time) {
        setClockAction('out');
      } else {
        setClockAction('in');
      }

      // Leave balance
      const annual = (balRes.balances || []).find((b: any) => b.leave_type_code === 'annual');
      if (annual) setLeaveBalance(annual.remaining_days);

      // Latest payslip
      if (payRes.payslips && payRes.payslips.length > 0) {
        setLatestPayslip(payRes.payslips[0]);
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
    setLocationStatus('Mendeteksi sinyal GPS presisi...');

    if (!('geolocation' in navigator)) {
      setGpsBlocked(true);
      setCoords(null);
      setLocationStatus('Perangkat tidak mendukung GPS');
      setDetectingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus(`GPS Terkunci (Akurasi: ±${Math.round(pos.coords.accuracy)}m)`);
        setGpsBlocked(false);
        setDetectingGps(false);
      },
      (err) => {
        console.warn('Geolocation blocked or error:', err.message);
        // Location is STRICTLY required - do not mock or fallback
        setCoords(null);
        setGpsBlocked(true);
        setLocationStatus('Akses GPS Diblokir / Nonaktif');
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
  const executeClock = async (action: 'in' | 'out', photoBase64?: string) => {
    if (!coords) {
      setFeedback({
        type: 'error',
        message: 'Akses GPS diblokir atau belum aktif. Anda wajib mengizinkan lokasi di browser untuk melakukan presensi.',
      });
      detectLocation();
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    const nowIso = new Date().toISOString();

    if (!navigator.onLine) {
      // Offline mode
      saveToOfflineQueue({
        id: `off-${Date.now()}`,
        type: action,
        latitude: coords.lat,
        longitude: coords.lng,
        photo_base64: photoBase64,
        device_timestamp: nowIso,
      });
      setSubmitting(false);
      setFeedback({
        type: 'success',
        message: `Offline: Presensi ${action === 'in' ? 'Masuk' : 'Pulang'} tersimpan di memori perangkat dan akan disinkron saat internet tersambung.`,
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
          device_timestamp: nowIso,
        }),
      });

      setFeedback({
        type: 'success',
        message: `${res.message} ${res.lateMinutes > 0 ? `(Terlambat ${res.lateMinutes} menit)` : ''}`,
      });
      loadDashboardData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Presensi gagal diproses' });
    } finally {
      setSubmitting(false);
    }
  };

  // Click on Clock In/Out button
  const handlePrimaryClockClick = () => {
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

  const openPayslipDetail = async (payslipId: string) => {
    try {
      const res = await apiFetch(`/payroll/items/${payslipId}/payslip`);
      setSelectedPayslip(res.payslip);
    } catch (err: any) {
      alert(err.message || 'Gagal memuat slip gaji');
    }
  };

  const timeString = currentTime.toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Employee Header & Status Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              {t.attendance.essPortal}
            </span>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">{user?.name}</h2>
            <p className="text-xs text-slate-500">{user?.jobTitle || 'Staff'}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              title="Ganti Bahasa / Switch Language"
            >
              <Globe size={13} className="text-blue-600" />
              <span>{language === 'id' ? 'EN' : 'ID'}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/attendance')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition cursor-pointer"
            >
              <History size={13} />
              <span>{t.attendance.historyTitle}</span>
            </button>
          </div>
        </div>

        {/* GPS Verification Badge */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                coords ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 animate-pulse'
              }`}
            />
            <span className={`font-medium ${coords ? 'text-slate-700' : 'text-rose-700'}`}>
              {locationStatus}
            </span>
          </div>

          <button
            type="button"
            disabled={detectingGps}
            onClick={detectLocation}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={11} className={detectingGps ? 'animate-spin' : ''} />
            <span>{t.common.refresh}</span>
          </button>
        </div>
      </div>

      {/* GPS BLOCKED ALERT BANNER (Strict Requirement) */}
      {gpsBlocked && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
          <div className="flex items-start gap-2">
            <ShieldAlert size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{t.attendance.gpsBlockedTitle}</p>
              <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                {t.attendance.gpsBlockedDesc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={detectLocation}
            className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-xs transition cursor-pointer"
          >
            {t.attendance.gpsRetryBtn}
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs underline opacity-80 hover:opacity-100">
            {t.common.close}
          </button>
        </div>
      )}

      {/* CLOCK IN/OUT CARD (Antislop Design) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs text-center space-y-5">
        <div>
          <div className="text-3xl font-extrabold tracking-tight font-mono text-slate-900">
            {timeString}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">{dateString}</p>
        </div>

        {/* Primary Action Button */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={!coords || submitting}
            onClick={handlePrimaryClockClick}
            className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
              clockAction === 'in'
                ? 'bg-slate-900 hover:bg-slate-800 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            <Clock size={16} />
            <span>
              {submitting
                ? t.common.submitting
                : !coords
                ? t.attendance.gpsRequiredNotice
                : clockAction === 'in'
                ? attendanceConfig.require_selfie
                  ? t.attendance.clockInWithSelfie
                  : t.attendance.clockInNow
                : t.attendance.clockOut}
            </span>
          </button>

          {/* Optional Selfie Button when Admin set it to optional */}
          {clockAction === 'in' && !attendanceConfig.require_selfie && coords && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => setCameraOpen(true)}
              className="w-full py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Camera size={13} className="text-slate-500" />
              <span>{t.attendance.takeSelfieOptional}</span>
            </button>
          )}
        </div>

        {/* Policy status notice */}
        <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck size={13} className="text-slate-400" />
          <span>
            {attendanceConfig.require_selfie
              ? t.attendance.policyNoticeMandatory
              : t.attendance.policyNoticeOptional}
          </span>
        </div>

        {/* Today's Log Summary */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-500 uppercase block font-medium">
              {t.attendance.todayMasuk}
            </span>
            <span className="font-bold text-slate-900 font-mono text-sm">
              {todayAttendance?.clock_in_time || '--:--'}
            </span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-500 uppercase block font-medium">
              {t.attendance.todayPulang}
            </span>
            <span className="font-bold text-slate-900 font-mono text-sm">
              {todayAttendance?.clock_out_time || '--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* QUICK METRICS (Sisa Cuti & Slip Gaji Terbaru) */}
      <div className="grid grid-cols-2 gap-3">
        <div
          onClick={() => navigate('/app/requests')}
          className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs cursor-pointer hover:border-slate-300 transition"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="text-[11px] font-medium">{t.leave.annualLeaveBalance}</span>
            <Calendar size={14} className="text-slate-400" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            {leaveBalance} <span className="text-xs font-normal text-slate-500">{t.common.days}</span>
          </div>
        </div>

        <div
          onClick={() => latestPayslip && openPayslipDetail(latestPayslip.id)}
          className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs cursor-pointer hover:border-slate-300 transition"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="text-[11px] font-medium">{t.payroll.slipGaji}</span>
            <DollarSign size={14} className="text-slate-400" />
          </div>
          <div className="text-sm font-bold text-slate-900 truncate">
            {latestPayslip ? formatCurrency(latestPayslip.take_home_pay) : '-'}
          </div>
        </div>
      </div>

      {/* QUICK REQUEST SHORTCUTS (Thumb Optimized) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2.5">
        <h3 className="font-bold text-slate-900 text-xs tracking-tight">
          {t.nav.requests}
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate('/app/requests?type=leave')}
            className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left transition text-xs font-medium text-slate-800 cursor-pointer"
          >
            <Calendar size={15} className="text-blue-600 shrink-0" />
            <span className="truncate">{t.nav.leave}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/app/requests?type=overtime')}
            className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left transition text-xs font-medium text-slate-800 cursor-pointer"
          >
            <Clock size={15} className="text-amber-600 shrink-0" />
            <span className="truncate">{t.shifts.requestOvertime}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/app/requests?type=kasbon')}
            className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left transition text-xs font-medium text-slate-800 cursor-pointer"
          >
            <CreditCard size={15} className="text-purple-600 shrink-0" />
            <span className="truncate">{t.kasbon.requestKasbon}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/app/requests?type=reimbursement')}
            className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left transition text-xs font-medium text-slate-800 cursor-pointer"
          >
            <Receipt size={15} className="text-emerald-600 shrink-0" />
            <span className="truncate">{t.kasbon.requestClaim}</span>
          </button>
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        title={`Foto Selfie Presensi ${clockAction === 'in' ? 'Masuk' : 'Pulang'}`}
        facingMode="user"
      />

      {/* Payslip View Modal */}
      <PayslipModal
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        payslip={selectedPayslip}
      />
    </div>
  );
};

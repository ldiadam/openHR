import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Calendar,
  DollarSign,
  Send,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  FileText,
  CreditCard,
  Receipt,
  Eye,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  formatRupiah,
  formatDateIndo,
  saveToOfflineQueue,
  getOfflineQueue,
  syncOfflineQueue,
} from '../api';
import { CameraModal } from '../components/CameraModal';
import { PayslipModal } from '../components/PayslipModal';

export const EmployeeHome: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [leaveBalance, setLeaveBalance] = useState<number>(12);
  const [latestPayslip, setLatestPayslip] = useState<any>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [clockAction, setClockAction] = useState<'in' | 'out'>('in');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('Mendeteksi GPS...');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data
  const loadDashboardData = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRes = await apiFetch(`/attendance/today?date=${todayStr}`);
      const myRecord = (todayRes.records || []).find((r: any) => r.employee_id === user?.employeeId);
      setTodayAttendance(myRecord || null);

      if (myRecord?.clock_in_time && !myRecord?.clock_out_time) {
        setClockAction('out');
      } else {
        setClockAction('in');
      }

      // Leave balance
      const balRes = await apiFetch('/leave/balances');
      const annual = (balRes.balances || []).find((b: any) => b.leave_type_code === 'annual');
      if (annual) setLeaveBalance(annual.remaining_days);

      // Latest payslip
      const payRes = await apiFetch('/payroll/my-payslips');
      if (payRes.payslips && payRes.payslips.length > 0) {
        setLatestPayslip(payRes.payslips[0]);
      }
    } catch (err: any) {
      console.warn('Load ESS error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    detectLocation();
  }, [user]);

  const detectLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationStatus('GPS Siap (Akurasi: ' + Math.round(pos.coords.accuracy) + 'm)');
        },
        (err) => {
          // Fallback to Jakarta office coordinates if simulator/browser denies
          console.warn('Geolocation denied or unavailable, using branch default:', err.message);
          setCoords({ lat: -6.2255, lng: 106.8095 });
          setLocationStatus('GPS Default Kantor');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setCoords({ lat: -6.2255, lng: 106.8095 });
      setLocationStatus('GPS Default Kantor');
    }
  };

  const handleStartClock = (action: 'in' | 'out') => {
    setClockAction(action);
    setCameraOpen(true);
  };

  const handlePhotoCaptured = async (base64Photo: string) => {
    const lat = coords?.lat || -6.2255;
    const lng = coords?.lng || 106.8095;
    const nowIso = new Date().toISOString();

    if (!navigator.onLine) {
      // Offline mode
      saveToOfflineQueue({
        id: `off-${Date.now()}`,
        type: clockAction,
        latitude: lat,
        longitude: lng,
        photo_base64: base64Photo,
        device_timestamp: nowIso,
      });
      setFeedback({
        type: 'success',
        message: `Offline: Presensi ${clockAction === 'in' ? 'Masuk' : 'Pulang'} disimpan di perangkat dan akan disinkron saat online.`,
      });
      return;
    }

    try {
      const res = await apiFetch('/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({
          type: clockAction,
          latitude: lat,
          longitude: lng,
          photo_base64: base64Photo,
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
    }
  };

  const openPayslipDetail = async (payslipId: string) => {
    try {
      const res = await apiFetch(`/payroll/items/${payslipId}/payslip`);
      setSelectedPayslip(res.payslip);
    } catch (err: any) {
      alert(err.message || 'Gagal memuat slip gaji');
    }
  };

  const timeString = currentTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="max-w-md mx-auto space-y-5">
      {/* Employee Greeting & Branch Badge */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
            Employee Self-Service
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">{user?.name}</h2>
          <p className="text-xs text-slate-500">{user?.jobTitle || 'Karyawan'}</p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200">
            <MapPin size={12} className="text-blue-600" />
            <span>{user?.branchName || 'Kantor'}</span>
          </span>
          <p className="text-[10px] text-slate-400 mt-1">{locationStatus}</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span className="flex-1">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold px-1">
            ✕
          </button>
        </div>
      )}

      {/* CLOCK IN/OUT BUTTON CARD (Primary Thumb Target) */}
      <div className="bg-linear-to-br from-blue-600 via-indigo-600 to-blue-800 text-white rounded-3xl p-6 shadow-xl text-center relative overflow-hidden">
        <div className="relative z-10">
          <div className="text-4xl font-extrabold tracking-tight font-mono">{timeString}</div>
          <p className="text-xs text-blue-100 mt-1 font-medium">{dateString}</p>

          <div className="mt-6 flex justify-center">
            {clockAction === 'in' ? (
              <button
                onClick={() => handleStartClock('in')}
                className="w-44 h-44 rounded-full bg-white text-blue-700 font-extrabold text-lg flex flex-col items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border-4 border-blue-200/50"
              >
                <Clock size={36} className="text-blue-600 mb-1" />
                <span>CLOCK IN</span>
                <span className="text-[11px] font-medium text-slate-500">Presensi Masuk</span>
              </button>
            ) : (
              <button
                onClick={() => handleStartClock('out')}
                className="w-44 h-44 rounded-full bg-amber-500 text-white font-extrabold text-lg flex flex-col items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border-4 border-amber-300/50"
              >
                <Clock size={36} className="text-white mb-1" />
                <span>CLOCK OUT</span>
                <span className="text-[11px] font-medium text-amber-100">Presensi Pulang</span>
              </button>
            )}
          </div>

          <div className="mt-5 text-xs text-blue-100 flex items-center justify-center gap-4">
            <div>
              <span className="opacity-75 block text-[10px]">Presensi Masuk</span>
              <strong className="text-white font-mono">
                {todayAttendance?.clock_in_time || '--:--'}
              </strong>
            </div>
            <div className="w-px h-6 bg-blue-400/40" />
            <div>
              <span className="opacity-75 block text-[10px]">Presensi Pulang</span>
              <strong className="text-white font-mono">
                {todayAttendance?.clock_out_time || '--:--'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK METRICS (Sisa Cuti & Slip Gaji Terbaru) */}
      <div className="grid grid-cols-2 gap-3">
        <div
          onClick={() => navigate('/app/requests')}
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer hover:border-blue-400 transition"
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Calendar size={16} className="text-blue-600" />
            <span>Sisa Cuti Tahunan</span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {leaveBalance} <span className="text-xs font-normal text-slate-500">Hari</span>
          </div>
        </div>

        <div
          onClick={() => latestPayslip && openPayslipDetail(latestPayslip.id)}
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer hover:border-emerald-400 transition"
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <DollarSign size={16} className="text-emerald-600" />
            <span>Slip Gaji Terakhir</span>
          </div>
          <div className="text-base font-bold text-emerald-600 truncate">
            {latestPayslip ? formatRupiah(latestPayslip.take_home_pay) : 'Belum Ada'}
          </div>
          {latestPayslip && (
            <p className="text-[10px] text-slate-400 truncate">{latestPayslip.period_title}</p>
          )}
        </div>
      </div>

      {/* FIVE ACTIONS, ONE THUMB: QUICK REQUEST BUTTONS */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
          Pengajuan Mandiri (Self-Service)
        </h3>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => navigate('/app/requests?type=leave')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 hover:bg-blue-100 text-left transition font-medium text-xs border border-blue-100"
          >
            <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0">
              <Calendar size={16} />
            </div>
            <div>
              <div className="font-bold">Ajukan Cuti / Izin</div>
              <div className="text-[10px] text-blue-600">Sakit, Tahunan, Izin</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/app/requests?type=overtime')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 text-left transition font-medium text-xs border border-amber-100"
          >
            <div className="p-2 rounded-lg bg-amber-600 text-white shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <div className="font-bold">Ajukan Lembur</div>
              <div className="text-[10px] text-amber-700">Hari Kerja & Libur</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/app/requests?type=kasbon')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-900 hover:bg-purple-100 text-left transition font-medium text-xs border border-purple-100"
          >
            <div className="p-2 rounded-lg bg-purple-600 text-white shrink-0">
              <CreditCard size={16} />
            </div>
            <div>
              <div className="font-bold">Ajukan Kasbon</div>
              <div className="text-[10px] text-purple-700">Potong Gaji Bulanan</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/app/requests?type=reimbursement')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-left transition font-medium text-xs border border-emerald-100"
          >
            <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0">
              <Receipt size={16} />
            </div>
            <div>
              <div className="font-bold">Klaim Biaya</div>
              <div className="text-[10px] text-emerald-700">Foto Struk / Nota</div>
            </div>
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

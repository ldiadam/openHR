import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CreditCard,
  Receipt,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Camera,
} from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { CameraModal } from '../components/CameraModal';

export const EmployeeRequests: React.FC = () => {
  const { t, formatDate, formatCurrency } = useLanguage();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('type') || 'leave';
  const [activeTab, setActiveTab] = useState<'leave' | 'overtime' | 'kasbon' | 'reimbursement'>(
    initialTab as any
  );

  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Forms states
  // 1. Leave
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveDays, setLeaveDays] = useState('1');
  const [leaveReason, setLeaveReason] = useState('');

  // 2. Overtime
  const [otDate, setOtDate] = useState(new Date().toISOString().split('T')[0]);
  const [otStart, setOtStart] = useState('18:00');
  const [otEnd, setOtEnd] = useState('20:00');
  const [otHours, setOtHours] = useState('2');
  const [otReason, setOtReason] = useState('');
  const [otIsHoliday, setOtIsHoliday] = useState(false);

  // 3. Kasbon
  const [kasbonAmount, setKasbonAmount] = useState('500000');
  const [kasbonReason, setKasbonReason] = useState('');
  const [kasbonInstalments, setKasbonInstalments] = useState('1');

  // 4. Reimbursement
  const [reimbCategory, setReimbCategory] = useState('Transport');
  const [reimbAmount, setReimbAmount] = useState('100000');
  const [reimbDesc, setReimbDesc] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ltRes, balRes] = await Promise.all([
        apiFetch('/leave/types'),
        apiFetch('/leave/balances'),
      ]);
      setLeaveTypes(ltRes.leaveTypes || []);
      setLeaveBalances(balRes.balances || []);
      if (ltRes.leaveTypes?.[0] && !leaveTypeId) {
        setLeaveTypeId(ltRes.leaveTypes[0].id);
      }

      await loadHistory(activeTab);
    } catch (err: any) {
      console.warn('Load requests data err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (tab: string) => {
    try {
      if (tab === 'leave') {
        const res = await apiFetch('/leave/requests');
        setHistory(res.requests || []);
      } else if (tab === 'overtime') {
        const res = await apiFetch('/shifts/overtime/requests');
        setHistory(res.requests || []);
      } else if (tab === 'kasbon') {
        const res = await apiFetch('/kasbon/requests');
        setHistory(res.kasbonList || []);
      } else if (tab === 'reimbursement') {
        const res = await apiFetch('/kasbon/reimbursements');
        setHistory(res.reimbursements || []);
      }
    } catch (err: any) {
      console.warn('History err:', err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/leave/requests', {
        method: 'POST',
        body: JSON.stringify({
          leave_type_id: leaveTypeId,
          start_date: leaveStart,
          end_date: leaveEnd,
          total_days: parseFloat(leaveDays),
          reason: leaveReason,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setLeaveReason('');
      loadHistory('leave');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/shifts/overtime/requests', {
        method: 'POST',
        body: JSON.stringify({
          date: otDate,
          start_time: otStart,
          end_time: otEnd,
          planned_hours: parseFloat(otHours),
          reason: otReason,
          is_holiday_or_rest_day: otIsHoliday,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setOtReason('');
      loadHistory('overtime');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSubmitKasbon = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/kasbon/requests', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(kasbonAmount),
          reason: kasbonReason,
          total_instalments: parseInt(kasbonInstalments, 10),
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setKasbonReason('');
      loadHistory('kasbon');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSubmitReimbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/kasbon/reimbursements', {
        method: 'POST',
        body: JSON.stringify({
          category: reimbCategory,
          amount: parseFloat(reimbAmount),
          description: reimbDesc,
          receipt_photo_base64: receiptPhoto,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setReimbDesc('');
      setReceiptPhoto(null);
      loadHistory('reimbursement');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.leave.approved}</span>;
      case 'rejected':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.leave.rejected}</span>;
      default:
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.leave.pending}</span>;
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t.nav.requests}</h2>
        <p className="text-xs text-slate-500">{t.leave.requestLeave}, {t.shifts.requestOvertime}, {t.kasbon.requestKasbon}</p>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-200 p-1 rounded-2xl text-[11px] font-semibold text-slate-700">
        <button
          onClick={() => setActiveTab('leave')}
          className={`py-2 rounded-xl transition ${activeTab === 'leave' ? 'bg-white text-blue-700 shadow-xs' : ''}`}
        >
          {t.nav.leave}
        </button>
        <button
          onClick={() => setActiveTab('overtime')}
          className={`py-2 rounded-xl transition ${activeTab === 'overtime' ? 'bg-white text-amber-700 shadow-xs' : ''}`}
        >
          {t.shifts.requestOvertime}
        </button>
        <button
          onClick={() => setActiveTab('kasbon')}
          className={`py-2 rounded-xl transition ${activeTab === 'kasbon' ? 'bg-white text-purple-700 shadow-xs' : ''}`}
        >
          {t.kasbon.requestKasbon}
        </button>
        <button
          onClick={() => setActiveTab('reimbursement')}
          className={`py-2 rounded-xl transition ${activeTab === 'reimbursement' ? 'bg-white text-emerald-700 shadow-xs' : ''}`}
        >
          {t.kasbon.requestClaim}
        </button>
      </div>

      {/* TAB 1: CUTI / IZIN */}
      {activeTab === 'leave' && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-xs uppercase text-slate-900">{t.leave.requestLeave}</h3>
            <div className="text-xs text-blue-600 font-semibold">
              {t.leave.annualLeaveBalance}: {leaveBalances.find((b) => b.leave_type_code === 'annual')?.remaining_days || 12} {t.leave.remainingDays}
            </div>
          </div>

          <form onSubmit={handleSubmitLeave} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t.leave.leaveType}</label>
              <select
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              >
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.is_paid ? 'Dibayar' : 'Tanpa Gaji'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Tgl Mulai</label>
                <input
                  type="date"
                  required
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Tgl Selesai</label>
                <input
                  type="date"
                  required
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Total Hari Kerja</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                required
                value={leaveDays}
                onChange={(e) => setLeaveDays(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Alasan Cuti / Izin</label>
              <textarea
                required
                rows={2}
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Keperluan keluarga, sakit flu, dll..."
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-xs hover:bg-blue-700 transition"
            >
              Kirim Pengajuan Cuti
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: OVERTIME */}
      {activeTab === 'overtime' && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-xs uppercase text-slate-900 border-b border-slate-100 pb-3">
            Form Pengajuan Lembur
          </h3>
          <form onSubmit={handleSubmitOvertime} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Tanggal Lembur</label>
              <input
                type="date"
                required
                value={otDate}
                onChange={(e) => setOtDate(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Jam Mulai</label>
                <input
                  type="time"
                  value={otStart}
                  onChange={(e) => setOtStart(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Jam Selesai</label>
                <input
                  type="time"
                  value={otEnd}
                  onChange={(e) => setOtEnd(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Durasi Rencana (Jam)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                required
                value={otHours}
                onChange={(e) => setOtHours(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="otHoliday"
                checked={otIsHoliday}
                onChange={(e) => setOtIsHoliday(e.target.checked)}
                className="rounded text-amber-600"
              />
              <label htmlFor="otHoliday" className="text-slate-700 font-medium">
                Hari Libur / Istirahat Mingguan (Tarif 2x / 3x / 4x)
              </label>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Uraian Tugas Lembur</label>
              <textarea
                required
                rows={2}
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
                placeholder="Pekerjaan deploy sistem, closing akhir bulan..."
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-amber-600 text-white font-bold rounded-xl shadow-xs hover:bg-amber-700 transition"
            >
              Kirim Pengajuan Lembur
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: KASBON */}
      {activeTab === 'kasbon' && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-xs uppercase text-slate-900 border-b border-slate-100 pb-3">
            Form Pinjaman Kasbon (Potong Gaji)
          </h3>
          <form onSubmit={handleSubmitKasbon} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Jumlah Kasbon (Rp)</label>
              <input
                type="number"
                step="50000"
                min="100000"
                required
                value={kasbonAmount}
                onChange={(e) => setKasbonAmount(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Jumlah Cicilan Bulan</label>
              <select
                value={kasbonInstalments}
                onChange={(e) => setKasbonInstalments(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              >
                <option value="1">1 Bulan (Lunas di Payroll Berikutnya)</option>
                <option value="2">2 Bulan</option>
                <option value="3">3 Bulan</option>
                <option value="6">6 Bulan</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Keperluan Pinjaman</label>
              <textarea
                required
                rows={2}
                value={kasbonReason}
                onChange={(e) => setKasbonReason(e.target.value)}
                placeholder="Biaya perbaikan kendaraan, biaya sekolah..."
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-purple-600 text-white font-bold rounded-xl shadow-xs hover:bg-purple-700 transition"
            >
              Kirim Pengajuan Kasbon
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: REIMBURSEMENT */}
      {activeTab === 'reimbursement' && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-xs uppercase text-slate-900 border-b border-slate-100 pb-3">
            Form Klaim Reimbursement
          </h3>
          <form onSubmit={handleSubmitReimbursement} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Kategori</label>
                <select
                  value={reimbCategory}
                  onChange={(e) => setReimbCategory(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                >
                  <option value="Transport">Transport / Bensin</option>
                  <option value="Makan Lembur">Makan Lembur</option>
                  <option value="ATK & Operasional">ATK & Operasional</option>
                  <option value="Medis">Medis / Kesehatan</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Nominal (Rp)</label>
                <input
                  type="number"
                  required
                  value={reimbAmount}
                  onChange={(e) => setReimbAmount(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Deskripsi Klaim</label>
              <input
                type="text"
                required
                value={reimbDesc}
                onChange={(e) => setReimbDesc(e.target.value)}
                placeholder="Grab ke klien PT ABC..."
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Foto Bukti / Struk</label>
              {receiptPhoto ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-300 aspect-16/9 bg-black">
                  <img src={receiptPhoto} alt="Struk" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setReceiptPhoto(null)}
                    className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] px-2 py-1 rounded"
                  >
                    Hapus Foto
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center gap-2 text-slate-600 hover:border-emerald-500 font-medium"
                >
                  <Camera size={18} className="text-emerald-600" />
                  <span>Ambil Foto Struk via Kamera / Galeri</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-xs hover:bg-emerald-700 transition"
            >
              Kirim Klaim Biaya
            </button>
          </form>
        </div>
      )}

      {/* REQUEST HISTORY LIST */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="font-bold text-xs uppercase text-slate-900 flex items-center justify-between">
          <span>{t.dashboard.pendingApprovals} / History</span>
          <span className="text-[10px] text-slate-400">{t.common.all}</span>
        </h3>

        {history.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-4">Belum ada riwayat pengajuan.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex justify-between items-start text-xs">
                <div>
                  <div className="font-bold text-slate-900">
                    {h.leave_type_name || (h.amount ? formatCurrency(h.amount) : `${h.actual_hours || h.planned_hours} ${t.common.hours}`)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {h.start_date ? `${formatDate(h.start_date)} - ${formatDate(h.end_date)} (${h.total_days} ${t.common.days})` : formatDate(h.date || h.created_at)}
                  </div>
                  {h.reason && <p className="text-[10px] text-slate-600 italic mt-1">"{h.reason}"</p>}
                  {h.rejection_note && <p className="text-[10px] text-rose-600 font-medium mt-1">Catatan: {h.rejection_note}</p>}
                </div>
                <div>{statusBadge(h.status)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(photo) => setReceiptPhoto(photo)}
        title="Ambil Foto Nota / Struk"
        facingMode="environment"
      />
    </div>
  );
};

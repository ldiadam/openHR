import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  MapPin,
  DollarSign,
  ShieldAlert,
  Save,
  CheckCircle2,
  AlertCircle,
  Mail,
  FileText,
  Clock,
  Camera,
} from 'lucide-react';
import { apiFetch, formatRupiah, formatDateIndo } from '../api';

export const HRSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'payroll' | 'attendance' | 'branches' | 'company' | 'audit'>('payroll');
  const [payrollSettings, setPayrollSettings] = useState<any>(null);
  const [attendancePolicy, setAttendancePolicy] = useState<{ require_selfie: boolean; require_location: boolean }>({
    require_selfie: false,
    require_location: true,
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit branch modal state
  const [selectedBranch, setSelectedBranch] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, bRes, cRes, aRes, attRes] = await Promise.all([
        apiFetch('/settings/payroll'),
        apiFetch('/settings/branches'),
        apiFetch('/settings/company'),
        apiFetch('/settings/audit-logs'),
        apiFetch('/settings/attendance').catch(() => ({ require_selfie: false, require_location: true })),
      ]);
      setPayrollSettings(pRes.settings || {});
      setBranches(bRes.branches || []);
      setCompany(cRes.company || {});
      setAuditLogs(aRes.logs || []);
      setAttendancePolicy(attRes);
    } catch (err: any) {
      console.warn('Settings load err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSavePayrollSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/settings/payroll', {
        method: 'PUT',
        body: JSON.stringify(payrollSettings),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSaveAttendancePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/settings/attendance', {
        method: 'PUT',
        body: JSON.stringify(attendancePolicy),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleUpdateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;
    try {
      const res = await apiFetch(`/settings/branches/${selectedBranch.id}`, {
        method: 'PUT',
        body: JSON.stringify(selectedBranch),
      });
      setMsg({ type: 'success', text: res.message });
      setSelectedBranch(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pengaturan Sistem (Settings)</h1>
        <p className="text-xs text-slate-500">
          Aturan Payroll Indonesia (BPJS & Pajak TER), Geofence Cabang, Purelymail, dan Audit Log
        </p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2 shadow-2xs ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold text-slate-500">
        <button
          onClick={() => setActiveTab('payroll')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <DollarSign size={15} />
          <span>Aturan Penggajian Indonesia</span>
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'branches' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <MapPin size={15} />
          <span>Cabang & Geofence (Presensi)</span>
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'attendance' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Clock size={15} />
          <span>Kebijakan Presensi & Selfie</span>
        </button>
        <button
          onClick={() => setActiveTab('company')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'company' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Building size={15} />
          <span>Profil Perusahaan</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <ShieldAlert size={15} />
          <span>Audit Log</span>
        </button>
      </div>

      {/* TAB 1: PAYROLL RULES */}
      {activeTab === 'payroll' && payrollSettings && (
        <form onSubmit={handleSavePayrollSettings} className="space-y-5">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Tarif & Batas Upah BPJS Indonesia</h3>
                <p className="text-xs text-slate-400">
                  Dapat disesuaikan sewaktu-waktu sesuai ketentuan peraturan pemerintah terbaru tanpa mengubah kode
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-1 rounded">
                Efektif: {payrollSettings.effective_date}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS Kesehatan - Perusahaan (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payrollSettings.bpjs_kesehatan_employer_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_kesehatan_employer_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 4.0%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS Kesehatan - Pegawai (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payrollSettings.bpjs_kesehatan_employee_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_kesehatan_employee_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 1.0%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Batas Maksimal Upah BPJS Kes (Rp)</label>
                <input
                  type="number"
                  value={payrollSettings.bpjs_kesehatan_wage_cap}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_kesehatan_wage_cap: parseFloat(e.target.value),
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: Rp 12.000.000</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS TK JHT - Perusahaan (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payrollSettings.bpjs_tk_jht_employer_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_tk_jht_employer_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 3.7%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS TK JHT - Pegawai (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payrollSettings.bpjs_tk_jht_employee_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_tk_jht_employee_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 2.0%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS TK JP (Pensiun) - Pegawai (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payrollSettings.bpjs_tk_jp_employee_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_tk_jp_employee_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 1.0%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Batas Maksimal Upah JP (Rp)</label>
                <input
                  type="number"
                  value={payrollSettings.bpjs_tk_jp_wage_cap}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_tk_jp_wage_cap: parseFloat(e.target.value),
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Batas 2026: Rp 10.042.300</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS TK JKK - Perusahaan (%)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={payrollSettings.bpjs_tk_jkk_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_tk_jkk_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar Kelompok 1: 0.24%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">BPJS TK JKM - Perusahaan (%)</label>
                <input
                  type="number"
                  step="0.001"
                  value={payrollSettings.bpjs_tk_jkm_rate * 100}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      bpjs_tk_jkm_rate: parseFloat(e.target.value) / 100,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 0.30%</span>
              </div>
            </div>
          </div>

          {/* Overtime & Deduction Rules */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">
              Perhitungan Lembur (UU Ketenagakerjaan / PP 35/2021) & Pemotong Keterlambatan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Pembagi Upah Lembur (Divider)</label>
                <input
                  type="number"
                  value={payrollSettings.overtime_divider}
                  onChange={(e) =>
                    setPayrollSettings({ ...payrollSettings, overtime_divider: parseFloat(e.target.value) })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 173 (Upah Sejam = Gaji / 173)</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Lembur Jam Pertama (Hari Kerja)</label>
                <input
                  type="number"
                  step="0.1"
                  value={payrollSettings.overtime_weekday_first_hour_mult}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      overtime_weekday_first_hour_mult: parseFloat(e.target.value),
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 1.5x upah sejam</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Lembur Jam Berikutnya (Hari Kerja)</label>
                <input
                  type="number"
                  step="0.1"
                  value={payrollSettings.overtime_weekday_next_hour_mult}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      overtime_weekday_next_hour_mult: parseFloat(e.target.value),
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">Standar: 2.0x upah sejam</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="lateDed"
                  checked={payrollSettings.late_deduction_enabled === 1}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      late_deduction_enabled: e.target.checked ? 1 : 0,
                    })
                  }
                  className="rounded text-blue-600"
                />
                <label htmlFor="lateDed" className="text-slate-800 font-semibold">
                  Aktifkan Pemotongan Gaji untuk Keterlambatan
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cbDeduct"
                  checked={payrollSettings.cuti_bersama_deducts_annual === 1}
                  onChange={(e) =>
                    setPayrollSettings({
                      ...payrollSettings,
                      cuti_bersama_deducts_annual: e.target.checked ? 1 : 0,
                    })
                  }
                  className="rounded text-blue-600"
                />
                <label htmlFor="cbDeduct" className="text-slate-800 font-semibold">
                  Cuti Bersama Pemerintah Memotong Saldo Cuti Tahunan
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              <Save size={16} />
              <span>Simpan Konfigurasi Payroll</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: BRANCHES & GEOFENCE */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((b) => (
              <div key={b.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-blue-600" />
                    <h3 className="font-extrabold text-slate-900 text-sm">{b.name}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedBranch(b)}
                    className="text-xs text-blue-600 font-bold hover:underline"
                  >
                    Ubah Geofence
                  </button>
                </div>
                <p className="text-xs text-slate-500">{b.address || 'Alamat Cabang'}</p>

                <div className="bg-slate-50 p-3 rounded-2xl grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Koordinat GPS</span>
                    <span className="font-mono font-bold text-slate-800 text-[11px]">
                      {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Radius Geofence</span>
                    <span className="font-bold text-slate-800">{b.radius_meters} Meter</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">UMK / UMP Wilayah</span>
                    <span className="font-bold text-slate-800">{formatRupiah(b.umk_amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* EDIT BRANCH MODAL */}
          {selectedBranch && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                <h3 className="font-bold text-base text-slate-900">Ubah Lokasi & Geofence Cabang</h3>
                <form onSubmit={handleUpdateBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Nama Cabang</label>
                    <input
                      type="text"
                      required
                      value={selectedBranch.name}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, name: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        required
                        value={selectedBranch.latitude}
                        onChange={(e) => setSelectedBranch({ ...selectedBranch, latitude: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        required
                        value={selectedBranch.longitude}
                        onChange={(e) => setSelectedBranch({ ...selectedBranch, longitude: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Radius Presensi Valid (Meter)</label>
                    <input
                      type="number"
                      required
                      value={selectedBranch.radius_meters}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, radius_meters: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Standar UMK / UMP (Rp)</label>
                    <input
                      type="number"
                      required
                      value={selectedBranch.umk_amount}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, umk_amount: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBranch(null)}
                      className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700"
                    >
                      Simpan Cabang
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: ATTENDANCE & SELFIE POLICY */}
      {activeTab === 'attendance' && (
        <form onSubmit={handleSaveAttendancePolicy} className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-6">
            <div>
              <h3 className="font-bold text-base text-slate-900">Kebijakan Presensi Masuk & Verifikasi</h3>
              <p className="text-xs text-slate-500 mt-1">
                Atur apakah pengambilan foto selfie bersifat wajib atau opsional bagi karyawan saat melakukan presensi masuk di ponsel.
              </p>
            </div>

            <div className="space-y-4">
              {/* Option 1: Selfie Requirement (Toggleable by Admin) */}
              <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                  <Camera size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="selfie_toggle" className="font-bold text-sm text-slate-900 cursor-pointer">
                      Wajibkan Foto Selfie Saat Presensi Masuk
                    </label>
                    <input
                      id="selfie_toggle"
                      type="checkbox"
                      checked={attendancePolicy.require_selfie}
                      onChange={(e) =>
                        setAttendancePolicy({ ...attendancePolicy, require_selfie: e.target.checked })
                      }
                      className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900 cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {attendancePolicy.require_selfie ? (
                      <span className="text-emerald-700 font-medium">
                        Aktif: Karyawan wajib menyalakan kamera depan dan mengambil foto selfie setiap kali melakukan presensi masuk (Clock In).
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        Opsional (Nonaktif): Karyawan dapat langsung melakukan presensi masuk hanya dengan verifikasi lokasi GPS tanpa harus mengambil foto. Opsi selfie tetap disediakan sebagai fitur opsional.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Option 2: Location Requirement (Strict - Cannot be disabled) */}
              <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                  <MapPin size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Verifikasi Lokasi GPS (Wajib & Mengikat)
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      Selalu Wajib
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Presensi wajib menyertakan koordinat GPS nyata. Jika karyawan memblokir izin lokasi browser atau GPS perangkat nonaktif, tombol presensi otomatis terkunci dan karyawan tidak dapat melakukan clock in/out.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Save size={15} />
                <span>Simpan Pengaturan Presensi</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: COMPANY & PURELYMAIL */}
      {activeTab === 'company' && company && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">
              Identitas Badan Usaha
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Nama Perusahaan</span>
                <span className="font-bold text-slate-900 text-sm">{company.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">NPWP Perusahaan</span>
                <span className="font-mono font-bold text-slate-800">{company.npwp}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Kode BPJS Kesehatan</span>
                <span className="font-mono font-bold text-slate-800">{company.bpjs_kesehatan_code}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Kode BPJS Ketenagakerjaan</span>
                <span className="font-mono font-bold text-slate-800">{company.bpjs_tk_code}</span>
              </div>
              <div className="md:col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase">Alamat Kantor Pusat</span>
                <span className="font-medium text-slate-800">{company.address}</span>
              </div>
            </div>
          </div>

          {/* Purelymail Integration Status */}
          <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
              <Mail size={18} className="text-blue-600" />
              <span>Integrasi Onboarding Purelymail API v0 & SMTP</span>
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">
              openHR terintegrasi langsung dengan API resmi Purelymail untuk membuat akun kotak surat (mailbox) karyawan secara otomatis, dan mengirimkan email undangan aktivasi melalui Purelymail SMTP (<code>smtp.purelymail.com:587</code>).
            </p>
            <div className="bg-white p-4 rounded-2xl border border-blue-200 text-xs font-mono text-slate-700 space-y-1">
              <div>API Endpoint: <code>POST https://purelymail.com/api/v0/createUser</code></div>
              <div>SMTP Server: <code>smtp.purelymail.com:587 (STARTTLS)</code></div>
              <div>Cloudflare Secret: <code>wrangler secret put PURELYMAIL_API_TOKEN</code></div>
              <div>Cloudflare Secret: <code>wrangler secret put PURELYMAIL_SMTP_PASS</code></div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Jejak Audit Sistem (Audit Log)</h3>
            <span className="text-xs text-slate-400">Pencatatan perubahan gaji, koreksi presensi, dan penguncian payroll</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Waktu</th>
                  <th className="py-3 px-4 font-bold">Pengguna</th>
                  <th className="py-3 px-4 font-bold">Aksi</th>
                  <th className="py-3 px-4 font-bold">Entitas</th>
                  <th className="py-3 px-4 font-bold">Detail Perubahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{log.user_email || 'System'}</td>
                    <td className="py-3 px-4 font-semibold text-blue-600">{log.action}</td>
                    <td className="py-3 px-4 text-slate-700">{log.entity_type}</td>
                    <td className="py-3 px-4 font-mono text-[10px] text-slate-500 max-w-xs truncate">
                      {log.new_values || log.old_values || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

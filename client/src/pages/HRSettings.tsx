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
  Plus,
  Trash2,
  Edit2,
  Navigation,
} from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';

export const HRSettings: React.FC = () => {
  const { t, formatCurrency, formatDate } = useLanguage();
  const { refreshCompany, updateCompanyLocal } = useCompany();
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
  const [savingCompany, setSavingCompany] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit branch modal state
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [gettingGps, setGettingGps] = useState(false);

  const [newBranch, setNewBranch] = useState({
    name: '',
    address: '',
    latitude: -6.2088,
    longitude: 106.8456,
    radius_meters: 100,
    umk_amount: 5067381,
    timezone: 'Asia/Jakarta',
  });

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

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCompany(true);
    setMsg(null);
    try {
      const res = await apiFetch('/settings/company', {
        method: 'PUT',
        body: JSON.stringify(company),
      });
      updateCompanyLocal(company);
      await refreshCompany();
      setMsg({ type: 'success', text: res.message || 'Profil perusahaan & branding berhasil disimpan!' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menyimpan profil perusahaan' });
    } finally {
      setSavingCompany(false);
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

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingBranch(true);
    setMsg(null);
    try {
      const res = await apiFetch('/settings/branches', {
        method: 'POST',
        body: JSON.stringify(newBranch),
      });
      setMsg({ type: 'success', text: res.message || 'Cabang baru berhasil ditambahkan' });
      setShowAddBranchModal(false);
      setNewBranch({
        name: '',
        address: '',
        latitude: -6.2088,
        longitude: 106.8456,
        radius_meters: 100,
        umk_amount: 5067381,
        timezone: 'Asia/Jakarta',
      });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menambahkan cabang baru' });
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleDeleteBranch = async (branchId: string, branchName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus cabang "${branchName}"?`)) {
      return;
    }
    setDeletingBranchId(branchId);
    setMsg(null);
    try {
      const res = await apiFetch(`/settings/branches/${branchId}`, {
        method: 'DELETE',
      });
      setMsg({ type: 'success', text: res.message || `Cabang "${branchName}" berhasil dihapus` });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menghapus cabang' });
    } finally {
      setDeletingBranchId(null);
    }
  };

  const handleGetGps = (target: 'new' | 'edit') => {
    if (!navigator.geolocation) {
      alert('Geolokasi tidak didukung oleh peramban Anda.');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        if (target === 'new') {
          setNewBranch((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        } else if (selectedBranch) {
          setSelectedBranch((prev: any) => ({ ...prev, latitude: lat, longitude: lng }));
        }
        setGettingGps(false);
      },
      (err) => {
        alert(`Gagal mengambil koordinat GPS: ${err.message}`);
        setGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t.settings.title}</h1>
        <p className="text-xs text-slate-500">
          {t.settings.subtitle}
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
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <DollarSign size={15} />
          <span>{t.settings.tabPayroll}</span>
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'branches' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <MapPin size={15} />
          <span>{t.settings.tabBranches}</span>
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'attendance' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Clock size={15} />
          <span>{t.settings.tabAttendance}</span>
        </button>
        <button
          onClick={() => setActiveTab('company')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'company' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Building size={15} />
          <span>{t.settings.tabCompany}</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <ShieldAlert size={15} />
          <span>{t.settings.tabAudit}</span>
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

      {/* TAB 2: BRANCHES & GEOFENCE (FULL CRUD) */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Kelola Kantor Cabang & Geofence</h3>
              <p className="text-xs text-slate-400">
                Atur titik koordinat GPS presensi, radius validasi geofence, dan standar UMK/UMP per cabang.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddBranchModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span>Tambah Cabang Baru</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((b) => (
              <div key={b.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-blue-600 shrink-0" />
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">{b.name}</h3>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-semibold">
                        {b.timezone || 'Asia/Jakarta'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedBranch({ ...b })}
                      className="px-2.5 py-1 text-xs text-blue-600 font-bold hover:bg-blue-50 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 size={13} />
                      <span>Ubah</span>
                    </button>
                    <button
                      onClick={() => handleDeleteBranch(b.id, b.name)}
                      disabled={deletingBranchId === b.id}
                      className="px-2 py-1 text-xs text-rose-600 font-bold hover:bg-rose-50 rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                      <span>{deletingBranchId === b.id ? '...' : 'Hapus'}</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{b.address || 'Alamat Cabang belum diatur'}</p>

                <div className="bg-slate-50 p-3 rounded-2xl grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Koordinat GPS</span>
                    <span className="font-mono font-bold text-slate-800 text-[11px] block truncate">
                      {typeof b.latitude === 'number' ? b.latitude.toFixed(4) : b.latitude},{' '}
                      {typeof b.longitude === 'number' ? b.longitude.toFixed(4) : b.longitude}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Radius Geofence</span>
                    <span className="font-bold text-slate-800">{b.radius_meters} Meter</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">UMK Wilayah</span>
                    <span className="font-bold text-slate-800">{formatCurrency(b.umk_amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CREATE BRANCH MODAL */}
          {showAddBranchModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-base text-slate-900">Tambah Cabang Baru</h3>
                  <button
                    onClick={() => setShowAddBranchModal(false)}
                    className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nama Cabang *</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Kantor Cabang Bandung"
                      value={newBranch.name}
                      onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Alamat Lengkap</label>
                    <input
                      type="text"
                      placeholder="Contoh: Jl. Dago Atas No. 88, Bandung"
                      value={newBranch.address}
                      onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11px]">Koordinat Titik Presensi</span>
                      <button
                        type="button"
                        onClick={() => handleGetGps('new')}
                        disabled={gettingGps}
                        className="flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <Navigation size={12} />
                        <span>{gettingGps ? 'Mendeteksi...' : 'Ambil Lokasi Saat Ini (GPS)'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={newBranch.latitude}
                          onChange={(e) => setNewBranch({ ...newBranch, latitude: parseFloat(e.target.value) || 0 })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={newBranch.longitude}
                          onChange={(e) => setNewBranch({ ...newBranch, longitude: parseFloat(e.target.value) || 0 })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Radius Geofence (Meter)</label>
                      <input
                        type="number"
                        min="10"
                        max="5000"
                        required
                        value={newBranch.radius_meters}
                        onChange={(e) => setNewBranch({ ...newBranch, radius_meters: parseInt(e.target.value, 10) || 100 })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Zona Waktu (Timezone)</label>
                      <select
                        value={newBranch.timezone}
                        onChange={(e) => setNewBranch({ ...newBranch, timezone: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      >
                        <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                        <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                        <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Standar UMK / UMP Wilayah (Rp)</label>
                    <input
                      type="number"
                      step="50000"
                      required
                      value={newBranch.umk_amount}
                      onChange={(e) => setNewBranch({ ...newBranch, umk_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddBranchModal(false)}
                      className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={creatingBranch}
                      className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                    >
                      {creatingBranch ? 'Menyimpan...' : 'Simpan Cabang Baru'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* EDIT BRANCH MODAL */}
          {selectedBranch && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-base text-slate-900">Ubah Lokasi & Geofence Cabang</h3>
                  <button
                    onClick={() => setSelectedBranch(null)}
                    className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleUpdateBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nama Cabang</label>
                    <input
                      type="text"
                      required
                      value={selectedBranch.name}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, name: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Alamat Lengkap</label>
                    <input
                      type="text"
                      value={selectedBranch.address || ''}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, address: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11px]">Koordinat Titik Presensi</span>
                      <button
                        type="button"
                        onClick={() => handleGetGps('edit')}
                        disabled={gettingGps}
                        className="flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <Navigation size={12} />
                        <span>{gettingGps ? 'Mendeteksi...' : 'Ambil Lokasi Saat Ini (GPS)'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={selectedBranch.latitude}
                          onChange={(e) => setSelectedBranch({ ...selectedBranch, latitude: parseFloat(e.target.value) || 0 })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={selectedBranch.longitude}
                          onChange={(e) => setSelectedBranch({ ...selectedBranch, longitude: parseFloat(e.target.value) || 0 })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Radius Geofence (Meter)</label>
                      <input
                        type="number"
                        min="10"
                        max="5000"
                        required
                        value={selectedBranch.radius_meters}
                        onChange={(e) => setSelectedBranch({ ...selectedBranch, radius_meters: parseInt(e.target.value, 10) || 100 })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Zona Waktu</label>
                      <select
                        value={selectedBranch.timezone || 'Asia/Jakarta'}
                        onChange={(e) => setSelectedBranch({ ...selectedBranch, timezone: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl"
                      >
                        <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                        <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                        <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Standar UMK / UMP Wilayah (Rp)</label>
                    <input
                      type="number"
                      step="50000"
                      required
                      value={selectedBranch.umk_amount}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, umk_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSelectedBranch(null)}
                      className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 cursor-pointer"
                    >
                      Simpan Perubahan
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
              <h3 className="font-bold text-base text-slate-900">{t.settings.selfiePolicyTitle}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {t.settings.selfiePolicySubtitle}
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
                      {t.settings.requireSelfieLabel}
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
                        {t.settings.requireSelfieActive}
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        {t.settings.requireSelfieOptional}
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
                      {t.settings.gpsPolicyTitle}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      {t.settings.gpsAlwaysMandatory}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {t.settings.gpsPolicyDesc}
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
                <span>{t.settings.saveAttendancePolicy}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: COMPANY & PURELYMAIL */}
      {activeTab === 'company' && company && (
        <form onSubmit={handleSaveCompany} className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Identitas & Branding Badan Usaha</h3>
                <p className="text-xs text-slate-400">
                  Nama perusahaan di bawah ini akan menggantikan branding openHR pada seluruh antarmuka aplikasi.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingCompany}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Save size={14} />
                <span>{savingCompany ? 'Menyimpan...' : 'Simpan Profil Perusahaan'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Nama Brand Perusahaan (Tampil di Aplikasi / Navbar / Login) *
                </label>
                <input
                  type="text"
                  required
                  value={company.name || ''}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  placeholder="Contoh: PT Maju Jaya Sentosa"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Nama Legal Badan Usaha (PT / CV / Firma)
                </label>
                <input
                  type="text"
                  value={company.legal_name || ''}
                  onChange={(e) => setCompany({ ...company, legal_name: e.target.value })}
                  placeholder="Contoh: PT Maju Jaya Sentosa Tbk"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  NPWP Perusahaan (16 Digit)
                </label>
                <input
                  type="text"
                  value={company.npwp || ''}
                  onChange={(e) => setCompany({ ...company, npwp: e.target.value })}
                  placeholder="01.234.567.8-012.000"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Email Resmi Perusahaan
                </label>
                <input
                  type="email"
                  value={company.email || ''}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  placeholder="hr@perusahaan.co.id"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Kode Badan Usaha BPJS Kesehatan
                </label>
                <input
                  type="text"
                  value={company.bpjs_kesehatan_code || ''}
                  onChange={(e) => setCompany({ ...company, bpjs_kesehatan_code: e.target.value })}
                  placeholder="00012345"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Kode Pendaftaran BPJS Ketenagakerjaan
                </label>
                <input
                  type="text"
                  value={company.bpjs_tk_code || ''}
                  onChange={(e) => setCompany({ ...company, bpjs_tk_code: e.target.value })}
                  placeholder="99887766"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Nomor Telepon Kantor
                </label>
                <input
                  type="text"
                  value={company.phone || ''}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  placeholder="+62 21 555 1234"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  Alamat Kantor Pusat
                </label>
                <input
                  type="text"
                  value={company.address || ''}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  placeholder="Jl. Jend. Sudirman Kav. 52, Jakarta"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
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
              Sistem HR terintegrasi langsung dengan API resmi Purelymail untuk membuat akun kotak surat (mailbox) karyawan secara otomatis, dan mengirimkan email undangan aktivasi melalui Purelymail SMTP (<code>smtp.purelymail.com:587</code>).
            </p>
            <div className="bg-white p-4 rounded-2xl border border-blue-200 text-xs font-mono text-slate-700 space-y-1">
              <div>API Endpoint: <code>POST https://purelymail.com/api/v0/createUser</code></div>
              <div>SMTP Server: <code>smtp.purelymail.com:587 (STARTTLS)</code></div>
              <div>Cloudflare Secret: <code>wrangler secret put PURELYMAIL_API_TOKEN</code></div>
              <div>Cloudflare Secret: <code>wrangler secret put PURELYMAIL_SMTP_PASS</code></div>
            </div>
          </div>
        </form>
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

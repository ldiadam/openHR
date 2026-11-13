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
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { LocationPickerMap } from '../components/LocationPickerMap';

export const HRSettings: React.FC = () => {
  const { t, tr, formatCurrency, formatDate } = useLanguage();
  const { refreshCompany, updateCompanyLocal } = useCompany();
  const [activeTab, setActiveTab] = useState<'payroll' | 'attendance' | 'branches' | 'company' | 'audit' | 'departments' | 'notifications'>('payroll');
  const [payrollSettings, setPayrollSettings] = useState<any>(null);
  const [attendancePolicy, setAttendancePolicy] = useState<{ require_selfie: boolean; require_location: boolean }>({
    require_selfie: false,
    require_location: true,
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [deptForm, setDeptForm] = useState({ id: '', name: '', code: '' });
  const [deptBusy, setDeptBusy] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ api: any; smtp: any } | null>(null);
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
      const [pRes, bRes, cRes, aRes, attRes, dRes] = await Promise.all([
        apiFetch('/settings/payroll'),
        apiFetch('/settings/branches'),
        apiFetch('/settings/company'),
        apiFetch('/settings/audit-logs'),
        apiFetch('/settings/attendance').catch(() => ({ require_selfie: false, require_location: true })),
        apiFetch('/settings/departments').catch(() => ({ departments: [] })),
      ]);
      setPayrollSettings(pRes.settings || {});
      setBranches(bRes.branches || []);
      setCompany(cRes.company || {});
      setAuditLogs(aRes.logs || []);
      setAttendancePolicy(attRes);
      setDepartments(dRes.departments || []);
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

  const handleSaveDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deptForm.name.trim()) return;
    setDeptBusy(true);
    setMsg(null);
    try {
      if (deptForm.id) {
        await apiFetch(`/settings/departments/${deptForm.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: deptForm.name.trim(), code: deptForm.code.trim() || null }),
        });
      } else {
        await apiFetch('/settings/departments', {
          method: 'POST',
          body: JSON.stringify({ name: deptForm.name.trim(), code: deptForm.code.trim() || null }),
        });
      }
      setDeptForm({ id: '', name: '', code: '' });
      const res = await apiFetch('/settings/departments');
      setDepartments(res.departments || []);
      setMsg({ type: 'success', text: tr('Departemen berhasil disimpan', 'Department saved successfully') });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menyimpan departemen', 'Failed to save department') });
    } finally {
      setDeptBusy(false);
    }
  };

  const handleDeleteDepartment = async (dept: any) => {
    if (!window.confirm(tr(`Hapus departemen "${dept.name}"?`, `Delete department "${dept.name}"?`))) return;
    setDeptBusy(true);
    try {
      await apiFetch(`/settings/departments/${dept.id}`, { method: 'DELETE' });
      const res = await apiFetch('/settings/departments');
      setDepartments(res.departments || []);
      setMsg({ type: 'success', text: tr('Departemen berhasil dihapus', 'Department deleted') });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menghapus departemen', 'Failed to delete department') });
    } finally {
      setDeptBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'notifications') return;
    apiFetch('/settings/notifications')
      .then((res) => setNotifications(res.notifications || []))
      .catch(() => setNotifications([]));
  }, [activeTab]);

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
      setMsg({ type: 'success', text: res.message || tr('Profil perusahaan & branding berhasil disimpan!', 'Company profile & branding saved successfully!') });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menyimpan profil perusahaan', 'Failed to save company profile') });
    } finally {
      setSavingCompany(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<any>('/settings/company/logo', {
        method: 'POST',
        body: formData,
      });
      const updated = { ...company, logo_url: res.logo_url };
      setCompany(updated);
      updateCompanyLocal({ logo_url: res.logo_url });
      await refreshCompany();
      setMsg({ type: 'success', text: res.message || tr('Logo perusahaan berhasil diunggah.', 'Company logo uploaded successfully.') });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal mengunggah logo.', 'Failed to upload logo.') });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    setUploadingLogo(true);
    setMsg(null);
    try {
      const res = await apiFetch<any>('/settings/company/logo', { method: 'DELETE' });
      const updated = { ...company, logo_url: null };
      setCompany(updated);
      updateCompanyLocal({ logo_url: undefined });
      await refreshCompany();
      setMsg({ type: 'success', text: res.message || tr('Logo perusahaan berhasil dihapus.', 'Company logo removed successfully.') });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menghapus logo.', 'Failed to remove logo.') });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleTestPurelymail = async () => {
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await apiFetch<any>('/settings/test-purelymail', {
        method: 'POST',
        body: JSON.stringify({
          purelymail_api_token: company.purelymail_api_token,
          purelymail_domain: company.purelymail_domain,
          purelymail_from_address: company.purelymail_from_address,
          purelymail_smtp_pass: company.purelymail_smtp_pass,
        }),
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        api: { status: 'error', message: err.message || tr('Gagal menghubungi server', 'Failed to contact the server') },
        smtp: { status: 'error', message: err.message || tr('Gagal menghubungi server', 'Failed to contact the server') },
      });
    } finally {
      setTestingEmail(false);
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
      setMsg({ type: 'success', text: res.message || tr('Cabang baru berhasil ditambahkan', 'New branch added successfully') });
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
      setMsg({ type: 'error', text: err.message || tr('Gagal menambahkan cabang baru', 'Failed to add new branch') });
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleDeleteBranch = async (branchId: string, branchName: string) => {
    if (!window.confirm(tr(`Apakah Anda yakin ingin menghapus cabang "${branchName}"?`, `Are you sure you want to delete the branch "${branchName}"?`))) {
      return;
    }
    setDeletingBranchId(branchId);
    setMsg(null);
    try {
      const res = await apiFetch(`/settings/branches/${branchId}`, {
        method: 'DELETE',
      });
      setMsg({ type: 'success', text: res.message || tr(`Cabang "${branchName}" berhasil dihapus`, `Branch "${branchName}" deleted successfully`) });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menghapus cabang', 'Failed to delete branch') });
    } finally {
      setDeletingBranchId(null);
    }
  };

  const handleGetGps = (target: 'new' | 'edit') => {
    if (!navigator.geolocation) {
      alert(tr('Geolokasi tidak didukung oleh peramban Anda.', 'Geolocation is not supported by your browser.'));
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
        alert(tr(`Gagal mengambil koordinat GPS: ${err.message}`, `Failed to get GPS coordinates: ${err.message}`));
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
      <div className="flex flex-wrap border-b border-slate-200 gap-x-6 gap-y-1 text-xs font-bold text-slate-500">
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
          onClick={() => setActiveTab('departments')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'departments' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Building size={15} />
          <span>{tr('Departemen', 'Departments')}</span>
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
        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'notifications' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Mail size={15} />
          <span>{tr('Notifikasi', 'Notifications')}</span>
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[0, 1].map((block) => (
            <div
              key={block}
              className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="h-4 w-56 max-w-[70%] animate-pulse rounded bg-slate-200" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {[0, 1, 2, 3, 4, 5].map((field) => (
                  <div key={field} className="space-y-1.5">
                    <div className="h-2.5 w-28 animate-pulse rounded bg-slate-200" />
                    <div className="h-9 w-full animate-pulse rounded-xl bg-slate-100" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <div className="h-9 w-40 animate-pulse rounded-xl bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 1: PAYROLL RULES */}
      {!loading && activeTab === 'payroll' && payrollSettings && (
        <form onSubmit={handleSavePayrollSettings} className="space-y-5">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{tr('Tarif & Batas Upah BPJS Indonesia', 'BPJS Indonesia Wage Rates & Caps')}</h3>
                <p className="text-xs text-slate-400">
                  {tr('Dapat disesuaikan sewaktu-waktu sesuai ketentuan peraturan pemerintah terbaru tanpa mengubah kode', 'Adjustable at any time to match the latest government regulations without changing code')}
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-1 rounded">
                {tr('Efektif: ', 'Effective: ')}{payrollSettings.effective_date}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS Kesehatan - Perusahaan (%)', 'BPJS Kesehatan - Employer (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 4.0%', 'Standard: 4.0%')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS Kesehatan - Pegawai (%)', 'BPJS Kesehatan - Employee (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 1.0%', 'Standard: 1.0%')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Batas Maksimal Upah BPJS Kes (Rp)', 'BPJS Kesehatan Max Wage Cap (Rp)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: Rp 12.000.000', 'Standard: Rp 12.000.000')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS TK JHT - Perusahaan (%)', 'BPJS TK JHT - Employer (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 3.7%', 'Standard: 3.7%')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS TK JHT - Pegawai (%)', 'BPJS TK JHT - Employee (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 2.0%', 'Standard: 2.0%')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS TK JP (Pensiun) - Pegawai (%)', 'BPJS TK JP (Pension) - Employee (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 1.0%', 'Standard: 1.0%')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Batas Maksimal Upah JP (Rp)', 'JP Max Wage Cap (Rp)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Batas 2026: Rp 10.042.300', '2026 Cap: Rp 10.042.300')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS TK JKK - Perusahaan (%)', 'BPJS TK JKK - Employer (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar Kelompok 1: 0.24%', 'Standard Group 1: 0.24%')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('BPJS TK JKM - Perusahaan (%)', 'BPJS TK JKM - Employer (%)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 0.30%', 'Standard: 0.30%')}</span>
              </div>
            </div>
          </div>

          {/* Overtime & Deduction Rules */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">
              {tr('Perhitungan Lembur (UU Ketenagakerjaan / PP 35/2021) & Pemotong Keterlambatan', 'Overtime Calculation (Labor Law / PP 35/2021) & Late Deduction')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Pembagi Upah Lembur (Divider)', 'Overtime Wage Divider')}</label>
                <input
                  type="number"
                  value={payrollSettings.overtime_divider}
                  onChange={(e) =>
                    setPayrollSettings({ ...payrollSettings, overtime_divider: parseFloat(e.target.value) })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <span className="text-[10px] text-slate-400">{tr('Standar: 173 (Upah Sejam = Gaji / 173)', 'Standard: 173 (Hourly Wage = Salary / 173)')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Lembur Jam Pertama (Hari Kerja)', 'Overtime First Hour (Workday)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 1.5x upah sejam', 'Standard: 1.5x hourly wage')}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Lembur Jam Berikutnya (Hari Kerja)', 'Overtime Subsequent Hours (Workday)')}</label>
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
                <span className="text-[10px] text-slate-400">{tr('Standar: 2.0x upah sejam', 'Standard: 2.0x hourly wage')}</span>
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
                  {tr('Aktifkan Pemotongan Gaji untuk Keterlambatan', 'Enable Salary Deduction for Lateness')}
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
                  {tr('Cuti Bersama Pemerintah Memotong Saldo Cuti Tahunan', 'Government Collective Leave Deducts Annual Leave Balance')}
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
              <span>{tr('Simpan Konfigurasi Payroll', 'Save Payroll Configuration')}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: BRANCHES & GEOFENCE (FULL CRUD) */}
      {!loading && activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">{tr('Kelola Kantor Cabang & Geofence', 'Manage Branch Offices & Geofence')}</h3>
              <p className="text-xs text-slate-400">
                {tr('Atur titik koordinat GPS presensi, radius validasi geofence, dan standar UMK/UMP per cabang.', 'Set attendance GPS coordinates, geofence validation radius, and UMK/UMP standards per branch.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddBranchModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span>{tr('Tambah Cabang Baru', 'Add New Branch')}</span>
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
                      <span>{tr('Ubah', 'Edit')}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteBranch(b.id, b.name)}
                      disabled={deletingBranchId === b.id}
                      className="px-2 py-1 text-xs text-rose-600 font-bold hover:bg-rose-50 rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                      <span>{deletingBranchId === b.id ? '...' : tr('Hapus', 'Delete')}</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{b.address || tr('Alamat Cabang belum diatur', 'Branch address is not set')}</p>

                <div className="bg-slate-50 p-3 rounded-2xl grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">{tr('Koordinat GPS', 'GPS Coordinates')}</span>
                    <span className="font-mono font-bold text-slate-800 text-[11px] block truncate">
                      {typeof b.latitude === 'number' ? b.latitude.toFixed(4) : b.latitude},{' '}
                      {typeof b.longitude === 'number' ? b.longitude.toFixed(4) : b.longitude}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">{tr('Radius Geofence', 'Geofence Radius')}</span>
                    <span className="font-bold text-slate-800">{b.radius_meters} Meter</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">{tr('UMK Wilayah', 'Regional UMK')}</span>
                    <span className="font-bold text-slate-800">{formatCurrency(b.umk_amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CREATE BRANCH MODAL */}
          {showAddBranchModal && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={(event) => {
                if (event.target === event.currentTarget) setShowAddBranchModal(false);
              }}
            >
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-base text-slate-900">{tr('Tambah Cabang Baru', 'Add New Branch')}</h3>
                  <button
                    onClick={() => setShowAddBranchModal(false)}
                    className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Cabang *', 'Branch Name *')}</label>
                    <input
                      type="text"
                      required
                      placeholder={tr('Contoh: Kantor Cabang Bandung', 'Example: Bandung Branch Office')}
                      value={newBranch.name}
                      onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Alamat Lengkap', 'Full Address')}</label>
                    <input
                      type="text"
                      placeholder={tr('Contoh: Jl. Dago Atas No. 88, Bandung', 'Example: Jl. Dago Atas No. 88, Bandung')}
                      value={newBranch.address}
                      onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11px]">{tr('Koordinat Titik Presensi', 'Attendance Point Coordinates')}</span>
                      <button
                        type="button"
                        onClick={() => handleGetGps('new')}
                        disabled={gettingGps}
                        className="flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <Navigation size={12} />
                        <span>{gettingGps ? tr('Mendeteksi...', 'Detecting...') : tr('Ambil Lokasi Saat Ini (GPS)', 'Get Current Location (GPS)')}</span>
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

                    <LocationPickerMap
                      lat={newBranch.latitude}
                      lng={newBranch.longitude}
                      radius={newBranch.radius_meters}
                      onChange={(la, ln) =>
                        setNewBranch({
                          ...newBranch,
                          latitude: Number(la.toFixed(6)),
                          longitude: Number(ln.toFixed(6)),
                        })
                      }
                      className="h-52 w-full overflow-hidden rounded-xl border border-slate-200"
                    />
                    <p className="text-[10px] text-slate-500">
                      {tr('Klik peta atau geser pin untuk memilih titik presensi.', 'Click the map or drag the pin to choose the attendance point.')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Radius Geofence (Meter)', 'Geofence Radius (Meters)')}</label>
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
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Zona Waktu (Timezone)', 'Time Zone (Timezone)')}</label>
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
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Standar UMK / UMP Wilayah (Rp)', 'Regional UMK / UMP Standard (Rp)')}</label>
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
                      {tr('Batal', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={creatingBranch}
                      className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                    >
                      {creatingBranch ? tr('Menyimpan...', 'Saving...') : tr('Simpan Cabang Baru', 'Save New Branch')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* EDIT BRANCH MODAL */}
          {selectedBranch && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={(event) => {
                if (event.target === event.currentTarget) setSelectedBranch(null);
              }}
            >
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-base text-slate-900">{tr('Ubah Lokasi & Geofence Cabang', 'Edit Branch Location & Geofence')}</h3>
                  <button
                    onClick={() => setSelectedBranch(null)}
                    className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleUpdateBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Cabang', 'Branch Name')}</label>
                    <input
                      type="text"
                      required
                      value={selectedBranch.name}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, name: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Alamat Lengkap', 'Full Address')}</label>
                    <input
                      type="text"
                      value={selectedBranch.address || ''}
                      onChange={(e) => setSelectedBranch({ ...selectedBranch, address: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11px]">{tr('Koordinat Titik Presensi', 'Attendance Point Coordinates')}</span>
                      <button
                        type="button"
                        onClick={() => handleGetGps('edit')}
                        disabled={gettingGps}
                        className="flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <Navigation size={12} />
                        <span>{gettingGps ? tr('Mendeteksi...', 'Detecting...') : tr('Ambil Lokasi Saat Ini (GPS)', 'Get Current Location (GPS)')}</span>
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

                    <LocationPickerMap
                      lat={selectedBranch.latitude}
                      lng={selectedBranch.longitude}
                      radius={selectedBranch.radius_meters}
                      onChange={(la, ln) =>
                        setSelectedBranch({
                          ...selectedBranch,
                          latitude: Number(la.toFixed(6)),
                          longitude: Number(ln.toFixed(6)),
                        })
                      }
                      className="h-52 w-full overflow-hidden rounded-xl border border-slate-200"
                    />
                    <p className="text-[10px] text-slate-500">
                      {tr('Klik peta atau geser pin untuk memilih titik presensi.', 'Click the map or drag the pin to choose the attendance point.')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Radius Geofence (Meter)', 'Geofence Radius (Meters)')}</label>
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
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Zona Waktu', 'Time Zone')}</label>
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
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Standar UMK / UMP Wilayah (Rp)', 'Regional UMK / UMP Standard (Rp)')}</label>
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
                      {tr('Batal', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 cursor-pointer"
                    >
                      {tr('Simpan Perubahan', 'Save Changes')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: DEPARTMENTS */}
      {!loading && activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">{tr('Manajemen Departemen', 'Department Management')}</h3>
              <p className="text-xs text-slate-500">
                {tr('Tambah, ubah, dan hapus departemen perusahaan.', 'Add, edit, and delete company departments.')}
              </p>
            </div>

            <form onSubmit={handleSaveDepartment} className="flex flex-col sm:flex-row gap-2 text-xs">
              <input
                type="text"
                required
                placeholder={tr('Nama departemen', 'Department name')}
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
              />
              <input
                type="text"
                placeholder={tr('Kode (opsional)', 'Code (optional)')}
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                className="w-full sm:w-40 rounded-xl border border-slate-300 px-3 py-2 font-mono"
              />
              <button
                type="submit"
                disabled={deptBusy}
                className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {deptForm.id ? tr('Simpan', 'Save') : tr('Tambah', 'Add')}
              </button>
              {deptForm.id && (
                <button
                  type="button"
                  onClick={() => setDeptForm({ id: '', name: '', code: '' })}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  {tr('Batal', 'Cancel')}
                </button>
              )}
            </form>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {departments.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-400">
                  {tr('Belum ada departemen.', 'No departments yet.')}
                </p>
              ) : (
                departments.map((dept) => (
                  <div key={dept.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800">{dept.name}</span>
                      {dept.code && <span className="ml-1.5 text-slate-400">· {dept.code}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDeptForm({ id: dept.id, name: dept.name, code: dept.code || '' })}
                        className="rounded-lg px-2 py-1 font-semibold text-blue-600 hover:bg-blue-50 cursor-pointer"
                      >
                        {tr('Ubah', 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDepartment(dept)}
                        className="rounded-lg px-2 py-1 font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        {tr('Hapus', 'Delete')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: ATTENDANCE & SELFIE POLICY */}
      {!loading && activeTab === 'attendance' && (
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
      {!loading && activeTab === 'company' && company && (
        <form onSubmit={handleSaveCompany} className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{tr('Identitas & Branding Badan Usaha', 'Company Identity & Branding')}</h3>
                <p className="text-xs text-slate-400">
                  {tr('Nama perusahaan di bawah ini akan menggantikan branding openHR pada seluruh antarmuka aplikasi.', 'The company name below replaces the openHR branding across the entire application interface.')}
                </p>
              </div>
              <button
                type="submit"
                disabled={savingCompany}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Save size={14} />
                <span>{savingCompany ? tr('Menyimpan...', 'Saving...') : tr('Simpan Profil Perusahaan', 'Save Company Profile')}</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-14 min-w-[120px] max-w-[220px] px-3 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  {company.logo_url ? (
                    <img src={company.logo_url} alt={company.name || 'Company Logo'} className="max-h-10 w-auto object-contain" />
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                      <ImageIcon size={16} />
                      <span>{tr('Belum ada logo', 'No logo')}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-slate-800">{tr('Logo Perusahaan', 'Company Logo')}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {tr(
                      'Ditampilkan di Sidebar, Halaman Login, Slip Gaji (PDF), dan Favicon. Maks 2 MB (PNG, JPG, WEBP, SVG).',
                      'Displayed on the Sidebar, Login screen, Payslip PDF, and Favicon. Max 2 MB (PNG, JPG, WEBP, SVG).'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                  <Upload size={14} />
                  <span>{uploadingLogo ? tr('Mengunggah...', 'Uploading...') : tr('Unggah Logo', 'Upload Logo')}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleUploadLogo}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </label>
                {company.logo_url && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={uploadingLogo}
                    className="inline-flex items-center gap-1 px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    <span>{tr('Hapus', 'Remove')}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  {tr('Nama Brand Perusahaan (Tampil di Aplikasi / Navbar / Login) *', 'Company Brand Name (Shown in App / Navbar / Login) *')}
                </label>
                <input
                  type="text"
                  required
                  value={company.name || ''}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  placeholder={tr('Contoh: PT Maju Jaya Sentosa', 'Example: PT Maju Jaya Sentosa')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  {tr('Nama Legal Badan Usaha (PT / CV / Firma)', 'Legal Entity Name (PT / CV / Firm)')}
                </label>
                <input
                  type="text"
                  value={company.legal_name || ''}
                  onChange={(e) => setCompany({ ...company, legal_name: e.target.value })}
                  placeholder={tr('Contoh: PT Maju Jaya Sentosa Tbk', 'Example: PT Maju Jaya Sentosa Tbk')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="text-slate-600 block text-xs font-semibold mb-1">
                  {tr('NPWP Perusahaan', 'Company NPWP')}
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
                  {tr('Email Resmi Perusahaan', 'Official Company Email')}
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
                  {tr('Kode Badan Usaha BPJS Kesehatan', 'BPJS Kesehatan Company Code')}
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
                  {tr('Kode Pendaftaran BPJS Ketenagakerjaan', 'BPJS Ketenagakerjaan Registration Code')}
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
                  {tr('Nomor Telepon Kantor', 'Office Phone Number')}
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
                  {tr('Alamat Kantor Pusat', 'Head Office Address')}
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

          {/* Konfigurasi Custom Domain & Purelymail API */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-3">
              <Mail size={18} className="text-blue-600" />
              <span>{tr('Konfigurasi Domain & API Purelymail (Email Onboarding)', 'Domain & Purelymail API Configuration (Email Onboarding)')}</span>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              {tr('Konfigurasikan domain aplikasi web Anda dan kredensial Purelymail langsung di sini. Data akan disimpan aman di database dan langsung digunakan untuk provisioning mailbox & pengiriman email.', 'Configure your web application domain and Purelymail credentials right here. Data is stored securely in the database and used immediately for mailbox provisioning & email delivery.')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-700 block text-xs font-semibold mb-1">
                  {tr('Custom Domain Aplikasi Web (App Domain)', 'Web App Custom Domain (App Domain)')}
                </label>
                <input
                  type="text"
                  value={company.custom_domain || ''}
                  onChange={(e) => setCompany({ ...company, custom_domain: e.target.value })}
                  placeholder={tr('Contoh: hr.shautomationpl.com', 'Example: hr.shautomationpl.com')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {tr('Digunakan untuk tautan aktivasi karyawan, reset kata sandi, dan slip gaji.', 'Used for employee activation links, password resets, and payslips.')}
                </span>
              </div>

              <div>
                <label className="text-slate-700 block text-xs font-semibold mb-1">
                  {tr('Domain Email Karyawan di Purelymail', 'Employee Email Domain on Purelymail')}
                </label>
                <input
                  type="text"
                  value={company.purelymail_domain || ''}
                  onChange={(e) => setCompany({ ...company, purelymail_domain: e.target.value })}
                  placeholder={tr('Contoh: shautomationpl.com', 'Example: shautomationpl.com')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {tr('Domain resmi untuk membuat kotak surat karyawan (contoh: ', 'Official domain for creating employee mailboxes (example: ')}<code>nama@domain.com</code>).
                </span>
              </div>

              <div>
                <label className="text-slate-700 block text-xs font-semibold mb-1">
                  {tr('Alamat Email Pengirim HR (From Address)', 'HR Sender Email Address (From Address)')}
                </label>
                <input
                  type="email"
                  value={company.purelymail_from_address || ''}
                  onChange={(e) => setCompany({ ...company, purelymail_from_address: e.target.value })}
                  placeholder={tr('Contoh: hr@shautomationpl.com', 'Example: hr@shautomationpl.com')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {tr('Alamat email pengirim undangan aktivasi dan notifikasi sistem.', 'Sender email address for activation invitations and system notifications.')}
                </span>
              </div>

              <div>
                <label className="text-slate-700 block text-xs font-semibold mb-1">
                  Purelymail API Token / API Key
                </label>
                <input
                  type="password"
                  value={company.purelymail_api_token || ''}
                  onChange={(e) => setCompany({ ...company, purelymail_api_token: e.target.value })}
                  placeholder={tr('Token API dari Purelymail Panel > Account > API', 'API Token from Purelymail Panel > Account > API')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {tr('Token API resmi Purelymail untuk otomatis membuat mailbox karyawan via API v0.', 'Official Purelymail API token to automatically create employee mailboxes via API v0.')}
                </span>
              </div>

              <div className="md:col-span-2">
                <label className="text-slate-700 block text-xs font-semibold mb-1">
                  Purelymail SMTP Password / App Password
                </label>
                <input
                  type="password"
                  value={company.purelymail_smtp_pass || ''}
                  onChange={(e) => setCompany({ ...company, purelymail_smtp_pass: e.target.value })}
                  placeholder={tr('Password mailbox pengirim atau App Password Purelymail', 'Sender mailbox password or Purelymail App Password')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {tr('Password untuk otentikasi pengiriman email via SMTP (', 'Password for email delivery authentication via SMTP (')}<code>smtp.purelymail.com:587</code>).
                </span>
              </div>
            </div>

            {/* Test Connection Button & Status Output */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-xs text-slate-800">{tr('Uji Koneksi Purelymail (API & SMTP)', 'Test Purelymail Connection (API & SMTP)')}</h4>
                  <p className="text-[11px] text-slate-500">
                    {tr('Periksa validitas API Token ke server Purelymail dan kirim email uji coba real-time.', 'Validate the API Token against the Purelymail server and send a real-time test email.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestPurelymail}
                  disabled={testingEmail}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Mail size={14} />
                  <span>{testingEmail ? tr('Menguji Koneksi...', 'Testing Connection...') : tr('Uji Koneksi API & SMTP Sekarang', 'Test API & SMTP Connection Now')}</span>
                </button>
              </div>

              {testResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className={`p-3 rounded-xl border ${
                    testResult.api.status === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : testResult.api.status === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      {testResult.api.status === 'ok' ? tr('✓ API Token Valid', '✓ API Token Valid') : testResult.api.status === 'warning' ? tr('⚠ API Token Info', '⚠ API Token Info') : tr('✕ API Token Gagal', '✕ API Token Failed')}
                    </div>
                    <div className="text-[11px]">{testResult.api.message}</div>
                  </div>

                  <div className={`p-3 rounded-xl border ${
                    testResult.smtp.status === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : testResult.smtp.status === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      {testResult.smtp.status === 'ok' ? tr('✓ SMTP Pengiriman Berhasil', '✓ SMTP Delivery Successful') : testResult.smtp.status === 'warning' ? tr('⚠ SMTP Info', '⚠ SMTP Info') : tr('✕ SMTP Gagal', '✕ SMTP Failed')}
                    </div>
                    <div className="text-[11px]">{testResult.smtp.message}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingCompany}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Save size={15} />
                <span>{savingCompany ? tr('Menyimpan...', 'Saving...') : tr('Simpan Profil & Integrasi Email', 'Save Profile & Email Integration')}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB: NOTIFICATIONS */}
      {!loading && activeTab === 'notifications' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900">{tr('Notifikasi Email', 'Email Notifications')}</h3>
            <p className="text-xs text-slate-500">
              {tr('Status pengiriman email sistem terbaru.', 'Latest system email delivery status.')}
            </p>
          </div>
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-400">
              {tr('Belum ada notifikasi.', 'No notifications yet.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <div key={notification.id} className="flex items-start justify-between gap-3 px-4 py-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{notification.subject}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {notification.to_email} · {notification.notification_type}
                    </p>
                    <p className="text-[10px] text-slate-400">{formatDate(notification.created_at)}</p>
                    {notification.error_message && (
                      <p className="text-[10px] text-rose-600">{notification.error_message}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      notification.status === 'sent'
                        ? 'bg-emerald-100 text-emerald-700'
                        : notification.status === 'failed'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {notification.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {!loading && activeTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">{tr('Jejak Audit Sistem (Audit Log)', 'System Audit Trail (Audit Log)')}</h3>
            <span className="text-xs text-slate-400">{tr('Pencatatan perubahan gaji, koreksi presensi, dan penguncian payroll', 'Record of salary changes, attendance corrections, and payroll locking')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">{tr('Waktu', 'Time')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Pengguna', 'User')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Aksi', 'Action')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Entitas', 'Entity')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Detail Perubahan', 'Change Details')}</th>
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

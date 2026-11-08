import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  Search,
  Filter,
  Eye,
  Edit,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
  Mail,
  Shield,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../api';

export const HREmployees: React.FC = () => {
  const { user, isOwnerAdmin, isManager } = useAuth();
  const { t, formatCurrency, formatDate } = useLanguage();
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add Employee Form State
  const [formData, setFormData] = useState({
    nik: '',
    full_name: '',
    ktp_number: '',
    npwp_number: '',
    date_of_birth: '1995-01-01',
    place_of_birth: 'Jakarta',
    gender: 'male',
    religion: 'Islam',
    marital_status: 'single',
    ptkp_status: 'TK/0',
    address: '',
    phone: '',
    personal_email: '',
    join_date: new Date().toISOString().split('T')[0],
    employment_status: 'PKWTT',
    lifecycle_status: 'active',
    contract_start_date: '',
    contract_end_date: '',
    job_title: '',
    department_id: '',
    branch_id: '',
    manager_id: '',
    base_salary: 6000000,
    fixed_allowances: 500000,
    bank_name: 'BCA',
    bank_account_number: '',
    bank_account_holder: '',
    bpjs_kesehatan_number: '',
    bpjs_tk_number: '',
    bpjs_wage_basis: '',
    // Foreign Worker Fields
    is_foreign_worker: false,
    nationality: 'Indonesia',
    passport_number: '',
    passport_expiry_date: '',
    kitas_kitap_number: '',
    tax_id_type: 'NPWP',
    provision_company_email: true,
    company_email_username: '',
  });

  // Bulk Import State
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, deptRes, branchRes] = await Promise.all([
        apiFetch('/employees'),
        apiFetch('/settings/departments'),
        apiFetch('/settings/branches'),
      ]);
      setEmployees(empRes.employees || []);
      setDepartments(deptRes.departments || []);
      setBranches(branchRes.branches || []);

      if (deptRes.departments?.[0] && !formData.department_id) {
        setFormData((prev) => ({
          ...prev,
          department_id: deptRes.departments[0].id,
          branch_id: branchRes.branches?.[0]?.id || '',
        }));
      }
    } catch (err: any) {
      console.warn('Employees err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (formData.is_foreign_worker && !formData.passport_number.trim()) {
      setMsg({ type: 'error', text: 'Nomor paspor wajib diisi untuk Tenaga Kerja Asing (TKA / Foreign Worker)' });
      return;
    }
    if (!formData.is_foreign_worker && !formData.ktp_number.trim()) {
      setMsg({ type: 'error', text: 'Nomor KTP wajib diisi untuk karyawan WNI' });
      return;
    }

    try {
      const res = await apiFetch('/employees', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      setInviteResult(res);
      setMsg({ type: 'success', text: res.message });
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menambahkan karyawan' });
    }
  };

  // Bulk Excel/CSV Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);
        setImportRows(data);
        setImportErrors([]);
      } catch (err: any) {
        alert('Format file tidak didukung: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExecuteImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportErrors([]);
    try {
      const res = await apiFetch('/employees/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ employees: importRows }),
      });

      if (res.errors && res.errors.length > 0) {
        setImportErrors(res.errors);
      }
      setMsg({
        type: 'success',
        text: `Berhasil mengimpor ${res.successCount} karyawan. ${res.errorCount > 0 ? `(${res.errorCount} baris memiliki kesalahan)` : ''}`,
      });
      if (res.successCount > 0) {
        loadData();
        if (res.errorCount === 0) {
          setShowImportModal(false);
        }
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mengimpor data' });
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleTemplate = () => {
    const sample = [
      {
        nik: 'EMP101',
        full_name: 'Bambang Sudirgo',
        ktp_number: '3171010101900010',
        npwp_number: '09.111.222.3-011.000',
        date_of_birth: '1990-05-10',
        place_of_birth: 'Jakarta',
        gender: 'male',
        religion: 'Islam',
        marital_status: 'married',
        ptkp_status: 'K/1',
        address: 'Jl. Merdeka No. 1, Jakarta',
        phone: '081299887766',
        personal_email: 'bambang@example.com',
        company_email: 'bambang@nusantara.id',
        job_title: 'Fullstack Developer',
        employment_status: 'PKWTT',
        join_date: '2026-01-01',
        base_salary: 10000000,
        fixed_allowances: 1000000,
        bank_name: 'BCA',
        bank_account_number: '1234567890',
        branch_name: 'Kantor Pusat Jakarta',
        department_name: 'Engineering',
      },
      {
        nik: 'EMP102',
        full_name: 'Ratna Sari',
        ktp_number: '3273010101930020',
        npwp_number: '',
        date_of_birth: '1993-08-15',
        place_of_birth: 'Bandung',
        gender: 'female',
        religion: 'Islam',
        marital_status: 'single',
        ptkp_status: 'TK/0',
        address: 'Jl. Dago No. 12, Bandung',
        phone: '081299887755',
        personal_email: 'ratna@example.com',
        company_email: 'ratna@nusantara.id',
        job_title: 'Finance Staff',
        employment_status: 'PKWT',
        join_date: '2026-02-01',
        base_salary: 6000000,
        fixed_allowances: 500000,
        bank_name: 'Mandiri',
        bank_account_number: '1310001122334',
        branch_name: 'Kantor Operasional Bandung',
        department_name: 'Finance & Accounting',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'Template Karyawan');
    XLSX.writeFile(wb, 'Template_Import_Karyawan_openHR.xlsx');
  };

  const filtered = employees.filter((e) => {
    const matchSearch =
      e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.nik?.toLowerCase().includes(search.toLowerCase()) ||
      e.job_title?.toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter ? e.department_id === deptFilter : true;
    return matchSearch && matchDept;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t.employees.title}</h1>
          <p className="text-xs text-slate-500">
            {isManager
              ? 'Menampilkan anggota tim yang berada di bawah supervisi Anda'
              : t.employees.subtitle}
          </p>
        </div>

        {isOwnerAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span>{t.employees.importExcel}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
            >
              <UserPlus size={16} />
              <span>{t.employees.addEmployee}</span>
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2 shadow-2xs ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Purelymail Onboarding Invite Card if newly created */}
      {inviteResult && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
              <Mail size={18} className="text-blue-600" />
              <span>Onboarding Karyawan Berhasil</span>
            </div>
            <button
              onClick={() => setInviteResult(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Tutup
            </button>
          </div>
          <p className="text-xs text-blue-800">
            {inviteResult.purelymail?.provisioned
              ? `Mailbox Purelymail (${inviteResult.purelymail.companyEmail}) berhasil dibuat.`
              : 'Mailbox disimulasikan / Purelymail token belum diisi.'} Email aktivasi akun telah disiapkan via SMTP.
          </p>
          <div className="bg-white p-3 rounded-xl border border-blue-200 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-700 truncate select-all">
              {inviteResult.inviteLink}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteResult.inviteLink);
                alert('Tautan aktivasi disalin ke clipboard!');
              }}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg shrink-0 font-semibold"
            >
              <Copy size={13} />
              <span>Salin Link</span>
            </button>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama, NIK, paspor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-slate-400" />
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white"
          >
            <option value="">{t.common.all} {t.employees.department}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 font-bold">{t.employees.nik} & {t.employees.fullName}</th>
                <th className="py-3.5 px-4 font-bold">{t.employees.jobTitle} & {t.employees.department}</th>
                <th className="py-3.5 px-4 font-bold">{t.employees.branch}</th>
                <th className="py-3.5 px-4 font-bold">{t.employees.employmentStatus}</th>
                <th className="py-3.5 px-4 font-bold">{t.employees.ptkpStatus}</th>
                {isOwnerAdmin && <th className="py-3.5 px-4 font-bold">{t.employees.baseSalary}</th>}
                <th className="py-3.5 px-4 font-bold text-right">{t.common.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {t.common.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Tidak ada data karyawan yang sesuai.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{emp.full_name}</span>
                        {emp.is_foreign_worker === 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            TKA ({emp.nationality || 'WNA'})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {emp.nik} {emp.passport_number ? `• ${t.employees.passportNumber}: ${emp.passport_number}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{emp.job_title}</div>
                      <div className="text-[11px] text-slate-400">{emp.department_name || '-'}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{emp.branch_name || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-[10px] border border-blue-200">
                        {emp.employment_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{emp.ptkp_status}</td>
                    {isOwnerAdmin && (
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatCurrency(emp.base_salary)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedEmp(emp)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs px-2.5 py-1 rounded-lg hover:bg-blue-50 cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>{t.common.detail}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-base text-slate-900">{selectedEmp.full_name}</h3>
                <p className="text-xs text-slate-500">NIK: {selectedEmp.nik} • {selectedEmp.job_title}</p>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="p-1 text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Kewarganegaraan</span>
                <span className="font-semibold text-slate-800">
                  {selectedEmp.is_foreign_worker ? `TKA (${selectedEmp.nationality || 'WNA'})` : 'WNI (Indonesia)'}
                </span>
              </div>
              {selectedEmp.is_foreign_worker === 1 && (
                <>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Nomor Paspor</span>
                    <span className="font-semibold text-slate-800 font-mono">{selectedEmp.passport_number || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Masa Berlaku Paspor</span>
                    <span className="font-semibold text-slate-800">{selectedEmp.passport_expiry_date || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Nomor KITAS / KITAP</span>
                    <span className="font-semibold text-slate-800 font-mono">{selectedEmp.kitas_kitap_number || '-'}</span>
                  </div>
                </>
              )}
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Nomor KTP</span>
                <span className="font-semibold text-slate-800">{selectedEmp.ktp_number || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">NPWP</span>
                <span className="font-semibold text-slate-800">{selectedEmp.npwp_number || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Status PTKP</span>
                <span className="font-semibold text-slate-800">{selectedEmp.ptkp_status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Status Kepegawaian</span>
                <span className="font-semibold text-slate-800">{selectedEmp.employment_status} ({selectedEmp.lifecycle_status})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">{t.employees.joinDate}</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedEmp.join_date)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">{t.employees.contractEnd}</span>
                <span className="font-semibold text-slate-800">{formatDate(selectedEmp.contract_end_date) || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">{t.employees.bpjsKes}</span>
                <span className="font-semibold text-slate-800">{selectedEmp.bpjs_kesehatan_number || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">{t.employees.bpjsTk}</span>
                <span className="font-semibold text-slate-800">{selectedEmp.bpjs_tk_number || '-'}</span>
              </div>
              {selectedEmp.base_salary !== undefined && (
                <>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">{t.employees.baseSalary}</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(selectedEmp.base_salary)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">{t.employees.fixedAllowances}</span>
                    <span className="font-bold text-slate-800">{formatCurrency(selectedEmp.fixed_allowances)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Rekening Payroll</span>
                    <span className="font-semibold text-slate-800">{selectedEmp.bank_name} {selectedEmp.bank_account_number}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedEmp(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD EMPLOYEE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Formulir Pendaftaran Karyawan Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4 text-xs">
              {/* Kewarganegaraan: WNI vs WNA (Foreign Worker) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="block font-semibold text-slate-700 mb-1.5">Status Kewarganegaraan:</span>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-medium">
                    <input
                      type="radio"
                      name="is_foreign_worker"
                      checked={!formData.is_foreign_worker}
                      onChange={() => setFormData({ ...formData, is_foreign_worker: false, nationality: 'Indonesia' })}
                      className="text-slate-900 focus:ring-slate-900"
                    />
                    <span>Warga Negara Indonesia (WNI)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-medium">
                    <input
                      type="radio"
                      name="is_foreign_worker"
                      checked={formData.is_foreign_worker}
                      onChange={() => setFormData({ ...formData, is_foreign_worker: true, nationality: 'WNA', ptkp_status: 'TK/0' })}
                      className="text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-amber-800 font-semibold">Tenaga Kerja Asing (TKA / Foreign Worker)</span>
                  </label>
                </div>
              </div>

              {/* Foreign Worker Specific Fields */}
              {formData.is_foreign_worker && (
                <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nomor Paspor *</label>
                    <input
                      type="text"
                      required={formData.is_foreign_worker}
                      value={formData.passport_number}
                      onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
                      placeholder="Contoh: TR1234567"
                      className="w-full p-2.5 border border-amber-300 rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Negara Asal / Kewarganegaraan *</label>
                    <input
                      type="text"
                      required={formData.is_foreign_worker}
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      placeholder="Contoh: Jepang, Singapura, dll."
                      className="w-full p-2.5 border border-amber-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nomor KITAS / KITAP (Opsional)</label>
                    <input
                      type="text"
                      value={formData.kitas_kitap_number}
                      onChange={(e) => setFormData({ ...formData, kitas_kitap_number: e.target.value })}
                      placeholder="Contoh: 2C21..."
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">NIK (Nomor Induk Karyawan) *</label>
                  <input
                    type="text"
                    required
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="Contoh: EMP006"
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Nama Lengkap ({formData.is_foreign_worker ? 'Sesuai Paspor' : 'Sesuai KTP'}) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder={formData.is_foreign_worker ? 'Contoh: Kenji Takahashi' : 'Contoh: Hendra Kurniawan'}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    {formData.is_foreign_worker ? 'Nomor KTP (Opsional untuk WNA)' : 'Nomor KTP (16 Digit) *'}
                  </label>
                  <input
                    type="text"
                    required={!formData.is_foreign_worker}
                    maxLength={16}
                    value={formData.ktp_number}
                    onChange={(e) => setFormData({ ...formData, ktp_number: e.target.value })}
                    placeholder={formData.is_foreign_worker ? 'Kosongkan jika hanya menggunakan paspor' : '31710101019...'}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">NPWP (Opsional / Pajak)</label>
                  <input
                    type="text"
                    value={formData.npwp_number}
                    onChange={(e) => setFormData({ ...formData, npwp_number: e.target.value })}
                    placeholder="00.000.000.0-000.000 (Opsional)"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Status PTKP *</label>
                  <select
                    value={formData.ptkp_status}
                    onChange={(e) => setFormData({ ...formData, ptkp_status: e.target.value as any })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    <option value="TK/0">TK/0 (Lajang tanpa tanggungan - TER A)</option>
                    <option value="TK/1">TK/1 (Lajang 1 tanggungan - TER A)</option>
                    <option value="K/0">K/0 (Menikah tanpa tanggungan - TER A)</option>
                    <option value="K/1">K/1 (Menikah 1 tanggungan - TER B)</option>
                    <option value="K/2">K/2 (Menikah 2 tanggungan - TER B)</option>
                    <option value="TK/2">TK/2 (Lajang 2 tanggungan - TER B)</option>
                    <option value="TK/3">TK/3 (Lajang 3 tanggungan - TER B)</option>
                    <option value="K/3">K/3 (Menikah 3 tanggungan - TER C)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Status Kepegawaian *</label>
                  <select
                    value={formData.employment_status}
                    onChange={(e) => setFormData({ ...formData, employment_status: e.target.value as any })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    <option value="PKWTT">PKWTT (Tetap)</option>
                    <option value="PKWT">PKWT (Kontrak)</option>
                    <option value="probation">Masa Percobaan (Probation)</option>
                    <option value="intern">Magang (Intern)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Jabatan (Job Title) *</label>
                  <input
                    type="text"
                    required
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Departemen *</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Cabang Penempatan *</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tanggal Masuk (Join Date) *</label>
                  <input
                    type="date"
                    required
                    value={formData.join_date}
                    onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Gaji Pokok (Rp) *</label>
                  <input
                    type="number"
                    step="100000"
                    required
                    value={formData.base_salary}
                    onChange={(e) => setFormData({ ...formData, base_salary: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tunjangan Tetap (Rp)</label>
                  <input
                    type="number"
                    step="50000"
                    value={formData.fixed_allowances}
                    onChange={(e) => setFormData({ ...formData, fixed_allowances: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Pribadi *</label>
                  <input
                    type="email"
                    required
                    value={formData.personal_email}
                    onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Nomor WhatsApp / HP *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Purelymail Provisioning Box */}
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="purelymailCheck"
                    checked={formData.provision_company_email}
                    onChange={(e) => setFormData({ ...formData, provision_company_email: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <label htmlFor="purelymailCheck" className="text-slate-800 font-bold">
                    Buat Kotak Surat Resmi via Purelymail API v0
                  </label>
                </div>
                {formData.provision_company_email && (
                  <div>
                    <label className="block text-slate-600 text-[11px] mb-1">Username Email Perusahaan (Opsional)</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="contoh: hendra.kurniawan"
                        value={formData.company_email_username}
                        onChange={(e) => setFormData({ ...formData, company_email_username: e.target.value })}
                        className="p-2 border border-slate-300 rounded-lg flex-1 bg-white"
                      />
                      <span className="text-slate-500 font-mono">@company.id</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700"
                >
                  Daftarkan Karyawan & Kirim Undangan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Bulk Import Karyawan dari Excel / CSV</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Unggah file spreadsheet berisikan data awal karyawan. Sistem akan memvalidasi status PTKP, NIK, dan nomor KTP per baris.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={downloadSampleTemplate}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <FileSpreadsheet size={16} className="text-emerald-600" />
                <span>Unduh Template Excel Resmi</span>
              </button>
              <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1.5">
                <Upload size={16} />
                <span>Pilih File Excel (.xlsx / .csv)</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {importRows.length > 0 && (
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-800">
                  {importRows.length} baris data karyawan terbaca dari file.
                </span>
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">NIK</th>
                        <th className="p-2">Nama Lengkap</th>
                        <th className="p-2">PTKP</th>
                        <th className="p-2">Jabatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRows.slice(0, 10).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono">{r.nik}</td>
                          <td className="p-2 font-medium">{r.full_name}</td>
                          <td className="p-2">{r.ptkp_status}</td>
                          <td className="p-2">{r.job_title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.length > 10 && (
                  <p className="text-[10px] text-slate-400 mt-1">Menampilkan 10 dari {importRows.length} baris.</p>
                )}
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-xs text-rose-800 space-y-1 max-h-36 overflow-y-auto">
                <strong className="block text-rose-900">Kesalahan Validasi:</strong>
                {importErrors.map((err, i) => (
                  <p key={i} className="text-[11px]">• {err.error}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={importRows.length === 0 || importing}
                onClick={handleExecuteImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
              >
                {importing ? 'Mengimpor...' : `Proses Impor ${importRows.length} Karyawan`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

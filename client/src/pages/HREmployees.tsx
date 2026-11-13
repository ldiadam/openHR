import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  Trash2,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { apiFetch, getLocalDateString, getToken } from '../api';
import { PageSkeleton } from '../components/Skeleton';
import { BANK_DIRECTORY, getBankPrefill } from '../utils/banks';

const DEFAULT_BANK_PREFILL = getBankPrefill('BCA');

const RELIGION_OPTIONS = [
  'Islam',
  'Kristen Protestan',
  'Katolik',
  'Hindu',
  'Buddha',
  'Khonghucu',
  'Lainnya',
];

const MARITAL_OPTIONS = [
  { value: 'single', label: 'Lajang (Belum Menikah)', labelEn: 'Single (Never Married)' },
  { value: 'married', label: 'Menikah', labelEn: 'Married' },
  { value: 'widowed', label: 'Duda / Janda (Cerai Mati)', labelEn: 'Widowed (Death of Spouse)' },
  { value: 'divorced', label: 'Cerai Hidup', labelEn: 'Divorced' },
];

const RELIGION_LABEL_EN: Record<string, string> = {
  Islam: 'Islam',
  'Kristen Protestan': 'Protestant Christian',
  Katolik: 'Catholic',
  Hindu: 'Hindu',
  Buddha: 'Buddhist',
  Khonghucu: 'Confucian',
  Lainnya: 'Other',
};

export const HREmployees: React.FC = () => {
  const { user, isOwnerAdmin, isManager } = useAuth();
  const { t, tr, formatCurrency, formatDate } = useLanguage();
  const { company } = useCompany();
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [shiftPatterns, setShiftPatterns] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals & Actions
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [deletingEmp, setDeletingEmp] = useState<any>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [severanceResult, setSeveranceResult] = useState<any>(null);
  const [calculatingSeverance, setCalculatingSeverance] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    join_date: getLocalDateString(),
    employment_status: 'PKWTT',
    lifecycle_status: 'active',
    contract_start_date: '',
    contract_end_date: '',
    job_title: '',
    user_role: 'employee',
    department_id: '',
    branch_id: '',
    manager_id: '',
    shift_pattern_id: 'shift-reg',
    base_salary: 6000000,
    fixed_allowances: 500000,
    bank_name: 'BCA',
    bank_account_number: '',
    bank_account_holder: '',
    bank_swift_code: DEFAULT_BANK_PREFILL?.bank_swift_code || '',
    bank_branch_name: DEFAULT_BANK_PREFILL?.bank_branch_name || '',
    bank_branch_code: DEFAULT_BANK_PREFILL?.bank_branch_code || '',
    bank_branch_address: DEFAULT_BANK_PREFILL?.bank_branch_address || '',
    bpjs_kesehatan_number: '',
    bpjs_tk_number: '',
    bpjs_wage_basis: '',
    has_bpjs_tk: false,
    has_bpjs_kes: true,
    pays_own_tax: false,
    tax_scheme: 'company_withheld',
    exclude_from_payroll: false,
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
      const [empRes, deptRes, branchRes, spRes] = await Promise.all([
        apiFetch('/employees'),
        apiFetch('/settings/departments'),
        apiFetch('/settings/branches'),
        apiFetch('/shifts/patterns'),
      ]);
      setEmployees(empRes.employees || []);
      setDepartments(deptRes.departments || []);
      setBranches(branchRes.branches || []);
      setShiftPatterns(spRes.patterns || []);

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
      setMsg({ type: 'error', text: tr(
        'Nomor paspor wajib diisi untuk Tenaga Kerja Asing (TKA / Foreign Worker)',
        'Passport number is required for Foreign Workers (TKA / Foreign Worker)'
      ) });
      return;
    }
    if (!formData.is_foreign_worker && !formData.ktp_number.trim()) {
      setMsg({ type: 'error', text: tr('Nomor KTP wajib diisi untuk karyawan WNI', 'KTP number is required for Indonesian citizens (WNI)') });
      return;
    }
    if (!formData.address?.trim()) {
      setMsg({ type: 'error', text: tr('Alamat lengkap domisili karyawan wajib diisi', 'The employee full domicile address is required') });
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
      setMsg({ type: 'error', text: err.message || tr('Gagal menambahkan karyawan', 'Failed to add employee') });
    }
  };

  const withBankPrefill = (emp: any) => {
    const prefill = getBankPrefill(emp?.bank_name);
    if (!prefill) return { ...emp };
    return {
      ...emp,
      bank_swift_code: emp.bank_swift_code || prefill.bank_swift_code,
      bank_branch_name: emp.bank_branch_name || prefill.bank_branch_name,
      bank_branch_code: emp.bank_branch_code || prefill.bank_branch_code,
      bank_branch_address: emp.bank_branch_address || prefill.bank_branch_address,
    };
  };




  const handleCalcSeverance = async () => {
    if (!editingEmp?.id) {
      setMsg({ type: 'error', text: tr('Simpan data karyawan terlebih dahulu.', 'Save the employee first.') });
      return;
    }
    setCalculatingSeverance(true);
    setMsg(null);
    try {
      const query = editingEmp.last_working_date ? `?last_working_date=${editingEmp.last_working_date}` : '';
      const res = await apiFetch(`/employees/${editingEmp.id}/severance${query}`);
      setSeveranceResult(res);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menghitung pesangon', 'Failed to calculate severance') });
    } finally {
      setCalculatingSeverance(false);
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setSavingEdit(true);
    setMsg(null);
    try {
      const res = await apiFetch<any>(`/employees/${editingEmp.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingEmp),
      });
      setMsg({ type: 'success', text: res.message || tr('Data karyawan berhasil diperbarui', 'Employee data updated successfully') });
      setEditingEmp(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal memperbarui data karyawan', 'Failed to update employee data') });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmp) return;
    setDeleting(true);
    setMsg(null);
    try {
      const res = await apiFetch<any>(`/employees/${deletingEmp.id}`, {
        method: 'DELETE',
      });
      setMsg({ type: 'success', text: res.message || tr('Karyawan berhasil dihapus', 'Employee deleted successfully') });
      setDeletingEmp(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menghapus karyawan', 'Failed to delete employee') });
    } finally {
      setDeleting(false);
    }
  };

  const handleResendInvite = async (empId: string) => {
    setResendingId(empId);
    setMsg(null);
    try {
      const res = await apiFetch<any>(`/employees/${empId}/resend-invite`, {
        method: 'POST',
      });
      setInviteResult(res);
      setMsg({ type: 'success', text: res.message || tr('Email aktivasi sedang dikirim ulang', 'Activation email is being resent') });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal mengirim ulang email aktivasi', 'Failed to resend activation email') });
    } finally {
      setResendingId(null);
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
        alert(tr('Format file tidak didukung: ', 'Unsupported file format: ') + err.message);
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
        text: tr(
          `Berhasil mengimpor ${res.successCount} karyawan. ${res.errorCount > 0 ? `(${res.errorCount} baris memiliki kesalahan)` : ''}`,
          `Successfully imported ${res.successCount} employees. ${res.errorCount > 0 ? `(${res.errorCount} rows have errors)` : ''}`
        ),
      });
      if (res.successCount > 0) {
        loadData();
        if (res.errorCount === 0) {
          setShowImportModal(false);
        }
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal mengimpor data', 'Failed to import data') });
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
    XLSX.utils.book_append_sheet(wb, ws, tr('Template Karyawan', 'Employee Template'));
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

  if (loading) return <PageSkeleton cards={4} rows={8} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t.employees.title}</h1>
          <p className="text-xs text-slate-500">
            {isManager
              ? tr('Menampilkan anggota tim yang berada di bawah supervisi Anda', 'Showing team members under your supervision')
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

      {/* Purelymail Onboarding Invite Card if newly created or resent */}
      {inviteResult && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
              <Mail size={18} className="text-blue-600" />
              <span>{inviteResult.emailSent !== undefined
                ? tr('Email Aktivasi Dikirim Ulang', 'Activation Email Resent')
                : tr('Onboarding Karyawan Berhasil', 'Employee Onboarding Successful')}</span>
            </div>
            <button
              onClick={() => setInviteResult(null)}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
            >
              ✕ {tr('Tutup', 'Close')}
            </button>
          </div>

          <div className="text-xs text-blue-900 space-y-1">
            {inviteResult.emailSent !== undefined ? (
              <div className="font-semibold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                <span>{tr('Email aktivasi sedang dikirim ulang ke email karyawan via server SMTP Purelymail.', 'The account activation email is being resent to the employee email via the Purelymail SMTP server.')}</span>
              </div>
            ) : inviteResult.purelymail ? (
              <div className="font-semibold">
                {tr('Status Mailbox: ', 'Mailbox Status: ')}{inviteResult.purelymail.provisioned
                  ? tr(
                      `✓ Mailbox Purelymail (${inviteResult.purelymail.companyEmail}) berhasil dibuat aktif!`,
                      `✓ Purelymail Mailbox (${inviteResult.purelymail.companyEmail}) has been created and activated!`
                    )
                  : `ℹ ${inviteResult.purelymail.notes || tr('Mailbox disiapkan', 'Mailbox prepared')}`}
              </div>
            ) : null}
            <div className="text-blue-700">
              {tr('Karyawan dapat langsung login sekarang dengan kredensial default, atau menggunakan tautan aktivasi mandiri di bawah.', 'The employee can log in right away using the default credentials, or use the self-service activation link below.')}
            </div>
          </div>

          {/* Login Credentials Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-3 rounded-2xl border border-blue-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{tr('Akun / Email Login', 'Login Account / Email')}</span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono font-bold text-slate-800 text-sm truncate">
                  {inviteResult.loginEmail || inviteResult.nik}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteResult.loginEmail || inviteResult.nik);
                    alert(tr('Email login disalin ke clipboard!', 'Login email copied to clipboard!'));
                  }}
                  className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                  title={tr('Salin email', 'Copy email')}
                >
                  <Copy size={13} />
                </button>
              </div>
              <span className="text-[10px] text-slate-500 block">{tr(`Bisa juga login menggunakan NIK (${inviteResult.nik})`, `You can also log in using your NIK (${inviteResult.nik})`)}</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-blue-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{tr('Kata Sandi Awal (Sementara)', 'Initial Password (Temporary)')}</span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {inviteResult.defaultPassword || 'Password123!'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteResult.defaultPassword || 'Password123!');
                    alert(tr('Kata sandi disalin ke clipboard!', 'Password copied to clipboard!'));
                  }}
                  className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                  title={tr('Salin kata sandi', 'Copy password')}
                >
                  <Copy size={13} />
                </button>
              </div>
              <span className="text-[10px] text-slate-500 block">{tr('Karyawan dapat mengganti kata sandi setelah masuk', 'The employee can change the password after logging in')}</span>
            </div>
          </div>

          {/* Activation Link */}
          <div className="bg-white p-3.5 rounded-2xl border border-blue-200 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">{tr('Tautan Aktivasi Mandiri (Untuk Karyawan Buat Password Sendiri)', 'Self-Service Activation Link (For Employees Creating Their Own Password)')}</span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-slate-700 truncate select-all">
                {inviteResult.inviteLink}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteResult.inviteLink);
                  alert(tr('Tautan aktivasi disalin ke clipboard!', 'Activation link copied to clipboard!'));
                }}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl shrink-0 font-semibold cursor-pointer transition shadow-xs"
              >
                <Copy size={13} />
                <span>{tr('Salin Tautan', 'Copy Link')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={tr('Cari nama, NIK, paspor...', 'Search name, NIK, passport...')}
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
                    {tr('Tidak ada data karyawan yang sesuai.', 'No employee data matches your filter.')}
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
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/employees/${emp.id}`}
                          title={tr('Lihat Detail Karyawan', 'View Employee Details')}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        >
                          <Eye size={15} />
                        </Link>
                        {isOwnerAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleResendInvite(emp.id)}
                              disabled={resendingId === emp.id}
                              title={tr('Kirim Ulang Email Aktivasi', 'Resend Activation Email')}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                            >
                              <Mail size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingEmp(withBankPrefill(emp))}
                              title={tr('Edit Data Karyawan', 'Edit Employee Data')}
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                            >
                              <Edit size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingEmp(emp)}
                              title={tr('Hapus Karyawan', 'Delete Employee')}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {/* ADD EMPLOYEE MODAL */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-200 shrink-0">
              <h3 className="font-bold text-base text-slate-900">{tr('Formulir Pendaftaran Karyawan Baru', 'New Employee Registration Form')}</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-5 sm:p-6 space-y-4 text-xs flex-1">
                {/* Kewarganegaraan: WNI vs WNA (Foreign Worker) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="block font-semibold text-slate-700 mb-1.5">{tr('Status Kewarganegaraan:', 'Citizenship Status:')}</span>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-medium">
                    <input
                      type="radio"
                      name="is_foreign_worker"
                      checked={!formData.is_foreign_worker}
                      onChange={() => setFormData({ ...formData, is_foreign_worker: false, nationality: 'Indonesia' })}
                      className="text-slate-900 focus:ring-slate-900"
                    />
                    <span>{tr('Warga Negara Indonesia (WNI)', 'Indonesian Citizen (WNI)')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-medium">
                    <input
                      type="radio"
                      name="is_foreign_worker"
                      checked={formData.is_foreign_worker}
                      onChange={() => setFormData({ ...formData, is_foreign_worker: true, nationality: 'WNA', ptkp_status: 'TK/0' })}
                      className="text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-amber-800 font-semibold">{tr('Tenaga Kerja Asing (TKA / Foreign Worker)', 'Foreign Worker (TKA / Foreign Worker)')}</span>
                  </label>
                </div>
              </div>

              {/* Foreign Worker Specific Fields */}
              {formData.is_foreign_worker && (
                <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor Paspor *', 'Passport Number *')}</label>
                    <input
                      type="text"
                      required={formData.is_foreign_worker}
                      value={formData.passport_number}
                      onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
                      placeholder={tr('Contoh: TR1234567', 'e.g. TR1234567')}
                      className="w-full p-2.5 border border-amber-300 rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Negara Asal / Kewarganegaraan *', 'Country of Origin / Nationality *')}</label>
                    <input
                      type="text"
                      required={formData.is_foreign_worker}
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      placeholder={tr('Contoh: Jepang, Singapura, dll.', 'e.g. Japan, Singapore, etc.')}
                      className="w-full p-2.5 border border-amber-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor KITAS / KITAP (Opsional)', 'KITAS / KITAP Number (Optional)')}</label>
                    <input
                      type="text"
                      value={formData.kitas_kitap_number}
                      onChange={(e) => setFormData({ ...formData, kitas_kitap_number: e.target.value })}
                      placeholder={tr('Contoh: 2C21...', 'e.g. 2C21...')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                    />
                  </div>
                </div>
              )}

              {/* 1. DATA PRIBADI & IDENTITAS */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 border-b border-slate-200/80 pb-2 text-xs">
                  {tr('1. Data Pribadi & Identitas Karyawan', '1. Personal Data & Employee Identity')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('NIK (Nomor Induk Karyawan) *', 'NIK (Employee ID Number) *')}</label>
                    <input
                      type="text"
                      required
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                      placeholder={tr('Contoh: EMP001', 'e.g. EMP001')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      {tr('Nama Lengkap', 'Full Name')} (
                      {formData.is_foreign_worker ? tr('Sesuai Paspor', 'As per Passport') : tr('Sesuai KTP', 'As per KTP')}) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder={tr('Contoh: Hendra Kurniawan', 'e.g. Hendra Kurniawan')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Jenis Kelamin *', 'Gender *')}</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="male">{tr('Laki-laki (Pria)', 'Male')}</option>
                      <option value="female">{tr('Perempuan (Wanita)', 'Female')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Status Pernikahan *', 'Marital Status *')}</label>
                    <select
                      value={formData.marital_status}
                      onChange={(e) => setFormData({ ...formData, marital_status: e.target.value as any })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      {MARITAL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{tr(m.label, m.labelEn)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Tempat Lahir *', 'Place of Birth *')}</label>
                    <input
                      type="text"
                      required
                      value={formData.place_of_birth}
                      onChange={(e) => setFormData({ ...formData, place_of_birth: e.target.value })}
                      placeholder={tr('Kota kelahiran, misal: Jakarta', 'City of birth, e.g. Jakarta')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Tanggal Lahir *', 'Date of Birth *')}</label>
                    <input
                      type="date"
                      required
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Agama *', 'Religion *')}</label>
                    <select
                      value={formData.religion}
                      onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      {RELIGION_OPTIONS.map((r) => (
                        <option key={r} value={r}>{tr(r, RELIGION_LABEL_EN[r] ?? r)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Status PTKP (Pajak) *', 'PTKP Status (Tax) *')}</label>
                    <select
                      value={formData.ptkp_status}
                      onChange={(e) => setFormData({ ...formData, ptkp_status: e.target.value as any })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                    >
                      <option value="TK/0">{tr('TK/0 (Lajang tanpa tanggungan - TER A)', 'TK/0 (Single, no dependents - TER A)')}</option>
                      <option value="TK/1">{tr('TK/1 (Lajang 1 tanggungan - TER A)', 'TK/1 (Single, 1 dependent - TER A)')}</option>
                      <option value="K/0">{tr('K/0 (Menikah tanpa tanggungan - TER A)', 'K/0 (Married, no dependents - TER A)')}</option>
                      <option value="K/1">{tr('K/1 (Menikah 1 tanggungan - TER B)', 'K/1 (Married, 1 dependent - TER B)')}</option>
                      <option value="K/2">{tr('K/2 (Menikah 2 tanggungan - TER B)', 'K/2 (Married, 2 dependents - TER B)')}</option>
                      <option value="TK/2">{tr('TK/2 (Lajang 2 tanggungan - TER B)', 'TK/2 (Single, 2 dependents - TER B)')}</option>
                      <option value="TK/3">{tr('TK/3 (Lajang 3 tanggungan - TER B)', 'TK/3 (Single, 3 dependents - TER B)')}</option>
                      <option value="K/3">{tr('K/3 (Menikah 3 tanggungan - TER C)', 'K/3 (Married, 3 dependents - TER C)')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      {formData.is_foreign_worker
                        ? tr('Nomor KTP (Opsional untuk WNA)', 'KTP Number (Optional for Foreign Nationals)')
                        : tr('Nomor KTP *', 'KTP Number *')}
                    </label>
                    <input
                      type="text"
                      required={!formData.is_foreign_worker}
                      maxLength={16}
                      value={formData.ktp_number}
                      onChange={(e) => setFormData({ ...formData, ktp_number: e.target.value })}
                      placeholder={formData.is_foreign_worker ? tr('Kosongkan jika hanya menggunakan paspor', 'Leave blank if using passport only') : '31710101019...'}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('NPWP (Nomor Pokok Wajib Pajak)', 'NPWP (Tax Identification Number)')}</label>
                    <input
                      type="text"
                      value={formData.npwp_number}
                      onChange={(e) => setFormData({ ...formData, npwp_number: e.target.value })}
                      placeholder={tr('00.000.000.0-000.000 (Opsional)', '00.000.000.0-000.000 (Optional)')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor WhatsApp / HP *', 'WhatsApp / Mobile Number *')}</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="081234567890"
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Email Pribadi *', 'Personal Email *')}</label>
                    <input
                      type="email"
                      required
                      value={formData.personal_email}
                      onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
                      placeholder="karyawan@gmail.com"
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Alamat Lengkap / Domisili *', 'Full Address / Domicile *')}</label>
                    <textarea
                      required
                      rows={2}
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder={tr('Jl. Nama Jalan No. XX, RT/RW, Kelurahan, Kecamatan, Kota / Kabupaten...', 'Street Name No. XX, RT/RW, Village, District, City / Regency...')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 2. PENEMPATAN KERJA & JABATAN */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 border-b border-slate-200/80 pb-2 text-xs">
                  {tr('2. Penempatan Kerja & Kontrak', '2. Work Placement & Contract')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Cabang Penempatan *', 'Placement Branch *')}</label>
                    <select
                      value={formData.branch_id}
                      onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Departemen *', 'Department *')}</label>
                    <select
                      value={formData.department_id}
                      onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Pola Shift Kerja / Jam Masuk *', 'Work Shift Pattern / Check-in Time *')}</label>
                    <select
                      value={formData.shift_pattern_id}
                      onChange={(e) => setFormData({ ...formData, shift_pattern_id: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
                    >
                      {shiftPatterns.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name} ({sp.start_time} - {sp.end_time})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Jabatan (Job Title) *', 'Job Title *')}</label>
                    <input
                      type="text"
                      required
                      value={formData.job_title}
                      onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                      placeholder={tr('Misal: Staff Finance, Senior Developer, Director', 'e.g. Finance Staff, Senior Developer, Director')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {tr(
                        "Isi 'Director' jika akun ini bertugas menyetujui (APPROVED BY) pada Claim Excel.",
                        "Use 'Director' if this account signs off as APPROVED BY on Claim Excel sheets."
                      )}
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Atasan Langsung (Manager)', 'Direct Supervisor (Manager)')}</label>
                    <select
                      value={formData.manager_id}
                      onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="">{tr('-- Tanpa Atasan / Melapor ke Direksi --', '-- No Supervisor / Reports to the Board of Directors --')}</option>
                      {employees.map((em) => (
                        <option key={em.id} value={em.id}>{em.full_name} ({em.job_title})</option>
                      ))}
                    </select>
                  </div>

                  {isOwnerAdmin && (
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Hak Akses Akun (Portal Role)', 'Account Access (Portal Role)')}</label>
                      <select
                        value={formData.user_role}
                        onChange={(e) => setFormData({ ...formData, user_role: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                      >
                        <option value="employee">{tr('Karyawan / Staff (ESS Mobile)', 'Employee / Staff (ESS Mobile)')}</option>
                        <option value="manager">{tr('Supervisor / Manager', 'Supervisor / Manager')}</option>
                        <option value="finance">{tr('Finance / Payroll', 'Finance / Payroll')}</option>
                        <option value="owner_admin">{tr('Admin / Director (Akses Penuh)', 'Admin / Director (Full Access)')}</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Status Kepegawaian *', 'Employment Status *')}</label>
                    <select
                      value={formData.employment_status}
                      onChange={(e) => setFormData({ ...formData, employment_status: e.target.value as any })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                    >
                      <option value="PKWTT">{tr('PKWTT (Karyawan Tetap)', 'PKWTT (Permanent Employee)')}</option>
                      <option value="PKWT">{tr('PKWT (Karyawan Kontrak)', 'PKWT (Contract Employee)')}</option>
                      <option value="probation">{tr('Masa Percobaan (Probation)', 'Probation Period')}</option>
                      <option value="intern">{tr('Magang (Internship)', 'Internship')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Tanggal Masuk (Join Date) *', 'Join Date *')}</label>
                    <input
                      type="date"
                      required
                      value={formData.join_date}
                      onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  {formData.employment_status !== 'PKWTT' && (
                    <>
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">{tr('Mulai Kontrak', 'Contract Start')}</label>
                        <input
                          type="date"
                          value={formData.contract_start_date}
                          onChange={(e) => setFormData({ ...formData, contract_start_date: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">{tr('Berakhir Kontrak', 'Contract End')}</label>
                        <input
                          type="date"
                          value={formData.contract_end_date}
                          onChange={(e) => setFormData({ ...formData, contract_end_date: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 3. KOMPENSASI & REKENING BANK PAYROLL */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 border-b border-slate-200/80 pb-2 text-xs">
                  {tr('3. Kompensasi & Rekening Bank Payroll', '3. Compensation & Payroll Bank Account')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Gaji Pokok (Rp) *', 'Base Salary (Rp) *')}</label>
                    <input
                      type="number"
                      step="100000"
                      required
                      value={formData.base_salary}
                      onChange={(e) => setFormData({ ...formData, base_salary: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Tunjangan Tetap (Rp)', 'Fixed Allowances (Rp)')}</label>
                    <input
                      type="number"
                      step="50000"
                      value={formData.fixed_allowances}
                      onChange={(e) => setFormData({ ...formData, fixed_allowances: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Bank Payroll', 'Payroll Bank Name')}</label>
                    <select
                      value={formData.bank_name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const prefill = getBankPrefill(name);
                        setFormData({
                          ...formData,
                          bank_name: name,
                          bank_swift_code: prefill?.bank_swift_code || '',
                          bank_branch_name: prefill?.bank_branch_name || '',
                          bank_branch_code: prefill?.bank_branch_code || '',
                          bank_branch_address: prefill?.bank_branch_address || '',
                        });
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    >
                      {BANK_DIRECTORY.map((bk) => (
                        <option key={bk.name} value={bk.name}>{bk.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor Rekening Bank', 'Bank Account Number')}</label>
                    <input
                      type="text"
                      value={formData.bank_account_number}
                      onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                      placeholder={tr('Contoh: 1234567890', 'e.g. 1234567890')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Pemilik Rekening', 'Account Holder Name')}</label>
                    <input
                      type="text"
                      value={formData.bank_account_holder}
                      onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                      placeholder={tr('Sesuai buku tabungan (misal: Hendra Kurniawan)', 'As shown on the passbook (e.g. Hendra Kurniawan)')}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* BPJS & TAX CONFIGURATION (OPTIONAL BPJS TK & SELF TAX) */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-4 text-xs">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
                  <span>{tr('Kebijakan BPJS & Pajak Karyawan', 'Employee BPJS & Tax Policy')}</span>
                  <span className="text-[11px] text-slate-500 font-normal">{tr('Dapat disesuaikan per karyawan', 'Adjustable per employee')}</span>
                </div>

                {/* 1. BPJS Ketenagakerjaan (Optional) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hasBpjsTkCheck"
                      checked={formData.has_bpjs_tk}
                      onChange={(e) => setFormData({ ...formData, has_bpjs_tk: e.target.checked })}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                    <label htmlFor="hasBpjsTkCheck" className="text-slate-800 font-bold cursor-pointer">
                      {tr('Ikut Program BPJS Ketenagakerjaan (JHT, JP, JKK, JKM)', 'Enrolled in BPJS Ketenagakerjaan (JHT, JP, JKK, JKM)')}
                    </label>
                    <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-medium">{tr('Opsional', 'Optional')}</span>
                  </div>
                  {formData.has_bpjs_tk ? (
                    <div className="pl-6">
                      <label className="block text-slate-600 text-[11px] mb-1">{tr('Nomor KPJ BPJS Ketenagakerjaan (Opsional)', 'BPJS Ketenagakerjaan KPJ Number (Optional)')}</label>
                      <input
                        type="text"
                        value={formData.bpjs_tk_number}
                        onChange={(e) => setFormData({ ...formData, bpjs_tk_number: e.target.value })}
                        placeholder={tr('Contoh: 12345678901 (11 Digit)', 'e.g. 12345678901 (11 Digits)')}
                        className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                      />
                    </div>
                  ) : (
                    <p className="pl-6 text-[11px] text-slate-500 italic">
                      {tr('Karyawan tidak memiliki BPJS Ketenagakerjaan. Iuran JHT, JP, JKK, & JKM tidak akan dipotong atau dibebankan.', 'The employee is not enrolled in BPJS Ketenagakerjaan. JHT, JP, JKK, & JKM contributions will not be deducted or charged.')}
                    </p>
                  )}
                </div>

                {/* 2. BPJS Kesehatan (Optional) */}
                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hasBpjsKesCheck"
                      checked={formData.has_bpjs_kes}
                      onChange={(e) => setFormData({ ...formData, has_bpjs_kes: e.target.checked })}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                    <label htmlFor="hasBpjsKesCheck" className="text-slate-800 font-bold cursor-pointer">
                      {tr('Ikut Program BPJS Kesehatan', 'Enrolled in BPJS Kesehatan')}
                    </label>
                    <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-medium">{tr('Opsional', 'Optional')}</span>
                  </div>
                  {formData.has_bpjs_kes && (
                    <div className="pl-6">
                      <label className="block text-slate-600 text-[11px] mb-1">{tr('Nomor Kartu BPJS Kesehatan (Opsional)', 'BPJS Kesehatan Card Number (Optional)')}</label>
                      <input
                        type="text"
                        value={formData.bpjs_kesehatan_number}
                        onChange={(e) => setFormData({ ...formData, bpjs_kesehatan_number: e.target.value })}
                        placeholder={tr('Contoh: 0001234567890 (13 Digit)', 'e.g. 0001234567890 (13 Digits)')}
                        className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* 3. Tax Scheme / Employee Pays Own Tax */}
                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <label className="block text-slate-800 font-bold">{tr('Skema Pembayaran PPh 21 (Pajak Penghasilan)', 'PPh 21 Payment Scheme (Income Tax)')}</label>
                  <select
                    value={formData.tax_scheme}
                    onChange={(e) => {
                      const scheme = e.target.value;
                      setFormData({
                        ...formData,
                        tax_scheme: scheme,
                        pays_own_tax: scheme === 'self_paid',
                      });
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800"
                  >
                    <option value="company_withheld">{tr('Dipotong oleh Perusahaan via Slip Gaji (Standar TER / DJP)', 'Withheld by the Company via Payslip (Standard TER / DJP)')}</option>
                    <option value="self_paid">{tr('Karyawan Bayar Pajak Sendiri (PPh 21 Mandiri - Tanpa Potongan Slip Gaji)', 'Employee Pays Own Tax (Self-Paid PPh 21 - No Payslip Deduction)')}</option>
                  </select>
                  {formData.tax_scheme === 'self_paid' ? (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      {tr('PPh 21 tidak akan dipotong dari gaji take home pay karyawan. Karyawan menyetor pajaknya secara mandiri.', 'PPh 21 will not be deducted from the employee take home pay. The employee pays the tax independently.')}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      {tr('PPh 21 dihitung otomatis menggunakan formula TER berdasarkan penghasilan bruto bulanan & status PTKP.', 'PPh 21 is calculated automatically using the TER formula based on monthly gross income & PTKP status.')}
                    </p>
                  )}
                </div>

                {/* 4. Payroll Exemption */}
                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="excludeFromPayrollCheck"
                      checked={formData.exclude_from_payroll}
                      onChange={(e) => setFormData({ ...formData, exclude_from_payroll: e.target.checked })}
                      className="rounded text-amber-600 cursor-pointer"
                    />
                    <label htmlFor="excludeFromPayrollCheck" className="text-slate-800 font-bold cursor-pointer">
                      {tr('Kecualikan dari Penggajian (Payroll)', 'Exclude from Payroll')}
                    </label>
                    <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-medium">{tr('Opsional', 'Optional')}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pl-6">
                    {tr('Karyawan tetap aktif (mis. Direktur) namun tidak akan ditarik ke dalam periode payroll.', 'The employee remains active (e.g. Director) but will not be pulled into payroll periods.')}
                  </p>
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
                    {tr('Buat Kotak Surat Resmi via Purelymail API v0', 'Create Official Mailbox via Purelymail API v0')}
                  </label>
                </div>
                {formData.provision_company_email && (
                  <div>
                    <label className="block text-slate-600 text-[11px] mb-1">{tr('Username Email Perusahaan (Opsional)', 'Company Email Username (Optional)')}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder={tr('contoh: hendra.kurniawan', 'e.g. hendra.kurniawan')}
                        value={formData.company_email_username}
                        onChange={(e) => setFormData({ ...formData, company_email_username: e.target.value })}
                        className="p-2 border border-slate-300 rounded-lg flex-1 bg-white"
                      />
                      <span className="text-slate-500 font-mono">@{company?.purelymail_domain || 'company.id'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50/80 rounded-b-3xl shrink-0">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 cursor-pointer"
              >
                {tr('Batal', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition"
              >
                {tr('Daftarkan Karyawan & Kirim Undangan', 'Register Employee & Send Invitation')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

      {/* EDIT EMPLOYEE MODAL */}
      {editingEmp && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditingEmp(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-900">{tr('Edit Data Karyawan', 'Edit Employee Data')}</h3>
                <p className="text-xs text-slate-500">NIK: {editingEmp.nik} • {editingEmp.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-5 sm:p-6 space-y-4 text-xs flex-1">
                {/* 1. DATA PRIBADI & IDENTITAS */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-900 border-b border-slate-200/80 pb-2 text-xs">
                    {tr('1. Data Pribadi & Identitas Karyawan', '1. Personal Data & Employee Identity')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('NIK (Nomor Induk Karyawan) *', 'NIK (Employee ID Number) *')}</label>
                      <input
                        type="text"
                        required
                        value={editingEmp.nik}
                        onChange={(e) => setEditingEmp({ ...editingEmp, nik: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Lengkap *', 'Full Name *')}</label>
                      <input
                        type="text"
                        required
                        value={editingEmp.full_name}
                        onChange={(e) => setEditingEmp({ ...editingEmp, full_name: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Jenis Kelamin *', 'Gender *')}</label>
                      <select
                        value={editingEmp.gender || 'male'}
                        onChange={(e) => setEditingEmp({ ...editingEmp, gender: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        <option value="male">{tr('Laki-laki (Pria)', 'Male')}</option>
                        <option value="female">{tr('Perempuan (Wanita)', 'Female')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Status Pernikahan *', 'Marital Status *')}</label>
                      <select
                        value={editingEmp.marital_status || 'single'}
                        onChange={(e) => setEditingEmp({ ...editingEmp, marital_status: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        {MARITAL_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>{tr(m.label, m.labelEn)}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Tempat Lahir *', 'Place of Birth *')}</label>
                      <input
                        type="text"
                        required
                        value={editingEmp.place_of_birth || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, place_of_birth: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Tanggal Lahir *', 'Date of Birth *')}</label>
                      <input
                        type="date"
                        required
                        value={editingEmp.date_of_birth || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, date_of_birth: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Agama *', 'Religion *')}</label>
                      <select
                        value={editingEmp.religion || 'Islam'}
                        onChange={(e) => setEditingEmp({ ...editingEmp, religion: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        {RELIGION_OPTIONS.map((r) => (
                          <option key={r} value={r}>{tr(r, RELIGION_LABEL_EN[r] ?? r)}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Status PTKP (Pajak) *', 'PTKP Status (Tax) *')}</label>
                      <select
                        value={editingEmp.ptkp_status}
                        onChange={(e) => setEditingEmp({ ...editingEmp, ptkp_status: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                      >
                        <option value="TK/0">{tr('TK/0 (Lajang tanpa tanggungan - TER A)', 'TK/0 (Single, no dependents - TER A)')}</option>
                        <option value="TK/1">{tr('TK/1 (Lajang 1 tanggungan - TER A)', 'TK/1 (Single, 1 dependent - TER A)')}</option>
                        <option value="K/0">{tr('K/0 (Menikah tanpa tanggungan - TER A)', 'K/0 (Married, no dependents - TER A)')}</option>
                        <option value="K/1">{tr('K/1 (Menikah 1 tanggungan - TER B)', 'K/1 (Married, 1 dependent - TER B)')}</option>
                        <option value="K/2">{tr('K/2 (Menikah 2 tanggungan - TER B)', 'K/2 (Married, 2 dependents - TER B)')}</option>
                        <option value="TK/2">{tr('TK/2 (Lajang 2 tanggungan - TER B)', 'TK/2 (Single, 2 dependents - TER B)')}</option>
                        <option value="TK/3">{tr('TK/3 (Lajang 3 tanggungan - TER B)', 'TK/3 (Single, 3 dependents - TER B)')}</option>
                        <option value="K/3">{tr('K/3 (Menikah 3 tanggungan - TER C)', 'K/3 (Married, 3 dependents - TER C)')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor KTP', 'KTP Number')}</label>
                      <input
                        type="text"
                        maxLength={16}
                        value={editingEmp.ktp_number || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, ktp_number: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">NPWP</label>
                      <input
                        type="text"
                        value={editingEmp.npwp_number || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, npwp_number: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor WhatsApp / HP *', 'WhatsApp / Mobile Number *')}</label>
                      <input
                        type="tel"
                        required
                        value={editingEmp.phone || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, phone: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Email Pribadi *', 'Personal Email *')}</label>
                      <input
                        type="email"
                        required
                        value={editingEmp.personal_email || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, personal_email: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Alamat Lengkap / Domisili *', 'Full Address / Domicile *')}</label>
                      <textarea
                        required
                        rows={2}
                        value={editingEmp.address || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, address: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. PENEMPATAN KERJA & JABATAN */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-900 border-b border-slate-200/80 pb-2 text-xs">
                    {tr('2. Penempatan Kerja, Jabatan & Status', '2. Work Placement, Job Title & Status')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Cabang Penempatan *', 'Placement Branch *')}</label>
                      <select
                        value={editingEmp.branch_id}
                        onChange={(e) => setEditingEmp({ ...editingEmp, branch_id: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Departemen *', 'Department *')}</label>
                      <select
                        value={editingEmp.department_id}
                        onChange={(e) => setEditingEmp({ ...editingEmp, department_id: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Pola Shift Kerja / Jam Masuk *', 'Work Shift Pattern / Check-in Time *')}</label>
                      <select
                        value={editingEmp.shift_pattern_id || 'shift-reg'}
                        onChange={(e) => setEditingEmp({ ...editingEmp, shift_pattern_id: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
                      >
                        {shiftPatterns.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name} ({sp.start_time} - {sp.end_time})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Jabatan (Job Title) *', 'Job Title *')}</label>
                      <input
                        type="text"
                        required
                        value={editingEmp.job_title}
                        onChange={(e) => setEditingEmp({ ...editingEmp, job_title: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        {tr(
                          "Isi 'Director' jika akun ini menyetujui (APPROVED BY) di Claim Excel.",
                          "Use 'Director' if this account signs off as APPROVED BY on Claim Excel."
                        )}
                      </span>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Atasan Langsung (Manager)', 'Direct Supervisor (Manager)')}</label>
                      <select
                        value={editingEmp.manager_id || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, manager_id: e.target.value || null })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        <option value="">{tr('-- Tanpa Atasan / Melapor ke Direksi --', '-- No Supervisor / Reports to the Board of Directors --')}</option>
                        {employees.filter((em) => em.id !== editingEmp.id).map((em) => (
                          <option key={em.id} value={em.id}>{em.full_name} ({em.job_title})</option>
                        ))}
                      </select>
                    </div>

                    {isOwnerAdmin && (
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">{tr('Hak Akses Akun (Portal Role)', 'Account Access (Portal Role)')}</label>
                        <select
                          value={editingEmp.user_role || 'employee'}
                          onChange={(e) => setEditingEmp({ ...editingEmp, user_role: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                        >
                          <option value="employee">{tr('Karyawan / Staff (ESS Mobile)', 'Employee / Staff (ESS Mobile)')}</option>
                          <option value="manager">{tr('Supervisor / Manager', 'Supervisor / Manager')}</option>
                          <option value="finance">{tr('Finance / Payroll', 'Finance / Payroll')}</option>
                          <option value="owner_admin">{tr('Admin / Director (Akses Penuh)', 'Admin / Director (Full Access)')}</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Status Kepegawaian *', 'Employment Status *')}</label>
                      <select
                        value={editingEmp.employment_status}
                        onChange={(e) => setEditingEmp({ ...editingEmp, employment_status: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                      >
                        <option value="PKWTT">{tr('PKWTT (Karyawan Tetap)', 'PKWTT (Permanent Employee)')}</option>
                        <option value="PKWT">{tr('PKWT (Karyawan Kontrak)', 'PKWT (Contract Employee)')}</option>
                        <option value="probation">{tr('Masa Percobaan (Probation)', 'Probation Period')}</option>
                        <option value="intern">{tr('Magang (Internship)', 'Internship')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Status Siklus Kerja (Lifecycle) *', 'Lifecycle Status *')}</label>
                      <select
                        value={editingEmp.lifecycle_status || 'active'}
                        onChange={(e) => setEditingEmp({ ...editingEmp, lifecycle_status: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                      >
                        <option value="active">{tr('Active (Aktif Bekerja)', 'Active (Currently Working)')}</option>
                        <option value="probation">{tr('Probation (Percobaan)', 'Probation')}</option>
                        <option value="on_leave">{tr('On Leave (Cuti Panjang)', 'On Leave (Extended Leave)')}</option>
                        <option value="resigned">{tr('Resigned (Mengundurkan Diri)', 'Resigned')}</option>
                        <option value="terminated">{tr('Terminated (Diberhentikan / PHK)', 'Terminated (Dismissed / Layoff)')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Tanggal Masuk (Join Date) *', 'Join Date *')}</label>
                      <input
                        type="date"
                        required
                        value={editingEmp.join_date || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, join_date: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    {editingEmp.employment_status !== 'PKWTT' && (
                      <>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">{tr('Mulai Kontrak', 'Contract Start')}</label>
                          <input
                            type="date"
                            value={editingEmp.contract_start_date || ''}
                            onChange={(e) => setEditingEmp({ ...editingEmp, contract_start_date: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">{tr('Berakhir Kontrak', 'Contract End')}</label>
                          <input
                            type="date"
                            value={editingEmp.contract_end_date || ''}
                            onChange={(e) => setEditingEmp({ ...editingEmp, contract_end_date: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Tanggal Pengunduran Diri', 'Resignation Date')}</label>
                      <input
                        type="date"
                        value={editingEmp.resignation_date || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, resignation_date: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Hari Kerja Terakhir', 'Last Working Date')}</label>
                      <input
                        type="date"
                        value={editingEmp.last_working_date || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, last_working_date: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-amber-900">
                            {tr('Offboarding & Estimasi Pesangon', 'Offboarding & Severance Estimate')}
                          </p>
                          <p className="text-[10px] text-amber-700">
                            {tr('Estimasi berdasarkan PP 35/2021 (UP + UPMK + UPH 15%).', 'Estimate based on PP 35/2021 (UP + UPMK + 15% UPH).')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCalcSeverance}
                          disabled={calculatingSeverance}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                        >
                          {calculatingSeverance
                            ? tr('Menghitung...', 'Calculating...')
                            : tr('Hitung Pesangon', 'Calculate Severance')}
                        </button>
                      </div>

                      {severanceResult && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                          <div className="rounded-lg bg-white/80 px-2 py-1.5">
                            <span className="block text-[9px] uppercase text-slate-400">{tr('Masa Kerja', 'Service')}</span>
                            <span className="font-bold text-slate-800">{severanceResult.months_of_service} {tr('bulan', 'months')}</span>
                          </div>
                          <div className="rounded-lg bg-white/80 px-2 py-1.5">
                            <span className="block text-[9px] uppercase text-slate-400">{tr('Upah Bulanan', 'Monthly Wage')}</span>
                            <span className="font-bold text-slate-800">{formatCurrency(severanceResult.monthly_wage)}</span>
                          </div>
                          <div className="rounded-lg bg-white/80 px-2 py-1.5">
                            <span className="block text-[9px] uppercase text-slate-400">{tr('Uang Pesangon', 'Severance')}</span>
                            <span className="font-bold text-slate-800">{formatCurrency(severanceResult.uang_pesangon)}</span>
                          </div>
                          <div className="rounded-lg bg-white/80 px-2 py-1.5">
                            <span className="block text-[9px] uppercase text-slate-400">UPMK</span>
                            <span className="font-bold text-slate-800">{formatCurrency(severanceResult.uang_penghargaan_masa_kerja)}</span>
                          </div>
                          <div className="rounded-lg bg-white/80 px-2 py-1.5">
                            <span className="block text-[9px] uppercase text-slate-400">UPH 15%</span>
                            <span className="font-bold text-slate-800">{formatCurrency(severanceResult.uang_penggantian_hak)}</span>
                          </div>
                          <div className="rounded-lg bg-amber-100 px-2 py-1.5">
                            <span className="block text-[9px] uppercase text-amber-700">{tr('Total', 'Total')}</span>
                            <span className="font-black text-amber-900">{formatCurrency(severanceResult.total)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. KOMPENSASI & REKENING BANK PAYROLL */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-900 border-b border-slate-200/80 pb-2 text-xs">
                    {tr('3. Kompensasi & Rekening Bank Payroll', '3. Compensation & Payroll Bank Account')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Gaji Pokok (Rp) *', 'Base Salary (Rp) *')}</label>
                      <input
                        type="number"
                        step="100000"
                        required
                        value={editingEmp.base_salary || 0}
                        onChange={(e) => setEditingEmp({ ...editingEmp, base_salary: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-emerald-700"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Tunjangan Tetap (Rp)', 'Fixed Allowances (Rp)')}</label>
                      <input
                        type="number"
                        step="50000"
                        value={editingEmp.fixed_allowances || 0}
                        onChange={(e) => setEditingEmp({ ...editingEmp, fixed_allowances: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Bank Payroll', 'Payroll Bank Name')}</label>
                      <select
                        value={editingEmp.bank_name || 'BCA'}
                        onChange={(e) => {
                          const name = e.target.value;
                          const prefill = getBankPrefill(name);
                          setEditingEmp({
                            ...editingEmp,
                            bank_name: name,
                            bank_swift_code: prefill?.bank_swift_code || '',
                            bank_branch_name: prefill?.bank_branch_name || '',
                            bank_branch_code: prefill?.bank_branch_code || '',
                            bank_branch_address: prefill?.bank_branch_address || '',
                          });
                        }}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      >
                        {BANK_DIRECTORY.map((bk) => (
                          <option key={bk.name} value={bk.name}>{bk.name}</option>
                        ))}
                        {editingEmp.bank_name && !BANK_DIRECTORY.some((bk) => bk.name === editingEmp.bank_name) && (
                          <option value={editingEmp.bank_name}>{editingEmp.bank_name}</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Nomor Rekening Bank', 'Bank Account Number')}</label>
                      <input
                        type="text"
                        value={editingEmp.bank_account_number || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, bank_account_number: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl font-mono bg-white"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">{tr('Nama Pemilik Rekening', 'Account Holder Name')}</label>
                      <input
                        type="text"
                        value={editingEmp.bank_account_holder || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, bank_account_holder: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Swift Code</label>
                      <input
                        type="text"
                        value={editingEmp.bank_swift_code || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, bank_swift_code: e.target.value })}
                        placeholder="JAGBIDJA / JAGBIDJAXXX"
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Branch Name</label>
                      <input
                        type="text"
                        value={editingEmp.bank_branch_name || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, bank_branch_name: e.target.value })}
                        placeholder="Head Office Jakarta"
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Branch Code</label>
                      <input
                        type="text"
                        value={editingEmp.bank_branch_code || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, bank_branch_code: e.target.value })}
                        placeholder="XXX"
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-mono"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">Branch Address</label>
                      <input
                        type="text"
                        value={editingEmp.bank_branch_address || ''}
                        onChange={(e) => setEditingEmp({ ...editingEmp, bank_branch_address: e.target.value })}
                        placeholder="FLOOR 46 JL. DR. IDE ANAK AGUNG, GDE AGUNG KAV 5.5-5.6"
                        className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. BPJS & SKEMA PAJAK */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-4 text-xs">
                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-2">
                    {tr('4. Kebijakan BPJS & Pajak PPh 21', '4. BPJS & PPh 21 Tax Policy')}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editHasBpjsTk"
                        checked={editingEmp.has_bpjs_tk === 1 || editingEmp.has_bpjs_tk === true}
                        onChange={(e) => setEditingEmp({ ...editingEmp, has_bpjs_tk: e.target.checked ? 1 : 0 })}
                        className="rounded text-blue-600 cursor-pointer"
                      />
                      <label htmlFor="editHasBpjsTk" className="text-slate-800 font-bold cursor-pointer">
                        {tr('Ikut Program BPJS Ketenagakerjaan (JHT, JP, JKK, JKM)', 'Enrolled in BPJS Ketenagakerjaan (JHT, JP, JKK, JKM)')}
                      </label>
                    </div>
                    {(editingEmp.has_bpjs_tk === 1 || editingEmp.has_bpjs_tk === true) && (
                      <div className="pl-6">
                        <label className="block text-slate-600 text-[11px] mb-1">{tr('Nomor KPJ BPJS TK', 'BPJS TK KPJ Number')}</label>
                        <input
                          type="text"
                          value={editingEmp.bpjs_tk_number || ''}
                          onChange={(e) => setEditingEmp({ ...editingEmp, bpjs_tk_number: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editHasBpjsKes"
                        checked={editingEmp.has_bpjs_kes === 1 || editingEmp.has_bpjs_kes === true}
                        onChange={(e) => setEditingEmp({ ...editingEmp, has_bpjs_kes: e.target.checked ? 1 : 0 })}
                        className="rounded text-blue-600 cursor-pointer"
                      />
                      <label htmlFor="editHasBpjsKes" className="text-slate-800 font-bold cursor-pointer">
                        {tr('Ikut Program BPJS Kesehatan', 'Enrolled in BPJS Kesehatan')}
                      </label>
                    </div>
                    {(editingEmp.has_bpjs_kes === 1 || editingEmp.has_bpjs_kes === true) && (
                      <div className="pl-6">
                        <label className="block text-slate-600 text-[11px] mb-1">{tr('Nomor Kartu BPJS Kesehatan', 'BPJS Kesehatan Card Number')}</label>
                        <input
                          type="text"
                          value={editingEmp.bpjs_kesehatan_number || ''}
                          onChange={(e) => setEditingEmp({ ...editingEmp, bpjs_kesehatan_number: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200/60">
                    <label className="block text-slate-800 font-bold">{tr('Skema Pembayaran PPh 21', 'PPh 21 Payment Scheme')}</label>
                    <select
                      value={editingEmp.tax_scheme || 'company_withheld'}
                      onChange={(e) => {
                        const scheme = e.target.value;
                        setEditingEmp({
                          ...editingEmp,
                          tax_scheme: scheme,
                          pays_own_tax: scheme === 'self_paid' ? 1 : 0,
                        });
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800"
                    >
                      <option value="company_withheld">{tr('Dipotong oleh Perusahaan via Slip Gaji (Standar TER / DJP)', 'Withheld by the Company via Payslip (Standard TER / DJP)')}</option>
                      <option value="self_paid">{tr('Karyawan Bayar Pajak Sendiri (PPh 21 Mandiri - Tanpa Potongan Slip Gaji)', 'Employee Pays Own Tax (Self-Paid PPh 21 - No Payslip Deduction)')}</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editExcludeFromPayrollCheck"
                        checked={editingEmp.exclude_from_payroll === 1 || editingEmp.exclude_from_payroll === true}
                        onChange={(e) => setEditingEmp({ ...editingEmp, exclude_from_payroll: e.target.checked ? 1 : 0 })}
                        className="rounded text-amber-600 cursor-pointer"
                      />
                      <label htmlFor="editExcludeFromPayrollCheck" className="text-slate-800 font-bold cursor-pointer">
                        {tr('Kecualikan dari Penggajian (Payroll)', 'Exclude from Payroll')}
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500 pl-6">
                      {tr('Karyawan tetap aktif (mis. Direktur) namun tidak akan ditarik ke dalam periode payroll.', 'The employee remains active (e.g. Director) but will not be pulled into payroll periods.')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50/80 rounded-b-3xl shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition disabled:opacity-50"
                >
                  {savingEdit ? tr('Menyimpan...', 'Saving...') : tr('Simpan Perubahan', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingEmp && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeletingEmp(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">{tr('Hapus Data Karyawan?', 'Delete Employee Data?')}</h3>
                <p className="text-xs text-slate-500 font-mono">NIK: {deletingEmp.nik}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {tr('Apakah Anda yakin ingin menghapus karyawan', 'Are you sure you want to delete employee')}{' '}
              <strong className="text-slate-900">{deletingEmp.full_name}</strong>
              {tr('? Tindakan ini akan menghapus akun portal login, data absensi, pengajuan cuti, dan riwayat dokumen terkait.', '? This action will delete the login portal account, attendance data, leave requests, and related document history.')}
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingEmp(null)}
                className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 cursor-pointer text-xs"
              >
                {tr('Batal', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteEmployee}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer text-xs transition disabled:opacity-50"
              >
                {deleting ? tr('Menghapus...', 'Deleting...') : tr('Ya, Hapus Karyawan', 'Yes, Delete Employee')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowImportModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">{tr('Bulk Import Karyawan dari Excel / CSV', 'Bulk Import Employees from Excel / CSV')}</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {tr('Unggah file spreadsheet berisikan data awal karyawan. Sistem akan memvalidasi status PTKP, NIK, dan nomor KTP per baris.', 'Upload a spreadsheet file containing the initial employee data. The system will validate PTKP status, NIK, and KTP number for each row.')}
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={downloadSampleTemplate}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <FileSpreadsheet size={16} className="text-emerald-600" />
                <span>{tr('Unduh Template Excel Resmi', 'Download Official Excel Template')}</span>
              </button>
              <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1.5">
                <Upload size={16} />
                <span>{tr('Pilih File Excel (.xlsx / .csv)', 'Choose Excel File (.xlsx / .csv)')}</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {importRows.length > 0 && (
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-800">
                  {tr(
                    `${importRows.length} baris data karyawan terbaca dari file.`,
                    `${importRows.length} rows of employee data read from the file.`
                  )}
                </span>
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">NIK</th>
                        <th className="p-2">{tr('Nama Lengkap', 'Full Name')}</th>
                        <th className="p-2">PTKP</th>
                        <th className="p-2">{tr('Jabatan', 'Job Title')}</th>
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
                  <p className="text-[10px] text-slate-400 mt-1">{tr(`Menampilkan 10 dari ${importRows.length} baris.`, `Showing 10 of ${importRows.length} rows.`)}</p>
                )}
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-xs text-rose-800 space-y-1 max-h-36 overflow-y-auto">
                <strong className="block text-rose-900">{tr('Kesalahan Validasi:', 'Validation Errors:')}</strong>
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
                {tr('Batal', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={importRows.length === 0 || importing}
                onClick={handleExecuteImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
              >
                {importing
                  ? tr('Mengimpor...', 'Importing...')
                  : tr(`Proses Impor ${importRows.length} Karyawan`, `Import ${importRows.length} Employees`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

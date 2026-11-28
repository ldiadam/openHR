import React, { useState, useEffect } from 'react';
import {
  Shield,
  CreditCard,
  HeartPulse,
  Mail,
  Phone,
  MapPin,
  UserCircle,
  ChevronRight,
  ChevronDown,
  Building2,
  LogOut,
  KeyRound,
  Camera,
  Trash2,
  IdCard,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { apiFetch, getToken } from '../api';
import { fileToDownscaledDataUrl } from '../utils/image';
import { PageSkeleton } from '../components/Skeleton';
import { EmployeeIdCardModal } from '../components/EmployeeIdCardModal';
import { apiFetchCached } from '../utils/offlineCache';
import { BANK_DIRECTORY, getBankPrefill } from '../utils/banks';
import { MobileSelect } from '../components/pickers/MobileSelect';

const BankRow = ({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) => (
  <div>
    <span className="text-slate-400 block text-[10px]">{label}</span>
    <span className={`font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
  </div>
);

export const EmployeeProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const { t, tr, formatDate } = useLanguage();
  const { companyName, palette } = useCompany();
  const [openSection, setOpenSection] = useState<'profile' | 'identity' | 'bank' | 'contact' | 'bpjs' | null>('profile');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showIdCard, setShowIdCard] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.employeeId) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, 512, 0.78);
      const res = await apiFetch(`/employees/${user.employeeId}/photo`, {
        method: 'PUT',
        body: JSON.stringify({ photo_base64: dataUrl }),
      });
      setProfile((prev: any) => (prev ? { ...prev, photo_url: res.photo_url } : prev));
    } catch (err: any) {
      alert(err.message || tr('Gagal mengunggah foto.', 'Failed to upload photo.'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.employeeId) return;
    setUploadingPhoto(true);
    try {
      await apiFetch(`/employees/${user.employeeId}/photo`, { method: 'DELETE' });
      setProfile((prev: any) => (prev ? { ...prev, photo_url: null } : prev));
    } catch (err: any) {
      alert(err.message || tr('Gagal menghapus foto.', 'Failed to remove photo.'));
    } finally {
      setUploadingPhoto(false);
    }
  };
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  const [editingBank, setEditingBank] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    bank_swift_code: '',
    bank_branch_name: '',
    bank_branch_code: '',
    bank_branch_address: '',
    bank_account_number: '',
    bank_account_holder: '',
  });
  const [bankIsCustom, setBankIsCustom] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ phone: '', address: '' });

  const startEditBank = () => {
    const prefill = getBankPrefill(profile?.bank_name);
    setBankIsCustom(
      Boolean(profile?.bank_name) && !BANK_DIRECTORY.some((bank) => bank.name === profile.bank_name)
    );
    setBankForm({
      bank_name: profile?.bank_name || '',
      bank_swift_code: profile?.bank_swift_code || prefill?.bank_swift_code || '',
      bank_branch_name: profile?.bank_branch_name || prefill?.bank_branch_name || '',
      bank_branch_code: profile?.bank_branch_code || prefill?.bank_branch_code || '',
      bank_branch_address: profile?.bank_branch_address || prefill?.bank_branch_address || '',
      bank_account_number: profile?.bank_account_number || '',
      bank_account_holder: profile?.bank_account_holder || '',
    });
    setBankError(null);
    setEditingBank(true);
  };

  const startEditContact = () => {
    setContactForm({ phone: profile?.phone || '', address: profile?.address || '' });
    setContactError(null);
    setEditingContact(true);
  };

  const handleSaveContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id) return;
    setSavingContact(true);
    setContactError(null);
    try {
      await apiFetch(`/employees/${profile.id}/contact`, {
        method: 'PUT',
        body: JSON.stringify(contactForm),
      });
      setProfile({ ...profile, ...contactForm });
      setEditingContact(false);
    } catch (err: any) {
      setContactError(err.message || 'Gagal menyimpan kontak');
    } finally {
      setSavingContact(false);
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    setSavingBank(true);
    setBankError(null);
    try {
      await apiFetch(`/employees/${profile.id}/bank-details`, {
        method: 'PUT',
        body: JSON.stringify(bankForm),
      });
      setProfile({ ...profile, ...bankForm });
      setEditingBank(false);
    } catch (err: any) {
      setBankError(err.message || tr('Gagal menyimpan data rekening', 'Failed to save bank account details'));
    } finally {
      setSavingBank(false);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.employeeId) return;
      try {
        const res = await apiFetchCached(`/employees/${user.employeeId}`);
        setProfile(res.employee);
      } catch (err: any) {
        console.warn('Profile load err:', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user]);

  const handleSendEditRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setRequestSent(true);
    setTimeout(() => {
      setShowEditRequestModal(false);
      setRequestSent(false);
      setEditNotes('');
    }, 2000);
  };

  if (loading) {
    return <PageSkeleton cards={3} rows={5} />;
  }

  const hasBpjsKes = Boolean(profile?.bpjs_kesehatan_number);
  const hasBpjsTk = Boolean(profile?.bpjs_tk_number) && Boolean(profile?.has_bpjs_tk);

  return (
    <div className="max-w-md mx-auto pb-8">
      {/* Curved Colored Profile Hero */}
      <div
        className="px-6 pt-8 pb-12 rounded-b-[32px] md:rounded-3xl relative overflow-hidden text-center shadow-sm"
        style={{ background: palette.gradient, color: palette.onPrimary, viewTransitionName: 'ess-hero' }}
      >
        {/* Subtle decorative circles */}
        <div className="pointer-events-none absolute -right-12 -top-12 w-44 h-44 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -left-10 bottom-0 w-36 h-36 rounded-full border border-white/10" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 text-white font-black text-3xl flex items-center justify-center shadow-lg overflow-hidden">
              {profile?.photo_url ? (
                <img
                  src={`${profile.photo_url}&token=${encodeURIComponent(getToken() || '')}`}
                  alt={profile?.full_name || 'Profile'}
                  className="w-full h-full object-cover"
                />
              ) : (
                profile?.full_name?.charAt(0) || 'U'
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <button
              type="button"
              disabled={uploadingPhoto}
              onClick={() => photoInputRef.current?.click()}
              title={tr('Ubah Foto Profil', 'Change Profile Photo')}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white text-slate-900 shadow-md flex items-center justify-center hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              <Camera size={14} />
            </button>
            {profile?.photo_url && (
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={handleRemovePhoto}
                title={tr('Hapus Foto', 'Remove Photo')}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-600 text-white shadow-md flex items-center justify-center hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <h2 className="mt-3 text-xl font-bold tracking-tight">{profile?.full_name}</h2>
          <p className="text-xs opacity-90 mt-0.5">{profile?.job_title || tr('Karyawan', 'Employee')}</p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-xs text-xs font-semibold">
              <Building2 size={13} />
              <span>{companyName}</span>
              <span className="opacity-60">·</span>
              <span className="font-mono">{profile?.nik}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowIdCard(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-slate-900 shadow-sm text-xs font-bold hover:bg-slate-100 cursor-pointer"
            >
              <IdCard size={13} />
              <span>{tr('Kartu ID', 'ID Card')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grouped White Action Menu */}
      <div className="-mt-6 px-4 relative z-20 space-y-3">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] divide-y divide-slate-100 overflow-hidden">
          {/* 1. Profilku */}
          <div>
            <button
              type="button"
              onClick={() => setOpenSection(openSection === 'profile' ? null : 'profile')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <UserCircle size={18} />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{tr('Profilku', 'My Profile')}</span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {profile?.employment_status} · {t.employees.joinDate}: {formatDate(profile?.join_date)}
                  </span>
                </div>
              </div>
              {openSection === 'profile' ? (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-slate-400 shrink-0" />
              )}
            </button>
            {openSection === 'profile' && (
              <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-3 text-xs bg-slate-50/50 border-t border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">{t.employees.nik}</span>
                  <span className="font-semibold text-slate-800 font-mono">{profile?.nik || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">{tr('Status Kerja', 'Status')}</span>
                  <span className="font-semibold text-slate-800">{profile?.employment_status || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">{t.employees.joinDate}</span>
                  <span className="font-semibold text-slate-800">{formatDate(profile?.join_date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">{t.employees.ptkpStatus}</span>
                  <span className="font-semibold text-slate-800">{profile?.ptkp_status || 'TK/0'}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Kartu Identitas */}
          <div>
            <button
              type="button"
              onClick={() => setOpenSection(openSection === 'identity' ? null : 'identity')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Shield size={18} />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {tr('Kartu Identitas & Pajak', 'Identity & Tax ID')}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {profile?.is_foreign_worker ? profile?.passport_number : profile?.ktp_number || '-'}
                  </span>
                </div>
              </div>
              {openSection === 'identity' ? (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-slate-400 shrink-0" />
              )}
            </button>
            {openSection === 'identity' && (
              <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-3 text-xs bg-slate-50/50 border-t border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">
                    {profile?.is_foreign_worker ? t.employees.passportNumber : t.employees.ktpNumber}
                  </span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {profile?.is_foreign_worker ? profile?.passport_number : profile?.ktp_number || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">{t.employees.npwp}</span>
                  <span className="font-semibold text-slate-800 font-mono">{profile?.npwp_number || '-'}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Rekening Bank Payroll */}
          <div>
            <button
              type="button"
              onClick={() => setOpenSection(openSection === 'bank' ? null : 'bank')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <CreditCard size={18} />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {tr('Rekening Bank Payroll', 'Payroll Bank Account')}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {profile?.bank_name ? `${profile.bank_name} · ${profile.bank_account_number || ''}` : tr('Belum diatur', 'Not set')}
                  </span>
                </div>
              </div>
              {openSection === 'bank' ? (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-slate-400 shrink-0" />
              )}
            </button>

            {openSection === 'bank' && (
              <div className="px-4 pb-4 pt-2 space-y-3 text-xs bg-slate-50/50 border-t border-slate-100">
                <div className="flex items-center justify-end">
                  {!editingBank && (
                    <button
                      type="button"
                      onClick={startEditBank}
                      style={{ color: palette.primary }}
                      className="text-[11px] font-bold hover:underline cursor-pointer"
                    >
                      {tr('Ubah Rekening', 'Edit Account')}
                    </button>
                  )}
                </div>

                {editingBank ? (
                  <form onSubmit={handleSaveBank} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Nama Bank', 'Bank Name')}</label>
                        <MobileSelect
                          value={bankIsCustom ? '__custom__' : bankForm.bank_name}
                          onChange={(value) => {
                            if (value === '__custom__') {
                              setBankIsCustom(true);
                              setBankForm((prev) => ({ ...prev, bank_name: '' }));
                              return;
                            }
                            setBankIsCustom(false);
                            const prefill = getBankPrefill(value);
                            setBankForm((prev) => ({
                              ...prev,
                              bank_name: value,
                              ...(prefill
                                ? {
                                    bank_swift_code: prefill.bank_swift_code,
                                    bank_branch_name: prefill.bank_branch_name,
                                    bank_branch_code: prefill.bank_branch_code,
                                    bank_branch_address: prefill.bank_branch_address,
                                  }
                                : {}),
                            }));
                          }}
                          title={tr('Pilih Bank', 'Select Bank')}
                          placeholder={tr('Pilih bank', 'Select a bank')}
                          options={[
                            ...BANK_DIRECTORY.map((bank) => ({ value: bank.name, label: bank.name })),
                            { value: '__custom__', label: tr('Lainnya (isi manual)', 'Other (enter manually)') },
                          ]}
                        />
                        {bankIsCustom && (
                          <input
                            type="text"
                            required
                            value={bankForm.bank_name}
                            onChange={(e) => setBankForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                            placeholder={tr('Nama bank', 'Bank name')}
                            className="mt-2 w-full p-2 border border-slate-300 rounded-lg bg-white"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Kode SWIFT', 'Swift Code')}</label>
                        <input
                          type="text"
                          value={bankForm.bank_swift_code}
                          onChange={(e) => setBankForm({ ...bankForm, bank_swift_code: e.target.value })}
                          placeholder="JAGBIDJA / JAGBIDJAXXX"
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Nama Cabang', 'Branch Name')}</label>
                        <input
                          type="text"
                          value={bankForm.bank_branch_name}
                          onChange={(e) => setBankForm({ ...bankForm, bank_branch_name: e.target.value })}
                          placeholder={tr('Kantor Pusat Jakarta', 'Head Office Jakarta')}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Kode Cabang', 'Branch Code')}</label>
                        <input
                          type="text"
                          value={bankForm.bank_branch_code}
                          onChange={(e) => setBankForm({ ...bankForm, bank_branch_code: e.target.value })}
                          placeholder="XXX"
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Alamat Cabang', 'Branch Address')}</label>
                        <input
                          type="text"
                          value={bankForm.bank_branch_address}
                          onChange={(e) => setBankForm({ ...bankForm, bank_branch_address: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Nomor Rekening', 'Account Number')}</label>
                        <input
                          type="text"
                          value={bankForm.bank_account_number}
                          onChange={(e) => setBankForm({ ...bankForm, bank_account_number: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-1">{tr('Nama Pemilik Rekening', 'Account Name')}</label>
                        <input
                          type="text"
                          value={bankForm.bank_account_holder}
                          onChange={(e) => setBankForm({ ...bankForm, bank_account_holder: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                    {bankError && <p className="text-rose-600 text-[11px]">{bankError}</p>}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <button
                        type="submit"
                        disabled={savingBank}
                        style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                        className="w-full sm:w-auto px-4 py-2 rounded-full font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {savingBank ? tr('Menyimpan...', 'Saving...') : tr('Simpan Rekening', 'Save Account')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingBank(false); setBankError(null); }}
                        className="w-full sm:w-auto px-4 py-2 text-slate-600 font-semibold rounded-full hover:bg-slate-200 cursor-pointer"
                      >
                        {tr('Batal', 'Cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                    <BankRow label={tr('Nama Bank', 'Bank Name')} value={profile?.bank_name} />
                    <BankRow label={tr('Kode SWIFT', 'Swift Code')} value={profile?.bank_swift_code} mono />
                    <BankRow label={tr('Nama Cabang', 'Branch Name')} value={profile?.bank_branch_name} />
                    <BankRow label={tr('Kode Cabang', 'Branch Code')} value={profile?.bank_branch_code} mono />
                    <div className="sm:col-span-2">
                      <BankRow label={tr('Alamat Cabang', 'Branch Address')} value={profile?.bank_branch_address} />
                    </div>
                    <BankRow label={tr('Nomor Rekening', 'Account Number')} value={profile?.bank_account_number} mono />
                    <BankRow label={tr('Nama Pemilik Rekening', 'Account Name')} value={profile?.bank_account_holder} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Kontak & Alamat */}
          <div>
            <button
              type="button"
              onClick={() => setOpenSection(openSection === 'contact' ? null : 'contact')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Mail size={18} />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {tr('Akunku & Kontak', 'Account & Contact')}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {profile?.company_email || profile?.personal_email || profile?.phone || '-'}
                  </span>
                </div>
              </div>
              {openSection === 'contact' ? (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-slate-400 shrink-0" />
              )}
            </button>

            {openSection === 'contact' && (
              <div className="px-4 pb-4 pt-2 space-y-3 text-xs bg-slate-50/50 border-t border-slate-100">
                <div className="flex items-center justify-end">
                  {!editingContact && (
                    <button
                      type="button"
                      onClick={startEditContact}
                      style={{ color: palette.primary }}
                      className="text-[11px] font-bold hover:underline cursor-pointer"
                    >
                      {tr('Ubah Kontak', 'Edit Contact')}
                    </button>
                  )}
                </div>

                {editingContact ? (
                  <form onSubmit={handleSaveContact} className="space-y-3">
                    <div>
                      <label className="block text-slate-500 text-[10px] mb-1">{t.employees.phone}</label>
                      <input
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] mb-1">{t.employees.address}</label>
                      <textarea
                        rows={3}
                        value={contactForm.address}
                        onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    {contactError && <p className="text-rose-600 text-[11px]">{contactError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={savingContact}
                        style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                        className="flex-1 rounded-full py-2 font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {savingContact ? tr('Menyimpan...', 'Saving...') : tr('Simpan Kontak', 'Save Contact')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingContact(false)}
                        className="flex-1 rounded-full bg-slate-200 py-2 font-semibold text-slate-700 hover:bg-slate-300 cursor-pointer"
                      >
                        {tr('Batal', 'Cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-400 shrink-0" />
                      <span className="text-slate-700">{profile?.company_email || profile?.personal_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400 shrink-0" />
                      <span className="text-slate-700">{profile?.phone || '-'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-slate-700">{profile?.address || '-'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. BPJS (if covered) */}
          {(hasBpjsKes || hasBpjsTk) && (
            <div>
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'bpjs' ? null : 'bpjs')}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <HeartPulse size={18} />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">BPJS</span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {tr('Kesehatan & Ketenagakerjaan', 'Health & Employment Coverage')}
                    </span>
                  </div>
                </div>
                {openSection === 'bpjs' ? (
                  <ChevronDown size={16} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400 shrink-0" />
                )}
              </button>
              {openSection === 'bpjs' && (
                <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-3 text-xs bg-slate-50/50 border-t border-slate-100">
                  {hasBpjsKes && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">{t.employees.bpjsKes}</span>
                      <span className="font-semibold text-slate-800 font-mono">{profile.bpjs_kesehatan_number}</span>
                    </div>
                  )}
                  {hasBpjsTk && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">{t.employees.bpjsTk}</span>
                      <span className="font-semibold text-slate-800 font-mono">{profile.bpjs_tk_number}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 6. Ubah Password */}
          <Link
            to="/reset-password"
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <KeyRound size={18} />
              </span>
              <span className="text-sm font-semibold text-slate-900">{tr('Ubah Password', 'Change Password')}</span>
            </div>
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          </Link>

          {/* 7. Keluar */}
          <button
            type="button"
            onClick={logout}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-rose-50/60 transition cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <LogOut size={18} />
              </span>
              <span className="text-sm font-semibold text-rose-600">{t.nav.logout}</span>
            </div>
            <ChevronRight size={16} className="text-rose-300 shrink-0" />
          </button>
        </div>
      </div>
      <EmployeeIdCardModal
        isOpen={showIdCard}
        onClose={() => setShowIdCard(false)}
        employee={profile}
      />
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Shield, CreditCard, HeartPulse, Mail, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../api';
import { PageSkeleton } from '../components/Skeleton';
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
  const { user } = useAuth();
  const { t, tr, formatDate } = useLanguage();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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
    <div className="max-w-md mx-auto space-y-4">
      {/* Profile Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs text-center">
        <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-lg mb-3">
          {profile?.full_name?.charAt(0) || 'U'}
        </div>
        <h2 className="text-lg font-bold text-slate-900">{profile?.full_name}</h2>
        <p className="text-xs text-slate-500">{profile?.job_title}</p>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-700">
          <span>{t.employees.nik}: {profile?.nik}</span>
          <span>•</span>
          <span className="text-blue-600 font-bold">{profile?.employment_status}</span>
        </div>
      </div>

      {/* Identity & Legal Info */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold uppercase text-slate-900 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
          <Shield size={14} className="text-blue-600" />
          <span>{profile?.is_foreign_worker ? `${t.employees.tka} (${t.employees.passportNumber})` : t.employees.ktpNumber}</span>
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-slate-400 block text-[10px]">{profile?.is_foreign_worker ? t.employees.passportNumber : t.employees.ktpNumber}</span>
            <span className="font-semibold text-slate-800">{profile?.is_foreign_worker ? profile?.passport_number : (profile?.ktp_number || '-')}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.npwp}</span>
            <span className="font-semibold text-slate-800">{profile?.npwp_number || '-'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.ptkpStatus}</span>
            <span className="font-semibold text-slate-800">{profile?.ptkp_status || 'TK/0'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.joinDate}</span>
            <span className="font-semibold text-slate-800">{formatDate(profile?.join_date)}</span>
          </div>
        </div>
      </div>

      {/* Banking Details - employee self-service */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3 text-xs">
        <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
          <h3 className="font-bold uppercase text-slate-900 text-[11px] flex items-center gap-1.5">
            <CreditCard size={14} className="text-indigo-600" />
            <span>{tr('Rekening Bank Payroll', 'Payroll Bank Account')}</span>
          </h3>
          {!editingBank && (
            <button
              type="button"
              onClick={startEditBank}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              {tr('Ubah', 'Edit')}
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
                  placeholder={tr('LANTAI 46 JL. DR. IDE ANAK AGUNG, GDE AGUNG KAV 5.5-5.6', 'FLOOR 46 JL. DR. IDE ANAK AGUNG, GDE AGUNG KAV 5.5-5.6')}
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
                className="w-full sm:w-auto px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold disabled:opacity-50 cursor-pointer"
              >
                {savingBank ? tr('Menyimpan...', 'Saving...') : tr('Simpan Rekening', 'Save Account')}
              </button>
              <button
                type="button"
                onClick={() => { setEditingBank(false); setBankError(null); }}
                className="w-full sm:w-auto px-3.5 py-2 text-slate-600 font-semibold rounded-lg hover:bg-slate-100 cursor-pointer"
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

      {/* BPJS - separated from banking, hidden until the employee has coverage */}
      {(hasBpjsKes || hasBpjsTk) && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3 text-xs">
          <h3 className="font-bold uppercase text-slate-900 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <HeartPulse size={14} className="text-emerald-600" />
            <span>BPJS</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {hasBpjsKes && (
              <div>
                <span className="text-slate-400 block text-[10px]">{t.employees.bpjsKes}</span>
                <span className="font-semibold text-slate-800">{profile.bpjs_kesehatan_number}</span>
              </div>
            )}
            {hasBpjsTk && (
              <div>
                <span className="text-slate-400 block text-[10px]">{t.employees.bpjsTk}</span>
                <span className="font-semibold text-slate-800">{profile.bpjs_tk_number}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact Info */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold uppercase text-slate-900 text-[11px] flex items-center gap-1.5">
            <Mail size={14} className="text-purple-600" />
            <span>{t.employees.phone} & {t.employees.address}</span>
          </h3>
          {!editingContact && (
            <button
              type="button"
              onClick={startEditContact}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              {tr('Ubah', 'Edit')}
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
                className="flex-1 rounded-lg bg-indigo-600 py-2 font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                {savingContact ? tr('Menyimpan...', 'Saving...') : tr('Simpan Kontak', 'Save Contact')}
              </button>
              <button
                type="button"
                onClick={() => setEditingContact(false)}
                className="flex-1 rounded-lg bg-slate-100 py-2 font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
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
              <span className="text-slate-700">{profile?.phone}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-700">{profile?.address}</span>
            </div>
          </div>
        )}
      </div>

      {/* Request profile update temporarily hidden until full HR approval flow is connected */}
    </div>
  );
};

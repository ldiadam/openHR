import React, { useState, useEffect } from 'react';
import { User, Shield, CreditCard, HeartPulse, Building, Mail, Phone, MapPin, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../api';

export const EmployeeProfile: React.FC = () => {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.employeeId) return;
      try {
        const res = await apiFetch(`/employees/${user.employeeId}`);
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
    return <div className="text-center text-xs text-slate-400 py-8">{t.common.loading}</div>;
  }

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

      {/* BPJS & Banking */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold uppercase text-slate-900 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
          <HeartPulse size={14} className="text-emerald-600" />
          <span>{t.employees.bpjsKes} & {t.employees.bankName}</span>
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.bpjsKes}</span>
            <span className="font-semibold text-slate-800">{profile?.bpjs_kesehatan_number || '-'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.bpjsTk}</span>
            <span className="font-semibold text-slate-800">{profile?.bpjs_tk_number || '-'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.bankName}</span>
            <span className="font-semibold text-slate-800">{profile?.bank_name || '-'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t.employees.bankAccount}</span>
            <span className="font-semibold text-slate-800">{profile?.bank_account_number || '-'}</span>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold uppercase text-slate-900 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
          <Mail size={14} className="text-purple-600" />
          <span>{t.employees.phone} & {t.employees.address}</span>
        </h3>
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
      </div>

      {/* Button Request Edit to HR */}
      <button
        onClick={() => setShowEditRequestModal(true)}
        className="w-full py-3 px-4 bg-slate-900 text-white rounded-2xl font-bold text-xs shadow-md hover:bg-slate-800 transition flex items-center justify-center gap-2 cursor-pointer"
      >
        <Send size={15} />
        <span>{t.common.edit} / Request Profile Update</span>
      </button>

      {/* Modal Request Edit */}
      {showEditRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">Ajukan Perubahan Data ke HR</h3>
            <p className="text-slate-500 text-[11px]">
              Tuliskan detail perubahan data (contoh: pembaruan no rekening bank, perubahan alamat, dll).
            </p>
            {requestSent ? (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl font-medium text-center">
                Permintaan perubahan data telah dikirim ke Tim HR.
              </div>
            ) : (
              <form onSubmit={handleSendEditRequest} className="space-y-3">
                <textarea
                  required
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Mohon ubah no rekening bank saya menjadi..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditRequestModal(false)}
                    className="px-3 py-1.5 text-slate-600 rounded-lg hover:bg-slate-100 font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                  >
                    Kirim ke HR
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

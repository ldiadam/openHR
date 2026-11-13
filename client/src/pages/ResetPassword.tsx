import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { KeyRound, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { apiFetch, setToken, setStoredUser } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export const ResetPassword: React.FC = () => {
  const { tr } = useLanguage();
  const { companyName, logoUrl } = useCompany();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const isInvite = window.location.pathname.includes('accept-invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [checkingInvite, setCheckingInvite] = useState(isInvite && !!token);

  useEffect(() => {
    if (isInvite && token) {
      apiFetch<any>(`/auth/invite-info?token=${encodeURIComponent(token)}`)
        .then((data) => {
          setInviteInfo(data);
          if (!data.valid) {
            setError(
              data.message ||
                (data.isExpired
                  ? tr('Tautan aktivasi telah kedaluwarsa.', 'The activation link has expired.')
                  : tr('Tautan aktivasi tidak valid.', 'The activation link is invalid.'))
            );
          }
        })
        .catch((err) => {
          setError(err.message || tr('Gagal memverifikasi token aktivasi.', 'Failed to verify the activation token.'));
        })
        .finally(() => {
          setCheckingInvite(false);
        });
    }
  }, [isInvite, token]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(tr('Konfirmasi kata sandi tidak cocok.', 'Password confirmation does not match.'));
      return;
    }
    if (password.length < 6) {
      setError(tr('Kata sandi minimal 6 karakter.', 'Password must be at least 6 characters.'));
      return;
    }

    setLoading(true);
    try {
      const endpoint = isInvite ? '/auth/accept-invite' : '/auth/confirm-reset';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ token, password, newPassword: password }),
      });
      setSuccess(res.message || tr('Kata sandi berhasil diperbarui.', 'Password updated successfully.'));

      if (res.token && res.user) {
        setToken(res.token);
        setStoredUser(res.user);
        setTimeout(() => {
          window.location.href = res.user.role === 'employee' ? '/app' : '/';
        }, 1200);
      } else {
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err: any) {
      setError(err.message || tr('Gagal memproses kata sandi.', 'Failed to process the password.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setRequestSent(true);
      setSuccess(res.message);
    } catch (err: any) {
      setError(err.message || tr('Gagal meminta reset kata sandi.', 'Failed to request a password reset.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {logoUrl ? (
          <div className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 shadow-lg mx-auto mb-4">
            <img src={logoUrl} alt={companyName} className="h-8 w-auto max-w-[220px] object-contain" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-lg mb-3">
            <KeyRound size={24} />
          </div>
        )}
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {token
            ? isInvite
              ? tr('Aktivasi Akun & Buat Kata Sandi', 'Account Activation & Create Password')
              : tr('Atur Kata Sandi Baru', 'Set a New Password')
            : tr('Lupa Kata Sandi', 'Forgot Password')}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {token
            ? tr(
                'Masukkan kata sandi baru untuk akun portal Anda',
                'Enter a new password for your portal account'
              )
            : tr(
                'Masukkan email akun Anda untuk menerima instruksi reset',
                'Enter your account email to receive reset instructions'
              )}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl border border-slate-100">
          {checkingInvite ? (
            <div className="text-center py-8 space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent"></div>
              <p className="text-xs text-slate-500 font-medium">
                {tr('Memverifikasi tautan aktivasi akun...', 'Verifying the account activation link...')}
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle size={16} className="shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {inviteInfo && inviteInfo.valid && (
                <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-900 p-3.5 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-sm">
                    {tr(`Halo, ${inviteInfo.employeeName}!`, `Hello, ${inviteInfo.employeeName}!`)}
                  </div>
                  <div>{tr('Akun Login:', 'Login Account:')} <strong className="font-mono">{inviteInfo.loginEmail}</strong> (NIK: {inviteInfo.nik})</div>
                  <div className="text-[11px] text-blue-700">
                    {tr(
                      'Tentukan kata sandi Anda di bawah untuk mengaktifkan akses ke portal kepegawaian.',
                      'Set your password below to activate access to the employee portal.'
                    )}
                  </div>
                </div>
              )}

              {isInvite && inviteInfo && !inviteInfo.valid ? (
                <div className="space-y-4 text-xs pt-2">
                  <Link
                    to="/login"
                    className="w-full inline-flex justify-center py-2.5 px-4 rounded-xl shadow-xs text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
                  >
                    {tr('Masuk ke Halaman Login', 'Go to Login Page')}
                  </Link>
                </div>
              ) : isInvite && !token ? (
                <div className="space-y-4 text-xs">
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl space-y-2 text-left">
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <AlertCircle size={16} className="text-amber-600" />
                      <span>{tr('Tautan Aktivasi Tidak Memiliki Token', 'The Activation Link Has No Token')}</span>
                    </div>
                    <p>
                      {tr(
                        'Pastikan Anda mengklik atau menyalin tautan lengkap dari email aktivasi (termasuk parameter ',
                        'Make sure you click or copy the full link from the activation email (including the parameter '
                      )}<code>?token=...</code>).
                    </p>
                    <p>
                      {tr(
                        'Anda juga dapat langsung masuk menggunakan email atau NIK dan kata sandi sementara default (',
                        'You can also sign in directly using your email or NIK and the default temporary password ('
                      )}<code>Password123!</code>).
                    </p>
                  </div>
                  <Link
                    to="/login"
                    className="w-full inline-flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
                  >
                    {tr('Masuk ke Halaman Login', 'Go to Login Page')}
                  </Link>
                </div>
              ) : token ? (
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      {tr('Kata Sandi Baru', 'New Password')}
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={tr('Minimal 6 karakter', 'At least 6 characters')}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      {tr('Konfirmasi Kata Sandi', 'Confirm Password')}
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={tr('Ulangi kata sandi', 'Repeat the password')}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                  >
                    {loading ? tr('Menyimpan...', 'Saving...') : tr('Simpan & Aktifkan Akun', 'Save & Activate Account')}
                  </button>
                </form>
              ) : !requestSent ? (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      {tr('Email Akun', 'Account Email')}
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={tr('nama@perusahaan.id', 'name@company.id')}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                  >
                    {loading ? tr('Mengirim...', 'Sending...') : tr('Kirim Tautan Reset', 'Send Reset Link')}
                  </button>

                  <div className="text-center pt-2">
                    <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600">
                      <ArrowLeft size={14} /> {tr('Kembali ke halaman login', 'Back to the login page')}
                    </Link>
                  </div>
                </form>
              ) : (
                <div className="text-center py-4 space-y-4">
                  <p className="text-xs text-slate-600">
                    {tr(
                      'Silakan cek kotak masuk email Anda untuk melanjutkan proses reset kata sandi.',
                      'Please check your email inbox to continue the password reset process.'
                    )}
                  </p>
                  <Link
                    to="/login"
                    className="inline-block bg-blue-600 text-white text-xs px-5 py-2.5 rounded-xl font-medium"
                  >
                    {tr('Kembali ke Login', 'Back to Login')}
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

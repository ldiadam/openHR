import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  KeyRound,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, setToken, setStoredUser } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export const ResetPassword: React.FC = () => {
  const { tr } = useLanguage();
  const { companyName, isCustomCompany, initials, legalName, logoUrl } = useCompany();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const isInvite = window.location.pathname.includes('accept-invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [resetInfo, setResetInfo] = useState<any>(null);
  const [checkingToken, setCheckingToken] = useState(!!token);

  useEffect(() => {
    setError(null);
    setSuccess(null);

    if (!token) {
      setCheckingToken(false);
      setInviteInfo(null);
      setResetInfo(null);
      return;
    }

    setCheckingToken(true);
    if (isInvite) {
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
          setCheckingToken(false);
        });
    } else {
      apiFetch<any>(`/auth/reset-info?token=${encodeURIComponent(token)}`)
        .then((data) => {
          setResetInfo(data);
          if (!data.valid) {
            setError(
              data.message ||
                (data.isExpired
                  ? tr('Tautan reset kata sandi telah kedaluwarsa.', 'The password reset link has expired.')
                  : tr('Tautan reset kata sandi tidak valid.', 'The password reset link is invalid.'))
            );
          }
        })
        .catch((err) => {
          setError(err.message || tr('Gagal memverifikasi token reset.', 'Failed to verify the reset token.'));
        })
        .finally(() => {
          setCheckingToken(false);
        });
    }
  }, [isInvite, token]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(tr('Kata sandi minimal 6 karakter.', 'Password must be at least 6 characters.'));
      return;
    }
    if (password !== confirmPassword) {
      setError(tr('Konfirmasi kata sandi tidak cocok.', 'Password confirmation does not match.'));
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
        setTimeout(() => navigate('/login'), 1800);
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
    if (!email.trim()) {
      setError(tr('Email atau NIK wajib diisi.', 'Email or Employee ID is required.'));
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setRequestSent(true);
      setSuccess(
        res.message ||
          tr(
            'Jika email terdaftar, instruksi reset kata sandi telah dikirim.',
            'If the email is registered, password reset instructions have been sent.'
          )
      );
    } catch (err: any) {
      setError(err.message || tr('Gagal meminta reset kata sandi.', 'Failed to request a password reset.'));
    } finally {
      setLoading(false);
    }
  };

  const handleTryAnother = () => {
    setRequestSent(false);
    setSuccess(null);
    setError(null);
  };

  const isInvalidResetToken = !isInvite && !!token && resetInfo && !resetInfo.valid;
  const isInvalidInviteToken = isInvite && !!token && inviteInfo && !inviteInfo.valid;

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-slate-950 px-12 py-12 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />

        {logoUrl ? (
          <div className="relative space-y-2.5">
            <div className="inline-flex items-center rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-black/20">
              <img src={logoUrl} alt={companyName} className="h-9 w-auto max-w-[260px] object-contain" />
            </div>
            <p className="truncate text-xs text-slate-400">
              {isCustomCompany ? legalName : tr('Ruang Kerja HR & Payroll', 'HR & Payroll Workspace')}
            </p>
          </div>
        ) : (
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-sm font-black tracking-wide shadow-lg shadow-blue-900/40">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight">{companyName}</p>
              <p className="truncate text-[11px] text-slate-400">
                {isCustomCompany ? legalName : tr('Ruang Kerja HR & Payroll', 'HR & Payroll Workspace')}
              </p>
            </div>
          </div>
        )}

        <div className="relative max-w-md" />

        <div className="relative flex items-center gap-2 border-t border-slate-800 pt-4 text-[11px] text-slate-500">
          <ShieldCheck size={13} className="shrink-0 text-slate-400" />
          <span>{tr('Hanya untuk personel berwenang · Sesi aman', 'Authorized personnel only · Secure session')}</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile brand header */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-8 w-auto max-w-[240px] object-contain" />
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white shadow-sm">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{companyName}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {isCustomCompany ? legalName : tr('Ruang Kerja HR & Payroll', 'HR & Payroll Workspace')}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <KeyRound size={13} />
                <span>
                  {isInvite
                    ? tr('Aktivasi Akun', 'Account Activation')
                    : tr('Pemulihan Akun', 'Account Recovery')}
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {token
                  ? isInvite
                    ? tr('Aktivasi Akun & Buat Kata Sandi', 'Account Activation & Create Password')
                    : tr('Atur Kata Sandi Baru', 'Set a New Password')
                  : tr('Lupa Kata Sandi', 'Forgot Password')}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {token
                  ? resetInfo?.maskedEmail
                    ? tr(
                        `Buat kata sandi baru untuk akun ${resetInfo.maskedEmail}.`,
                        `Create a new password for ${resetInfo.maskedEmail}.`
                      )
                    : tr(
                        'Masukkan kata sandi baru untuk akun portal Anda.',
                        'Enter a new password for your portal account.'
                      )
                  : tr(
                      'Masukkan email perusahaan atau NIK Anda untuk menerima tautan reset kata sandi.',
                      'Enter your company email or employee ID to receive a password reset link.'
                    )}
              </p>
            </div>

            {checkingToken ? (
              <div className="py-10 text-center space-y-3">
                <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-slate-900 border-t-transparent" />
                <p className="text-xs font-medium text-slate-500">
                  {isInvite
                    ? tr('Memverifikasi tautan aktivasi akun...', 'Verifying the account activation link...')
                    : tr('Memverifikasi tautan reset kata sandi...', 'Verifying the password reset link...')}
                </p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800">
                    <CheckCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{success}</span>
                  </div>
                )}

                {inviteInfo && inviteInfo.valid && (
                  <div className="mb-4 space-y-1 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900">
                    <div className="text-sm font-bold">
                      {tr(`Halo, ${inviteInfo.employeeName}!`, `Hello, ${inviteInfo.employeeName}!`)}
                    </div>
                    <div>
                      {tr('Akun Login:', 'Login Account:')}{' '}
                      <strong className="font-mono">{inviteInfo.loginEmail}</strong> (NIK: {inviteInfo.nik})
                    </div>
                    <div className="text-[11px] text-blue-700">
                      {tr(
                        'Tentukan kata sandi Anda di bawah untuk mengaktifkan akses ke portal kepegawaian.',
                        'Set your password below to activate access to the employee portal.'
                      )}
                    </div>
                  </div>
                )}

                {isInvalidInviteToken ? (
                  <div className="space-y-3 pt-2 text-xs">
                    <Link
                      to="/login"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {tr('Masuk ke Halaman Login', 'Go to Login Page')}
                    </Link>
                  </div>
                ) : isInvalidResetToken ? (
                  <div className="space-y-3 pt-2 text-xs">
                    <Link
                      to="/reset-password"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <RefreshCw size={15} />
                      <span>{tr('Minta Tautan Reset Baru', 'Request New Reset Link')}</span>
                    </Link>
                    <div className="text-center pt-1">
                      <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
                      >
                        <ArrowLeft size={14} /> {tr('Kembali ke halaman login', 'Back to the login page')}
                      </Link>
                    </div>
                  </div>
                ) : isInvite && !token ? (
                  <div className="space-y-4 text-xs">
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-900">
                      <div className="flex items-center gap-1.5 text-sm font-bold">
                        <AlertCircle size={16} className="text-amber-600" />
                        <span>{tr('Tautan Aktivasi Tidak Memiliki Token', 'The Activation Link Has No Token')}</span>
                      </div>
                      <p>
                        {tr(
                          'Pastikan Anda mengklik atau menyalin tautan lengkap dari email aktivasi (termasuk parameter ',
                          'Make sure you click or copy the full link from the activation email (including the parameter '
                        )}
                        <code>?token=...</code>).
                      </p>
                      <p>
                        {tr(
                          'Anda juga dapat langsung masuk menggunakan email atau NIK dan kata sandi sementara default (',
                          'You can also sign in directly using your email or NIK and the default temporary password ('
                        )}
                        <code>Password123!</code>).
                      </p>
                    </div>
                    <Link
                      to="/login"
                      className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {tr('Masuk ke Halaman Login', 'Go to Login Page')}
                    </Link>
                  </div>
                ) : token ? (
                  <form onSubmit={handleSetPassword} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        {tr('Kata Sandi Baru', 'New Password')}
                      </label>
                      <div className="relative">
                        <LockKeyhole
                          size={15}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={tr('Minimal 6 karakter', 'At least 6 characters')}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          aria-label={showPassword ? tr('Sembunyikan kata sandi', 'Hide password') : tr('Lihat kata sandi', 'Show password')}
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        {tr('Konfirmasi Kata Sandi', 'Confirm Password')}
                      </label>
                      <div className="relative">
                        <LockKeyhole
                          size={15}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={tr('Ulangi kata sandi', 'Repeat the password')}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          aria-label={showConfirmPassword ? tr('Sembunyikan kata sandi', 'Hide password') : tr('Lihat kata sandi', 'Show password')}
                        >
                          {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !!success}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50 cursor-pointer"
                    >
                      {loading
                        ? tr('Menyimpan...', 'Saving...')
                        : isInvite
                          ? tr('Simpan & Aktifkan Akun', 'Save & Activate Account')
                          : tr('Simpan Kata Sandi Baru', 'Save New Password')}
                    </button>

                    <div className="pt-1 text-center">
                      <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
                      >
                        <ArrowLeft size={14} /> {tr('Kembali ke halaman login', 'Back to the login page')}
                      </Link>
                    </div>
                  </form>
                ) : !requestSent ? (
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        {tr('Email / NIK Karyawan', 'Email / Employee ID')}
                      </label>
                      <div className="relative">
                        <Mail
                          size={15}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={tr('nama@perusahaan.id atau EMP001', 'name@company.com or EMP001')}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? tr('Mengirim...', 'Sending...') : tr('Kirim Tautan Reset', 'Send Reset Link')}
                    </button>

                    <div className="pt-1 text-center">
                      <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
                      >
                        <ArrowLeft size={14} /> {tr('Kembali ke halaman login', 'Back to the login page')}
                      </Link>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 py-2 text-center">
                    <p className="text-xs leading-relaxed text-slate-600">
                      {tr(
                        'Silakan cek kotak masuk (atau folder spam) email Anda. Tautan reset berlaku selama 60 menit.',
                        'Please check your email inbox (or spam folder). The reset link is valid for 60 minutes.'
                      )}
                    </p>
                    <div className="space-y-2.5 pt-1">
                      <Link
                        to="/login"
                        className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        {tr('Kembali ke Login', 'Back to Login')}
                      </Link>
                      <button
                        type="button"
                        onClick={handleTryAnother}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 cursor-pointer"
                      >
                        {tr('Kirim ulang atau gunakan email lain', 'Resend or try another email')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-[11px] text-slate-500">
              <span>{tr('Bahasa / Language', 'Language')}</span>
              <LanguageSwitcher compact />
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
            © {new Date().getFullYear()} {isCustomCompany ? legalName : tr('HR & Payroll', 'HR & Payroll')}.
            <br />
            {tr(
              'Akses hanya untuk personel yang berwenang.',
              'Access is restricted to authorized personnel only.'
            )}
          </p>
        </div>
      </main>
    </div>
  );
};

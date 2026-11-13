import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  LogIn,
  AlertCircle,
  ShieldCheck,
  Mail,
  LockKeyhole,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { t, tr } = useLanguage();
  const { companyName, isCustomCompany, initials, legalName, logoUrl } = useCompany();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user.role === 'employee') {
        navigate('/app');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || t.auth.loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (userEmail: string) => {
    setEmail(userEmail);
    setPassword('Password123!');
    setError(null);
    setLoading(true);
    try {
      const user = await login(userEmail, 'Password123!');
      if (user.role === 'employee') {
        navigate('/app');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || tr('Login gagal', 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

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
                <Building2 size={13} />
                <span>{t.auth.signIn}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {tr('Portal Kepegawaian', 'HR Portal')}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {tr(
                  'Masuk dengan email perusahaan atau NIK karyawan.',
                  'Sign in with your company email or employee ID.'
                )}
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {tr(`${t.auth.email} / NIK`, `${t.auth.email} / Employee ID`)}
                </label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    {t.auth.password}
                  </label>
                  <Link to="/reset-password" className="text-[11px] font-medium text-blue-600 hover:underline">
                    {t.auth.forgotPassword}
                  </Link>
                </div>
                <div className="relative">
                  <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50 cursor-pointer"
              >
                <LogIn size={16} />
                <span>{loading ? t.auth.loggingIn : t.auth.signIn}</span>
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-[11px] text-slate-500">
              <span>{tr('Bahasa / Language', 'Language')}</span>
              <LanguageSwitcher compact />
            </div>

            {import.meta.env.DEV && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin@openhr.id')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-900 transition hover:bg-blue-100 cursor-pointer"
                >
                  <ShieldCheck size={15} className="text-blue-600" />
                  <span>{tr('Login Dev', 'Dev Login')} · <strong className="font-mono">admin@openhr.id</strong></span>
                </button>
              </div>
            )}
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

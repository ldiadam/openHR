import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, AlertCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
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
      setError(err.message || 'Login gagal / Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Language Switcher in top right */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-xl">
          HR
        </div>
        <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">openHR</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t.auth.tagline}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {error && (
            <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                {t.auth.email}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.id"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase">
                  {t.auth.password}
                </label>
                <Link to="/reset-password" className="text-xs text-blue-600 hover:underline">
                  {t.auth.forgotPassword}
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden disabled:opacity-50 transition cursor-pointer"
            >
              <LogIn size={18} />
              <span>{loading ? t.auth.loggingIn : t.auth.signIn}</span>
            </button>
          </form>

          {/* Quick Admin Login for Fast Access */}
          <div className="mt-8 border-t border-slate-200 pt-5 text-center">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@openhr.id')}
              className="w-full py-2.5 px-4 border border-blue-200 bg-blue-50 text-blue-900 rounded-xl hover:bg-blue-100 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-2xs"
            >
              <ShieldCheck size={16} className="text-blue-600" />
              <span>Login Admin (1-Click) &bull; <strong className="font-mono">admin@openhr.id</strong></span>
            </button>
            <p className="text-[11px] text-slate-400 mt-2">
              {t.auth.defaultPassword} <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">Password123!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

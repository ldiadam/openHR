import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, AlertCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { login } = useAuth();
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
      setError(err.message || 'Login gagal. Periksa kembali email dan kata sandi Anda.');
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
      setError(err.message || 'Quick login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-xl">
          HR
        </div>
        <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">openHR</h2>
        <p className="mt-1 text-sm text-slate-400">
          Sistem HR & Penggajian Lengkap UKM Indonesia
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
                Email
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
                  Kata Sandi
                </label>
                <Link to="/reset-password" className="text-xs text-blue-600 hover:underline">
                  Lupa kata sandi?
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
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden disabled:opacity-50 transition"
            >
              <LogIn size={18} />
              <span>{loading ? 'Memproses...' : 'Masuk ke openHR'}</span>
            </button>
          </form>

          {/* Quick Demo Logins for Pair Programming Review */}
          <div className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 text-center">
              Pilihan Akun Demo (1-Click Login):
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickLogin('budi.santoso@nusantara.id')}
                className="p-2 border border-purple-200 bg-purple-50 text-purple-900 rounded-lg hover:bg-purple-100 text-left font-medium"
              >
                <div className="font-bold flex items-center gap-1">
                  <ShieldCheck size={14} /> Owner/Admin
                </div>
                <div className="text-[10px] text-purple-700">budi.santoso@</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('siti.rahma@nusantara.id')}
                className="p-2 border border-blue-200 bg-blue-50 text-blue-900 rounded-lg hover:bg-blue-100 text-left font-medium"
              >
                <div className="font-bold flex items-center gap-1">
                  <UserCheck size={14} /> HR Manager
                </div>
                <div className="text-[10px] text-blue-700">siti.rahma@</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('dewi.lestari@nusantara.id')}
                className="p-2 border border-emerald-200 bg-emerald-50 text-emerald-900 rounded-lg hover:bg-emerald-100 text-left font-medium"
              >
                <div className="font-bold">💰 Finance</div>
                <div className="text-[10px] text-emerald-700">dewi.lestari@</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('agus.setiawan@nusantara.id')}
                className="p-2 border border-slate-200 bg-slate-50 text-slate-900 rounded-lg hover:bg-slate-100 text-left font-medium"
              >
                <div className="font-bold">📱 Karyawan</div>
                <div className="text-[10px] text-slate-600">agus.setiawan@</div>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              Kata sandi default semua akun: <code className="bg-slate-100 px-1 py-0.5 rounded">Password123!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

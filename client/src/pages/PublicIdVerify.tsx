import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Building2, MapPin, Calendar, Briefcase } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const PublicIdVerify: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { tr, formatDate } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id || !token) {
      setError(tr('Tautan verifikasi kartu tidak valid.', 'Invalid ID badge verification link.'));
      setLoading(false);
      return;
    }
    fetch(`/api/public/id-card/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(json.error || 'Verification failed');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            {tr('Memverifikasi kartu karyawan...', 'Verifying employee ID card...')}
          </div>
        ) : error || !data?.employee ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <ShieldAlert size={26} />
            </div>
            <h2 className="text-base font-black text-slate-900">
              {tr('Verifikasi Gagal', 'Verification Failed')}
            </h2>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
        ) : (
          <div>
            <div
              className={`px-5 py-4 flex items-center gap-3 ${
                data.active ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
              }`}
            >
              {data.active ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
              <div>
                <div className="text-sm font-black">
                  {data.active ? tr('Karyawan Terverifikasi Aktif', 'Verified Active Employee') : tr('Karyawan Tidak Aktif', 'Inactive Employee')}
                </div>
                <div className="text-[11px] opacity-90">{data.company?.name || 'openHR'}</div>
              </div>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="mx-auto h-24 w-24 overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
                {data.employee.photo_url ? (
                  <img src={data.employee.photo_url} alt={data.employee.full_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-slate-600">
                    {(data.employee.full_name || 'U').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-lg font-black text-slate-900">{data.employee.full_name}</h1>
                <p className="text-xs font-semibold text-slate-500">{data.employee.job_title}</p>
                <div className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-800">
                  NIK: {data.employee.nik}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-left text-xs space-y-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <Building2 size={14} className="text-slate-400" />
                  <span>{data.employee.department_name || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin size={14} className="text-slate-400" />
                  <span>{data.employee.branch_name || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Briefcase size={14} className="text-slate-400" />
                  <span className="uppercase">{data.employee.employment_status}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Calendar size={14} className="text-slate-400" />
                  <span>{tr('Bergabung', 'Joined')}: {data.employee.join_date ? formatDate(data.employee.join_date) : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

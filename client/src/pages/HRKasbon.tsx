import React, { useState, useEffect } from 'react';
import { CreditCard, Receipt, CheckCircle2, XCircle, AlertCircle, Eye } from 'lucide-react';
import { apiFetch, formatRupiah, formatDateIndo } from '../api';

export const HRKasbon: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kasbon' | 'reimbursements'>('kasbon');
  const [kasbonList, setKasbonList] = useState<any[]>([]);
  const [reimbursements, setReimbursements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [kRes, rRes] = await Promise.all([
        apiFetch('/kasbon/requests'),
        apiFetch('/kasbon/reimbursements'),
      ]);
      setKasbonList(kRes.kasbonList || []);
      setReimbursements(rRes.reimbursements || []);
    } catch (err: any) {
      console.warn('Kasbon err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReviewKasbon = async (id: string, status: 'approved' | 'rejected') => {
    const note = prompt(`Catatan ${status === 'approved' ? 'persetujuan' : 'penolakan'} (opsional):`);
    try {
      const res = await apiFetch(`/kasbon/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleReviewReimb = async (id: string, status: 'approved' | 'rejected') => {
    const note = prompt(`Catatan ${status === 'approved' ? 'persetujuan' : 'penolakan'} (opsional):`);
    try {
      const res = await apiFetch(`/kasbon/reimbursements/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Kasbon & Reimbursement</h1>
        <p className="text-xs text-slate-500">
          Kelola pinjaman karyawan (otomatis potong gaji) dan klaim pengeluaran operasional
        </p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2 shadow-2xs ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold text-slate-500">
        <button
          onClick={() => setActiveTab('kasbon')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'kasbon' ? 'border-purple-600 text-purple-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>Pengajuan Kasbon (Pinjaman)</span>
          {kasbonList.filter((k) => k.status === 'pending').length > 0 && (
            <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {kasbonList.filter((k) => k.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('reimbursements')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'reimbursements' ? 'border-emerald-600 text-emerald-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>Klaim Biaya (Reimbursement)</span>
          {reimbursements.filter((r) => r.status === 'pending').length > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {reimbursements.filter((r) => r.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: KASBON */}
      {activeTab === 'kasbon' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Karyawan</th>
                  <th className="py-3 px-4 font-bold">Tanggal</th>
                  <th className="py-3 px-4 font-bold">Jumlah Kasbon</th>
                  <th className="py-3 px-4 font-bold">Cicilan</th>
                  <th className="py-3 px-4 font-bold">Sisa Pinjaman</th>
                  <th className="py-3 px-4 font-bold">Keperluan</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kasbonList.map((k) => (
                  <tr key={k.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{k.full_name}</td>
                    <td className="py-3 px-4">{formatDateIndo(k.created_at)}</td>
                    <td className="py-3 px-4 font-extrabold text-purple-700">{formatRupiah(k.amount)}</td>
                    <td className="py-3 px-4">{k.total_instalments}x ({formatRupiah(k.instalment_amount)}/bln)</td>
                    <td className="py-3 px-4 font-bold text-slate-800">{formatRupiah(k.remaining_amount)}</td>
                    <td className="py-3 px-4 italic max-w-xs">{k.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        k.status === 'paid_off'
                          ? 'bg-blue-100 text-blue-800'
                          : k.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : k.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {k.status === 'paid_off' ? 'Lunas' : k.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {k.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewKasbon(k.id, 'approved')}
                            className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleReviewKasbon(k.id, 'rejected')}
                            className="bg-rose-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-rose-700"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REIMBURSEMENTS */}
      {activeTab === 'reimbursements' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Karyawan</th>
                  <th className="py-3 px-4 font-bold">Kategori</th>
                  <th className="py-3 px-4 font-bold">Jumlah</th>
                  <th className="py-3 px-4 font-bold">Deskripsi</th>
                  <th className="py-3 px-4 font-bold">Metode Bayar</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reimbursements.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{r.full_name}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{r.category}</td>
                    <td className="py-3 px-4 font-extrabold text-emerald-600">{formatRupiah(r.amount)}</td>
                    <td className="py-3 px-4 italic max-w-xs">{r.description}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] bg-slate-100 font-semibold px-2 py-0.5 rounded">
                        {r.payment_method === 'payroll' ? 'Masuk Payroll' : 'Transfer Terpisah'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {r.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewReimb(r.id, 'approved')}
                            className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleReviewReimb(r.id, 'rejected')}
                            className="bg-rose-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-rose-700"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

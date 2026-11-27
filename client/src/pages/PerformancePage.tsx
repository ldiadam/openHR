import React, { useEffect, useState } from 'react';
import { Award, Plus, Target, Star, Pencil, Trash2, X, FileDown, Eye, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export const PerformancePage: React.FC = () => {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const canManage = user?.role === 'owner_admin' || user?.role === 'manager';

  const [cycles, setCycles] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'reviews' | 'goals' | 'cycles'>('reviews');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Cycle modal
  const [showCycle, setShowCycle] = useState(false);
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [cycleTitle, setCycleTitle] = useState('');
  const [cycleType, setCycleType] = useState('annual');
  const [cycleStatus, setCycleStatus] = useState('active');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  // Goal modal
  const [showGoal, setShowGoal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalCycleId, setGoalCycleId] = useState('');
  const [goalEmpId, setGoalEmpId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalMetric, setGoalMetric] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalActual, setGoalActual] = useState('');
  const [goalWeight, setGoalWeight] = useState('0');
  const [goalStatus, setGoalStatus] = useState('on_track');

  // Review submit modal
  const [activeReview, setActiveReview] = useState<any | null>(null);
  const [activeReviewDetail, setActiveReviewDetail] = useState<any | null>(null);
  const [rating, setRating] = useState('4');
  const [finalRating, setFinalRating] = useState('4');
  const [comments, setComments] = useState('');

  // Review detail modal (read-only + PDF export)
  const [detailModal, setDetailModal] = useState<any | null>(null);

  const flash = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/performance');
      setCycles(res.cycles || []);
      setGoals(res.goals || []);
      setReviews(res.reviews || []);
      setEmployees(res.employees || []);
      if (!goalCycleId && res.cycles?.[0]?.id) setGoalCycleId(res.cycles[0].id);
      if (!goalEmpId && (res.employees?.[0]?.id || user?.employeeId)) setGoalEmpId(res.employees?.[0]?.id || user?.employeeId || '');
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNewCycle = () => {
    setEditingCycleId(null);
    setCycleTitle('');
    setCycleType('annual');
    setCycleStatus('active');
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setShowCycle(true);
  };

  const openEditCycle = (c: any) => {
    setEditingCycleId(c.id);
    setCycleTitle(c.title || '');
    setCycleType(c.cycle_type || 'annual');
    setCycleStatus(c.status || 'active');
    setStartDate(c.start_date || '');
    setEndDate(c.end_date || '');
    setShowCycle(true);
  };

  const handleSaveCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { title: cycleTitle.trim(), cycle_type: cycleType, status: cycleStatus, start_date: startDate, end_date: endDate };
      if (editingCycleId) {
        await apiFetch(`/performance/cycles/${editingCycleId}`, { method: 'PUT', body: JSON.stringify(payload) });
        flash('ok', tr('Siklus diperbarui.', 'Review cycle updated.'));
      } else {
        await apiFetch('/performance/cycles', { method: 'POST', body: JSON.stringify(payload) });
        flash('ok', tr('Siklus penilaian dibuat.', 'Review cycle created.'));
      }
      setShowCycle(false);
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDeleteCycle = async (c: any) => {
    if (!window.confirm(tr(`Hapus siklus "${c.title}" beserta semua target & penilaiannya?`, `Delete cycle "${c.title}" and its goals/reviews?`))) return;
    try {
      await apiFetch(`/performance/cycles/${c.id}`, { method: 'DELETE' });
      flash('ok', tr('Siklus dihapus.', 'Cycle deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openNewGoal = () => {
    setEditingGoalId(null);
    setGoalCycleId(cycles[0]?.id || '');
    setGoalEmpId(employees[0]?.id || user?.employeeId || '');
    setGoalTitle('');
    setGoalMetric('');
    setGoalTarget('');
    setGoalActual('');
    setGoalWeight('25');
    setGoalStatus('on_track');
    setShowGoal(true);
  };

  const openEditGoal = (g: any) => {
    setEditingGoalId(g.id);
    setGoalCycleId(g.cycle_id || '');
    setGoalEmpId(g.employee_id || '');
    setGoalTitle(g.title || '');
    setGoalMetric(g.metric || '');
    setGoalTarget(g.target_value || '');
    setGoalActual(g.actual_value || '');
    setGoalWeight(String(g.weight || 0));
    setGoalStatus(g.status || 'on_track');
    setShowGoal(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        cycle_id: goalCycleId,
        employee_id: goalEmpId,
        title: goalTitle.trim(),
        metric: goalMetric.trim(),
        target_value: goalTarget.trim(),
        actual_value: goalActual.trim(),
        weight: Number(goalWeight || 0) || 0,
        status: goalStatus,
      };
      if (editingGoalId) {
        await apiFetch(`/performance/goals/${editingGoalId}`, { method: 'PUT', body: JSON.stringify(payload) });
        flash('ok', tr('Target KPI diperbarui.', 'KPI goal updated.'));
      } else {
        await apiFetch('/performance/goals', { method: 'POST', body: JSON.stringify(payload) });
        flash('ok', tr('Target KPI ditambahkan.', 'Goal added.'));
      }
      setShowGoal(false);
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDeleteGoal = async (g: any) => {
    if (!window.confirm(tr(`Hapus KPI "${g.title}"?`, `Delete goal "${g.title}"?`))) return;
    try {
      await apiFetch(`/performance/goals/${g.id}`, { method: 'DELETE' });
      flash('ok', tr('Target KPI dihapus.', 'KPI goal deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openReviewSubmit = async (r: any) => {
    setActiveReview(r);
    setActiveReviewDetail(null);
    setComments('');
    setRating('4');
    setFinalRating('4');
    try {
      const detail = await apiFetch(`/performance/reviews/${r.id}`);
      setActiveReviewDetail(detail);
      if (detail.suggested_rating) {
        const rounded = String(Math.round(detail.suggested_rating));
        setRating(rounded);
        setFinalRating(String(detail.suggested_rating));
      }
    } catch {
      // fallback without detail
    }
  };

  const openReviewDetail = async (r: any) => {
    try {
      const detail = await apiFetch(`/performance/reviews/${r.id}`);
      setDetailModal(detail);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReview) return;
    const isSelf = activeReview.status === 'pending_self' && activeReview.employee_id === user?.employeeId;
    const endpoint = isSelf ? `/performance/reviews/${activeReview.id}/self` : `/performance/reviews/${activeReview.id}/manager`;
    try {
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          rating: Number(rating),
          final_rating: isSelf ? undefined : Number(finalRating || rating),
          comments,
        }),
      });
      setActiveReview(null);
      setActiveReviewDetail(null);
      setComments('');
      flash('ok', tr('Penilaian tersimpan.', 'Review saved.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDeleteReview = async (r: any) => {
    if (!window.confirm(tr(`Hapus penilaian ${r.employee_name}?`, `Delete review for ${r.employee_name}?`))) return;
    try {
      await apiFetch(`/performance/reviews/${r.id}`, { method: 'DELETE' });
      flash('ok', tr('Penilaian dihapus.', 'Review deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const exportAppraisalPdf = (detail: any) => {
    const r = detail.review;
    const rGoals: any[] = detail.goals || [];
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('PERFORMANCE APPRAISAL SUMMARY', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Cycle: ${r.cycle_title} (${r.cycle_type}) · ${r.start_date} to ${r.end_date}`, 14, 27);
    doc.setTextColor(0);
    doc.line(14, 31, 196, 31);

    let y = 39;
    doc.setFontSize(11);
    doc.text(`Employee: ${r.employee_name} (${r.nik || '-'})`, 14, y);
    y += 6;
    doc.text(`Position: ${r.job_title || '-'}   |   Reviewer: ${r.reviewer_name || '-'}`, 14, y);
    y += 6;
    doc.text(`Status: ${String(r.status).toUpperCase()}`, 14, y);
    y += 9;

    doc.setFontSize(12);
    doc.text('Ratings Summary', 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(`Self Rating: ${r.self_rating ?? '-'} / 5`, 14, y);
    doc.text(`Manager Rating: ${r.manager_rating ?? '-'} / 5`, 75, y);
    doc.text(`Final Rating: ${r.final_rating ?? '-'} / 5`, 140, y);
    y += 7;
    if (r.self_comments) {
      doc.text(`Self Comments: ${String(r.self_comments).slice(0, 110)}`, 14, y);
      y += 6;
    }
    if (r.manager_comments) {
      doc.text(`Manager Comments: ${String(r.manager_comments).slice(0, 110)}`, 14, y);
      y += 6;
    }

    y += 4;
    doc.setFontSize(12);
    doc.text(
      `KPI Goals (${rGoals.length})${detail.weighted_achievement_pct !== null ? ` — Weighted Achievement: ${detail.weighted_achievement_pct}%` : ''}`,
      14,
      y
    );
    y += 7;
    doc.setFontSize(9);
    if (rGoals.length === 0) {
      doc.text('No KPI goals recorded for this cycle.', 14, y);
    } else {
      for (const g of rGoals) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(
          `- ${g.title} [${g.weight || 0}%] | Target: ${g.target_value || '-'} | Actual: ${g.actual_value || '-'} | ${g.status}`,
          14,
          y
        );
        y += 6;
      }
    }

    doc.save(`Appraisal_${(r.employee_name || 'Employee').replace(/\s+/g, '_')}.pdf`);
  };

  // KPI metrics
  const activeCyclesCount = cycles.filter((c) => c.status === 'active').length;
  const completedGoalsCount = goals.filter((g) => g.status === 'completed' || g.status === 'achieved').length;
  const completedReviews = reviews.filter((r) => r.status === 'completed');
  const avgFinalScore =
    completedReviews.length > 0
      ? (completedReviews.reduce((s, r) => s + Number(r.final_rating || 0), 0) / completedReviews.length).toFixed(2)
      : '-';

  const q = search.trim().toLowerCase();
  const filteredReviews = reviews.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (q && !`${r.employee_name} ${r.nik || ''} ${r.cycle_title}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const filteredGoals = goals.filter((g) => {
    if (q && !`${g.title} ${g.employee_name} ${g.nik || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Award size={20} className="text-blue-600" />
            {tr('Kinerja & Penilaian (KPI)', 'Performance & Appraisals')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr('Siklus evaluasi masa percobaan/tahunan, target KPI berbobot, dan laporan penilaian PDF.', 'Probation/annual review cycles, weighted KPI goals, and appraisal PDF reports.')}
          </p>
        </div>
        <div className="flex gap-2">
          {cycles.length > 0 && (
            <button type="button" onClick={openNewGoal} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Target size={14} /> {tr('Tambah KPI', 'Add Goal')}
            </button>
          )}
          {canManage && (
            <button type="button" onClick={openNewCycle} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
              <Plus size={14} /> {tr('Siklus Baru', 'New Cycle')}
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Siklus Aktif', 'Active Cycles')}</div>
          <div className="mt-1 text-xl font-black text-slate-900">{activeCyclesCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Target KPI', 'KPI Goals')}</div>
          <div className="mt-1 text-xl font-black text-slate-900">
            {goals.length} <span className="text-xs font-bold text-emerald-600">({completedGoalsCount} {tr('selesai', 'done')})</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Penilaian Selesai', 'Completed Reviews')}</div>
          <div className="mt-1 text-xl font-black text-blue-600">
            {completedReviews.length} <span className="text-xs font-semibold text-slate-400">/ {reviews.length}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Rata-rata Skor Akhir', 'Avg Final Score')}</div>
          <div className="mt-1 text-xl font-black text-amber-600">{avgFinalScore} <span className="text-xs font-semibold text-slate-400">/ 5</span></div>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 text-xs font-bold w-fit">
          <button type="button" onClick={() => setTab('reviews')} className={`rounded-xl px-3 py-1.5 ${tab === 'reviews' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            {tr('Penilaian', 'Reviews')} ({reviews.length})
          </button>
          <button type="button" onClick={() => setTab('goals')} className={`rounded-xl px-3 py-1.5 ${tab === 'goals' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            {tr('Target KPI', 'KPI Goals')} ({goals.length})
          </button>
          {canManage && (
            <button type="button" onClick={() => setTab('cycles')} className={`rounded-xl px-3 py-1.5 ${tab === 'cycles' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
              {tr('Siklus', 'Cycles')} ({cycles.length})
            </button>
          )}
        </div>

        {tab !== 'cycles' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Cari karyawan / KPI...', 'Search employee / KPI...')}
                className="rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
            {tab === 'reviews' && (
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <option value="all">{tr('Semua Status', 'All Status')}</option>
                <option value="pending_self">Pending Self</option>
                <option value="pending_manager">Pending Manager</option>
                <option value="completed">Completed</option>
              </select>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">Loading...</div>
      ) : tab === 'reviews' ? (
        <div className="space-y-2.5">
          {filteredReviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
              {tr('Belum ada data penilaian.', 'No performance reviews found.')}
            </div>
          ) : (
            filteredReviews.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{r.employee_name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{r.cycle_title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      r.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : r.status === 'pending_manager' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                    }`}>{r.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Self: <strong>{r.self_rating ?? '-'}</strong> · Manager: <strong>{r.manager_rating ?? '-'}</strong> · Final: <strong className="text-slate-900">{r.final_rating ?? '-'}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openReviewDetail(r)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye size={12} /> {tr('Detail & PDF', 'Detail & PDF')}
                  </button>
                  {r.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => openReviewSubmit(r)}
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      <Star size={12} /> {r.status === 'pending_self' ? tr('Isi Evaluasi Diri', 'Self Review') : tr('Nilai Karyawan', 'Manager Review')}
                    </button>
                  )}
                  {canManage && (
                    <button type="button" onClick={() => handleDeleteReview(r)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'goals' ? (
        <div className="space-y-2.5">
          {filteredGoals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
              {tr('Belum ada target KPI.', 'No goals yet.')}
            </div>
          ) : (
            filteredGoals.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{g.title}</span>
                    {g.metric && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{g.metric}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      g.status === 'completed' || g.status === 'achieved' ? 'bg-emerald-50 text-emerald-700' : g.status === 'at_risk' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>{g.status}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {g.employee_name} · Target: <strong>{g.target_value || '-'}</strong> · Actual: <strong>{g.actual_value || '-'}</strong> · Weight: <strong>{g.weight || 0}%</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEditGoal(g)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100" title={tr('Ubah', 'Edit')}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" onClick={() => handleDeleteGoal(g)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {cycles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
              {tr('Belum ada siklus.', 'No cycles yet.')}
            </div>
          ) : (
            cycles.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{c.title}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">{c.cycle_type}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{c.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">{c.start_date} → {c.end_date}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEditCycle(c)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100" title={tr('Ubah', 'Edit')}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" onClick={() => handleDeleteCycle(c)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">
                {editingCycleId ? tr('Ubah Siklus Penilaian', 'Edit Review Cycle') : tr('Siklus Penilaian Baru', 'New Review Cycle')}
              </h2>
              <button type="button" onClick={() => setShowCycle(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveCycle} className="space-y-3 text-xs">
              <input required value={cycleTitle} onChange={(e) => setCycleTitle(e.target.value)} placeholder="e.g. Q4 2026 Performance Review" className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="grid grid-cols-2 gap-2">
                <select value={cycleType} onChange={(e) => setCycleType(e.target.value)} className="rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="probation">Probation</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
                <select value={cycleStatus} onChange={(e) => setCycleStatus(e.target.value)} className="rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border border-slate-300 p-2" />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border border-slate-300 p-2" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCycle(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white">{tr('Simpan', 'Save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">
                {editingGoalId ? tr('Ubah Target KPI', 'Edit KPI Goal') : tr('Tambah Target KPI', 'Add KPI Goal')}
              </h2>
              <button type="button" onClick={() => setShowGoal(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveGoal} className="space-y-3 text-xs">
              {!editingGoalId && (
                <>
                  <select value={goalCycleId} onChange={(e) => setGoalCycleId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                    {cycles.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  {canManage && (
                    <select value={goalEmpId} onChange={(e) => setGoalEmpId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.nik} · {e.full_name}</option>)}
                    </select>
                  )}
                </>
              )}
              <input required value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder={tr('Judul KPI / OKR', 'Goal title')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <input value={goalMetric} onChange={(e) => setGoalMetric(e.target.value)} placeholder={tr('Metrik (opsional, e.g. % Uptime)', 'Metric (optional)')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="grid grid-cols-2 gap-2">
                <input value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder={tr('Target (e.g. 99)', 'Target value')} className="rounded-xl border border-slate-300 p-2.5" />
                <input value={goalActual} onChange={(e) => setGoalActual(e.target.value)} placeholder={tr('Realisasi (e.g. 95)', 'Actual value')} className="rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={0} max={100} value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="Weight (%)" className="rounded-xl border border-slate-300 p-2.5" />
                <select value={goalStatus} onChange={(e) => setGoalStatus(e.target.value)} className="rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowGoal(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white">{tr('Simpan', 'Save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">{activeReview.employee_name} — {activeReview.cycle_title}</h2>
              <button type="button" onClick={() => setActiveReview(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            {activeReviewDetail?.goals?.length > 0 && (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="mb-1.5 flex items-center justify-between font-bold text-slate-700">
                  <span>{tr('Target KPI Terkait', 'Linked KPI Goals')}</span>
                  {activeReviewDetail.weighted_achievement_pct !== null && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-800">
                      {tr('Capaian Berbobot', 'Weighted')}: {activeReviewDetail.weighted_achievement_pct}% (Saran: {activeReviewDetail.suggested_rating}/5)
                    </span>
                  )}
                </div>
                <ul className="space-y-1 text-[11px] text-slate-600">
                  {activeReviewDetail.goals.map((g: any) => (
                    <li key={g.id} className="flex justify-between gap-2">
                      <span className="truncate font-medium">{g.title} ({g.weight || 0}%)</span>
                      <span className="shrink-0">{g.actual_value || '-'} / {g.target_value || '-'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={handleReviewSubmit} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Skor (1-5)', 'Rating (1-5)')}</label>
                <select value={rating} onChange={(e) => { setRating(e.target.value); setFinalRating(e.target.value); }} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="5">5 - Outstanding</option>
                  <option value="4">4 - Exceeds Expectations</option>
                  <option value="3">3 - Meets Expectations</option>
                  <option value="2">2 - Needs Improvement</option>
                  <option value="1">1 - Unsatisfactory</option>
                </select>
              </div>
              {!(activeReview.status === 'pending_self' && activeReview.employee_id === user?.employeeId) && (
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Skor Akhir (bisa disesuaikan, 1-5)', 'Final Calibrated Score (1-5)')}</label>
                  <input type="number" step="0.1" min={1} max={5} value={finalRating} onChange={(e) => setFinalRating(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
              )}
              <textarea required rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder={tr('Catatan evaluasi...', 'Evaluation comments...')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setActiveReview(null)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white">{tr('Kirim', 'Submit')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">{detailModal.review.employee_name}</h2>
                <p className="text-xs text-slate-500">{detailModal.review.cycle_title} · {detailModal.review.start_date} → {detailModal.review.end_date}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => exportAppraisalPdf(detailModal)} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                  <FileDown size={13} /> {tr('Ekspor PDF', 'Appraisal PDF')}
                </button>
                <button type="button" onClick={() => setDetailModal(null)}><X size={18} className="text-slate-400" /></button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs mb-4">
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-[11px] text-slate-500">Self Rating</div>
                <div className="mt-1 text-lg font-black text-slate-900">{detailModal.review.self_rating ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-[11px] text-slate-500">Manager Rating</div>
                <div className="mt-1 text-lg font-black text-slate-900">{detailModal.review.manager_rating ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                <div className="text-[11px] text-blue-700">Final Rating</div>
                <div className="mt-1 text-lg font-black text-blue-900">{detailModal.review.final_rating ?? '-'}</div>
              </div>
            </div>

            {(detailModal.review.self_comments || detailModal.review.manager_comments) && (
              <div className="mb-4 space-y-2 text-xs">
                {detailModal.review.self_comments && (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="font-bold text-slate-700">{tr('Catatan Karyawan', 'Self Comments')}</div>
                    <p className="mt-0.5 text-slate-600">{detailModal.review.self_comments}</p>
                  </div>
                )}
                {detailModal.review.manager_comments && (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="font-bold text-slate-700">{tr('Catatan Manajer', 'Manager Comments')}</div>
                    <p className="mt-0.5 text-slate-600">{detailModal.review.manager_comments}</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">{tr('Target KPI Siklus Ini', 'KPI Goals in This Cycle')}</h3>
                {detailModal.weighted_achievement_pct !== null && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    {tr('Capaian Berbobot', 'Weighted Achievement')}: {detailModal.weighted_achievement_pct}% (Saran: {detailModal.suggested_rating}/5)
                  </span>
                )}
              </div>
              {detailModal.goals.length === 0 ? (
                <p className="text-xs text-slate-400">{tr('Belum ada target KPI untuk karyawan ini pada siklus ini.', 'No KPI goals recorded for this cycle.')}</p>
              ) : (
                <div className="space-y-1.5">
                  {detailModal.goals.map((g: any) => (
                    <div key={g.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{g.title}</div>
                        <div className="text-[11px] text-slate-500">Target: {g.target_value || '-'} · Actual: {g.actual_value || '-'}</div>
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{g.weight || 0}%</span>
                        <div className="mt-0.5 text-[10px] uppercase text-slate-500">{g.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

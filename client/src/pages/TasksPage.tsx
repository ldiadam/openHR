import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  CheckSquare,
  Plus,
  Search,
  Clock,
  AlertTriangle,
  Paperclip,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  X,
  UserCheck,
  Inbox,
  FileText,
} from 'lucide-react';
import { apiFetch, getToken } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { MobileSelect } from '../components/pickers/MobileSelect';
import { MobileDatePicker } from '../components/pickers/MobileDatePicker';
import { ClassicTmsView } from '../components/tasks/ClassicTmsView';

type TaskTab = 'inbox' | 'assigned' | 'approvals' | 'results' | 'all';
type ActionTab = 'action' | 'handover' | 'reschedule' | 'close';

const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-rose-100 text-rose-700 border-rose-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_BADGE: Record<string, { id: string; en: string; cls: string }> = {
  open: { id: 'Terbuka', en: 'Open', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { id: 'Dikerjakan', en: 'In Progress', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  rescheduled: { id: 'Dijadwalkan Ulang', en: 'Rescheduled', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  pending_approval: { id: 'Menunggu Persetujuan', en: 'Pending Approval', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { id: 'Disetujui & Selesai', en: 'Approved & Closed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { id: 'Ditolak', en: 'Rejected', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const ACTION_LABEL: Record<string, { id: string; en: string }> = {
  created: { id: 'Tugas dibuat', en: 'Task created' },
  action: { id: 'Tindakan dicatat', en: 'Action logged' },
  handover: { id: 'Serah terima tugas', en: 'Handed over' },
  reschedule: { id: 'Jadwal diperbarui', en: 'Rescheduled' },
  submitted_for_approval: { id: 'Selesai · Menunggu persetujuan', en: 'Completed · Sent for approval' },
  approved: { id: 'Disetujui & ditutup', en: 'Approved & closed' },
  returned: { id: 'Dikembalikan untuk tindak lanjut', en: 'Returned for follow-up' },
};

export const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/app/') ? '/app/tasks' : '/tasks';

  const [tab, setTab] = useState<TaskTab>('inbox');
  const [viewMode, setViewMode] = useState<'modern' | 'classic'>(() => {
    try {
      return localStorage.getItem('openhr_tms_view') === 'modern' ? 'modern' : 'classic';
    } catch {
      return 'classic';
    }
  });
  const [tasks, setTasks] = useState<any[]>([]);
  const [counts, setCounts] = useState({ inbox: 0, assigned: 0, approvals: 0, results: 0, overdue: 0, total: 0 });
  const [employees, setEmployees] = useState<any[]>([]);
  const [referenceFields, setReferenceFields] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState('Company');
  const [nextReferenceNo, setNextReferenceNo] = useState('TMS');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create Modal
  const [showCreate, setShowCreate] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<string>('general');
  const [newRouter, setNewRouter] = useState<string>('adhoc');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newWatchers, setNewWatchers] = useState<string[]>([]);
  const [newDueDate, setNewDueDate] = useState(todayISO());
  const [newDueTime, setNewDueTime] = useState('18:00');
  const [newRemarks, setNewRemarks] = useState('');
  const [newRefMeta, setNewRefMeta] = useState<Record<string, string>>({});
  const [newReminderMin, setNewReminderMin] = useState(30);
  const [newAlert1Min, setNewAlert1Min] = useState(30);
  const [newAlert2Min, setNewAlert2Min] = useState(45);
  const [newWarningMin, setNewWarningMin] = useState(60);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  // Detail Drawer / Modal
  const [detail, setDetail] = useState<{ task: any; activities: any[]; attachments: any[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionTab, setActionTab] = useState<ActionTab>('action');
  const [acting, setActing] = useState(false);

  // Action states
  const [actionStatus, setActionStatus] = useState<'in_progress' | 'open'>('in_progress');
  const [actionNote, setActionNote] = useState('');
  const [actionFile, setActionFile] = useState<File | null>(null);

  const [handoverTo, setHandoverTo] = useState('');
  const [handoverReason, setHandoverReason] = useState('');
  const [handoverFile, setHandoverFile] = useState<File | null>(null);

  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('18:00');
  const [reschedReason, setReschedReason] = useState('');
  const [reschedReminder, setReschedReminder] = useState(30);
  const [reschedAlert1, setReschedAlert1] = useState(30);
  const [reschedAlert2, setReschedAlert2] = useState(45);
  const [reschedWarning, setReschedWarning] = useState(60);

  const [closeRemarks, setCloseRemarks] = useState('');
  const [closeFile, setCloseFile] = useState<File | null>(null);
  const [closeNotifyEmail, setCloseNotifyEmail] = useState('');
  const [closeMailBody, setCloseMailBody] = useState('');

  const [approvalRemarks, setApprovalRemarks] = useState('');

  const flash = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadMeta = async () => {
    try {
      const res = await apiFetch('/tasks/meta');
      setEmployees(res.employees || []);
      setReferenceFields(res.referenceFields || []);
      if (res.companyName) setCompanyName(res.companyName);
      if (res.nextReferenceNo) setNextReferenceNo(res.nextReferenceNo);
      if (!newAssignee && res.employees?.[0]?.id) {
        setNewAssignee(res.employees[0].id);
      }
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (priorityFilter) params.set('priority', priorityFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/tasks?${params.toString()}`);
      setTasks(res.tasks || []);
      if (res.counts) setCounts(res.counts);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [tab, priorityFilter, categoryFilter]);

  useEffect(() => {
    if (viewMode === 'modern') {
      if (taskId) {
        openDetail(taskId);
      } else {
        setDetail(null);
      }
    }
  }, [taskId, viewMode]);

  const openDetail = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/tasks/${taskId}`);
      setDetail(res);
      const t = res.task;
      const [dPart, tPart] = String(t.due_at || '').split(' ');
      setReschedDate(dPart || todayISO());
      setReschedTime(tPart || '18:00');
      setReschedReminder(Number(t.reminder_minutes ?? 30));
      setReschedAlert1(Number(t.alert1_minutes ?? 30));
      setReschedAlert2(Number(t.alert2_minutes ?? 45));
      setReschedWarning(Number(t.warning_minutes ?? 60));
      setActionTab('action');
      setActionNote('');
      setActionFile(null);
      setHandoverReason('');
      setHandoverFile(null);
      setReschedReason('');
      setCloseRemarks('');
      setCloseFile(null);
      setCloseNotifyEmail('');
      setCloseMailBody('');
      setApprovalRemarks('');
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const uploadAttachment = async (taskId: string, file: File, activityId?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (activityId) fd.append('activity_id', activityId);
    const token = getToken();
    const res = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Upload failed');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAssignee || !newDueDate) {
      flash('err', tr('Lengkapi judul, penerima, dan tenggat waktu.', 'Complete title, assignee, and due date.'));
      return;
    }
    setCreating(true);
    try {
      const created = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          category: newCategory,
          router: newRouter,
          priority: newPriority,
          assignee_id: newAssignee,
          watchers: newWatchers,
          reference_meta: newRefMeta,
          due_at: `${newDueDate} ${newDueTime || '18:00'}`,
          reminder_minutes: newReminderMin,
          alert1_minutes: newAlert1Min,
          alert2_minutes: newAlert2Min,
          warning_minutes: newWarningMin,
          remarks: newRemarks.trim(),
        }),
      });
      for (const f of newFiles) {
        await uploadAttachment(created.id, f);
      }
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewRemarks('');
      setNewWatchers([]);
      setNewRefMeta({});
      setNewFiles([]);
      flash('ok', tr(`Tugas ${created.reference_no} berhasil dibuat.`, `Task ${created.reference_no} created.`));
      await loadTasks();
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setActing(true);
    try {
      const res = await apiFetch(`/tasks/${detail.task.id}/action`, {
        method: 'POST',
        body: JSON.stringify({ status: actionStatus, note: actionNote }),
      });
      if (actionFile) await uploadAttachment(detail.task.id, actionFile, res.activity_id);
      flash('ok', tr('Tindakan berhasil dicatat.', 'Action logged.'));
      await Promise.all([openDetail(detail.task.id), loadTasks()]);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setActing(false);
    }
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setActing(true);
    try {
      const res = await apiFetch(`/tasks/${detail.task.id}/handover`, {
        method: 'POST',
        body: JSON.stringify({ next_assignee_id: handoverTo, reason: handoverReason }),
      });
      if (handoverFile) await uploadAttachment(detail.task.id, handoverFile, res.activity_id);
      flash('ok', tr('Tugas berhasil diteruskan.', 'Task handed over.'));
      await Promise.all([openDetail(detail.task.id), loadTasks()]);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setActing(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setActing(true);
    try {
      await apiFetch(`/tasks/${detail.task.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          due_at: `${reschedDate} ${reschedTime || '18:00'}`,
          reason: reschedReason,
          reminder_minutes: reschedReminder,
          alert1_minutes: reschedAlert1,
          alert2_minutes: reschedAlert2,
          warning_minutes: reschedWarning,
        }),
      });
      flash('ok', tr('Jadwal tugas diperbarui.', 'Task rescheduled.'));
      await Promise.all([openDetail(detail.task.id), loadTasks()]);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setActing(false);
    }
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setActing(true);
    try {
      const res = await apiFetch(`/tasks/${detail.task.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          remarks: closeRemarks,
          notify_emails: closeNotifyEmail
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          mail_body: closeMailBody,
        }),
      });
      if (closeFile) await uploadAttachment(detail.task.id, closeFile, res.activity_id);
      flash('ok', tr('Tugas diajukan untuk persetujuan.', 'Task submitted for approval.'));
      await Promise.all([openDetail(detail.task.id), loadTasks()]);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setActing(false);
    }
  };

  const handleApprove = async (decision: 'approve' | 'return') => {
    if (!detail) return;
    setActing(true);
    try {
      await apiFetch(`/tasks/${detail.task.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ decision, remarks: approvalRemarks }),
      });
      flash(
        'ok',
        decision === 'approve'
          ? tr('Tugas disetujui dan ditutup.', 'Task approved and closed.')
          : tr('Tugas dikembalikan ke penerima.', 'Task returned to assignee.')
      );
      await Promise.all([openDetail(detail.task.id), loadTasks()]);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setActing(false);
    }
  };

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.nik ? `${e.nik} · ` : ''}${e.full_name}${e.department_name ? ` (${e.department_name})` : ''}`,
      })),
    [employees]
  );

  const nowCmp = useMemo(() => {
    const d = new Date();
    return `${todayISO()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [tasks]);

  const canApproveDetail = Boolean(
    detail &&
      detail.task.status === 'pending_approval' &&
      (user?.employeeId === detail.task.assignor_id || user?.role === 'owner_admin' || user?.role === 'manager')
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <CheckSquare size={20} className="text-blue-600" />
            {tr('Manajemen Tugas (TMS)', 'Task Management (TMS)')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr(
              'Penugasan, serah-terima, penjadwalan ulang, penyelesaian, dan persetujuan dalam satu ruang kerja.',
              'Assign, track, hand over, reschedule, close, and approve tasks in one streamlined workspace.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setViewMode('modern');
                try {
                  localStorage.setItem('openhr_tms_view', 'modern');
                } catch {}
              }}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                viewMode === 'modern' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tr('Tampilan Modern', 'Modern View')}
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('classic');
                try {
                  localStorage.setItem('openhr_tms_view', 'classic');
                } catch {}
              }}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                viewMode === 'classic' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tr('Klasik TMS', 'Classic TMS')}
            </button>
          </div>
          {viewMode === 'modern' && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={15} />
              {tr('Buat Tugas Baru', 'New Task')}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
            notice.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {viewMode === 'classic' ? (
        <ClassicTmsView
          tasks={tasks}
          loading={loading}
          counts={counts}
          employees={employees}
          referenceFields={referenceFields}
          companyName={companyName}
          nextReferenceNo={nextReferenceNo}
          selectedTaskId={taskId}
          onNavigateTask={(id) => navigate(id ? `${basePath}/${id}` : basePath)}
          user={user}
          tab={tab}
          setTab={setTab}
          onRefresh={async () => {
            await Promise.all([loadTasks(), loadMeta()]);
          }}
          flash={flash}
          uploadAttachment={uploadAttachment}
        />
      ) : (
        <>

      {/* Tabs + Overdue summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-1">
          {[
            { id: 'inbox' as const, label: tr('Kotak Masuk Saya', 'My Inbox'), count: counts.inbox, icon: Inbox },
            { id: 'assigned' as const, label: tr('Tugas Saya Berikan', 'Assigned by Me'), count: counts.assigned, icon: Send },
            { id: 'approvals' as const, label: tr('Menunggu Persetujuan', 'Pending Approval'), count: counts.approvals, icon: UserCheck },
            { id: 'all' as const, label: tr('Semua Tugas', 'All Tasks'), count: counts.total, icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {counts.overdue > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700">
            <AlertTriangle size={13} />
            {counts.overdue} {tr('terlambat', 'overdue')}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadTasks()}
            placeholder={tr('Cari nomor referensi, judul, nama, atau detail...', 'Search ref no, title, person, or reference...')}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
        >
          <option value="">{tr('Semua Prioritas', 'All Priorities')}</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="">{tr('Semua Kategori', 'All Categories')}</option>
            <option value="general">General</option>
            <option value="technical">Technical / IT</option>
            <option value="operations">Operations</option>
            <option value="finance">Finance</option>
            <option value="hr">HR</option>
            <option value="safety">Safety / Compliance</option>
          </select>
          <button
            type="button"
            onClick={loadTasks}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50"
            title={tr('Muat ulang', 'Refresh')}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`card-skel-${idx}`} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
                <div className="flex gap-2">
                  <div className="h-4 w-28 rounded-full bg-slate-200" />
                  <div className="h-4 w-16 rounded-full bg-slate-200" />
                  <div className="h-4 w-20 rounded-full bg-slate-200" />
                </div>
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
            {tr('Tidak ada tugas di tab ini.', 'No tasks in this view.')}
          </div>
        ) : (
          tasks.map((task) => {
            const st = STATUS_BADGE[task.status] || STATUS_BADGE.open;
            const isOverdue =
              task.status !== 'approved' && task.status !== 'rejected' && task.due_at && task.due_at < nowCmp;
            const metaEntries = Object.entries(task.reference_meta || {}).filter(([, v]) => Boolean(v));
            return (
              <div
                key={task.id}
                onClick={() => navigate(`${basePath}/${task.id}`)}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-slate-500">{task.reference_no}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                        {task.category}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                        {tr(st.id, st.en)}
                      </span>
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          <AlertTriangle size={10} />
                          {tr('Terlambat', 'Overdue')}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{task.title}</h3>
                    {task.description && (
                      <p className="line-clamp-1 text-xs text-slate-500">{task.description}</p>
                    )}
                    {metaEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {metaEntries.map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                          >
                            <span className="text-slate-400">{k}:</span> {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-1 text-[11px] text-slate-500 sm:items-end">
                    <div className="font-semibold text-slate-700">
                      {task.assignor_name || '-'} → {task.assignee_name || '-'}
                    </div>
                    <div className={`inline-flex items-center gap-1 ${isOverdue ? 'font-bold text-rose-600' : ''}`}>
                      <Clock size={12} />
                      <span>{task.due_at}</span>
                    </div>
                    {Number(task.attachment_count) > 0 && (
                      <div className="inline-flex items-center gap-1 text-slate-400">
                        <Paperclip size={11} />
                        <span>{task.attachment_count}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-900">{tr('Buat Tugas Baru', 'New Task Assignment')}</h2>
                <p className="text-[11px] text-slate-500">
                  {tr('Nomor referensi & pengirim diisi otomatis oleh sistem.', 'Reference number and assignor are auto-filled.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  {tr('Subjek / Judul Tugas', 'Subject / Task Title')} <span className="text-rose-500">*</span>
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={tr('Contoh: Inspeksi rutin atau tindak lanjut klien', 'e.g. Monthly equipment check or client follow-up')}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    {tr('Ditugaskan Kepada (Assignee)', 'Assignee')} <span className="text-rose-500">*</span>
                  </label>
                  <MobileSelect
                    value={newAssignee}
                    onChange={setNewAssignee}
                    title={tr('Pilih Assignee', 'Select Assignee')}
                    options={employeeOptions}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    {tr('CC / Pemantau (Opsional)', 'Watchers / CC (Optional)')}
                  </label>
                  <MobileSelect
                    value=""
                    onChange={(val) => {
                      if (val && !newWatchers.includes(val)) setNewWatchers((prev) => [...prev, val]);
                    }}
                    placeholder={tr('Tambah pemantau...', 'Add watcher...')}
                    options={employeeOptions.filter((o) => o.value !== newAssignee && !newWatchers.includes(o.value))}
                  />
                  {newWatchers.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {newWatchers.map((wId) => {
                        const emp = employees.find((e) => e.id === wId);
                        return (
                          <span
                            key={wId}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                          >
                            {emp?.full_name || wId}
                            <button
                              type="button"
                              onClick={() => setNewWatchers((prev) => prev.filter((id) => id !== wId))}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Kategori', 'Category')}</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium"
                  >
                    <option value="general">General</option>
                    <option value="technical">Technical / IT</option>
                    <option value="operations">Operations</option>
                    <option value="finance">Finance</option>
                    <option value="hr">HR</option>
                    <option value="safety">Safety / Compliance</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Routine', 'Routine')}</label>
                  <select
                    value={newRouter}
                    onChange={(e) => setNewRouter(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium"
                  >
                    <option value="adhoc">Adhoc</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Prioritas', 'Priority')}</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    {tr('Tenggat Tanggal', 'Due Date')} <span className="text-rose-500">*</span>
                  </label>
                  <MobileDatePicker value={newDueDate} onChange={setNewDueDate} allowClear={false} />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Jam', 'Due Time')}</label>
                  <input
                    type="time"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 font-medium"
                  />
                </div>
              </div>

              {referenceFields.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="text-[11px] font-bold text-slate-700">
                    {tr('Referensi / Aset (Opsional)', 'Reference / Asset Details (Optional)')}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {referenceFields.map((field) => (
                      <div key={field}>
                        <label className="mb-1 block text-[10px] font-semibold text-slate-500">{field}</label>
                        <input
                          value={newRefMeta[field] || ''}
                          onChange={(e) => setNewRefMeta((prev) => ({ ...prev, [field]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Detail Tugas', 'Task Details')}</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Catatan (Opsional)', 'Remarks (Optional)')}</label>
                  <input
                    value={newRemarks}
                    onChange={(e) => setNewRemarks(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Lampiran', 'Attachments')}</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-[11px]"
                  />
                </div>
              </div>

              {/* Collapsible Reminder & Escalation */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <button
                  type="button"
                  onClick={() => setShowReminders((v) => !v)}
                  className="flex w-full items-center justify-between text-[11px] font-bold text-slate-700"
                >
                  <span>
                    {tr('Pengingat & Eskalasi', 'Reminders & Escalation')} ({newReminderMin}m / {newAlert1Min}m / {newAlert2Min}m / {newWarningMin}m)
                  </span>
                  {showReminders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showReminders && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: 'Reminder (min)', val: newReminderMin, set: setNewReminderMin },
                      { label: 'Alert 1 (min)', val: newAlert1Min, set: setNewAlert1Min },
                      { label: 'Alert 2 (min)', val: newAlert2Min, set: setNewAlert2Min },
                      { label: 'Warning (min)', val: newWarningMin, set: setNewWarningMin },
                    ].map((r) => (
                      <div key={r.label}>
                        <label className="mb-1 block text-[10px] font-semibold text-slate-500">{r.label}</label>
                        <input
                          type="number"
                          min={0}
                          value={r.val}
                          onChange={(e) => r.set(Math.max(0, Number(e.target.value) || 0))}
                          className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {creating ? tr('Menyimpan...', 'Submitting...') : tr('Kirim Tugas', 'Assign Task')}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Detail & Action Modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {detailLoading || !detail ? (
              <div className="p-8 text-center text-xs text-slate-400">{tr('Memuat detail...', 'Loading details...')}</div>
            ) : (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-500">{detail.task.reference_no}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          PRIORITY_BADGE[detail.task.priority] || PRIORITY_BADGE.medium
                        }`}
                      >
                        {detail.task.priority}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          (STATUS_BADGE[detail.task.status] || STATUS_BADGE.open).cls
                        }`}
                      >
                        {tr(
                          (STATUS_BADGE[detail.task.status] || STATUS_BADGE.open).id,
                          (STATUS_BADGE[detail.task.status] || STATUS_BADGE.open).en
                        )}
                      </span>
                    </div>
                    <h2 className="mt-1 text-base font-black text-slate-900">{detail.task.title}</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {tr('Dari', 'From')}: <strong>{detail.task.assignor_name || '-'}</strong> → {tr('Kepada', 'To')}:{' '}
                      <strong>{detail.task.assignee_name || '-'}</strong> · {tr('Tenggat', 'Due')}:{' '}
                      <strong>{detail.task.due_at}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDetail(null);
                      if (taskId) navigate(basePath);
                    }}
                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  {/* Left: Info + Actions */}
                  <div className="space-y-4 lg:col-span-3">
                    {detail.task.description && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">
                        {detail.task.description}
                      </div>
                    )}

                    {Object.entries(detail.task.reference_meta || {}).filter(([, v]) => Boolean(v)).length > 0 && (
                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 p-3 text-xs">
                        {Object.entries(detail.task.reference_meta)
                          .filter(([, v]) => Boolean(v))
                          .map(([k, v]) => (
                            <div key={k}>
                              <div className="text-[10px] font-semibold text-slate-400">{k}</div>
                              <div className="font-bold text-slate-800">{String(v)}</div>
                            </div>
                          ))}
                      </div>
                    )}

                    {detail.attachments.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-700">{tr('Lampiran', 'Attachments')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {detail.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`${att.url}?token=${encodeURIComponent(getToken() || '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              <Paperclip size={11} />
                              {att.file_name}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Section C Approval Banner */}
                    {canApproveDetail && (
                      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2.5 text-xs">
                        <div className="font-bold text-amber-900">
                          {tr('Persetujuan Penyelesaian Tugas', 'Task Completion Approval')}
                        </div>
                        {detail.task.completion_remarks && (
                          <p className="text-amber-800">
                            <strong>{tr('Catatan Penyelesaian', 'Completion Remarks')}:</strong> {detail.task.completion_remarks}
                          </p>
                        )}
                        <input
                          value={approvalRemarks}
                          onChange={(e) => setApprovalRemarks(e.target.value)}
                          placeholder={tr('Catatan persetujuan / revisi...', 'Approval or revision remarks...')}
                          className="w-full rounded-xl border border-amber-200 bg-white p-2 text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() => handleApprove('approve')}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={14} />
                            {tr('Setujui & Tutup', 'Approve & Close')}
                          </button>
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() => handleApprove('return')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                          >
                            <XCircle size={14} />
                            {tr('Kembalikan ke Penerima', 'Return to Assignee')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section B Actions (hidden once approved) */}
                    {detail.task.status !== 'approved' && (
                      <div className="rounded-2xl border border-slate-200 p-3.5 space-y-3 text-xs">
                        <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-2">
                          {[
                            { id: 'action' as const, label: tr('Tindakan', 'Take Action'), icon: CheckSquare },
                            { id: 'handover' as const, label: tr('Serah Terima', 'Handover'), icon: ArrowRightLeft },
                            { id: 'reschedule' as const, label: tr('Jadwal Ulang', 'Reschedule'), icon: CalendarClock },
                            { id: 'close' as const, label: tr('Selesai & Tutup', 'Close Task'), icon: CheckCircle2 },
                          ].map((tItem) => {
                            const Icon = tItem.icon;
                            const active = actionTab === tItem.id;
                            return (
                              <button
                                key={tItem.id}
                                type="button"
                                onClick={() => setActionTab(tItem.id)}
                                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${
                                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                <Icon size={12} />
                                {tItem.label}
                              </button>
                            );
                          })}
                        </div>

                        {actionTab === 'action' && (
                          <form onSubmit={handleActionSubmit} className="space-y-2.5">
                            <select
                              value={actionStatus}
                              onChange={(e) => setActionStatus(e.target.value as any)}
                              className="w-full rounded-xl border border-slate-300 bg-white p-2 font-medium"
                            >
                              <option value="in_progress">{tr('Sedang Dikerjakan', 'In Progress')}</option>
                              <option value="open">{tr('Terbuka', 'Open')}</option>
                            </select>
                            <textarea
                              rows={2}
                              required
                              value={actionNote}
                              onChange={(e) => setActionNote(e.target.value)}
                              placeholder={tr('Catat progres atau tindakan yang diambil...', 'Log progress or action taken...')}
                              className="w-full rounded-xl border border-slate-300 p-2"
                            />
                            <input
                              type="file"
                              onChange={(e) => setActionFile(e.target.files?.[0] || null)}
                              className="w-full text-[11px]"
                            />
                            <button
                              type="submit"
                              disabled={acting}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              {tr('Simpan Progres', 'Save Action')}
                            </button>
                          </form>
                        )}

                        {actionTab === 'handover' && (
                          <form onSubmit={handleHandoverSubmit} className="space-y-2.5">
                            <MobileSelect
                              value={handoverTo}
                              onChange={setHandoverTo}
                              title={tr('Teruskan ke Karyawan', 'Handover To')}
                              placeholder={tr('Pilih penerima berikutnya...', 'Select next assignee...')}
                              options={employeeOptions}
                            />
                            <textarea
                              rows={2}
                              required
                              value={handoverReason}
                              onChange={(e) => setHandoverReason(e.target.value)}
                              placeholder={tr('Alasan / instruksi tindak lanjut...', 'Next action details / reason...')}
                              className="w-full rounded-xl border border-slate-300 p-2"
                            />
                            <input
                              type="file"
                              onChange={(e) => setHandoverFile(e.target.files?.[0] || null)}
                              className="w-full text-[11px]"
                            />
                            <button
                              type="submit"
                              disabled={acting}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              {tr('Teruskan Tugas', 'Submit Handover')}
                            </button>
                          </form>
                        )}

                        {actionTab === 'reschedule' && (
                          <form onSubmit={handleRescheduleSubmit} className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <MobileDatePicker value={reschedDate} onChange={setReschedDate} allowClear={false} />
                              <input
                                type="time"
                                value={reschedTime}
                                onChange={(e) => setReschedTime(e.target.value)}
                                className="rounded-xl border border-slate-300 p-2"
                              />
                            </div>
                            <input
                              value={reschedReason}
                              onChange={(e) => setReschedReason(e.target.value)}
                              placeholder={tr('Alasan penjadwalan ulang...', 'Reason for rescheduling...')}
                              className="w-full rounded-xl border border-slate-300 p-2"
                            />
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { label: 'Rem', val: reschedReminder, set: setReschedReminder },
                                { label: 'Alert 1', val: reschedAlert1, set: setReschedAlert1 },
                                { label: 'Alert 2', val: reschedAlert2, set: setReschedAlert2 },
                                { label: 'Warn', val: reschedWarning, set: setReschedWarning },
                              ].map((r) => (
                                <div key={r.label}>
                                  <label className="block text-[9px] font-semibold text-slate-400">{r.label} (m)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={r.val}
                                    onChange={(e) => r.set(Math.max(0, Number(e.target.value) || 0))}
                                    className="w-full rounded-lg border border-slate-300 p-1.5 text-[11px]"
                                  />
                                </div>
                              ))}
                            </div>
                            <button
                              type="submit"
                              disabled={acting}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              {tr('Simpan Jadwal Baru', 'Update Schedule')}
                            </button>
                          </form>
                        )}

                        {actionTab === 'close' && (
                          <form onSubmit={handleCloseSubmit} className="space-y-2.5">
                            <textarea
                              rows={2}
                              required
                              value={closeRemarks}
                              onChange={(e) => setCloseRemarks(e.target.value)}
                              placeholder={tr('Catatan hasil penyelesaian...', 'Completion remarks...')}
                              className="w-full rounded-xl border border-slate-300 p-2"
                            />
                            <input
                              value={closeNotifyEmail}
                              onChange={(e) => setCloseNotifyEmail(e.target.value)}
                              placeholder={tr('Email notifikasi (opsional, pisahkan koma)', 'Notify emails (optional, comma-separated)')}
                              className="w-full rounded-xl border border-slate-300 p-2"
                            />
                            {closeNotifyEmail.trim() && (
                              <textarea
                                rows={2}
                                value={closeMailBody}
                                onChange={(e) => setCloseMailBody(e.target.value)}
                                placeholder={tr('Isi pesan email...', 'Email body...')}
                                className="w-full rounded-xl border border-slate-300 p-2"
                              />
                            )}
                            <input
                              type="file"
                              onChange={(e) => setCloseFile(e.target.files?.[0] || null)}
                              className="w-full text-[11px]"
                            />
                            <button
                              type="submit"
                              disabled={acting}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              {tr('Selesaikan & Ajukan Persetujuan', 'Close & Submit for Approval')}
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Timeline / History */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-2">
                    <div className="mb-3 text-xs font-bold text-slate-900">{tr('Riwayat Aktivitas', 'Activity History')}</div>
                    <div className="space-y-3">
                      {detail.activities.map((act) => {
                        const lbl = ACTION_LABEL[act.action_type] || { id: act.action_type, en: act.action_type };
                        return (
                          <div key={act.id} className="relative border-l-2 border-slate-300 pl-3 text-[11px]">
                            <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-slate-700" />
                            <div className="font-bold text-slate-800">{tr(lbl.id, lbl.en)}</div>
                            <div className="text-[10px] text-slate-500">
                              {act.actor_name} · {String(act.created_at || '').replace('T', ' ').slice(0, 16)}
                            </div>
                            {act.note && <p className="mt-0.5 text-slate-600">{act.note}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

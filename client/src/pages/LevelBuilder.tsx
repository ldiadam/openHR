import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  Layers,
  Network,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, formatRupiah } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { OrgChartView } from '../components/OrgChartView';
import {
  ApprovalScope,
  DEFAULT_LEVEL_BYPASS,
  DEFAULT_LEVEL_CAPABILITIES,
  EmployeeLevelDto,
  LevelBypassFlags,
  LevelCapabilities,
  LevelPresetDefinition,
  TaskAssignScope,
} from '../../../shared/levels';

interface SimulatedStep {
  step: string;
  label: string;
  status: 'required' | 'bypassed' | 'auto_approved';
  approverLevels: Array<{ id: string; code: string; name: string; rank: number; color: string }>;
  reason?: string;
}

const COLOR_SWATCHES = [
  '#64748B',
  '#0EA5E9',
  '#10B981',
  '#14B8A6',
  '#2563EB',
  '#F59E0B',
  '#EF4444',
  '#7C3AED',
];

export const LevelBuilder: React.FC = () => {
  const { lang } = useLanguage();
  const tr = (idText: string, enText: string) => (lang === 'en' ? enText : idText);

  const [levels, setLevels] = useState<EmployeeLevelDto[]>([]);
  const [presets, setPresets] = useState<LevelPresetDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<'levels' | 'chart'>('levels');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Draft editor state
  const [draft, setDraft] = useState<{
    id?: string;
    code: string;
    name: string;
    rank: number;
    color: string;
    description: string;
    is_default: boolean;
    capabilities: LevelCapabilities;
    bypass: LevelBypassFlags;
  }>({
    code: '',
    name: '',
    rank: 10,
    color: '#2563EB',
    description: '',
    is_default: false,
    capabilities: { ...DEFAULT_LEVEL_CAPABILITIES },
    bypass: { ...DEFAULT_LEVEL_BYPASS },
  });

  // Simulator state
  const [simModule, setSimModule] = useState<'leave' | 'claims' | 'petty_cash' | 'overtime' | 'kasbon'>('leave');
  const [simAmount, setSimAmount] = useState<string>('2500000');
  const [simSteps, setSimSteps] = useState<SimulatedStep[]>([]);

  // Assign modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

  const loadLevels = async (preferredId?: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ levels: EmployeeLevelDto[]; presets: LevelPresetDefinition[] }>('/levels');
      const list = res.levels || [];
      setLevels(list);
      setPresets(res.presets || []);
      const nextId = preferredId && list.some((l) => l.id === preferredId) ? preferredId : list[0]?.id || null;
      setSelectedId(nextId);
    } catch (err: any) {
      setMessage({ text: err.message || 'Gagal memuat level', error: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLevels();
  }, []);

  const selectedLevel = useMemo(
    () => levels.find((l) => l.id === selectedId) || null,
    [levels, selectedId]
  );

  useEffect(() => {
    if (selectedLevel) {
      setDraft({
        id: selectedLevel.id,
        code: selectedLevel.code,
        name: selectedLevel.name,
        rank: selectedLevel.rank,
        color: selectedLevel.color || '#2563EB',
        description: selectedLevel.description || '',
        is_default: selectedLevel.is_default,
        capabilities: { ...DEFAULT_LEVEL_CAPABILITIES, ...selectedLevel.capabilities },
        bypass: { ...DEFAULT_LEVEL_BYPASS, ...selectedLevel.bypass },
      });
    }
  }, [selectedLevel]);

  useEffect(() => {
    if (!selectedId) {
      setSimSteps([]);
      return;
    }
    const amt = Number(simAmount);
    apiFetch<{ steps: SimulatedStep[] }>('/levels/simulate', {
      method: 'POST',
      body: JSON.stringify({
        levelId: selectedId,
        module: simModule,
        amount: Number.isFinite(amt) && amt > 0 ? amt : null,
      }),
    })
      .then((res) => setSimSteps(res.steps || []))
      .catch(() => setSimSteps([]));
  }, [selectedId, simModule, simAmount, levels]);

  const startNewLevel = () => {
    const maxRank = levels.reduce((m, l) => Math.max(m, l.rank), 0);
    setSelectedId(null);
    setDraft({
      id: undefined,
      code: `L${levels.length + 1}`,
      name: '',
      rank: maxRank + 10,
      color: COLOR_SWATCHES[levels.length % COLOR_SWATCHES.length],
      description: '',
      is_default: levels.length === 0,
      capabilities: { ...DEFAULT_LEVEL_CAPABILITIES },
      bypass: { ...DEFAULT_LEVEL_BYPASS },
    });
  };

  const handleSave = async () => {
    if (!draft.code.trim() || !draft.name.trim()) {
      setMessage({ text: tr('Kode dan nama level wajib diisi', 'Level code and name are required'), error: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (draft.id) {
        const res = await apiFetch<{ level: EmployeeLevelDto }>(`/levels/${draft.id}`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
        setMessage({ text: tr('Level berhasil diperbarui', 'Level updated') });
        await loadLevels(res.level.id);
      } else {
        const res = await apiFetch<{ level: EmployeeLevelDto }>('/levels', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
        setMessage({ text: tr('Level baru dibuat', 'Level created') });
        await loadLevels(res.level.id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Gagal menyimpan level', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tr('Hapus level ini? Karyawan terkait akan dilepas dari level ini.', 'Delete this level? Assigned employees will be unassigned.'))) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/levels/${id}`, { method: 'DELETE' });
      setMessage({ text: tr('Level dihapus', 'Level deleted') });
      await loadLevels();
    } catch (err: any) {
      setMessage({ text: err.message || 'Gagal menghapus level', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = async (key: string) => {
    if (
      levels.length > 0 &&
      !confirm(
        tr(
          'Terapkan preset ini? Level dengan kode sama akan diperbarui.',
          'Apply this preset? Existing levels with matching codes will be updated.'
        )
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ levels: EmployeeLevelDto[] }>(`/levels/presets/${key}`, {
        method: 'POST',
        body: JSON.stringify({ replace: false }),
      });
      setLevels(res.levels || []);
      setSelectedId(res.levels?.[0]?.id || null);
      setMessage({ text: tr('Preset level berhasil diterapkan', 'Level preset applied') });
    } catch (err: any) {
      setMessage({ text: err.message || 'Gagal menerapkan preset', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= levels.length) return;
    const copy = [...levels];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    const reordered = copy.map((lvl, idx) => ({ id: lvl.id, rank: (idx + 1) * 10 }));
    try {
      const res = await apiFetch<{ levels: EmployeeLevelDto[] }>('/levels/reorder', {
        method: 'POST',
        body: JSON.stringify({ items: reordered }),
      });
      setLevels(res.levels || []);
    } catch (err: any) {
      setMessage({ text: err.message || 'Gagal mengubah urutan', error: true });
    }
  };

  const openAssignModal = async () => {
    if (!selectedId) return;
    setShowAssignModal(true);
    try {
      const res = await apiFetch<{ employees: any[] }>('/employees');
      const emps = res.employees || [];
      setAllEmployees(emps);
      setSelectedEmpIds(new Set(emps.filter((e: any) => e.level_id === selectedId).map((e: any) => e.id)));
    } catch {
      setAllEmployees([]);
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await apiFetch(`/levels/${selectedId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ employeeIds: Array.from(selectedEmpIds) }),
      });
      setShowAssignModal(false);
      setMessage({ text: tr('Karyawan berhasil ditetapkan ke level ini', 'Employees assigned to level') });
      await loadLevels(selectedId);
    } catch (err: any) {
      setMessage({ text: err.message || 'Gagal menetapkan karyawan', error: true });
    } finally {
      setSaving(false);
    }
  };

  const updateCap = <K extends keyof LevelCapabilities>(key: K, value: LevelCapabilities[K]) => {
    setDraft((prev) => ({
      ...prev,
      capabilities: { ...prev.capabilities, [key]: value },
    }));
  };

  const updateBypass = (key: keyof LevelBypassFlags, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      bypass: { ...prev.bypass, [key]: value },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider">
            <Layers size={14} />
            <span>{tr('Arsitektur Organisasi', 'Organization Builder')}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {tr('Visual Employee Level Builder', 'Visual Employee Level Builder')}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tr(
              'Rancang hierarki level karyawan, wewenang persetujuan, TMS, dan opsi bypass secara visual.',
              'Visually configure employee hierarchy tiers, approval authority, TMS rules, and bypass flags.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('levels')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'levels' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} />
              <span>{tr('Level Builder', 'Level Builder')}</span>
            </button>
            <button
              onClick={() => setActiveTab('chart')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'chart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Network size={14} />
              <span>{tr('Bagan Organisasi', 'Org Chart')}</span>
            </button>
          </div>
          {activeTab === 'levels' && (
            <button
              onClick={startNewLevel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
            >
              <Plus size={16} />
              <span>{tr('Tambah Level', 'New Level')}</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'chart' ? (
        <OrgChartView />
      ) : (
        <>

      {message && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between ${
            message.error
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* 1-Click Presets (only shown when no levels are configured yet) */}
      {!loading && levels.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            <Sparkles size={14} className="text-amber-500" />
            <span>{tr('Template Hierarki Cepat (Open Source Presets)', 'Quick Hierarchy Presets')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {presets.map((preset) => (
              <button
                key={preset.key}
                onClick={() => handleApplyPreset(preset.key)}
                disabled={saving}
                className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
              >
                <div className="font-semibold text-sm text-slate-900">{preset.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Split: Ladder (left) + Inspector (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Hierarchy Tier Ladder */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              {tr('Tangga Hierarki (Rank)', 'Hierarchy Ladder (Rank)')}
            </h2>
            <span className="text-xs text-slate-400">{levels.length} levels</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">{tr('Memuat...', 'Loading...')}</div>
          ) : levels.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
              {tr(
                'Belum ada level. Pilih preset di atas atau klik "Tambah Level".',
                'No levels yet. Pick a preset above or click "New Level".'
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {levels.map((lvl, idx) => {
                const isSelected = lvl.id === selectedId;
                const bypassCount = Object.values(lvl.bypass).filter(Boolean).length;
                return (
                  <div
                    key={lvl.id}
                    onClick={() => setSelectedId(lvl.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-8 rounded-full shrink-0"
                          style={{ backgroundColor: lvl.color || '#2563EB' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 text-[11px] font-bold rounded bg-slate-100 text-slate-700">
                              {lvl.code}
                            </span>
                            <span className="font-semibold text-sm text-slate-900 truncate">{lvl.name}</span>
                            {lvl.is_default && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-700">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span>Rank {lvl.rank}</span>
                            <span className="inline-flex items-center gap-1">
                              <Users size={12} /> {lvl.employee_count ?? 0}
                            </span>
                            {bypassCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                <ShieldAlert size={12} /> {bypassCount} bypass
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleMove(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
                          title="Move up"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() => handleMove(idx, 1)}
                          disabled={idx === levels.length - 1}
                          className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
                          title="Move down"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Level Inspector & Live Flow Simulator */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {draft.id ? tr(`Edit Level: ${draft.name}`, `Edit Level: ${draft.name}`) : tr('Buat Level Baru', 'Create New Level')}
                </h2>
                <p className="text-xs text-slate-500">
                  {tr('Atur identitas, wewenang approval, TMS, dan bypass.', 'Configure identity, approval authority, TMS, and bypasses.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {draft.id && (
                  <>
                    <button
                      onClick={openAssignModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <UserPlus size={14} />
                      <span>{tr('Tetapkan Karyawan', 'Assign Staff')}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(draft.id!)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Identity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{tr('Kode', 'Code')}</label>
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="MGR"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{tr('Nama Level', 'Level Name')}</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Manager"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{tr('Rank (Urutan)', 'Rank')}</label>
                <input
                  type="number"
                  value={draft.rank}
                  onChange={(e) => setDraft({ ...draft, rank: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">{tr('Warna Badge', 'Badge Color')}</label>
                <div className="flex items-center gap-2 pt-1">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraft({ ...draft, color: c })}
                      className={`w-6 h-6 rounded-full border-2 ${
                        draft.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{tr('Deskripsi', 'Description')}</label>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder={tr('Ringkasan wewenang level ini...', 'Short summary of responsibilities...')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            {/* Approval Capabilities */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>{tr('Wewenang Persetujuan (Approval)', 'Approval Authority')}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    ['can_approve_leave', tr('Approve Cuti', 'Approve Leave')],
                    ['can_approve_overtime', tr('Approve Lembur', 'Approve Overtime')],
                    ['can_approve_claims', tr('Approve Klaim', 'Approve Claims')],
                    ['can_approve_petty_cash', tr('Approve Petty Cash', 'Approve Petty Cash')],
                    ['can_approve_kasbon', tr('Approve Kasbon', 'Approve Kasbon')],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={draft.capabilities[key]}
                      onChange={(e) => updateCap(key, e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tr('Cakupan Approval', 'Approval Scope')}
                  </label>
                  <select
                    value={draft.capabilities.approval_scope}
                    onChange={(e) => updateCap('approval_scope', e.target.value as ApprovalScope)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    <option value="direct_reports">{tr('Bawahan Langsung', 'Direct Reports')}</option>
                    <option value="department">{tr('Satu Departemen', 'Department')}</option>
                    <option value="branch">{tr('Satu Cabang', 'Branch')}</option>
                    <option value="company">{tr('Seluruh Perusahaan', 'Company-Wide')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tr('Batas Maks Klaim (Rp)', 'Max Claim Limit (Rp)')}
                  </label>
                  <input
                    type="number"
                    value={draft.capabilities.max_claim_approval_amount ?? ''}
                    onChange={(e) =>
                      updateCap('max_claim_approval_amount', e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder={tr('Tak terbatas', 'Unlimited')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tr('Batas Maks Petty Cash (Rp)', 'Max Petty Cash (Rp)')}
                  </label>
                  <input
                    type="number"
                    value={draft.capabilities.max_petty_cash_approval_amount ?? ''}
                    onChange={(e) =>
                      updateCap('max_petty_cash_approval_amount', e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder={tr('Tak terbatas', 'Unlimited')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* TMS Authority */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {tr('Wewenang Tugas (TMS)', 'Task Management (TMS) Authority')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tr('Boleh Menugaskan Tugas Ke', 'Can Assign Tasks To')}
                  </label>
                  <select
                    value={draft.capabilities.can_assign_tasks_to}
                    onChange={(e) => updateCap('can_assign_tasks_to', e.target.value as TaskAssignScope)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    <option value="none">{tr('Tidak Bisa Menugaskan', 'None')}</option>
                    <option value="lower_rank">{tr('Rank Lebih Rendah', 'Lower Rank Only')}</option>
                    <option value="same_or_lower_rank">{tr('Rank Sama atau Lebih Rendah', 'Same or Lower Rank')}</option>
                    <option value="all">{tr('Semua Level', 'All Levels')}</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.capabilities.can_view_all_tasks}
                      onChange={(e) => updateCap('can_view_all_tasks', e.target.checked)}
                    />
                    <span>{tr('Lihat semua tugas tim/perusahaan', 'View all tasks')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.capabilities.can_force_close_tasks}
                      onChange={(e) => updateCap('can_force_close_tasks', e.target.checked)}
                    />
                    <span>{tr('Paksa tutup tugas tanpa review', 'Force-close tasks')}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Bypass Switches */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700">
                <ShieldAlert size={14} />
                <span>{tr('Opsi Bypass (Pengecualian Level)', 'Bypass Options')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-amber-50/60 border border-amber-200/80 rounded-xl p-3">
                {(
                  [
                    ['bypass_approval_chain', tr('Bypass Rantai Approval (Auto-Approve)', 'Bypass Approval Chain (Auto-Approve)')],
                    ['bypass_leave_admin_check', tr('Lewati Cek Admin Cuti', 'Skip Leave Admin Check')],
                    ['bypass_leave_dept_head', tr('Lewati Persetujuan Dept Head Cuti', 'Skip Leave Dept Head')],
                    ['bypass_leave_management', tr('Lewati Persetujuan Manajemen Cuti', 'Skip Leave Management')],
                    ['bypass_task_approval', tr('Tutup Tugas TMS Tanpa Approval', 'Bypass TMS Task Approval')],
                    ['bypass_geofence', tr('Bypass Geofence GPS Presensi', 'Bypass GPS Geofence')],
                    ['bypass_claim_cutoff', tr('Bypass Batas Tanggal Cutoff Klaim', 'Bypass Claim Cutoff')],
                    ['bypass_petty_cash_limit', tr('Bypass Limit Petty Cash', 'Bypass Petty Cash Limit')],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.bypass[key]}
                      onChange={(e) => updateBypass(key, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan Level', 'Save Level')}
              </button>
            </div>
          </div>

          {/* Live Approval Flow Preview */}
          {selectedId && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <GitBranch size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    {tr('Simulasi Alur Approval', 'Live Approval Flow Preview')}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={simModule}
                    onChange={(e) => setSimModule(e.target.value as any)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                  >
                    <option value="leave">Leave</option>
                    <option value="claims">Claims</option>
                    <option value="petty_cash">Petty Cash</option>
                    <option value="overtime">Overtime</option>
                    <option value="kasbon">Kasbon</option>
                  </select>
                  {(simModule === 'claims' || simModule === 'petty_cash') && (
                    <input
                      type="number"
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                      className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                      placeholder="Amount"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {simSteps.map((s) => (
                  <div
                    key={s.step}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                      s.status === 'auto_approved'
                        ? 'bg-purple-50 border-purple-200'
                        : s.status === 'bypassed'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <CheckCircle2
                          size={14}
                          className={
                            s.status === 'auto_approved'
                              ? 'text-purple-600'
                              : s.status === 'bypassed'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                          }
                        />
                        <span>{s.label}</span>
                        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200">
                          {s.status}
                        </span>
                      </div>
                      {s.reason && <p className="text-[11px] text-slate-500 mt-0.5">{s.reason}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.approverLevels.map((a) => (
                        <span
                          key={a.id}
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: a.color }}
                        >
                          {a.code} · {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {simModule === 'claims' && Number(simAmount) > 0 && (
                <p className="text-[11px] text-slate-400">
                  Simulated amount: {formatRupiah(Number(simAmount))}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assign Employees Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">
                {tr(`Tetapkan Karyawan ke ${draft.name}`, `Assign Staff to ${draft.name}`)}
              </h3>
              <button onClick={() => setShowAssignModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {allEmployees.map((emp) => {
                const checked = selectedEmpIds.has(emp.id);
                return (
                  <label
                    key={emp.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(selectedEmpIds);
                          if (e.target.checked) next.add(emp.id);
                          else next.delete(emp.id);
                          setSelectedEmpIds(next);
                        }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{emp.full_name}</div>
                        <div className="text-xs text-slate-500">
                          {emp.nik} · {emp.job_title}
                        </div>
                      </div>
                    </div>
                    {emp.level_code && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {emp.level_code}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              >
                {tr('Batal', 'Cancel')}
              </button>
              <button
                onClick={handleSaveAssignments}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                {tr('Simpan Penugasan', 'Save Assignments')}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

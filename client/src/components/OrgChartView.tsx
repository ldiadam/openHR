import React, { useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GitFork,
  Network,
  Save,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';

export type HierarchyMode = 'single_manager' | 'department_head' | 'multi_tier';

interface OrgNode {
  id: string;
  nik: string;
  full_name: string;
  job_title: string;
  department_id: string | null;
  department_name: string | null;
  branch_name: string | null;
  manager_id: string | null;
  effective_manager_id: string | null;
  level_id: string | null;
  level_code: string | null;
  level_name: string | null;
  level_rank: number | null;
  level_color: string | null;
  user_role: string | null;
  children: OrgNode[];
}

const TreeNodeCard: React.FC<{
  node: OrgNode;
  depth?: number;
}> = ({ node, depth = 0 }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const accentColor = node.level_color || (depth === 0 ? '#2563EB' : '#64748B');

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div
        className="relative w-56 rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-3 text-left"
        style={{ borderTopWidth: 4, borderTopColor: accentColor }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-xs text-slate-900 truncate">{node.full_name}</div>
            <div className="text-[11px] text-slate-500 truncate">{node.job_title || '-'}</div>
          </div>
          {node.level_code && (
            <span
              className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: accentColor }}
              title={node.level_name || node.level_code}
            >
              {node.level_code}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-slate-500">
          <span className="truncate">{node.department_name || '-'}</span>
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold shrink-0"
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span>{node.children.length}</span>
            </button>
          )}
        </div>
      </div>

      {/* Connector + Children */}
      {hasChildren && expanded && (
        <>
          <div className="w-px h-5 bg-slate-300" />
          <div className="relative flex items-start justify-center gap-4 pt-4">
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-slate-300"
                style={{ left: '14%', right: '14%' }}
              />
            )}
            {node.children.map((child) => (
              <div key={child.id} className="relative flex flex-col items-center">
                <div className="w-px h-4 bg-slate-300 -mt-4" />
                <TreeNodeCard node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const OrgChartView: React.FC = () => {
  const { lang } = useLanguage();
  const tr = (idText: string, enText: string) => (lang === 'en' ? enText : idText);

  const [mode, setMode] = useState<HierarchyMode>('department_head');
  const [primaryManagerId, setPrimaryManagerId] = useState<string>('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [deptManagers, setDeptManagers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        config: { hierarchy_mode: HierarchyMode; primary_manager_id: string | null };
        departments: any[];
        employees: any[];
        tree: OrgNode[];
      }>('/levels/hierarchy');

      setMode(res.config?.hierarchy_mode || 'department_head');
      setPrimaryManagerId(res.config?.primary_manager_id || '');
      setDepartments(res.departments || []);
      setEmployees(res.employees || []);
      setTree(res.tree || []);

      const map: Record<string, string> = {};
      for (const d of res.departments || []) {
        map[d.id] = d.manager_id || '';
      }
      setDeptManagers(map);
    } catch (err: any) {
      setMsg({ text: err.message || 'Gagal memuat bagan organisasi', error: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHierarchy();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ tree: OrgNode[] }>('/levels/hierarchy', {
        method: 'PUT',
        body: JSON.stringify({
          hierarchy_mode: mode,
          primary_manager_id: primaryManagerId || null,
          departmentManagers: departments.map((d) => ({
            id: d.id,
            manager_id: deptManagers[d.id] || null,
          })),
        }),
      });
      setTree(res.tree || []);
      setMsg({ text: tr('Struktur & bagan organisasi diperbarui', 'Hierarchy & org chart updated') });
    } catch (err: any) {
      setMsg({ text: err.message || 'Gagal menyimpan struktur', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium ${
            msg.error
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Mode Picker */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr('Model Hierarki Perusahaan', 'Company Hierarchy Model')}
            </h2>
            <p className="text-xs text-slate-500">
              {tr(
                'Pilih bagaimana atasan/penyetuju ditentukan: satu manajer untuk semua, per departemen, atau pohon pelaporan bertingkat.',
                'Choose how managers are resolved: one manager for all, per-department heads, or a multi-tier reporting tree.'
              )}
            </p>
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={15} />
            <span>{saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan & Perbarui Bagan', 'Save & Refresh Chart')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              {
                key: 'single_manager',
                icon: UserCheck,
                title: tr('1 Manajer (Semua Karyawan)', '1 Manager (Company-Wide)'),
                desc: tr(
                  'Cocok untuk tim ramping di mana 1 manajer utama membawahi seluruh karyawan.',
                  'Best for lean teams where one primary manager oversees everyone.'
                ),
              },
              {
                key: 'department_head',
                icon: Building2,
                title: tr('Manajer Per Departemen', 'Department Managers'),
                desc: tr(
                  'Setiap departemen memiliki Kepala Departemen (plus fallback jika belum diisi).',
                  'Each department has its own Department Head (with optional fallback).'
                ),
              },
              {
                key: 'multi_tier',
                icon: GitFork,
                title: tr('Hierarki Bertingkat (Multi-Tier)', 'Multi-Tier Reporting Tree'),
                desc: tr(
                  'Mengikuti atasan langsung tiap karyawan + rank level secara bertingkat.',
                  'Follows each employee direct manager_id + level rank recursively.'
                ),
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  active
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <Icon size={16} className={active ? 'text-blue-600' : 'text-slate-500'} />
                  <span>{item.title}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Primary Manager & Department Heads Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {mode === 'single_manager'
                ? tr('Manajer Utama Perusahaan', 'Primary Company Manager')
                : tr('Manajer Utama / Fallback Direksi (Opsional)', 'Primary / Fallback Manager (Optional)')}
            </label>
            <select
              value={primaryManagerId}
              onChange={(e) => setPrimaryManagerId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">{tr('-- Tidak Ada --', '-- None --')}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.job_title}{e.level_code ? ` · ${e.level_code}` : ''})
                </option>
              ))}
            </select>
          </div>

          {mode === 'department_head' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                {tr('Kepala Departemen', 'Department Heads')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {departments.map((d) => (
                  <div key={d.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] font-bold text-slate-700 mb-1">{d.name}</div>
                    <select
                      value={deptManagers[d.id] || ''}
                      onChange={(e) => setDeptManagers({ ...deptManagers, [d.id]: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      <option value="">{tr('-- Pilih Kepala Dept --', '-- Select Head --')}</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Visual Org Chart Canvas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Network size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {tr('Bagan Organisasi (Org Chart)', 'Visual Org Chart')}
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Users size={13} /> {employees.length} {tr('karyawan aktif', 'active staff')}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">{tr('Memuat bagan...', 'Loading chart...')}</div>
        ) : tree.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
            {tr('Belum ada data karyawan aktif.', 'No active employees found.')}
          </div>
        ) : (
          <div className="overflow-x-auto pb-6 pt-2">
            <div className="inline-flex min-w-full justify-center gap-10 px-4">
              {tree.map((root) => (
                <TreeNodeCard key={root.id} node={root} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export type HierarchyMode = 'single_manager' | 'department_head' | 'multi_tier';

export interface OrgEmployeeNode {
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
  children: OrgEmployeeNode[];
}

export interface OrgHierarchyConfig {
  hierarchy_mode: HierarchyMode;
  primary_manager_id: string | null;
}

export function normalizeHierarchyMode(raw: unknown): HierarchyMode {
  if (raw === 'single_manager' || raw === 'department_head' || raw === 'multi_tier') {
    return raw;
  }
  return 'department_head';
}

export async function getOrgHierarchyConfig(db: D1Database): Promise<OrgHierarchyConfig> {
  try {
    const row = await db
      .prepare(`SELECT hierarchy_mode, primary_manager_id FROM companies LIMIT 1`)
      .first<any>();
    return {
      hierarchy_mode: normalizeHierarchyMode(row?.hierarchy_mode),
      primary_manager_id: row?.primary_manager_id ?? null,
    };
  } catch {
    return { hierarchy_mode: 'department_head', primary_manager_id: null };
  }
}

export function resolveEffectiveManagerId(
  emp: {
    id: string;
    manager_id?: string | null;
    department_id?: string | null;
  },
  config: OrgHierarchyConfig,
  departmentManagerMap: Map<string, string | null>
): string | null {
  if (config.hierarchy_mode === 'single_manager') {
    if (!config.primary_manager_id || config.primary_manager_id === emp.id) return null;
    return config.primary_manager_id;
  }

  if (config.hierarchy_mode === 'department_head') {
    if (emp.manager_id && emp.manager_id !== emp.id) return emp.manager_id;
    const deptMgr = emp.department_id ? departmentManagerMap.get(emp.department_id) : null;
    if (deptMgr && deptMgr !== emp.id) return deptMgr;
    if (config.primary_manager_id && config.primary_manager_id !== emp.id) {
      return config.primary_manager_id;
    }
    return null;
  }

  // multi_tier: direct manager_id first, then dept head, then primary_manager_id
  if (emp.manager_id && emp.manager_id !== emp.id) return emp.manager_id;
  const deptMgr = emp.department_id ? departmentManagerMap.get(emp.department_id) : null;
  if (deptMgr && deptMgr !== emp.id) return deptMgr;
  if (config.primary_manager_id && config.primary_manager_id !== emp.id) {
    return config.primary_manager_id;
  }
  return null;
}

export function wouldCreateManagerCycle(
  employeeId: string,
  candidateManagerId: string | null,
  parentMap: Map<string, string | null>
): boolean {
  if (!candidateManagerId) return false;
  if (candidateManagerId === employeeId) return true;
  const visited = new Set<string>([employeeId]);
  let cursor: string | null | undefined = candidateManagerId;
  let steps = 0;
  while (cursor && steps < 50) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parentMap.get(cursor) ?? null;
    steps++;
  }
  return false;
}

export function buildOrgChartTree(
  employees: Array<{
    id: string;
    nik: string;
    full_name: string;
    job_title: string;
    department_id: string | null;
    department_name: string | null;
    branch_name: string | null;
    manager_id: string | null;
    level_id?: string | null;
    level_code?: string | null;
    level_name?: string | null;
    level_rank?: number | null;
    level_color?: string | null;
    user_role?: string | null;
  }>,
  config: OrgHierarchyConfig,
  departmentManagerMap: Map<string, string | null>
): OrgEmployeeNode[] {
  const nodeMap = new Map<string, OrgEmployeeNode>();

  for (const emp of employees) {
    const effectiveMgr = resolveEffectiveManagerId(emp, config, departmentManagerMap);
    nodeMap.set(emp.id, {
      id: emp.id,
      nik: emp.nik,
      full_name: emp.full_name,
      job_title: emp.job_title,
      department_id: emp.department_id,
      department_name: emp.department_name,
      branch_name: emp.branch_name,
      manager_id: emp.manager_id,
      effective_manager_id: effectiveMgr,
      level_id: emp.level_id ?? null,
      level_code: emp.level_code ?? null,
      level_name: emp.level_name ?? null,
      level_rank: emp.level_rank !== undefined && emp.level_rank !== null ? Number(emp.level_rank) : null,
      level_color: emp.level_color ?? null,
      user_role: emp.user_role ?? null,
      children: [],
    });
  }

  const roots: OrgEmployeeNode[] = [];
  for (const node of nodeMap.values()) {
    const parentId = node.effective_manager_id;
    if (parentId && parentId !== node.id && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Break any remaining cycles (e.g., A -> B -> A via department_head fallback) so every employee appears in the chart
  const visited = new Set<string>();
  const markReachable = (node: OrgEmployeeNode) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    for (const child of node.children) markReachable(child);
  };
  for (const root of roots) markReachable(root);

  if (visited.size < nodeMap.size) {
    const remaining = Array.from(nodeMap.values())
      .filter((n) => !visited.has(n.id))
      .sort((a, b) => (b.level_rank ?? 0) - (a.level_rank ?? 0));
    for (const node of remaining) {
      if (visited.has(node.id)) continue;
      // Detach from its cyclic parent and promote as a root
      const parentId = node.effective_manager_id;
      if (parentId && nodeMap.has(parentId)) {
        const parent = nodeMap.get(parentId)!;
        parent.children = parent.children.filter((c) => c.id !== node.id);
      }
      node.effective_manager_id = null;
      roots.push(node);
      markReachable(node);
    }
  }

  const sortNodes = (list: OrgEmployeeNode[]) => {
    list.sort((a, b) => {
      const rankDiff = (b.level_rank ?? 0) - (a.level_rank ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return a.full_name.localeCompare(b.full_name);
    });
    for (const item of list) {
      if (item.children.length > 0) sortNodes(item.children);
    }
  };

  sortNodes(roots);
  return roots;
}

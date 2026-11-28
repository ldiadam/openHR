import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrgChartTree,
  resolveEffectiveManagerId,
  wouldCreateManagerCycle,
} from '../src/services/org-hierarchy';

const sampleEmployees = [
  {
    id: 'emp-dir',
    nik: 'EMP001',
    full_name: 'Budi Santoso',
    job_title: 'Director',
    department_id: 'dept-mgmt',
    department_name: 'Management',
    branch_name: 'Jakarta',
    manager_id: null,
    level_rank: 100,
    level_code: 'DIR',
  },
  {
    id: 'emp-mgr-ops',
    nik: 'EMP002',
    full_name: 'Siti Rahmawati',
    job_title: 'Ops Manager',
    department_id: 'dept-ops',
    department_name: 'Operations',
    branch_name: 'Jakarta',
    manager_id: 'emp-dir',
    level_rank: 30,
    level_code: 'MGR',
  },
  {
    id: 'emp-staff-1',
    nik: 'EMP004',
    full_name: 'Agus Setiawan',
    job_title: 'Ops Staff',
    department_id: 'dept-ops',
    department_name: 'Operations',
    branch_name: 'Jakarta',
    manager_id: null,
    level_rank: 10,
    level_code: 'STF',
  },
];

test('single_manager mode routes all employees under primary_manager_id', () => {
  const deptMap = new Map<string, string | null>([['dept-ops', 'emp-mgr-ops']]);
  const config = { hierarchy_mode: 'single_manager' as const, primary_manager_id: 'emp-dir' };

  assert.equal(resolveEffectiveManagerId(sampleEmployees[0], config, deptMap), null);
  assert.equal(resolveEffectiveManagerId(sampleEmployees[1], config, deptMap), 'emp-dir');
  assert.equal(resolveEffectiveManagerId(sampleEmployees[2], config, deptMap), 'emp-dir');

  const tree = buildOrgChartTree(sampleEmployees, config, deptMap);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, 'emp-dir');
  assert.equal(tree[0].children.length, 2);
});

test('department_head mode falls back to department manager when employee manager_id is null', () => {
  const deptMap = new Map<string, string | null>([['dept-ops', 'emp-mgr-ops']]);
  const config = { hierarchy_mode: 'department_head' as const, primary_manager_id: 'emp-dir' };

  assert.equal(resolveEffectiveManagerId(sampleEmployees[2], config, deptMap), 'emp-mgr-ops');

  const tree = buildOrgChartTree(sampleEmployees, config, deptMap);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, 'emp-dir');
  assert.equal(tree[0].children[0].id, 'emp-mgr-ops');
  assert.equal(tree[0].children[0].children[0].id, 'emp-staff-1');
});

test('wouldCreateManagerCycle detects self-links and indirect loops', () => {
  const parentMap = new Map<string, string | null>([
    ['emp-dir', null],
    ['emp-mgr', 'emp-dir'],
    ['emp-staff', 'emp-mgr'],
  ]);

  assert.equal(wouldCreateManagerCycle('emp-dir', 'emp-dir', parentMap), true);
  assert.equal(wouldCreateManagerCycle('emp-dir', 'emp-staff', parentMap), true);
  assert.equal(wouldCreateManagerCycle('emp-staff', 'emp-dir', parentMap), false);
});

test('buildOrgChartTree breaks cycles instead of returning empty tree', () => {
  const cyclicEmployees = [
    { ...sampleEmployees[0], manager_id: 'emp-mgr-ops' },
    { ...sampleEmployees[1], manager_id: 'emp-dir' },
  ];
  const tree = buildOrgChartTree(
    cyclicEmployees,
    { hierarchy_mode: 'multi_tier', primary_manager_id: null },
    new Map()
  );
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, 'emp-dir');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].id, 'emp-mgr-ops');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_PRESETS,
  normalizeLevelBypass,
  normalizeLevelCapabilities,
} from '../shared/levels';
import {
  ActorLevelContext,
  canApproveForTarget,
  canAssignTaskToRank,
  rowToEmployeeLevel,
  simulateApprovalFlow,
} from '../src/services/employee-levels';

function makeActor(overrides: Partial<ActorLevelContext>): ActorLevelContext {
  return {
    userId: 'u-1',
    tenantId: 'default',
    role: 'employee',
    employeeId: 'emp-1',
    departmentId: 'dept-1',
    branchId: 'br-1',
    level: null,
    ...overrides,
  };
}

test('normalizeLevelCapabilities and normalizeLevelBypass sanitize inputs', () => {
  const caps = normalizeLevelCapabilities(
    JSON.stringify({
      can_approve_leave: true,
      approval_scope: 'department',
      max_claim_approval_amount: 1500000.4,
      can_assign_tasks_to: 'lower_rank',
    })
  );
  assert.equal(caps.can_approve_leave, true);
  assert.equal(caps.approval_scope, 'department');
  assert.equal(caps.max_claim_approval_amount, 1500000);
  assert.equal(caps.can_assign_tasks_to, 'lower_rank');

  const invalid = normalizeLevelCapabilities({ approval_scope: 'invalid', max_claim_approval_amount: -5 });
  assert.equal(invalid.approval_scope, 'direct_reports');
  assert.equal(invalid.max_claim_approval_amount, null);

  const bypass = normalizeLevelBypass({ bypass_geofence: 1, bypass_task_approval: true });
  assert.equal(bypass.bypass_geofence, true);
  assert.equal(bypass.bypass_task_approval, true);
  assert.equal(bypass.bypass_approval_chain, false);
});

test('canApproveForTarget enforces scope, amount caps, and legacy role fallback', () => {
  const spvLevel = rowToEmployeeLevel({
    id: 'lvl-spv',
    code: 'SPV',
    name: 'Supervisor',
    rank: 20,
    capabilities_json: JSON.stringify({
      can_approve_claims: true,
      approval_scope: 'department',
      max_claim_approval_amount: 2000000,
    }),
    bypass_json: '{}',
  });

  const spv = makeActor({ level: spvLevel, departmentId: 'dept-ops' });
  assert.equal(
    canApproveForTarget(spv, { id: 'emp-2', department_id: 'dept-ops', branch_id: 'br-1' }, 'claims', 1500000),
    true
  );
  assert.equal(
    canApproveForTarget(spv, { id: 'emp-2', department_id: 'dept-ops', branch_id: 'br-1' }, 'claims', 3000000),
    false
  );
  assert.equal(
    canApproveForTarget(spv, { id: 'emp-3', department_id: 'dept-hr', branch_id: 'br-1' }, 'claims', 500000),
    false
  );

  // Legacy fallback when level is null
  const legacyMgr = makeActor({ role: 'manager', employeeId: 'mgr-1', level: null });
  assert.equal(canApproveForTarget(legacyMgr, { id: 'emp-2', manager_id: 'mgr-1' }, 'leave'), true);
  assert.equal(canApproveForTarget(legacyMgr, { id: 'emp-3', manager_id: 'mgr-2' }, 'leave'), false);
});

test('canAssignTaskToRank enforces rank rules', () => {
  const srLevel = rowToEmployeeLevel({
    id: 'lvl-sr',
    code: 'SR',
    name: 'Senior Staff',
    rank: 20,
    capabilities_json: JSON.stringify({ can_assign_tasks_to: 'lower_rank' }),
    bypass_json: '{}',
  });
  const sr = makeActor({ level: srLevel });
  assert.equal(canAssignTaskToRank(sr, 10), true);
  assert.equal(canAssignTaskToRank(sr, 20), false);
  assert.equal(canAssignTaskToRank(sr, 30), false);
});

test('simulateApprovalFlow reflects bypasses and amount limits', () => {
  const sme = LEVEL_PRESETS.find((p) => p.key === 'sme_4_tier')!;
  const levels = sme.levels.map((l, idx) =>
    rowToEmployeeLevel({
      id: `lvl-${idx}`,
      code: l.code,
      name: l.name,
      rank: l.rank,
      color: l.color,
      capabilities_json: JSON.stringify(l.capabilities),
      bypass_json: JSON.stringify(l.bypass),
      is_active: 1,
    })
  );

  const mgrId = levels.find((l) => l.code === 'MGR')!.id;
  const dirId = levels.find((l) => l.code === 'DIR')!.id;
  const stfId = levels.find((l) => l.code === 'STF')!.id;

  const mgrLeave = simulateApprovalFlow(levels, mgrId, 'leave');
  assert.equal(mgrLeave.find((s) => s.step === 'administrator')?.status, 'bypassed');
  assert.equal(mgrLeave.find((s) => s.step === 'dept_head')?.status, 'required');

  const dirLeave = simulateApprovalFlow(levels, dirId, 'leave');
  assert.equal(dirLeave.length, 1);
  assert.equal(dirLeave[0].status, 'auto_approved');

  const stfSmallClaim = simulateApprovalFlow(levels, stfId, 'claims', 1000000);
  assert.equal(stfSmallClaim[0].approverLevels.some((a) => a.code === 'SPV'), true);

  const stfLargeClaim = simulateApprovalFlow(levels, stfId, 'claims', 5000000);
  assert.equal(stfLargeClaim[0].approverLevels.some((a) => a.code === 'SPV'), false);
  assert.equal(stfLargeClaim[0].approverLevels.some((a) => a.code === 'MGR'), true);
});

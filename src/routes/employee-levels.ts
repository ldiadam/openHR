import { Hono } from 'hono';
import { Bindings } from '../types';
import { AuthContext, authMiddleware, requireRole } from '../middleware/auth';
import { makeId } from '../utils/id';
import {
  LEVEL_PRESETS,
  normalizeLevelBypass,
  normalizeLevelCapabilities,
} from '../../shared/levels';
import {
  ApprovalModule,
  listEmployeeLevels,
  rowToEmployeeLevel,
  simulateApprovalFlow,
} from '../services/employee-levels';

export const employeeLevelRoutes = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

employeeLevelRoutes.use('*', authMiddleware);

// List all levels + presets
employeeLevelRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const levels = await listEmployeeLevels(c.env.DB, tenantId);
  return c.json({ levels, presets: LEVEL_PRESETS });
});

// List presets explicitly
employeeLevelRoutes.get('/presets', (c) => {
  return c.json({ presets: LEVEL_PRESETS });
});

// Apply a starter preset (creates or updates levels by code)
employeeLevelRoutes.post('/presets/:key', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const key = c.req.param('key');
  const preset = LEVEL_PRESETS.find((p) => p.key === key);
  if (!preset) {
    return c.json({ error: 'Preset not found' }, 404);
  }

  let replace = false;
  try {
    const body = await c.req.json();
    replace = Boolean(body?.replace);
  } catch {
    // optional JSON body
  }

  if (replace) {
    await c.env.DB.prepare(`UPDATE employees SET level_id = NULL WHERE tenant_id = ?`).bind(tenantId).run();
    await c.env.DB.prepare(`DELETE FROM employee_levels WHERE tenant_id = ?`).bind(tenantId).run();
  }

  for (const item of preset.levels) {
    const caps = JSON.stringify(normalizeLevelCapabilities(item.capabilities));
    const bypass = JSON.stringify(normalizeLevelBypass(item.bypass));
    const existing = await c.env.DB.prepare(
      `SELECT id FROM employee_levels WHERE tenant_id = ? AND UPPER(code) = UPPER(?)`
    )
      .bind(tenantId, item.code)
      .first<any>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE employee_levels
         SET name = ?, rank = ?, color = ?, description = ?, capabilities_json = ?, bypass_json = ?, is_default = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(
          item.name,
          item.rank,
          item.color,
          item.description,
          caps,
          bypass,
          item.is_default ? 1 : 0,
          existing.id
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO employee_levels (id, tenant_id, code, name, rank, color, description, capabilities_json, bypass_json, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
        .bind(
          makeId('lvl'),
          tenantId,
          item.code.toUpperCase(),
          item.name,
          item.rank,
          item.color,
          item.description,
          caps,
          bypass,
          item.is_default ? 1 : 0
        )
        .run();
    }
  }

  const levels = await listEmployeeLevels(c.env.DB, tenantId);
  return c.json({ levels, appliedPreset: preset.key });
});

// Create a new level
employeeLevelRoutes.post('/', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const body = await c.req.json();

  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const rank = Number(body.rank ?? 10);
  const color = String(body.color || '#2563EB').trim();
  const description = body.description ? String(body.description).trim() : null;

  if (!code || !name || !Number.isFinite(rank)) {
    return c.json({ error: 'code, name, and numeric rank are required' }, 400);
  }

  const dup = await c.env.DB.prepare(
    `SELECT id FROM employee_levels WHERE tenant_id = ? AND UPPER(code) = ?`
  )
    .bind(tenantId, code)
    .first<any>();
  if (dup) {
    return c.json({ error: `Level code "${code}" already exists` }, 409);
  }

  const isDefault = body.is_default ? 1 : 0;
  if (isDefault) {
    await c.env.DB.prepare(`UPDATE employee_levels SET is_default = 0 WHERE tenant_id = ?`).bind(tenantId).run();
  }

  const id = makeId('lvl');
  const caps = JSON.stringify(normalizeLevelCapabilities(body.capabilities));
  const bypass = JSON.stringify(normalizeLevelBypass(body.bypass));

  await c.env.DB.prepare(
    `INSERT INTO employee_levels (id, tenant_id, code, name, rank, color, description, capabilities_json, bypass_json, is_default, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  )
    .bind(id, tenantId, code, name, Math.round(rank), color, description, caps, bypass, isDefault)
    .run();

  const created = await c.env.DB.prepare(`SELECT * FROM employee_levels WHERE id = ?`).bind(id).first<any>();
  return c.json({ level: rowToEmployeeLevel(created) }, 201);
});

// Update a level
employeeLevelRoutes.put('/:id', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    `SELECT * FROM employee_levels WHERE id = ? AND tenant_id = ?`
  )
    .bind(id, tenantId)
    .first<any>();

  if (!existing) {
    return c.json({ error: 'Level not found' }, 404);
  }

  const body = await c.req.json();
  const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : existing.code;
  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const rank = body.rank !== undefined ? Math.round(Number(body.rank)) : existing.rank;
  const color = body.color !== undefined ? String(body.color).trim() : existing.color;
  const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : existing.description;
  const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
  const isDefault = body.is_default !== undefined ? (body.is_default ? 1 : 0) : existing.is_default;

  if (!code || !name || !Number.isFinite(rank)) {
    return c.json({ error: 'code, name, and numeric rank are required' }, 400);
  }

  if (code !== existing.code) {
    const dup = await c.env.DB.prepare(
      `SELECT id FROM employee_levels WHERE tenant_id = ? AND UPPER(code) = ? AND id != ?`
    )
      .bind(tenantId, code, id)
      .first<any>();
    if (dup) return c.json({ error: `Level code "${code}" already exists` }, 409);
  }

  if (isDefault) {
    await c.env.DB.prepare(`UPDATE employee_levels SET is_default = 0 WHERE tenant_id = ? AND id != ?`)
      .bind(tenantId, id)
      .run();
  }

  const caps = body.capabilities !== undefined
    ? JSON.stringify(normalizeLevelCapabilities(body.capabilities))
    : existing.capabilities_json;
  const bypass = body.bypass !== undefined
    ? JSON.stringify(normalizeLevelBypass(body.bypass))
    : existing.bypass_json;

  await c.env.DB.prepare(
    `UPDATE employee_levels
     SET code = ?, name = ?, rank = ?, color = ?, description = ?, capabilities_json = ?, bypass_json = ?, is_default = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(code, name, rank, color, description, caps, bypass, isDefault, isActive, id)
    .run();

  const updated = await c.env.DB.prepare(`SELECT * FROM employee_levels WHERE id = ?`).bind(id).first<any>();
  return c.json({ level: rowToEmployeeLevel(updated) });
});

// Reorder ranks in bulk
employeeLevelRoutes.post('/reorder', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const body = await c.req.json();
  const items: Array<{ id: string; rank: number }> = Array.isArray(body?.items) ? body.items : [];

  if (items.length === 0) {
    return c.json({ error: 'items array is required' }, 400);
  }

  for (const item of items) {
    if (!item?.id || !Number.isFinite(Number(item.rank))) continue;
    await c.env.DB.prepare(
      `UPDATE employee_levels SET rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`
    )
      .bind(Math.round(Number(item.rank)), item.id, tenantId)
      .run();
  }

  const levels = await listEmployeeLevels(c.env.DB, tenantId);
  return c.json({ levels });
});

// Delete a level (optionally reassign employees first)
employeeLevelRoutes.delete('/:id', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const id = c.req.param('id');
  const reassignTo = c.req.query('reassignTo') || null;

  const existing = await c.env.DB.prepare(
    `SELECT id FROM employee_levels WHERE id = ? AND tenant_id = ?`
  )
    .bind(id, tenantId)
    .first<any>();

  if (!existing) {
    return c.json({ error: 'Level not found' }, 404);
  }

  if (reassignTo) {
    const target = await c.env.DB.prepare(
      `SELECT id FROM employee_levels WHERE id = ? AND tenant_id = ?`
    )
      .bind(reassignTo, tenantId)
      .first<any>();
    if (!target) return c.json({ error: 'Target reassignment level not found' }, 404);
    await c.env.DB.prepare(`UPDATE employees SET level_id = ? WHERE level_id = ?`).bind(reassignTo, id).run();
  } else {
    await c.env.DB.prepare(`UPDATE employees SET level_id = NULL WHERE level_id = ?`).bind(id).run();
  }

  await c.env.DB.prepare(`DELETE FROM employee_levels WHERE id = ?`).bind(id).run();
  return c.json({ deleted: true, id });
});

// Bulk assign employees to a level
employeeLevelRoutes.post('/:id/assign', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const id = c.req.param('id');
  const body = await c.req.json();
  const employeeIds: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds : [];

  const lvl = await c.env.DB.prepare(
    `SELECT id FROM employee_levels WHERE id = ? AND tenant_id = ?`
  )
    .bind(id, tenantId)
    .first<any>();

  if (!lvl) {
    return c.json({ error: 'Level not found' }, 404);
  }

  for (const empId of employeeIds) {
    if (!empId) continue;
    await c.env.DB.prepare(`UPDATE employees SET level_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(id, empId)
      .run();
  }

  return c.json({ assigned: employeeIds.length, levelId: id });
});

// Simulate approval chain for visual preview
employeeLevelRoutes.post('/simulate', requireRole(['owner_admin']), async (c) => {
  const user = c.get('user');
  const tenantId = user.tenantId || 'default';
  const body = await c.req.json();
  const levelId = String(body?.levelId || '');
  const module = String(body?.module || 'leave') as ApprovalModule;
  const amount = body?.amount !== undefined && body?.amount !== null ? Number(body.amount) : null;

  const levels = await listEmployeeLevels(c.env.DB, tenantId);
  const steps = simulateApprovalFlow(levels, levelId, module, amount);
  return c.json({ steps });
});

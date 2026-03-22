import { query } from '../../db.js';

function itemToValue(row) {
  if (!row) return null;
  switch (row.value_type) {
    case 'number':
      return row.value_number != null ? Number(row.value_number) : (row.default_value_json != null ? Number(JSON.parse(row.default_value_json)) : null);
    case 'boolean':
      return row.value_boolean !== undefined && row.value_boolean !== null ? row.value_boolean : (row.default_value_json != null ? JSON.parse(row.default_value_json) === true : null);
    case 'json':
      return row.value_json != null ? row.value_json : (row.default_value_json != null ? JSON.parse(row.default_value_json) : null);
    default:
      return row.value_text != null ? row.value_text : (row.default_value_json != null ? JSON.parse(row.default_value_json) : null);
  }
}

async function getGroups() {
  const res = await query(
    'SELECT id, key, label, description, sort_order, is_active FROM settings_groups WHERE is_active = true ORDER BY sort_order, id'
  );
  return res.rows || [];
}

async function getByGroupKey(groupKey) {
  const res = await query(
    `SELECT i.* FROM settings_items i
     JOIN settings_groups g ON g.id = i.group_id AND g.key = $1
     ORDER BY i.sort_order, i.id`,
    [groupKey]
  );
  const rows = res.rows || [];
  const out = {};
  for (const r of rows) {
    out[r.key] = {
      id: r.id,
      key: r.key,
      label: r.label,
      value_type: r.value_type,
      value: itemToValue(r),
      default_value_json: r.default_value_json,
      unit: r.unit,
      description: r.description,
      is_editable: r.is_editable,
    };
  }
  return out;
}

async function getSetting(groupKey, itemKey) {
  const res = await query(
    `SELECT i.* FROM settings_items i
     JOIN settings_groups g ON g.id = i.group_id AND g.key = $1
     WHERE i.key = $2`,
    [groupKey, itemKey]
  );
  return itemToValue(res.rows[0] || null);
}

async function updateGroup(groupKey, payload, updatedBy = null) {
  const gRes = await query('SELECT id FROM settings_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  const groupId = g.id;
  for (const [itemKey, value] of Object.entries(payload)) {
    const itemRes = await query('SELECT id, value_type FROM settings_items WHERE group_id = $1 AND key = $2', [groupId, itemKey]);
    const item = itemRes.rows[0];
    if (!item) continue;
    if (typeof value === 'number') {
      await query('UPDATE settings_items SET value_number = $2, value_text = NULL, value_boolean = NULL, value_json = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, value, updatedBy]);
    } else if (typeof value === 'boolean') {
      await query('UPDATE settings_items SET value_boolean = $2, value_text = NULL, value_number = NULL, value_json = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, value, updatedBy]);
    } else if (typeof value === 'object' && value !== null) {
      await query('UPDATE settings_items SET value_json = $2, value_text = NULL, value_number = NULL, value_boolean = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, JSON.stringify(value), updatedBy]);
    } else {
      await query('UPDATE settings_items SET value_text = $2, value_number = NULL, value_boolean = NULL, value_json = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, String(value), updatedBy]);
    }
  }
  return getByGroupKey(groupKey);
}

async function resetGroup(groupKey, updatedBy = null) {
  const gRes = await query('SELECT id FROM settings_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  await query(
    `UPDATE settings_items SET
       value_text = CASE WHEN value_type = 'string' AND default_value_json IS NOT NULL THEN default_value_json#>>'{}' ELSE NULL END,
       value_number = CASE WHEN value_type = 'number' AND default_value_json IS NOT NULL THEN (default_value_json#>>'{}')::numeric ELSE NULL END,
       value_boolean = CASE WHEN value_type = 'boolean' AND default_value_json IS NOT NULL THEN (default_value_json#>>'{}')::boolean ELSE NULL END,
       value_json = CASE WHEN value_type = 'json' THEN default_value_json ELSE NULL END,
       updated_by = $2, updated_at = NOW()
     WHERE group_id = $1`,
    [g.id, updatedBy]
  );
  return getByGroupKey(groupKey);
}

export default { getGroups, getByGroupKey, getSetting, updateGroup, resetGroup };

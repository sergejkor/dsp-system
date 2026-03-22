import { query } from '../../db.js';

async function getGroups() {
  const res = await query('SELECT id, key, label, description FROM settings_lookup_groups ORDER BY key');
  return res.rows || [];
}

async function getByGroupKey(groupKey, activeOnly = true) {
  const res = await query(
    `SELECT v.* FROM settings_lookup_values v
     JOIN settings_lookup_groups g ON g.id = v.group_id AND g.key = $1
     ${activeOnly ? 'WHERE v.is_active = true' : ''}
     ORDER BY v.sort_order, v.value_key`,
    [groupKey]
  );
  return res.rows || [];
}

async function createValue(groupKey, data, updatedBy = null) {
  const gRes = await query('SELECT id FROM settings_lookup_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  const res = await query(
    `INSERT INTO settings_lookup_values (group_id, value_key, label, color, icon, sort_order, is_active, description, metadata_json, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      g.id,
      data.value_key || data.key,
      data.label || data.value_key,
      data.color || null,
      data.icon || null,
      data.sort_order ?? 0,
      data.is_active !== false,
      data.description || null,
      data.metadata_json ? JSON.stringify(data.metadata_json) : null,
      updatedBy,
    ]
  );
  return res.rows[0];
}

async function updateValue(groupKey, valueId, data, updatedBy = null) {
  const gRes = await query('SELECT id FROM settings_lookup_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  const allow = ['value_key', 'label', 'color', 'icon', 'sort_order', 'is_active', 'description', 'metadata_json'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const k of allow) {
    if (data[k] !== undefined) {
      if (k === 'metadata_json') {
        updates.push(`${k} = $${idx}::jsonb`);
        values.push(JSON.stringify(data[k]));
      } else {
        updates.push(`${k} = $${idx}`);
        values.push(data[k]);
      }
      idx++;
    }
  }
  if (updates.length === 0) {
    const r = await query('SELECT * FROM settings_lookup_values WHERE id = $1 AND group_id = $2', [valueId, g.id]);
    return r.rows[0] || null;
  }
  values.push(updatedBy, valueId, g.id);
  const idx2 = idx + 1;
  const idx3 = idx + 2;
  await query(
    `UPDATE settings_lookup_values SET ${updates.join(', ')}, updated_by = $${idx}, updated_at = NOW() WHERE id = $${idx2} AND group_id = $${idx3}`,
    values
  );
  const r = await query('SELECT * FROM settings_lookup_values WHERE id = $1', [valueId]);
  return r.rows[0] || null;
}

async function reorder(groupKey, valueIdsInOrder) {
  const gRes = await query('SELECT id FROM settings_lookup_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  for (let i = 0; i < valueIdsInOrder.length; i++) {
    await query('UPDATE settings_lookup_values SET sort_order = $2, updated_at = NOW() WHERE id = $1 AND group_id = $3', [valueIdsInOrder[i], i, g.id]);
  }
  return getByGroupKey(groupKey, false);
}

export default { getGroups, getByGroupKey, createValue, updateValue, reorder };

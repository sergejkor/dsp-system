import { query } from '../../db.js';

async function getAll() {
  const res = await query(
    'SELECT id, key, label, value_json, updated_at FROM settings_security ORDER BY key'
  );
  const out = {};
  for (const r of res.rows || []) {
    out[r.key] = { id: r.id, label: r.label, value: r.value_json, updated_at: r.updated_at };
  }
  return out;
}

async function update(payload, updatedBy = null) {
  for (const [key, value] of Object.entries(payload)) {
    await query(
      'UPDATE settings_security SET value_json = $2::jsonb, updated_by = $3, updated_at = NOW() WHERE key = $1',
      [key, typeof value === 'string' ? value : JSON.stringify(value), updatedBy]
    );
  }
  return getAll();
}

export default { getAll, update };

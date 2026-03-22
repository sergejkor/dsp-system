import { query } from '../../db.js';

async function list() {
  const res = await query(
    'SELECT id, key, label, description, enabled, environment_scope, updated_at FROM settings_feature_flags ORDER BY key'
  );
  return res.rows || [];
}

async function getByKey(key) {
  const res = await query('SELECT * FROM settings_feature_flags WHERE key = $1', [key]);
  return res.rows[0] || null;
}

async function setEnabled(key, enabled, updatedBy = null) {
  await query(
    'UPDATE settings_feature_flags SET enabled = $2, updated_by = $3, updated_at = NOW() WHERE key = $1',
    [key, !!enabled, updatedBy]
  );
  return getByKey(key);
}

export default { list, getByKey, setEnabled };

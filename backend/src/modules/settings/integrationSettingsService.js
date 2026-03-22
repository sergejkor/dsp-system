import { query } from '../../db.js';

/** Return only public/safe config; never expose secrets. */
async function list() {
  const res = await query(
    `SELECT id, integration_key, label, is_enabled, environment, base_url, public_config_json, private_config_exists, sync_frequency, last_sync_at, last_sync_status, last_error, updated_at
     FROM settings_integrations ORDER BY integration_key`
  );
  return res.rows || [];
}

async function getByKey(integrationKey) {
  const res = await query(
    `SELECT id, integration_key, label, is_enabled, environment, base_url, public_config_json, private_config_exists, sync_frequency, last_sync_at, last_sync_status, last_error, updated_at
     FROM settings_integrations WHERE integration_key = $1`,
    [integrationKey]
  );
  return res.rows[0] || null;
}

async function update(integrationKey, data, updatedBy = null) {
  const allow = ['label', 'is_enabled', 'environment', 'base_url', 'public_config_json', 'sync_frequency'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const k of allow) {
    if (data[k] !== undefined) {
      if (k === 'public_config_json') {
        updates.push(`${k} = $${idx}::jsonb`);
        values.push(typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k] || {}));
      } else {
        updates.push(`${k} = $${idx}`);
        values.push(data[k]);
      }
      idx++;
    }
  }
  if (data.private_config_exists !== undefined) {
    updates.push(`private_config_exists = $${idx}`);
    values.push(!!data.private_config_exists);
    idx++;
  }
  if (updates.length === 0) return getByKey(integrationKey);
  values.push(updatedBy, integrationKey);
  await query(
    `UPDATE settings_integrations SET ${updates.join(', ')}, updated_by = $${idx}, updated_at = NOW() WHERE integration_key = $${idx + 1}`,
    values
  );
  return getByKey(integrationKey);
}

async function setLastSync(integrationKey, status, error = null) {
  await query(
    'UPDATE settings_integrations SET last_sync_at = NOW(), last_sync_status = $2, last_error = $3, updated_at = NOW() WHERE integration_key = $1',
    [integrationKey, status, error]
  );
  return getByKey(integrationKey);
}

export default { list, getByKey, update, setLastSync };

/**
 * Audit log: persist all important changes with entity_type, entity_id, action, old/new value, actor, ip, user_agent.
 */
import { query } from '../../db.js';

async function log(entityType, entityId, action, oldValue, newValue, changedBy, ipAddress = null, userAgent = null) {
  await query(
    `INSERT INTO settings_audit_logs (entity_type, entity_id, action, old_value_json, new_value_json, changed_by, ip_address, user_agent)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
    [
      entityType,
      entityId != null ? String(entityId) : null,
      action,
      oldValue != null ? JSON.stringify(oldValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
      changedBy,
      ipAddress,
      userAgent,
    ]
  );
}

async function list(filters = {}) {
  const { entity_type, entity_id, changed_by, from_date, to_date, limit = 100, offset = 0 } = filters;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (entity_type) { conditions.push(`entity_type = $${idx}`); params.push(entity_type); idx++; }
  if (entity_id) { conditions.push(`entity_id = $${idx}`); params.push(String(entity_id)); idx++; }
  if (changed_by) { conditions.push(`changed_by = $${idx}`); params.push(changed_by); idx++; }
  if (from_date) { conditions.push(`changed_at >= $${idx}`); params.push(from_date); idx++; }
  if (to_date) { conditions.push(`changed_at <= $${idx}`); params.push(to_date); idx++; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const res = await query(
    `SELECT id, entity_type, entity_id, action, old_value_json, new_value_json, changed_by, changed_at, ip_address, user_agent
     FROM settings_audit_logs ${where}
     ORDER BY changed_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return { items: res.rows || [], limit, offset };
}

export default { log, list };

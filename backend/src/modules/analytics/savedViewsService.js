/**
 * Analytics saved views: CRUD for user-specific and shared views.
 */
import { query } from '../../db.js';

export async function getSavedViews(userId) {
  const res = await query(
    `SELECT id, name, page_key, filters_json, layout_json, is_default, is_shared, created_at, updated_at
     FROM analytics_saved_views
     WHERE user_id = $1 OR is_shared = true
     ORDER BY is_default DESC, name`,
    [userId]
  );
  return res.rows || [];
}

export async function createSavedView(userId, data) {
  const { name, page_key, filters_json = {}, layout_json = {}, is_default = false, is_shared = false } = data;
  const res = await query(
    `INSERT INTO analytics_saved_views (user_id, name, page_key, filters_json, layout_json, is_default, is_shared)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, page_key, filters_json, layout_json, is_default, is_shared, created_at, updated_at`,
    [userId, name, page_key || 'overview', JSON.stringify(filters_json), JSON.stringify(layout_json), !!is_default, !!is_shared]
  );
  if (is_default) {
    await query(
      `UPDATE analytics_saved_views SET is_default = false WHERE user_id = $1 AND id != $2`,
      [userId, res.rows[0].id]
    );
  }
  return res.rows[0];
}

export async function updateSavedView(id, userId, data) {
  const updates = [];
  const params = [];
  let idx = 1;
  if (data.name !== undefined) { updates.push(`name = $${idx++}`); params.push(data.name); }
  if (data.page_key !== undefined) { updates.push(`page_key = $${idx++}`); params.push(data.page_key); }
  if (data.filters_json !== undefined) { updates.push(`filters_json = $${idx++}`); params.push(JSON.stringify(data.filters_json)); }
  if (data.layout_json !== undefined) { updates.push(`layout_json = $${idx++}`); params.push(JSON.stringify(data.layout_json)); }
  if (data.is_default !== undefined) { updates.push(`is_default = $${idx++}`); params.push(!!data.is_default); }
  if (data.is_shared !== undefined) { updates.push(`is_shared = $${idx++}`); params.push(!!data.is_shared); }
  if (updates.length === 0) {
    const r = await query(`SELECT * FROM analytics_saved_views WHERE id = $1 AND (user_id = $2 OR is_shared = true)`, [id, userId]);
    return r.rows[0] || null;
  }
  params.push(id, userId);
  const res = await query(
    `UPDATE analytics_saved_views SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${idx} AND user_id = $${idx + 1}
     RETURNING id, name, page_key, filters_json, layout_json, is_default, is_shared, created_at, updated_at`,
    params
  );
  if (data.is_default && res.rows[0]) {
    await query(
      `UPDATE analytics_saved_views SET is_default = false WHERE user_id = $1 AND id != $2`,
      [userId, id]
    );
  }
  return res.rows[0] || null;
}

export async function deleteSavedView(id, userId) {
  const res = await query(
    `DELETE FROM analytics_saved_views WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return res.rowCount > 0;
}

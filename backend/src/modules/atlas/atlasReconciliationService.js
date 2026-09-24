import { pool } from '../../db.js';

export function normalizeAtlasRouteCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function resolveAtlasRouteAssignments(atlasRoutes, dailyRows) {
  const normalizedRoutes = [...new Set((atlasRoutes || []).map(normalizeAtlasRouteCode).filter(Boolean))].sort();
  const assignments = [];
  for (const routeCode of normalizedRoutes) {
    const names = new Set();
    for (const row of dailyRows || []) {
      if (normalizeAtlasRouteCode(row.routencode) !== routeCode) continue;
      const driverName = String(row.driver_name ?? '').trim();
      if (driverName) names.add(driverName);
    }
    const matchStatus = names.size === 0 ? 'UNMATCHED' : names.size === 1 ? 'MATCHED' : 'AMBIGUOUS';
    assignments.push({
      routeCode,
      driverName: matchStatus === 'MATCHED' ? [...names][0] : null,
      matchStatus,
    });
  }
  return assignments;
}

export async function reconcileAtlasRoutesWithStore(serviceDate, store) {
  const [routes, dailyRows] = await Promise.all([
    store.getAtlasRoutes(serviceDate),
    store.getDailyRows(serviceDate),
  ]);
  const assignments = resolveAtlasRouteAssignments(routes, dailyRows);
  await store.replaceAssignments(serviceDate, assignments);
  return assignments;
}

async function reconcileAtlasRoutesWithClient(serviceDate, client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`atlas-route-reconcile:${serviceDate}`]);
  const store = {
    async getAtlasRoutes(date) {
      const result = await client.query(`
          SELECT DISTINCT UPPER(BTRIM(route_code)) AS route_code
          FROM atlas_shipments
          WHERE service_date = $1 AND BTRIM(route_code) <> ''
        `, [date]);
        return result.rows.map((row) => row.route_code);
    },
    async getDailyRows(date) {
      const result = await client.query(`
          SELECT routencode, driver_name
          FROM daily_upload_rows
          WHERE day_key = $1
        `, [date]);
        return result.rows;
    },
    async replaceAssignments(date, assignments) {
      for (const assignment of assignments) {
        await client.query(`
            INSERT INTO atlas_route_assignments
              (service_date, route_code, driver_name, match_status, matched_at)
        VALUES ($1, $2, $3, $4, CASE WHEN $4::varchar = 'MATCHED' THEN NOW() ELSE NULL END)
            ON CONFLICT (service_date, route_code) DO UPDATE SET
              driver_name = EXCLUDED.driver_name,
              match_status = EXCLUDED.match_status,
              matched_at = CASE
                WHEN EXCLUDED.match_status <> 'MATCHED' THEN NULL
                WHEN atlas_route_assignments.match_status = 'MATCHED'
                  AND atlas_route_assignments.driver_name IS NOT DISTINCT FROM EXCLUDED.driver_name
                  THEN atlas_route_assignments.matched_at
                ELSE NOW()
              END,
              updated_at = NOW()
          `, [date, assignment.routeCode, assignment.driverName, assignment.matchStatus]);
      }
      await client.query(`
          DELETE FROM atlas_route_assignments existing
          WHERE service_date = $1
            AND NOT EXISTS (
              SELECT 1 FROM atlas_shipments shipment
              WHERE shipment.service_date = $1
                AND UPPER(BTRIM(shipment.route_code)) = existing.route_code
            )
      `, [date]);
    },
  };
  return reconcileAtlasRoutesWithStore(serviceDate, store);
}

export async function reconcileAtlasRoutes(serviceDate, { client: transactionClient } = {}) {
  if (transactionClient) return reconcileAtlasRoutesWithClient(serviceDate, transactionClient);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const assignments = await reconcileAtlasRoutesWithClient(serviceDate, client);
    await client.query('COMMIT');
    return assignments;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}

export default { reconcileAtlasRoutes, resolveAtlasRouteAssignments };

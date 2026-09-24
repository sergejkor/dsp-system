import { query } from '../../db.js';

export function createAtlasQueryService({ queryFn = query } = {}) {
  async function getAtlasResultForDate(serviceDate) {
    const emailResult = await queryFn(`
      SELECT EXISTS (
        SELECT 1 FROM incoming_emails
        WHERE provider = 'atlas_goneo'
          AND processing_status = 'processed'
          AND raw_extraction_payload->>'serviceDate' = $1
      ) AS exists
    `, [serviceDate]);
    const routeResult = await queryFn(`
      WITH shipment_routes AS (
        SELECT service_date,
               UPPER(BTRIM(route_code)) AS route_code,
               COUNT(*)::int AS shipment_count,
               ARRAY_AGG(tracking_id ORDER BY tracking_id) AS tracking_ids
        FROM atlas_shipments
        WHERE service_date = $1
        GROUP BY service_date, UPPER(BTRIM(route_code))
      ), assignments AS (
        SELECT service_date,
               UPPER(BTRIM(route_code)) AS route_code,
               CASE
                 WHEN BOOL_OR(match_status = 'AMBIGUOUS') OR COUNT(DISTINCT driver_name) > 1 THEN 'AMBIGUOUS'
                 WHEN BOOL_AND(match_status = 'MATCHED') AND COUNT(DISTINCT driver_name) = 1 THEN 'MATCHED'
                 ELSE 'UNMATCHED'
               END AS match_status,
               CASE
                 WHEN BOOL_AND(match_status = 'MATCHED') AND COUNT(DISTINCT driver_name) = 1
                   THEN MIN(driver_name)
                 ELSE NULL
               END AS driver_name
        FROM atlas_route_assignments
        WHERE service_date = $1
        GROUP BY service_date, UPPER(BTRIM(route_code))
      )
      SELECT shipment_routes.route_code,
             assignments.driver_name,
             COALESCE(assignments.match_status, 'UNMATCHED') AS match_status,
             shipment_routes.shipment_count,
             shipment_routes.tracking_ids
      FROM shipment_routes
      LEFT JOIN assignments USING (service_date, route_code)
      ORDER BY shipment_routes.route_code
    `, [serviceDate]);
    const slackResult = await queryFn(`
      SELECT status, sent_at
      FROM atlas_slack_deliveries
      WHERE service_date = $1
      LIMIT 1
    `, [serviceDate]);

    const routes = routeResult.rows.map((row) => ({
      routeCode: row.route_code,
      driverName: row.driver_name,
      matchStatus: row.match_status,
      shipmentCount: Number(row.shipment_count) || 0,
      trackingIds: [...(row.tracking_ids || [])].map(String).sort(),
    }));
    const summary = { shipments: 0, routes: routes.length, matched: 0, unmatched: 0, ambiguous: 0 };
    for (const route of routes) {
      summary.shipments += route.shipmentCount;
      if (route.matchStatus === 'MATCHED') summary.matched += 1;
      else if (route.matchStatus === 'AMBIGUOUS') summary.ambiguous += 1;
      else summary.unmatched += 1;
    }

    const slack = slackResult.rows[0];
    return {
      serviceDate,
      hasEmail: emailResult.rows[0]?.exists === true,
      summary,
      slack: { status: slack?.status || 'not_sent', sentAt: slack?.sent_at || null },
      routes,
    };
  }

  return { getAtlasResultForDate };
}

export const { getAtlasResultForDate } = createAtlasQueryService();
export default { getAtlasResultForDate };

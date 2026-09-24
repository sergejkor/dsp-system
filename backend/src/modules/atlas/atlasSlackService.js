import { createHash } from 'node:crypto';
import { pool } from '../../db.js';

const SLACK_LOCK_NAMESPACE = 'atlas-slack-delivery';
const SLACK_TIMEOUT_MS = 15_000;
const SENDING_LEASE_MS = 5 * 60_000;

function berlinClock(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function isAtlasSlackRetryWindow(now = new Date()) {
  const { weekday, minuteOfDay } = berlinClock(now);
  return weekday !== 'Sun' && minuteOfDay >= 8 * 60 && minuteOfDay < 10 * 60 + 30;
}

export function getAtlasBerlinDate(now = new Date()) {
  return berlinClock(now).date;
}

export function isAtlasSlackReady({ hasEmail, routes, allAssignmentsMatched = true }) {
  return hasEmail === true &&
    Array.isArray(routes) && routes.length > 0 &&
    allAssignmentsMatched &&
    routes.every((route) => route.matchStatus === 'MATCHED' &&
      String(route.driverName || '').trim() && Number(route.shipmentCount) > 0);
}

function cleanCell(value) {
  return String(value ?? '').replace(/[\r\n\t`]/g, ' ').trim();
}

export function formatAtlasSlackMessage(serviceDate, routes) {
  const date = String(serviceDate).split('-').reverse().join('.');
  const header = 'Routencode   Name des Fahrers                 Anzahl';
  const routeLines = [...routes]
    .sort((a, b) => cleanCell(a.routeCode).localeCompare(cleanCell(b.routeCode)))
    .map(({ routeCode, driverName, shipmentCount }) =>
      `${cleanCell(routeCode).padEnd(13)} ${cleanCell(driverName).padEnd(31)} x${Number(shipmentCount) || 0}`
    );
  const shipmentTotal = routes.reduce((sum, route) => sum + (Number(route.shipmentCount) || 0), 0);
  return [
    `📦 *Atlas Shipments – ${date}*`,
    '```text',
    header,
    ...routeLines,
    '```',
    `${shipmentTotal} Sendungen · ${routes.length} Routen`,
    ` ${routes.length}/${routes.length} Fahrer zugeordnet`,
    'Automatisch erstellt durch LightCore',
  ].join('\n');
}

function safeErrorCode(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
  const code = String(error?.code || '');
  return /^[A-Z0-9_-]{1,24}$/.test(code) ? code : 'network_error';
}

async function loadAtlasResult(client, serviceDate) {
  const emailResult = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM incoming_emails
      WHERE provider = 'atlas_goneo'
        AND processing_status = 'processed'
        AND raw_extraction_payload->>'serviceDate' = $1
    ) AS exists
  `, [serviceDate]);
  const shipmentResult = await client.query(`
    WITH assignments AS (
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
    SELECT UPPER(BTRIM(shipment.route_code)) AS route_code,
           shipment.tracking_id,
           assignment.driver_name,
           assignment.match_status
    FROM atlas_shipments shipment
    LEFT JOIN assignments assignment
      ON assignment.service_date = shipment.service_date
      AND assignment.route_code = UPPER(BTRIM(shipment.route_code))
    WHERE shipment.service_date = $1
    ORDER BY UPPER(BTRIM(shipment.route_code)), shipment.tracking_id
  `, [serviceDate]);
  const assignmentResult = await client.query(`
    SELECT COUNT(*) FILTER (
      WHERE match_status <> 'MATCHED' OR driver_name IS NULL OR BTRIM(driver_name) = ''
    )::int AS invalid_count
    FROM atlas_route_assignments
    WHERE service_date = $1
  `, [serviceDate]);

  const routesByCode = new Map();
  for (const row of shipmentResult.rows) {
    const routeCode = cleanCell(row.route_code).toUpperCase();
    if (!routesByCode.has(routeCode)) {
      routesByCode.set(routeCode, {
        routeCode,
        driverName: row.driver_name,
        matchStatus: row.match_status,
        shipmentCount: 0,
        trackingIds: [],
      });
    }
    const route = routesByCode.get(routeCode);
    route.shipmentCount += 1;
    route.trackingIds.push(String(row.tracking_id));
  }
  const routes = [...routesByCode.values()].sort((a, b) => a.routeCode.localeCompare(b.routeCode));
  const hasEmail = emailResult.rows[0]?.exists === true;
  const shipments = shipmentResult.rows.length;
  const allAssignmentsMatched = Number(assignmentResult.rows[0]?.invalid_count || 0) === 0 &&
    routes.every((route) => route.matchStatus === 'MATCHED' && String(route.driverName || '').trim());

  return {
    serviceDate,
    hasEmail,
    shipments,
    routes,
    allAssignmentsMatched,
    ready: isAtlasSlackReady({ hasEmail, routes, allAssignmentsMatched }),
  };
}

async function saveFailure(client, serviceDate, errorCode) {
  await client.query(`
    UPDATE atlas_slack_deliveries
    SET status = 'failed', last_error = $2, updated_at = NOW()
    WHERE service_date = $1 AND status = 'sending'
  `, [serviceDate, errorCode]);
}

export function createAtlasSlackService({
  dbPool = pool,
  fetchImpl = globalThis.fetch,
  environment = () => process.env,
  now = () => new Date(),
} = {}) {
  async function deliverAtlasToSlack(serviceDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate))) return { status: 'invalid_date' };
    if (serviceDate < getAtlasBerlinDate(now())) return { status: 'historical_date' };

    const env = environment();
    if (String(env.ATLAS_SLACK_ENABLED || '').trim().toLowerCase() !== 'true') {
      return { status: 'disabled' };
    }
    const webhookUrl = String(env.ATLAS_SLACK_WEBHOOK_URL || '').trim();
    if (!webhookUrl) {
      console.warn('[atlas] Slack delivery is enabled but its webhook is not configured');
      return { status: 'not_configured' };
    }

    let client;
    let lockHeld = false;
    try {
      client = await dbPool.connect();
      const lock = await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
        [SLACK_LOCK_NAMESPACE, serviceDate],
      );
      lockHeld = lock.rows[0]?.locked === true;
      if (!lockHeld) return { status: 'in_progress' };

      const existing = await client.query(`
        SELECT status,
               (last_attempt_at >= date_trunc('minute', NOW())) AS attempted_this_minute,
               (updated_at >= NOW() - ($2::int * INTERVAL '1 millisecond')) AS sending_is_fresh
        FROM atlas_slack_deliveries
        WHERE service_date = $1
      `, [serviceDate, SENDING_LEASE_MS]);
      const prior = existing.rows[0];
      if (prior?.status === 'sent') return { status: 'already_sent' };
      if (prior?.status === 'sending' && prior.sending_is_fresh) return { status: 'in_progress' };
      if (prior?.attempted_this_minute) return { status: 'retry_throttled' };

      const result = await loadAtlasResult(client, serviceDate);
      if (!result.hasEmail) return { status: 'not_ready', reason: 'email_not_processed' };
      if (!result.shipments) return { status: 'not_ready', reason: 'no_shipments' };
      if (!result.ready) return { status: 'not_ready', reason: 'assignments_incomplete' };

      const text = formatAtlasSlackMessage(serviceDate, result.routes);
      const payloadHash = createHash('sha256').update(text, 'utf8').digest('hex');
      await client.query(`
        INSERT INTO atlas_slack_deliveries
          (service_date, status, payload_hash, attempt_count, last_error, last_attempt_at, sent_at, created_at, updated_at)
        VALUES ($1, 'sending', $2, 1, NULL, NOW(), NULL, NOW(), NOW())
        ON CONFLICT (service_date) DO UPDATE SET
          status = 'sending', payload_hash = EXCLUDED.payload_hash,
          attempt_count = atlas_slack_deliveries.attempt_count + 1,
          last_error = NULL, last_attempt_at = NOW(), sent_at = NULL, updated_at = NOW()
      `, [serviceDate, payloadHash]);

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), SLACK_TIMEOUT_MS);
      let response;
      let fetchError;
      try {
        response = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: abortController.signal,
        });
      } catch (error) {
        fetchError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (fetchError || !response?.ok) {
        const errorCode = fetchError ? safeErrorCode(fetchError) : `http_${Number(response?.status) || 0}`;
        await saveFailure(client, serviceDate, errorCode);
        console.error(`[atlas] Slack delivery failed for ${serviceDate} (${errorCode})`);
        return { status: 'failed' };
      }

      await client.query(`
        UPDATE atlas_slack_deliveries
        SET status = 'sent', last_error = NULL, sent_at = NOW(), updated_at = NOW()
        WHERE service_date = $1 AND status = 'sending'
      `, [serviceDate]);
      console.info(`[atlas] Slack delivery completed for ${serviceDate}`);
      return { status: 'sent', shipmentCount: result.shipments, routeCount: result.routes.length };
    } catch (error) {
      console.error(`[atlas] Slack delivery could not be completed for ${serviceDate} (${safeErrorCode(error)})`);
      return { status: 'failed' };
    } finally {
      if (client) {
        if (lockHeld) {
          try {
            await client.query(
              'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
              [SLACK_LOCK_NAMESPACE, serviceDate],
            );
          } catch { /* releasing the client also releases the session lock */ }
        }
        client.release();
      }
    }
  }

  return { deliverAtlasToSlack };
}

export const { deliverAtlasToSlack } = createAtlasSlackService();

export async function attemptAtlasSlackDeliverySafely(serviceDate, deliver = deliverAtlasToSlack) {
  try {
    return await deliver(serviceDate);
  } catch {
    console.error(`[atlas] Slack delivery failed for ${serviceDate} (unexpected error)`);
    return { status: 'failed' };
  }
}

export default { deliverAtlasToSlack, attemptAtlasSlackDeliverySafely };

import { pool } from '../../db.js';

const TIMEOUT_MS = 15_000;
function berlinDate(now = new Date(), timezone = 'Europe/Berlin') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function berlinTime(now = new Date(), timezone = 'Europe/Berlin') { return new Intl.DateTimeFormat('de-DE', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now); }
function errorCode(error) { return error?.name === 'AbortError' ? 'timeout' : /^[A-Z0-9_-]+$/.test(String(error?.code || '')) ? error.code : 'network_error'; }
export function formatEvMonitoringSlackMessage(result, now = new Date(), timezone = 'Europe/Berlin') {
  const date = berlinDate(now, timezone).split('-').reverse().join('.'); const below = result.vehicles.filter((v) => v.soc !== null && v.soc < result.threshold); const dataIssues = result.vehicles.filter((v) => v.stale || v.soc === null); const provider = (name, info) => info.status === 'connected' ? `✅ ${info.vehicleCount}/${info.vehicleCount} vehicles checked` : `❌ ${info.errorCode === 'AUTH_REQUIRED' ? 'Authentication required' : 'Error'}\n0 vehicles verified`;
  const lines = [`⚡ *EV Monitoring — ${date}*`, ''];
  if (Object.values(result.providers).some((p) => p.status !== 'connected')) lines.push('❌ *Check incomplete*', ''); else if (below.length) lines.push(`⚠️ *Vehicles below ${result.threshold}%*`, '', ...below.map((v) => `• ${v.vehicleName} — *${v.soc}%* — ${v.chargingState || 'charging state unavailable'}`), ''); else if (dataIssues.length) lines.push('⚠️ *Data issues*', '', ...dataIssues.map((v) => `• ${v.vehicleName} — ${v.soc === null ? 'SOC unavailable' : 'stale telemetry'}`), ''); else lines.push(`✅ *All verified EVs are at or above ${result.threshold}%*`, '');
  lines.push('*Rivian FleetOS*', provider('Rivian', result.providers.rivian), '', '*Geotab*', provider('Geotab', result.providers.geotab), '');
  if (dataIssues.length && below.length) lines.push(`⚠️ Data issues: ${dataIssues.map((v) => v.vehicleName).join(', ')}`, '');
  if (below.length) lines.push(`${result.summary.okVehicles}/${result.summary.totalVehicles} vehicles at or above ${result.threshold}%`);
  lines.push('', `Checked: ${berlinTime(now, timezone)}`); return lines.join('\n');
}
export function createEvMonitoringSlackService({ dbPool = pool, fetchImpl = globalThis.fetch, environment = () => process.env, now = () => new Date() } = {}) {
  return { async deliver(result) { const env = environment(); if (String(env.EV_MONITORING_SLACK_ENABLED).toLowerCase() !== 'true') return { status: 'disabled' }; const webhook = String(env.EV_MONITORING_SLACK_WEBHOOK_URL || '').trim(); if (!webhook) return { status: 'not_configured' }; const timezone = env.EV_MONITORING_TIMEZONE || 'Europe/Berlin'; const serviceDate = berlinDate(now(), timezone); const client = await dbPool.connect(); let locked = false; try {
    const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked', ['ev-monitoring-slack', serviceDate]); locked = lock.rows[0]?.locked === true; if (!locked) return { status: 'in_progress' };
    const prior = await client.query('SELECT status FROM ev_monitoring_slack_deliveries WHERE service_date = $1', [serviceDate]); if (prior.rows[0]?.status === 'sent') return { status: 'already_sent' };
    await client.query(`INSERT INTO ev_monitoring_slack_deliveries (service_date, check_id, status, attempt_count, last_attempt_at) VALUES ($1, $2, 'sending', 1, NOW()) ON CONFLICT (service_date) DO UPDATE SET check_id = EXCLUDED.check_id, status = 'sending', attempt_count = ev_monitoring_slack_deliveries.attempt_count + 1, last_attempt_at = NOW(), updated_at = NOW()`, [serviceDate, result.checkId]);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); let response; try { response = await fetchImpl(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: formatEvMonitoringSlackMessage(result, now(), timezone) }), signal: controller.signal }); } catch (error) { await client.query(`UPDATE ev_monitoring_slack_deliveries SET status = 'failed', last_error = $2, updated_at = NOW() WHERE service_date = $1`, [serviceDate, errorCode(error)]); return { status: 'failed' }; } finally { clearTimeout(timer); }
    if (!response.ok) { await client.query(`UPDATE ev_monitoring_slack_deliveries SET status = 'failed', last_error = $2, updated_at = NOW() WHERE service_date = $1`, [serviceDate, `http_${response.status}`]); return { status: 'failed' }; }
    await client.query(`UPDATE ev_monitoring_slack_deliveries SET status = 'sent', sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE service_date = $1`, [serviceDate]); return { status: 'sent' };
  } finally { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', ['ev-monitoring-slack', serviceDate]).catch(() => {}); client.release(); } } };
}
export const evMonitoringSlackService = createEvMonitoringSlackService();

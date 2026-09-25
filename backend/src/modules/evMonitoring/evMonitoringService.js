import { query } from '../../db.js';
import { rivianFleetService } from './rivianFleetService.js';
import { geotabService } from './geotabService.js';

let inFlightCheck = null;

function thresholdFrom(env) { const value = Number(env.EV_MONITORING_SOC_THRESHOLD); return Number.isFinite(value) ? value : 90; }
function providerInfo(result) { return { status: result.status, vehicleCount: result.vehicles.length, ...(result.errorCode ? { errorCode: result.errorCode } : {}) }; }

export function buildEvResult({ rivian, geotab, threshold, checkedAt }) {
  const vehicles = [...rivian.vehicles, ...geotab.vehicles].map((vehicle) => ({ ...vehicle, status: vehicle.soc === null ? 'error' : vehicle.soc < threshold ? 'warning' : vehicle.stale ? 'warning' : 'ok' }));
  vehicles.sort((a, b) => {
    const priority = (v) => v.status === 'error' ? 0 : v.soc !== null && v.soc < threshold ? 1 : v.stale ? 2 : 3;
    return priority(a) - priority(b) || (a.soc ?? Infinity) - (b.soc ?? Infinity) || a.vehicleName.localeCompare(b.vehicleName);
  });
  const summary = { totalVehicles: vehicles.length, okVehicles: vehicles.filter((v) => v.status === 'ok').length, belowThreshold: vehicles.filter((v) => v.soc !== null && v.soc < threshold).length, staleVehicles: vehicles.filter((v) => v.stale).length, errorVehicles: vehicles.filter((v) => v.status === 'error').length };
  return { checkedAt, threshold, summary, providers: { rivian: providerInfo(rivian), geotab: providerInfo(geotab) }, vehicles };
}

export function createEvMonitoringService({ dbQuery = query, rivian = rivianFleetService, geotab = geotabService, environment = () => process.env, now = () => new Date() } = {}) {
  async function persist(result, trigger, startedAt) {
    const status = Object.values(result.providers).every((p) => p.status === 'connected') ? 'completed' : 'partial';
    const insert = await dbQuery(`INSERT INTO ev_monitoring_checks (trigger, started_at, finished_at, status, rivian_status, geotab_status, vehicle_count, below_threshold_count, stale_count, error_count, result_json, error_code) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) RETURNING id`, [trigger, startedAt, status, result.providers.rivian.status, result.providers.geotab.status, result.summary.totalVehicles, result.summary.belowThreshold, result.summary.staleVehicles, result.summary.errorVehicles, JSON.stringify(result), Object.values(result.providers).map((p) => p.errorCode).filter(Boolean).join(',') || null]);
    return { ...result, checkId: insert.rows[0]?.id ?? null };
  }
  async function run(trigger = 'page') {
    const startedAt = now().toISOString(); const env = environment(); const threshold = thresholdFrom(env);
    const [rivianResult, geotabResult] = await Promise.all([rivian.fetchVehicles(), geotab.fetchVehicles()]);
    const result = buildEvResult({ rivian: rivianResult, geotab: geotabResult, threshold, checkedAt: now().toISOString() });
    return persist(result, trigger, startedAt);
  }
  return { run, latest: async () => { const result = await dbQuery('SELECT result_json, id, created_at FROM ev_monitoring_checks ORDER BY created_at DESC LIMIT 1'); const row = result.rows[0]; return row ? { ...row.result_json, checkId: row.id, storedAt: row.created_at } : null; } };
}
export const evMonitoringService = createEvMonitoringService();

export function runEvMonitoringCheck({ trigger = 'page' } = {}) {
  if (!inFlightCheck) inFlightCheck = evMonitoringService.run(trigger).finally(() => { inFlightCheck = null; });
  return inFlightCheck;
}

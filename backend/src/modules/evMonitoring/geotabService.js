import { isAuthenticationFailure, withPersistentContext } from './browserSessionManager.js';

const SOC = 'DiagnosticStateOfChargeId'; const POWER = 'DiagnosticElectricVehicleBatteryPowerId'; const CHARGING = 'DiagnosticElectricVehicleChargingStateId';
export function normalizeGeotabVehicles(devices, statuses, now = new Date(), staleMinutes = 360) {
  const names = new Map(devices.map((d) => [d.id, d.name]));
  return statuses.map((entry) => {
    const values = new Map((entry.statusData || []).map((d) => [d.diagnostic?.id, d])); const socData = values.get(SOC); const charge = values.get(CHARGING); const power = values.get(POWER);
    const soc = Number.isFinite(Number(socData?.data)) ? Number(socData.data) : null; const timestamp = socData?.dateTime || null;
    return { source: 'geotab', externalId: entry.device?.id, vehicleName: names.get(entry.device?.id) || entry.device?.id || 'Unbekannt', vin: null, soc, chargingState: charge ? ({ 0: 'not charging', 1: 'AC charging', 2: 'DC charging' }[Number(charge.data)] || String(charge.data)) : null, chargingPowerW: Number.isFinite(Number(power?.data)) ? Number(power.data) : null, socTimestamp: timestamp, lastReportedAt: entry.dateTime || null, rangeKm: Number.isFinite(Number(entry.realTimeRangeRemainingMeanKm)) ? Number(entry.realTimeRangeRemainingMeanKm) : null, stale: timestamp ? now.getTime() - new Date(timestamp).getTime() > staleMinutes * 60_000 : true };
  });
}
export function createGeotabService({ withContext = withPersistentContext, environment = () => process.env, now = () => new Date() } = {}) {
  return { async fetchVehicles() { const env = environment(); try { return await withContext('geotab', env.EV_MONITORING_GEOTAB_PROFILE_DIR, async (context) => {
    const page = context.pages()[0] || await context.newPage(); await page.goto(env.EV_MONITORING_GEOTAB_URL || 'https://my.geotab.com/amazon_de_alui/', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async ({ apiUrl, database }) => { const request = async (method, params) => { const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json', database }, body: JSON.stringify({ method, params }) }); if (!response.ok) throw new Error(`Geotab HTTP ${response.status}`); return response.json(); }; const devices = await request('Get', { typeName: 'Device' }); const statuses = await request('Get', { typeName: 'EVStatusInfo', search: { deviceSearch: { deviceIds: devices.map((d) => d.id) } } }); return { devices, statuses }; }, { apiUrl: env.EV_MONITORING_GEOTAB_API_URL || 'https://my.geotab.com/apiv1', database: env.EV_MONITORING_GEOTAB_DATABASE || 'amazon_de_alui' });
    if (!Array.isArray(result?.devices)) { const error = new Error('Geotab authentication required'); error.code = 'AUTH_REQUIRED'; throw error; }
    return { status: 'connected', vehicles: normalizeGeotabVehicles(result.devices, result.statuses || [], now(), Number(env.EV_MONITORING_STALE_MINUTES || 360)) };
  }); } catch (error) { return { status: 'auth_required', errorCode: isAuthenticationFailure(error) ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR', vehicles: [] }; } } };
}
export const geotabService = createGeotabService();

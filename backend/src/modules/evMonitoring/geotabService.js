import { isAuthenticationFailure, withPersistentContext } from './browserSessionManager.js';

const SOC = 'DiagnosticStateOfChargeId'; const POWER = 'DiagnosticElectricVehicleBatteryPowerId'; const CHARGING = 'DiagnosticElectricVehicleChargingStateId';
const isAuthError = (error) => isAuthenticationFailure(error) || /Geotab HTTP (401|403)/.test(String(error?.message || ''));
export function unwrapGeotabResult(payload) { if (!Array.isArray(payload?.result)) throw new Error('Geotab provider returned an invalid response'); return payload.result; }
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
    const page = context.pages()[0] || await context.newPage(); let authorization;
    let resolveAuthorization; const authorizationSeen = new Promise((resolve) => { resolveAuthorization = resolve; });
    const observeRequest = (request) => { try { const url = new URL(request.url()); const header = request.headers().authorization; if (url.hostname === 'my.geotab.com' && url.pathname.startsWith('/apiv1') && /^Bearer\s+\S+$/i.test(header || '')) { authorization = header; resolveAuthorization(); } } catch (_error) {} };
    page.on('request', observeRequest);
    await page.goto(env.EV_MONITORING_GEOTAB_URL || 'https://my.geotab.com/amazon_de_alui/', { waitUntil: 'domcontentloaded' });
    const authTimeout = Number(env.EV_MONITORING_GEOTAB_AUTH_TIMEOUT_MS || 10_000);
    await Promise.race([authorizationSeen, new Promise((_, reject) => setTimeout(() => { const error = new Error('Geotab authentication required'); error.code = 'AUTH_REQUIRED'; reject(error); }, authTimeout))]);
    const result = await page.evaluate(async ({ apiUrl, database, authorization: currentAuthorization }) => { const request = async (method, params) => { const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json', database, authorization: currentAuthorization }, body: JSON.stringify({ method, params }) }); if (!response.ok) throw new Error(`Geotab HTTP ${response.status}`); return response.json(); }; const devices = await request('Get', { typeName: 'Device' }); const deviceRows = Array.isArray(devices?.result) ? devices.result : []; const statuses = await request('Get', { typeName: 'EVStatusInfo', search: { deviceSearch: { deviceIds: deviceRows.map((d) => d.id) } } }); return { devices, statuses }; }, { apiUrl: env.EV_MONITORING_GEOTAB_API_URL || 'https://my.geotab.com/apiv1', database: env.EV_MONITORING_GEOTAB_DATABASE || 'amazon_de_alui', authorization });
    const devices = unwrapGeotabResult(result?.devices); const statuses = unwrapGeotabResult(result?.statuses);
    return { status: 'connected', vehicles: normalizeGeotabVehicles(devices, statuses, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360)) };
  }); } catch (error) { const errorCode = isAuthError(error) ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR'; return { status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error', errorCode, vehicles: [] }; } } };
}
export const geotabService = createGeotabService();

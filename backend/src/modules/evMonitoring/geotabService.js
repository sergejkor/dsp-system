import { isAuthenticationFailure, withPersistentContext } from './browserSessionManager.js';

const SOC = 'DiagnosticStateOfChargeId'; const POWER = 'DiagnosticElectricVehicleBatteryPowerId'; const CHARGING = 'DiagnosticElectricVehicleChargingStateId';
const isLoginUrl = (url) => /\/(login|sign-?in|auth)(\/|$)/i.test(new URL(url).pathname);
const isAuthError = (error) => isAuthenticationFailure(error) || /Geotab HTTP (401|403)/.test(String(error?.message || ''));
export function unwrapGeotabResult(payload) { if (!Array.isArray(payload?.result)) throw new Error('Geotab provider returned an invalid response'); return payload.result; }
function providerError(error) { const errorCode = isAuthError(error) ? 'AUTH_REQUIRED' : error?.code === 'GEOTAB_API_REQUEST_NOT_OBSERVED' ? error.code : 'PROVIDER_ERROR'; return { status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error', errorCode, vehicles: [] }; }
export function normalizeGeotabVehicles(devices, statuses, now = new Date(), staleMinutes = 360) {
  const names = new Map(devices.map((d) => [d.id, d.name]));
  return statuses.map((entry) => { const values = new Map((entry.statusData || []).map((d) => [d.diagnostic?.id, d])); const socData = values.get(SOC); const charge = values.get(CHARGING); const power = values.get(POWER); const soc = Number.isFinite(Number(socData?.data)) ? Number(socData.data) : null; const timestamp = socData?.dateTime || null; return { source: 'geotab', externalId: entry.device?.id, vehicleName: names.get(entry.device?.id) || entry.device?.id || 'Unbekannt', vin: null, soc, chargingState: charge ? ({ 0: 'not charging', 1: 'AC charging', 2: 'DC charging' }[Number(charge.data)] || String(charge.data)) : null, chargingPowerW: Number.isFinite(Number(power?.data)) ? Number(power.data) : null, socTimestamp: timestamp, lastReportedAt: entry.dateTime || null, rangeKm: Number.isFinite(Number(entry.realTimeRangeRemainingMeanKm)) ? Number(entry.realTimeRangeRemainingMeanKm) : null, stale: timestamp ? now.getTime() - new Date(timestamp).getTime() > staleMinutes * 60_000 : true }; });
}
function findExecuteMultiCall(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.method === 'ExecuteMultiCall') return value;
  for (const child of Object.values(value)) { const found = findExecuteMultiCall(child); if (found) return found; }
  return null;
}
function parseNativeGeotabResponse(requestBody, payload) {
  const execute = findExecuteMultiCall(requestBody); const calls = execute?.params?.calls || execute?.params?.multiCall || [];
  const result = Array.isArray(payload?.result) ? payload.result : null;
  const evIndex = calls.findIndex((call) => call?.params?.typeName === 'EVStatusInfo');
  const deviceIndex = calls.findIndex((call) => call?.params?.typeName === 'Device');
  const statuses = evIndex >= 0 && Array.isArray(result?.[evIndex]) ? result[evIndex] : [];
  const devices = deviceIndex >= 0 && Array.isArray(result?.[deviceIndex]) ? result[deviceIndex] : [];
  return { devices, statuses, childMethodCount: calls.length, evStatusFound: evIndex >= 0, resultLength: result?.length || 0, jsonrpcPresent: Boolean(payload?.jsonrpc), topLevelType: Array.isArray(payload) ? 'array' : typeof payload, errorPresent: Boolean(payload?.error), errorCode: payload?.error?.code ?? null };
}
export function createGeotabService({ withContext = withPersistentContext, environment = () => process.env, now = () => new Date(), diagnostics = () => {} } = {}) {
  return { async fetchVehicles() { const env = environment(); try { return await withContext('geotab', env.EV_MONITORING_GEOTAB_PROFILE_DIR, async (context) => {
    const page = context.pages()[0] || await context.newPage();
    let authorization = null;
    if (context.on) context.on('request', (request) => { void request.headerValue('authorization').then((value) => { if (value) authorization = value; }).catch(() => {}); });
      const nativeCapable = Boolean(context.on && page.locator); let nativeResponse = null; let nativeRequestObserved = false; let apiStatus = null; const requests = new Map(); let resolveNative;
    const nativeSeen = new Promise((resolve) => { resolveNative = resolve; });
    const observeRequest = async (request) => { try { const url = new URL(request.url()); if (url.hostname !== 'my.geotab.com' || !url.pathname.startsWith('/apiv1')) return; const body = await request.postDataJSON(); const execute = findExecuteMultiCall(body); if (execute?.params?.calls?.some((call) => call?.params?.typeName === 'EVStatusInfo')) { nativeRequestObserved = true; requests.set(request, body); } } catch (_error) {} };
    if (nativeCapable) {
      context.on('request', (request) => { void observeRequest(request); });
      context.on('response', (response) => { void (async () => { const request = response.request(); if (!requests.has(request) || nativeResponse) return; apiStatus = response.status(); try { nativeResponse = { status: apiStatus, requestBody: requests.get(request), payload: await response.json() }; resolveNative(nativeResponse); } catch (_error) {} })(); });
    }
    await page.goto(env.EV_MONITORING_GEOTAB_URL || 'https://my.geotab.com/amazon_de_alui/', { waitUntil: 'domcontentloaded' });
    if (authorization) await new Promise((resolve) => setImmediate(resolve));
    const timeout = Number(env.EV_MONITORING_GEOTAB_AUTH_TIMEOUT_MS || 20_000);
    let observed = context.on ? await Promise.race([nativeSeen, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]) : null;
    if (!observed && context.on) {
      try { const links = await page.locator('a,button,[role=link]').evaluateAll((items) => items.map((item) => ({ text: (item.textContent || '').trim(), href: item.href || '' })).filter((item) => /ev.*charge|charge.*monitor/i.test(item.text + ' ' + item.href))); const target = links[0]; if (target?.text) await page.getByText(target.text, { exact: true }).first().click(); } catch (_error) {}
      observed = await Promise.race([nativeSeen, new Promise((resolve) => setTimeout(() => resolve(null), timeout))]);
    }
    if (nativeCapable) {
      if (!observed) { const error = new Error('Geotab EVStatusInfo request was not observed'); error.code = /\/(login|sign-?in|auth)(\/|$)/i.test(new URL(page.url()).pathname) ? 'AUTH_REQUIRED' : 'GEOTAB_EV_STATUS_REQUEST_NOT_OBSERVED'; throw error; }
      const parsed = parseNativeGeotabResponse(observed.requestBody, observed.payload); diagnostics({ finalUrl: new URL(page.url()).hostname + new URL(page.url()).pathname, title: await page.title(), evStatusRequestObserved: true, httpStatus: observed.status, ...parsed, deviceCount: parsed.devices.length, evStatusInfoCount: parsed.statuses.length });
      if ([401, 403].includes(observed.status)) { const error = new Error('Geotab authentication required'); error.code = 'AUTH_REQUIRED'; throw error; }
      if (parsed.errorPresent || !parsed.evStatusFound || !parsed.statuses.length) { const error = new Error('Geotab native response could not be parsed'); error.code = 'PROVIDER_ERROR'; throw error; }
      return { status: 'connected', vehicles: normalizeGeotabVehicles(parsed.devices, parsed.statuses, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360)) };
    }
    const result = await page.evaluate(async ({ apiUrl, database, authorization: currentAuthorization }) => { const request = async (method, params) => { const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json', database, authorization: currentAuthorization }, body: JSON.stringify({ method, params }) }); if (!response.ok) throw new Error('Geotab HTTP ' + response.status); return response.json(); }; const devices = await request('Get', { typeName: 'Device' }); const statuses = await request('Get', { typeName: 'EVStatusInfo', search: { deviceSearch: { deviceIds: devices.result.map((d) => d.id) } } }); return { devices, statuses }; }, { apiUrl: env.EV_MONITORING_GEOTAB_API_URL || 'https://my.geotab.com/apiv1', database: env.EV_MONITORING_GEOTAB_DATABASE || 'amazon_de_alui', authorization: authorization });
    const devices = unwrapGeotabResult(result.devices); const statuses = unwrapGeotabResult(result.statuses); return { status: 'connected', vehicles: normalizeGeotabVehicles(devices, statuses, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360)) };
  }); } catch (error) { const errorCode = isAuthError(error) ? 'AUTH_REQUIRED' : (error?.code === 'GEOTAB_EV_STATUS_REQUEST_NOT_OBSERVED' ? error.code : 'PROVIDER_ERROR'); return { status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error', errorCode, vehicles: [] }; } } };
}
export const geotabService = createGeotabService();
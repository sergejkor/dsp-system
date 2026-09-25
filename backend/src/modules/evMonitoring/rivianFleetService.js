import { isAuthenticationFailure, withPersistentContext } from './browserSessionManager.js';

const PAGE_SIZE = 25;
const isLoginUrl = (url) => /\/(login|sign-?in|auth)(\/|$)/i.test(new URL(url).pathname);

function normalizeItem(item, now, staleMinutes) {
  const telemetry = item.telemetry || {};
  const battery = telemetry.battery?.main || {};
  const socValue = battery.stateOfCharge?.value ?? battery.stateOfCharge ?? null;
  const socTimestamp = battery.stateOfCharge?.timestamp ?? battery.stateOfCharge?.measuredAt ?? null;
  const soc = Number.isFinite(Number(socValue)) ? Number(socValue) : null;
  const stale = socTimestamp ? now.getTime() - new Date(socTimestamp).getTime() > staleMinutes * 60_000 : true;
  return { source: 'rivian', externalId: item.vin || item.id || item.name, vehicleName: item.name || item.vin || 'Unbekannt', vin: item.vin || null, soc, chargingState: battery.chargerState || null, chargingPowerW: Number.isFinite(Number(battery.chargingPower)) ? Number(battery.chargingPower) : null, socTimestamp, lastReportedAt: telemetry.lastReportedAt || null, rangeKm: null, stale };
}

export function createRivianFleetService({ withContext = withPersistentContext, environment = () => process.env, now = () => new Date(), diagnostics = () => {} } = {}) {
  return { async fetchVehicles() {
    const env = environment();
    try { return await withContext('rivian', env.EV_MONITORING_RIVIAN_PROFILE_DIR, async (context) => {
      const page = context.pages()[0] || await context.newPage();
      const nativeCapable = Boolean(context.on && page.locator);
      const currentUrl = () => typeof page.url === 'function' ? page.url() : (env.EV_MONITORING_RIVIAN_URL || 'https://business.rivian.com/vehicles/tracker');
      let resolveNative; let nativeResponse = null; let nativeRequestObserved = false;
      const nativeSeen = new Promise((resolve) => { resolveNative = resolve; });
      const inspectRequest = async (request) => { try { const url = new URL(request.url()); if (url.hostname !== 'business.rivian.com' || url.pathname !== '/api') return null; const body = await request.postDataJSON(); return body?.operationName === 'Vehicles' ? body : null; } catch (_error) { return null; } };
      if (nativeCapable) {
        context.on('request', (request) => { void inspectRequest(request).then((body) => { if (body) nativeRequestObserved = true; }); });
        context.on('response', (response) => { void (async () => { const body = await inspectRequest(response.request()); if (!body || nativeResponse) return; try { nativeResponse = { status: response.status(), body, payload: await response.json() }; resolveNative(nativeResponse); } catch (_error) {} })(); });
      }
      await page.goto(env.EV_MONITORING_RIVIAN_URL || 'https://business.rivian.com/vehicles/tracker', { waitUntil: 'domcontentloaded' });
      if (nativeCapable) {
        const observed = await Promise.race([nativeSeen, new Promise((resolve) => setTimeout(() => resolve(null), Number(env.EV_MONITORING_RIVIAN_REQUEST_TIMEOUT_MS || 20_000)))]);
        const native = nativeResponse || observed;
        if (!native) { const error = new Error('FleetOS Vehicles response was not observed'); error.code = /\/(login|sign-?in|auth)(\/|$)/i.test(new URL(currentUrl()).pathname) ? 'AUTH_REQUIRED' : 'RIVIAN_VEHICLES_RESPONSE_NOT_OBSERVED'; throw error; }
        const payload = native.payload; const errors = Array.isArray(payload?.errors) ? payload.errors : [];
        const pageData = payload?.data?.fleetVehiclesPaginated;
        diagnostics({ finalUrl: new URL(currentUrl()).hostname + new URL(currentUrl()).pathname, nativeRequestObserved: true, httpStatus: native.status, graphqlErrorCount: errors.length, graphqlErrorCodes: errors.map((e) => e?.extensions?.code).filter(Boolean), totalItems: pageData?.pageInfo?.totalItems ?? null, itemCount: Array.isArray(pageData?.items) ? pageData.items.length : 0 });
        if ([401, 403].includes(native.status)) { const error = new Error('FleetOS authentication required'); error.code = 'AUTH_REQUIRED'; throw error; }
        if (errors.length) { const error = new Error('FleetOS GraphQL provider error'); error.code = 'PROVIDER_ERROR'; error.graphqlErrors = errors; throw error; }
        if (!pageData || !Array.isArray(pageData.items) || !pageData.pageInfo) { const error = new Error('FleetOS returned an unexpected response'); error.code = 'PROVIDER_ERROR'; throw error; }
        const vehicles = pageData.items.map((item) => normalizeItem(item, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360)));
        return { status: 'connected', vehicles, paginationLimited: Number(pageData.pageInfo.totalItems || vehicles.length) > vehicles.length };
      }
      const response = await page.evaluate(async ({ apiUrl, assetGroup }) => { const res = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationName: 'Vehicles', variables: { assetGroups: [assetGroup], filter: '{}', limit: PAGE_SIZE, offset: 0, sort: [{ attr: 'core/info/identifiers.vin', order: 'DESC' }] }, query: 'query Vehicles($assetGroups:[String!]!,$limit:Int,$offset:Int,$sort:[FleetVehiclesPaginatedSortInput!],$filter:String) { fleetVehiclesPaginated(assetGroups:$assetGroups, filter:$filter, limit:$limit, offset:$offset, sort:$sort) { items { id name vin telemetry { lastReportedAt battery { main { stateOfCharge { value timestamp } chargerState chargingPower } } } } pageInfo { totalItems } } }' }) }); return { status: res.status, payload: await res.json() }; }, { apiUrl: env.EV_MONITORING_RIVIAN_API_URL || 'https://business.rivian.com/api', assetGroup: env.EV_MONITORING_RIVIAN_ASSET_GROUP });
      if ([401, 403].includes(response.status)) { const error = new Error('FleetOS authentication required'); error.code = 'AUTH_REQUIRED'; throw error; }
      if (response.payload?.errors?.length) { const error = new Error('FleetOS GraphQL provider error'); error.code = 'PROVIDER_ERROR'; throw error; }
      const payload = response.payload ?? response;
      const pageData = payload?.data?.fleetVehiclesPaginated; if (!pageData) { const error = new Error('FleetOS returned an unexpected response'); error.code = 'PROVIDER_ERROR'; throw error; }
      return { status: 'connected', vehicles: pageData.items.map((item) => normalizeItem(item, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360))) };
    }); } catch (error) { const errorCode = isAuthenticationFailure(error) || error?.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR'; return { status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error', errorCode, vehicles: [] }; }
  } };
}
export const rivianFleetService = createRivianFleetService();

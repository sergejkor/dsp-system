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
    const env = environment(); let diagnosticHttpStatus = null; let diagnosticGraphqlErrors = [];
    try {
      return await withContext('rivian', env.EV_MONITORING_RIVIAN_PROFILE_DIR, async (context) => {
        const page = context.pages()[0] || await context.newPage();
        const currentUrl = () => typeof page.url === 'function' ? page.url() : (env.EV_MONITORING_RIVIAN_URL || 'https://business.rivian.com/vehicles/tracker');
        let nativeBody = null; let nativeObserved = false; let resolveNative;
        const nativeSeen = new Promise((resolve) => { resolveNative = resolve; });
        const observeRequest = async (request) => { try { const url = new URL(request.url()); if (url.hostname !== 'business.rivian.com' || url.pathname !== '/api') return; const body = await request.postDataJSON(); if (body?.operationName === 'Vehicles' && body?.variables) { nativeBody = body; nativeObserved = true; resolveNative(); } } catch (_error) {} };
        if (context.on) context.on('request', (request) => { void observeRequest(request); });
        await page.goto(env.EV_MONITORING_RIVIAN_URL || 'https://business.rivian.com/vehicles/tracker', { waitUntil: 'domcontentloaded' });
        if (context.on) { await Promise.race([nativeSeen, new Promise((resolve) => setTimeout(resolve, Number(env.EV_MONITORING_RIVIAN_REQUEST_TIMEOUT_MS || 20_000)))]); if (!nativeBody) { const error = new Error('FleetOS Vehicles request was not observed'); error.code = isLoginUrl(currentUrl()) ? 'AUTH_REQUIRED' : 'RIVIAN_API_REQUEST_NOT_OBSERVED'; throw error; } }
        const all = []; let offset = 0; let total = Infinity; let lastHttpStatus = null; let lastGraphqlErrors = [];
        while (offset < total) {
          const response = await page.evaluate(async ({ apiUrl, offset, limit, assetGroup, nativeBody }) => {
            const fallback = { operationName: 'Vehicles', variables: { assetGroups: [assetGroup], filter: '{}', limit, offset, sort: [{ attr: 'core/info/identifiers.vin', order: 'DESC' }] }, query: 'query Vehicles($assetGroups:[String!]!,$limit:Int,$offset:Int,$sort:[FleetVehiclesPaginatedSortInput!],$filter:String) { fleetVehiclesPaginated(assetGroups:$assetGroups, filter:$filter, limit:$limit, offset:$offset, sort:$sort) { items { id name vin telemetry { lastReportedAt battery { main { stateOfCharge { value timestamp } chargerState chargingPower } } } } pageInfo { totalItems } } }' };
            const body = nativeBody ? { ...nativeBody, variables: { ...nativeBody.variables, offset, limit } } : { ...fallback, variables: { ...fallback.variables, offset, limit } };
            const res = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { httpStatus: res.status, payload: await res.json() };
          }, { apiUrl: env.EV_MONITORING_RIVIAN_API_URL || 'https://business.rivian.com/api', offset, limit: PAGE_SIZE, assetGroup: env.EV_MONITORING_RIVIAN_ASSET_GROUP, nativeBody });
          diagnosticHttpStatus = response.httpStatus; const payload = response.payload ?? response; diagnosticGraphqlErrors = payload?.errors || [];
          if ([401, 403].includes(response.httpStatus)) { const error = new Error('FleetOS HTTP ' + response.httpStatus); error.code = 'AUTH_REQUIRED'; throw error; }
          if (payload?.errors?.length) { const error = new Error('FleetOS GraphQL provider error'); error.code = 'PROVIDER_ERROR'; error.graphqlErrors = payload.errors; throw error; }
          const pageData = payload?.data?.fleetVehiclesPaginated;
          if (!pageData) { const error = new Error('FleetOS returned an unexpected response'); error.code = isLoginUrl(currentUrl()) ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR'; throw error; }
          const items = pageData.items || []; all.push(...items); total = Number(pageData.pageInfo?.totalItems ?? all.length); offset += PAGE_SIZE; if (!items.length) break;
        }
        diagnostics({ finalUrl: new URL(currentUrl()).hostname + new URL(currentUrl()).pathname, loginRedirect: isLoginUrl(currentUrl()), httpStatus: 200, graphqlDataPresent: true, graphqlErrorCount: 0, graphqlErrorCodes: [], vehicleCount: all.length, status: 'connected' });
        return { status: 'connected', vehicles: all.map((item) => normalizeItem(item, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360))) };
      });
    } catch (error) { const errorCode = isAuthenticationFailure(error) || error?.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR'; diagnostics({ finalUrl: null, loginRedirect: false, httpStatus: diagnosticHttpStatus, graphqlDataPresent: false, graphqlErrorCount: error?.graphqlErrors?.length || diagnosticGraphqlErrors.length, graphqlErrorCodes: (error?.graphqlErrors || []).map((entry) => entry?.extensions?.code).filter(Boolean), vehicleCount: 0, status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error' }); return { status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error', errorCode, vehicles: [] }; }
  } };
}
export const rivianFleetService = createRivianFleetService();

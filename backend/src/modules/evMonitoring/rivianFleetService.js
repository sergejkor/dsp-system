import { isAuthenticationFailure, withPersistentContext } from './browserSessionManager.js';

const PAGE_SIZE = 25;

function normalizeItem(item, now, staleMinutes) {
  const telemetry = item.telemetry || {};
  const battery = telemetry.battery?.main || {};
  const socValue = battery.stateOfCharge?.value ?? battery.stateOfCharge ?? null;
  const socTimestamp = battery.stateOfCharge?.timestamp ?? battery.stateOfCharge?.measuredAt ?? null;
  const soc = Number.isFinite(Number(socValue)) ? Number(socValue) : null;
  const stale = socTimestamp ? now.getTime() - new Date(socTimestamp).getTime() > staleMinutes * 60_000 : true;
  return { source: 'rivian', externalId: item.vin || item.id || item.name, vehicleName: item.name || item.vin || 'Unbekannt', vin: item.vin || null, soc, chargingState: battery.chargerState || null, chargingPowerW: Number.isFinite(Number(battery.chargingPower)) ? Number(battery.chargingPower) : null, socTimestamp, lastReportedAt: telemetry.lastReportedAt || null, rangeKm: null, stale };
}

export function createRivianFleetService({ withContext = withPersistentContext, environment = () => process.env, now = () => new Date() } = {}) {
  return { async fetchVehicles() {
    const env = environment();
    try {
      return await withContext('rivian', env.EV_MONITORING_RIVIAN_PROFILE_DIR, async (context) => {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(env.EV_MONITORING_RIVIAN_URL || 'https://business.rivian.com/vehicles/tracker', { waitUntil: 'domcontentloaded' });
        const all = []; let offset = 0; let total = Infinity;
        while (offset < total) {
          const response = await page.evaluate(async ({ apiUrl, offset, limit, assetGroup }) => {
            const res = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationName: 'Vehicles', variables: { assetGroups: [assetGroup], filter: '{}', limit, offset, sort: [{ attr: 'core/info/identifiers.vin', order: 'DESC' }] }, query: 'query Vehicles($assetGroups:[ID!],$filter:String,$limit:Int,$offset:Int,$sort:[SortInput!]) { fleetVehiclesPaginated(assetGroups:$assetGroups, filter:$filter, limit:$limit, offset:$offset, sort:$sort) { items { id name vin telemetry { lastReportedAt battery { main { stateOfCharge { value timestamp } chargerState chargingPower } } } } pageInfo { totalItems } } }' }) });
            if (!res.ok) throw new Error(`FleetOS HTTP ${res.status}`); return res.json();
          }, { apiUrl: env.EV_MONITORING_RIVIAN_API_URL || 'https://business.rivian.com/api', offset, limit: PAGE_SIZE, assetGroup: env.EV_MONITORING_RIVIAN_ASSET_GROUP });
          const pageData = response?.data?.fleetVehiclesPaginated;
          if (!pageData) { const error = new Error('FleetOS authentication required'); error.code = 'AUTH_REQUIRED'; throw error; }
          const items = pageData.items || []; all.push(...items); total = Number(pageData.pageInfo?.totalItems ?? all.length); offset += PAGE_SIZE;
          if (!items.length) break;
        }
        return { status: 'connected', vehicles: all.map((item) => normalizeItem(item, now(), Number(env.EV_MONITORING_STALE_MINUTES || 360))) };
      });
    } catch (error) { return { status: 'auth_required', errorCode: isAuthenticationFailure(error) ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR', vehicles: [] }; }
  } };
}
export const rivianFleetService = createRivianFleetService();

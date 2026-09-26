import { isAuthenticationFailure, withPersistentContext } from './browserSessionManager.js';

const SOC = 'DiagnosticStateOfChargeId';
const POWER = 'DiagnosticElectricVehicleBatteryPowerId';
const CHARGING = 'DiagnosticElectricVehicleChargingStateId';
const DEFAULT_URL = 'https://my.geotab.com/amazon_de_alui/#evChargeMonitoring,powertrainTypes:!(GroupElectricHybridPlugInId)';
const isLoginUrl = (url) => /\/(login|sign-?in|auth)(\/|$)/i.test(new URL(url).pathname);

export function parseLatestStatusResponse(payload) {
  if (!payload?.result || Array.isArray(payload.result) || !Array.isArray(payload.result.data)) throw new Error('Geotab status response malformed');
  return { rows: payload.result.data, totalPages: payload.result.totalPages, totalRecords: payload.result.totalRecords };
}

export function adaptLatestStatusRows(rows) {
  return rows.filter((row) => (row.sensorData || []).some((sensor) => sensor.diagnosticId === SOC)).map((row) => ({
    device: { id: row.device?.id }, dateTime: row.dateTime,
    statusData: (row.sensorData || []).map((sensor) => ({ diagnostic: { id: sensor.diagnosticId }, data: sensor.sensorValue, dateTime: sensor.lastUpdateTime })),
  }));
}

export function parseDeviceResponse(payload) {
  if (!Array.isArray(payload?.result)) throw new Error('Geotab device response malformed');
  return payload.result.map((device) => ({ id: device.id, name: device.name }));
}

function hasSoc(status) { return (status?.statusData || []).some((item) => item?.diagnostic?.id === SOC && Number.isFinite(Number(item.data))); }

export function normalizeGeotabVehicles(devices, statuses, now = new Date(), staleMinutes = 360, fallbackStatuses = []) {
  const names = new Map(devices.map((device) => [device.id, device.name]));
  const byDevice = new Map();
  for (const status of fallbackStatuses) if (status?.device?.id && hasSoc(status)) byDevice.set(status.device.id, status);
  // The dashboard response is richer; use it wherever it is present.
  for (const status of statuses) if (status?.device?.id) byDevice.set(status.device.id, status);
  // The Device endpoint contains the complete historical fleet, including
  // deactivated vehicles. Only expose a device when current EV telemetry (the
  // dashboard result or the SOC fallback) actually identifies it.
  return [...byDevice.values()].map((entry) => {
    const values = new Map((entry.statusData || []).map((item) => [item.diagnostic?.id, item]));
    const socData = values.get(SOC); const charge = values.get(CHARGING); const power = values.get(POWER);
    const soc = Number.isFinite(Number(socData?.data)) ? Number(socData.data) : null;
    const timestamp = socData?.dateTime || null;
    return { source: 'geotab', externalId: entry.device?.id, vehicleName: names.get(entry.device?.id) || entry.device?.id || 'Unbekannt', vin: null, soc,
      chargingState: charge ? ({ 0: 'not charging', 1: 'AC charging', 2: 'DC charging' }[Number(charge.data)] || String(charge.data)) : null,
      chargingPowerW: Number.isFinite(Number(power?.data)) ? Number(power.data) : null, socTimestamp: timestamp,
      lastReportedAt: entry.dateTime || null, rangeKm: null, stale: timestamp ? now.getTime() - new Date(timestamp).getTime() > staleMinutes * 60_000 : true };
  });
}

function providerFailure(error) {
  const errorCode = isAuthenticationFailure(error) ? 'AUTH_REQUIRED' : error?.code || 'PROVIDER_ERROR';
  return { status: errorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'provider_error', errorCode, vehicles: [] };
}

export function createGeotabService({ withContext = withPersistentContext, environment = () => process.env, now = () => new Date(), diagnostics = () => {} } = {}) {
  return { async fetchVehicles() {
    const env = environment();
    try { return await withContext('geotab', env.EV_MONITORING_GEOTAB_PROFILE_DIR, async (context) => {
      const page = context.pages()[0] || await context.newPage();
      const statusRequests = new Set(); const deviceRequests = new Set(); const responses = [];
      let deviceRows = []; let deviceStatusCode = null; let resolveStatus; let resolveDevices; let settleTimer = null;
      const statusDone = new Promise((resolve) => { resolveStatus = resolve; });
      const devicesDone = new Promise((resolve) => { resolveDevices = resolve; });
      const finishStatus = () => { if (settleTimer) clearTimeout(settleTimer); resolveStatus(responses.at(-1)); };
      context.on('request', async (request) => {
        try { const url = new URL(request.url()); if (url.hostname !== 'my.geotab.com' || !url.pathname.startsWith('/apiv1')) return;
          const body = await request.postDataJSON(); if (body?.method === 'GetLatestStatusDataByDevice') statusRequests.add(request);
          else if (body?.method === 'Get' && body?.params?.typeName === 'Device') deviceRequests.add(request); } catch { /* ignore unrelated requests */ }
      });
      context.on('response', async (response) => {
        try {
          const request = response.request();
          if (statusRequests.has(request)) {
            if ([401, 403].includes(response.status())) { const error = new Error('Geotab auth required'); error.code = 'AUTH_REQUIRED'; throw error; }
            let parsed; try { parsed = parseLatestStatusResponse(await response.json()); } catch { return; }
            responses.push({ status: response.status(), parsed });
            if (adaptLatestStatusRows(parsed.rows).length) resolveStatus(responses.at(-1)); else if (responses.length === 1) settleTimer = setTimeout(finishStatus, 4000);
          }
          if (deviceRequests.has(request)) {
            deviceStatusCode = response.status(); if ([401, 403].includes(deviceStatusCode)) { const error = new Error('Geotab auth required'); error.code = 'AUTH_REQUIRED'; throw error; }
            for (const device of parseDeviceResponse(await response.json())) if (!deviceRows.some((row) => row.id === device.id)) deviceRows.push(device);
            resolveDevices(deviceRows);
          }
        } catch (error) { if (error?.code === 'AUTH_REQUIRED') resolveStatus(Promise.reject(error)); }
      });
      await page.goto(env.EV_MONITORING_GEOTAB_EV_URL || DEFAULT_URL, { waitUntil: 'domcontentloaded' });
      const timeout = Number(env.EV_MONITORING_GEOTAB_AUTH_TIMEOUT_MS || 20_000);
      const status = await Promise.race([statusDone, new Promise((resolve) => setTimeout(() => resolve(null), timeout))]);
      if (!status) { const error = new Error('Geotab status request not observed'); error.code = isLoginUrl(page.url()) ? 'AUTH_REQUIRED' : 'GEOTAB_STATUS_DATA_REQUEST_NOT_OBSERVED'; throw error; }
      const devices = await Promise.race([devicesDone, new Promise((resolve) => setTimeout(() => resolve(null), timeout))]);
      if (!devices) { const error = new Error('Geotab Device response not observed'); error.code = 'GEOTAB_DEVICE_DATA_NOT_OBSERVED'; throw error; }
      const fallbackStatuses = await page.evaluate(async ({ apiUrl, database, diagnosticIds }) => {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json', database }, body: JSON.stringify({ method: 'Get', params: { typeName: 'DeviceStatusInfo', search: { diagnostics: diagnosticIds.map((id) => ({ id })) } } }) });
        if (!response.ok) return []; const payload = await response.json(); return Array.isArray(payload?.result) ? payload.result : [];
      }, { apiUrl: env.EV_MONITORING_GEOTAB_API_URL || 'https://my.geotab.com/apiv1', database: env.EV_MONITORING_GEOTAB_DATABASE || 'amazon_de_alui', diagnosticIds: [SOC, POWER, CHARGING] }).catch(() => []);
      const vehicles = normalizeGeotabVehicles(devices, adaptLatestStatusRows(status.parsed.rows), now(), Number(env.EV_MONITORING_STALE_MINUTES || 360), fallbackStatuses);
      diagnostics({ statusHttpStatus: status.status, deviceHttpStatus: deviceStatusCode, statusRequestObserved: true, deviceResponseObserved: true, numberOfStatusResponsesObserved: responses.length, numberOfValidStatusResponses: responses.length, firstValidTotalRecords: responses[0]?.parsed.totalRecords, selectedTotalRecords: status.parsed.totalRecords, vehicleCount: vehicles.length, finalUrl: new URL(page.url()).toString() });
      return { status: 'connected', vehicles };
    }); } catch (error) { return providerFailure(error); }
  } };
}

export const geotabService = createGeotabService();

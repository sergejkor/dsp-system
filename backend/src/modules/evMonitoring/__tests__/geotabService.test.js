import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeotabService, normalizeGeotabVehicles, unwrapGeotabResult } from '../geotabService.js';

test('normalizes Geotab device names, SOC freshness, power, and charging state', () => {
  const rows = normalizeGeotabVehicles([{ id: 'b28', name: 'M-AZ 7673E' }, { id: 'b2B', name: 'M-AZ 8233E' }], [
    { device: { id: 'b28' }, dateTime: '2026-09-25T06:12:00.000Z', realTimeRangeRemainingMeanKm: 220, statusData: [{ data: 100, dateTime: '2026-09-25T06:11:05.016Z', diagnostic: { id: 'DiagnosticStateOfChargeId' } }, { data: 160, diagnostic: { id: 'DiagnosticElectricVehicleBatteryPowerId' } }, { data: 0, diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' } }] },
    { device: { id: 'b2B' }, statusData: [{ data: 98.5, dateTime: '2026-09-25T00:00:00.000Z', diagnostic: { id: 'DiagnosticStateOfChargeId' } }, { data: 2, diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' } }] },
  ], new Date('2026-09-25T06:12:00.000Z'), 360);
  assert.deepEqual(rows[0], { source: 'geotab', externalId: 'b28', vehicleName: 'M-AZ 7673E', vin: null, soc: 100, chargingState: 'not charging', chargingPowerW: 160, socTimestamp: '2026-09-25T06:11:05.016Z', lastReportedAt: '2026-09-25T06:12:00.000Z', rangeKm: 220, stale: false });
  assert.equal(rows[1].vehicleName, 'M-AZ 8233E'); assert.equal(rows[1].chargingState, 'DC charging'); assert.equal(rows[1].stale, true);
});

test('unwraps the MyGeotab JSON-RPC result array', () => {
  assert.deepEqual(unwrapGeotabResult({ result: [{ id: 'b28' }], jsonrpc: '2.0' }), [{ id: 'b28' }]);
});

test('captures the current Geotab authorization header in memory and reuses it', async () => {
  let handler; let evaluationArgs; let headerValueCalled = false;
  const page = { goto: async () => { await handler({ url: () => 'https://my.geotab.com/apiv1', headerValue: async (name) => { headerValueCalled = name === 'authorization'; return 'Bearer current-session-token'; } }); }, title: async () => 'Geotab', url: () => 'https://my.geotab.com/amazon_de_alui/', evaluate: async (_fn, args) => { evaluationArgs = args; return { devices: { result: [{ id: 'b28', name: 'EV' }] }, statuses: { result: [] } }; } };
  const service = createGeotabService({ environment: () => ({ EV_MONITORING_GEOTAB_PROFILE_DIR: '/tmp/profile', EV_MONITORING_GEOTAB_AUTH_TIMEOUT_MS: '1000' }), withContext: async (_name, _dir, work) => work({ on: (event, callback) => { if (event === 'request') handler = callback; }, pages: () => [page] }) });
  assert.equal((await service.fetchVehicles()).status, 'connected'); assert.equal(headerValueCalled, true); assert.equal(evaluationArgs.authorization, 'Bearer current-session-token');
});

for (const status of [401, 403]) test(`maps Geotab HTTP ${status} to AUTH_REQUIRED`, async () => {
  let handler;
  const page = { goto: async () => { await handler({ url: () => 'https://my.geotab.com/apiv1', headerValue: async () => 'Bearer current-session-token' }); }, title: async () => 'Geotab', evaluate: async () => { throw new Error(`Geotab HTTP ${status}`); } };
  const service = createGeotabService({ environment: () => ({ EV_MONITORING_GEOTAB_PROFILE_DIR: '/tmp/profile', EV_MONITORING_GEOTAB_AUTH_TIMEOUT_MS: '1000' }), withContext: async (_name, _dir, work) => work({ on: (event, callback) => { if (event === 'request') handler = callback; }, pages: () => [page] }) });
  assert.deepEqual(await service.fetchVehicles(), { status: 'auth_required', errorCode: 'AUTH_REQUIRED', vehicles: [] });
});

test('maps non-authentication Geotab failures to PROVIDER_ERROR', async () => {
  const service = createGeotabService({ environment: () => ({ EV_MONITORING_GEOTAB_PROFILE_DIR: '/tmp/profile' }), withContext: async () => { throw new Error('provider unavailable'); } });
  assert.deepEqual(await service.fetchVehicles(), { status: 'provider_error', errorCode: 'PROVIDER_ERROR', vehicles: [] });
});


test('returns provider error when no API request is observed', async () => {
  const page = { goto: async () => {}, title: async () => 'FleetOS', url: () => 'https://my.geotab.com/amazon_de_alui/' };
  const service = createGeotabService({ environment: () => ({ EV_MONITORING_GEOTAB_PROFILE_DIR: '/tmp/profile', EV_MONITORING_GEOTAB_AUTH_TIMEOUT_MS: '1' }), withContext: async (_name, _dir, work) => work({ on: () => {}, pages: () => [page] }) });
  assert.deepEqual(await service.fetchVehicles(), { status: 'provider_error', errorCode: 'GEOTAB_API_REQUEST_NOT_OBSERVED', vehicles: [] });
});

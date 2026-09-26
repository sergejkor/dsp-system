import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptLatestStatusRows, createGeotabService, normalizeGeotabVehicles, parseDeviceResponse, parseLatestStatusResponse } from '../geotabService.js';

test('normalizes Geotab device names, SOC freshness, power, and charging state', () => {
  const rows = normalizeGeotabVehicles([{ id: 'b28', name: 'M-AZ 7673E' }, { id: 'b2B', name: 'M-AZ 8233E' }], [
    { device: { id: 'b28' }, dateTime: '2026-09-25T06:12:00.000Z', statusData: [{ data: 100, dateTime: '2026-09-25T06:11:05.016Z', diagnostic: { id: 'DiagnosticStateOfChargeId' } }, { data: 160, diagnostic: { id: 'DiagnosticElectricVehicleBatteryPowerId' } }, { data: 0, diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' } }] },
    { device: { id: 'b2B' }, statusData: [{ data: 98.5, dateTime: '2026-09-25T00:00:00.000Z', diagnostic: { id: 'DiagnosticStateOfChargeId' } }, { data: 2, diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' } }] },
  ], new Date('2026-09-25T06:12:00.000Z'), 360);
  assert.equal(rows[0].vehicleName, 'M-AZ 7673E');
  assert.equal(rows[0].soc, 100);
  assert.equal(rows[0].chargingState, 'not charging');
  assert.equal(rows[0].chargingPowerW, 160);
  assert.equal(rows[0].stale, false);
  assert.equal(rows[1].chargingState, 'DC charging');
  assert.equal(rows[1].stale, true);
});

test('uses DeviceStatusInfo when the dashboard omits an EV without adding inactive devices', () => {
  const rows = normalizeGeotabVehicles([{ id: '7670', name: 'M-AZ 7670E' }, { id: 'missing', name: 'M-AZ missing' }], [], new Date('2026-09-26T06:00:00Z'), 360, [
    { device: { id: '7670' }, dateTime: '2026-09-26T06:00:00Z', statusData: [{ diagnostic: { id: 'DiagnosticStateOfChargeId' }, data: 36, dateTime: '2026-09-26T05:59:00Z' }, { diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' }, data: 1 }] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].vehicleName, 'M-AZ 7670E');
  assert.equal(rows[0].soc, 36);
  assert.equal(rows[0].chargingState, 'AC charging');
});

test('parses native MyGeotab device and latest-status responses', () => {
  assert.deepEqual(parseDeviceResponse({ result: [{ id: 'b28', name: 'EV' }] }), [{ id: 'b28', name: 'EV' }]);
  const parsed = parseLatestStatusResponse({ result: { data: [{ device: { id: 'b28' }, sensorData: [{ diagnosticId: 'DiagnosticStateOfChargeId', sensorValue: 91, lastUpdateTime: '2026-09-25T06:00:00Z' }] }], totalPages: 1, totalRecords: 1 } });
  assert.equal(parsed.totalRecords, 1);
  const adapted = adaptLatestStatusRows(parsed.rows);
  assert.equal(adapted.length, 1);
  assert.equal(adapted[0].statusData[0].data, 91);
});

test('maps authentication and provider failures without throwing', async () => {
  const auth = createGeotabService({ environment: () => ({ EV_MONITORING_GEOTAB_PROFILE_DIR: '/tmp/profile' }), withContext: async () => { const error = new Error('login required'); error.code = 'AUTH_REQUIRED'; throw error; } });
  assert.deepEqual(await auth.fetchVehicles(), { status: 'auth_required', errorCode: 'AUTH_REQUIRED', vehicles: [] });
  const provider = createGeotabService({ environment: () => ({ EV_MONITORING_GEOTAB_PROFILE_DIR: '/tmp/profile' }), withContext: async () => { throw new Error('provider unavailable'); } });
  assert.deepEqual(await provider.fetchVehicles(), { status: 'provider_error', errorCode: 'PROVIDER_ERROR', vehicles: [] });
});

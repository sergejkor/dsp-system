import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeotabVehicles } from '../geotabService.js';

test('normalizes Geotab device names, SOC freshness, power, and charging state', () => {
  const rows = normalizeGeotabVehicles([{ id: 'b28', name: 'M-AZ 7673E' }, { id: 'b2B', name: 'M-AZ 8233E' }], [
    { device: { id: 'b28' }, dateTime: '2026-09-25T06:12:00.000Z', realTimeRangeRemainingMeanKm: 220, statusData: [{ data: 100, dateTime: '2026-09-25T06:11:05.016Z', diagnostic: { id: 'DiagnosticStateOfChargeId' } }, { data: 160, diagnostic: { id: 'DiagnosticElectricVehicleBatteryPowerId' } }, { data: 0, diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' } }] },
    { device: { id: 'b2B' }, statusData: [{ data: 98.5, dateTime: '2026-09-25T00:00:00.000Z', diagnostic: { id: 'DiagnosticStateOfChargeId' } }, { data: 2, diagnostic: { id: 'DiagnosticElectricVehicleChargingStateId' } }] },
  ], new Date('2026-09-25T06:12:00.000Z'), 360);
  assert.deepEqual(rows[0], { source: 'geotab', externalId: 'b28', vehicleName: 'M-AZ 7673E', vin: null, soc: 100, chargingState: 'not charging', chargingPowerW: 160, socTimestamp: '2026-09-25T06:11:05.016Z', lastReportedAt: '2026-09-25T06:12:00.000Z', rangeKm: 220, stale: false });
  assert.equal(rows[1].vehicleName, 'M-AZ 8233E'); assert.equal(rows[1].chargingState, 'DC charging'); assert.equal(rows[1].stale, true);
});

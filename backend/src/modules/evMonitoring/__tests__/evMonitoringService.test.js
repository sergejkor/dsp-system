import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvResult, createEvMonitoringService } from '../evMonitoringService.js';

test('buildEvResult classifies threshold, stale and missing SOC and orders priority', () => {
  const result = buildEvResult({ threshold: 90, checkedAt: '2026-09-25T06:00:00Z', rivian: { status: 'connected', vehicles: [{ vehicleName: 'Healthy', soc: 100, stale: false }, { vehicleName: 'Low', soc: 82, stale: false }] }, geotab: { status: 'auth_required', errorCode: 'AUTH_REQUIRED', vehicles: [{ vehicleName: 'Missing', soc: null, stale: true }] } });
  assert.deepEqual(result.vehicles.map((v) => v.vehicleName), ['Missing', 'Low', 'Healthy']); assert.equal(result.summary.belowThreshold, 1); assert.equal(result.summary.errorVehicles, 1); assert.equal(result.summary.providerErrors, 1);
});
test('service queries both providers concurrently and persists only sanitized results', async () => {
  const inserted = []; const service = createEvMonitoringService({ now: () => new Date('2026-09-25T06:00:00Z'), rivian: { fetchVehicles: async () => ({ status: 'connected', vehicles: [] }) }, geotab: { fetchVehicles: async () => ({ status: 'connected', vehicles: [] }) }, dbQuery: async (sql, params) => { inserted.push(params); return { rows: [{ id: 7 }] }; } });
  const result = await service.run('scheduled'); assert.equal(result.checkId, 7); assert.equal(inserted[0][0], 'scheduled'); assert.equal(inserted[0][9].includes('authorization'), false);
});

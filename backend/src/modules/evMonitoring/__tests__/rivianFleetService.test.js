import test from 'node:test';
import assert from 'node:assert/strict';
import { createRivianFleetService } from '../rivianFleetService.js';

test('Rivian fallback request normalizes FleetOS vehicles', async () => {
  const calls = [];
  const service = createRivianFleetService({
    environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile', EV_MONITORING_RIVIAN_ASSET_GROUP: 'fleet-group', EV_MONITORING_STALE_MINUTES: '360' }),
    now: () => new Date('2026-09-25T06:00:00Z'),
    withContext: async (_name, _dir, work) => work({
      pages: () => [],
      newPage: async () => ({
        goto: async () => {},
        evaluate: async (_fn, values) => {
          calls.push(values.assetGroup);
          return { status: 200, payload: { data: { fleetVehiclesPaginated: {
            items: [
              { id: '1', name: 'R1', vin: 'VIN1', telemetry: { battery: { main: { stateOfCharge: { value: 100, timestamp: '2026-09-25T05:30:00Z' }, chargerState: 'charging_complete' } } } },
              { id: '2', name: 'R2', vin: 'VIN2', telemetry: { battery: { main: { stateOfCharge: { value: 89, timestamp: '2026-09-25T05:30:00Z' }, chargerState: 'charging_station_error' } } } },
            ],
            pageInfo: { totalItems: 2 },
          } } } };
        },
      }),
    }),
  });
  const result = await service.fetchVehicles();
  assert.equal(result.status, 'connected');
  assert.deepEqual(calls, ['fleet-group']);
  assert.equal(result.vehicles.length, 2);
  assert.equal(result.vehicles[1].soc, 89);
  assert.equal(result.vehicles[1].chargingState, 'charging_station_error');
});

test('Rivian authentication errors are structured and do not throw', async () => {
  const service = createRivianFleetService({ environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile' }), withContext: async () => { const error = new Error('login required'); error.code = 'AUTH_REQUIRED'; throw error; } });
  assert.deepEqual(await service.fetchVehicles(), { status: 'auth_required', errorCode: 'AUTH_REQUIRED', vehicles: [] });
});

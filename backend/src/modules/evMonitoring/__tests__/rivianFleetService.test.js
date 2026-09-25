import test from 'node:test';
import assert from 'node:assert/strict';
import { createRivianFleetService } from '../rivianFleetService.js';

test('Rivian service paginates all FleetOS vehicles and normalizes charger states', async () => {
  const calls = []; const service = createRivianFleetService({ environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile', EV_MONITORING_STALE_MINUTES: '360' }), now: () => new Date('2026-09-25T06:00:00Z'), withContext: async (_name, _dir, work) => work({ pages: () => [], newPage: async () => ({ goto: async () => {}, evaluate: async (_fn, values) => { calls.push(values.offset); return { data: { fleetVehiclesPaginated: { items: values.offset ? [{ id: '2', name: 'R2', vin: 'VIN2', telemetry: { battery: { main: { stateOfCharge: { value: 89, timestamp: '2026-09-25T05:30:00Z' }, chargerState: 'charging_station_error' } } } }] : Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `R${i}`, vin: `VIN${i}`, telemetry: { battery: { main: { stateOfCharge: { value: 100, timestamp: '2026-09-25T05:30:00Z' }, chargerState: 'charging_complete' } } } })), pageInfo: { totalItems: 26 } } } }; } }) }) });
  const result = await service.fetchVehicles(); assert.equal(result.status, 'connected'); assert.deepEqual(calls, [0, 25]); assert.equal(result.vehicles.length, 26); assert.equal(result.vehicles.at(-1).soc, 89); assert.equal(result.vehicles.at(-1).chargingState, 'charging_station_error');
});

test('Rivian authentication errors are structured and do not throw', async () => {
  const service = createRivianFleetService({ environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile' }), withContext: async () => { const error = new Error('login required'); error.code = 'AUTH_REQUIRED'; throw error; } });
  assert.deepEqual(await service.fetchVehicles(), { status: 'auth_required', errorCode: 'AUTH_REQUIRED', vehicles: [] });
});


test('Rivian ordinary provider errors are not reported as authentication failures', async () => {
  const service = createRivianFleetService({ environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile' }), withContext: async () => { throw new Error('provider unavailable'); } });
  assert.deepEqual(await service.fetchVehicles(), { status: 'provider_error', errorCode: 'PROVIDER_ERROR', vehicles: [] });
});

test('Rivian GraphQL errors are provider errors', async () => {
  const service = createRivianFleetService({ environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile' }), withContext: async (_name, _dir, work) => work({ pages: () => [], newPage: async () => ({ goto: async () => {}, url: () => 'https://business.rivian.com/vehicles/tracker', evaluate: async () => ({ httpStatus: 200, payload: { errors: [{ message: 'bad query', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] } }) }) }) });
  assert.deepEqual(await service.fetchVehicles(), { status: 'provider_error', errorCode: 'PROVIDER_ERROR', vehicles: [] });
});

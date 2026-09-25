import test from 'node:test';
import assert from 'node:assert/strict';
import { createRivianFleetService } from '../rivianFleetService.js';

test('Rivian consumes a native Vehicles response without replay when all vehicles fit', async () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: 'R' + i, vin: 'VIN' + i, telemetry: { battery: { main: { stateOfCharge: { value: i === 0 ? 89 : 100, timestamp: '2026-09-25T05:30:00Z' }, chargerState: 'charging_complete' } } } }));
  let requestHandler; let responseHandler; let evaluateCalls = 0;
  const request = { url: () => 'https://business.rivian.com/api', postDataJSON: async () => ({ operationName: 'Vehicles', variables: { offset: 0, limit: 25 }, query: 'portal-native-query' }) };
  const response = { request: () => request, status: () => 200, json: async () => ({ data: { fleetVehiclesPaginated: { items, pageInfo: { totalItems: 8 } } } }) };
  const page = { locator: () => ({}), goto: async () => { await requestHandler(request); await responseHandler(response); }, url: () => 'https://business.rivian.com/vehicles/tracker', evaluate: async () => { evaluateCalls += 1; } };
  const service = createRivianFleetService({ environment: () => ({ EV_MONITORING_RIVIAN_PROFILE_DIR: '/tmp/profile', EV_MONITORING_STALE_MINUTES: '360' }), now: () => new Date('2026-09-25T06:00:00Z'), withContext: async (_name, _dir, work) => work({ on: (event, callback) => { if (event === 'request') requestHandler = callback; if (event === 'response') responseHandler = callback; }, pages: () => [page] }) });
  const result = await service.fetchVehicles(); assert.equal(result.status, 'connected'); assert.equal(result.vehicles.length, 8); assert.equal(result.vehicles[0].soc, 89); assert.equal(evaluateCalls, 0);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLease, saveLease } from './carLease.js';
import { isOutsideLease } from '../../../../frontend/src/utils/carLeaseAvailability.js';
import { pool } from '../../db.js';
import cars from './carsService.js';

const lease = { active_from: '2026-07-16', active_to: '2026-07-31' };
test('lease dates validate sources, boundaries, missing and invalid dates', () => {
  for (const source of ['LMR', 'Rental', 'Self source', ' LMR Rental ']) assert.deepEqual(validateLease(lease, source), lease);
  assert.equal(validateLease(lease, 'Owned'), null);
  assert.equal(validateLease({ mileage: 123 }, 'LMR'), null);
  for (const data of [{ ...lease, active_to: '' }, { ...lease, active_to: '2026-07-15' }, { ...lease, active_from: '2026-02-30' }]) {
    assert.throws(() => validateLease(data, 'LMR'), { status: 400 });
  }
});
test('expiry is automatic, inclusive and reverses when extended without affecting other sources', () => {
  const car = { ...lease, fleet_provider: 'LMR' };
  assert.equal(isOutsideLease(car, '2026-07-15'), true);
  assert.equal(isOutsideLease(car, '2026-07-16'), false);
  assert.equal(isOutsideLease(car, '2026-07-31'), false);
  assert.equal(isOutsideLease(car, '2026-08-01'), true);
  assert.equal(isOutsideLease({ ...car, active_to: '2026-08-31' }, '2026-08-01'), false);
  assert.equal(isOutsideLease({ ...car, fleet_provider: 'Owned' }, '2026-08-01'), false);
});
test('saving lease dates preserves manual deactivation', async () => {
  let sql;
  await saveLease(async text => { sql = text; }, 51, lease);
  assert.doesNotMatch(sql.split('DO UPDATE')[1], /deactivated\s*=/);
});
test('Cars create and update atomically save the shared lease, rolling back on failure', async () => {
  const originalQuery = pool.query, originalConnect = pool.connect;
  const calls = [];
  let failLease = false;
  pool.query = async () => ({ rows: [] });
  pool.connect = async () => ({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (failLease && sql.startsWith('INSERT INTO car_planning_car_state')) throw new Error('Lease write failed');
      return { rows: [{ id: 51, fleet_provider: 'LMR' }] };
    },
    release: () => calls.push({ sql: 'RELEASE' }),
  });
  try {
    const saved = await cars.createCar({ vehicle_id: 'TEST', fleet_provider: 'LMR', ...lease });
    assert.equal(saved.active_to, lease.active_to);
    assert.deepEqual(calls.find(call => call.sql.startsWith('INSERT INTO car_planning_car_state')).params, [51, lease.active_from, lease.active_to]);
    assert.deepEqual(calls.slice(-2).map(call => call.sql), ['COMMIT', 'RELEASE']);
    calls.length = 0;
    await cars.updateCar(51, lease);
    assert.ok(calls.some(call => call.sql.includes('FOR UPDATE')));
    assert.ok(calls.some(call => call.sql.startsWith('INSERT INTO car_planning_car_state')));
    calls.length = 0;
    failLease = true;
    await assert.rejects(cars.updateCar(51, { model: 'TEST', ...lease }), /Lease write failed/);
    assert.deepEqual(calls.slice(-2).map(call => call.sql), ['ROLLBACK', 'RELEASE']);
    assert.ok(!calls.some(call => call.sql === 'COMMIT'));
  } finally { pool.query = originalQuery; pool.connect = originalConnect; }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../../../db.js';
import { listRentals, saveRental } from '../fleetRentalsService.js';
import router from '../fleetRentalsRoutes.js';

const row = { id: 7, license_plate: 'TEST', fleet_provider: 'Self source', active_from: '2026-09-01', active_to: '2026-09-30', rental_updated_at: null };
const form = { active_from: '2026-09-02', active_to: '2026-09-25', daily_rate: 50, daily_km: 100, odometer_start: 0, odometer_end: 3000, extra_km_rate: 0.25 };

test('rental service selects shared vehicle data and saves both records atomically', async () => {
  const originalQuery = pool.query, originalConnect = pool.connect;
  const calls = [];
  let failure = false, provider = 'Self source';
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.startsWith('SELECT') ? [row] : [] };
  };
  pool.connect = async () => ({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT fleet_provider')) return { rows: [{ fleet_provider: provider }] };
      if (sql.startsWith('SELECT c.id')) return { rows: [row] };
      if (failure && sql.startsWith('INSERT INTO fleet_rental_details')) throw new Error('Simulated storage failure');
      return { rows: [] };
    }, release: () => calls.push({ sql: 'RELEASE' }),
  });
  try {
    const rows = await listRentals();
    assert.equal(rows[0].revision.length, 64);
    assert.match(calls[0].sql, /CREATE TABLE IF NOT EXISTS fleet_rental_details/);
    assert.match(calls[1].sql, /LEFT JOIN car_planning_car_state/);
    assert.deepEqual(calls[1].params[0], ['lmr', 'rental', 'lmr rental', 'self source']);
    calls.length = 0;
    await saveRental(7, { ...form, revision: rows[0].revision });
    assert.equal(calls[0].sql, 'BEGIN');
    assert.ok(calls.some(call => call.sql.includes('FOR UPDATE')));
    const dates = calls.find(call => call.sql.startsWith('INSERT INTO car_planning_car_state'));
    assert.deepEqual(dates.params, [7, form.active_from, form.active_to]);
    assert.doesNotMatch(dates.sql.split('DO UPDATE')[1], /deactivated\s*=/);
    assert.deepEqual(calls.slice(-2).map(call => call.sql), ['COMMIT', 'RELEASE']);

    calls.length = 0;
    await assert.rejects(saveRental(7, { ...form, revision: 'stale' }), { status: 409 });
    assert.ok(!calls.some(call => call.sql.startsWith('INSERT')));
    assert.deepEqual(calls.slice(-2).map(call => call.sql), ['ROLLBACK', 'RELEASE']);

    calls.length = 0;
    failure = true;
    await assert.rejects(saveRental(7, { ...form, revision: rows[0].revision }), /Simulated storage failure/);
    assert.deepEqual(calls.slice(-2).map(call => call.sql), ['ROLLBACK', 'RELEASE']);
    assert.ok(!calls.some(call => call.sql === 'COMMIT'));

    calls.length = 0;
    provider = 'Owned';
    await assert.rejects(saveRental(7, { ...form, revision: rows[0].revision }), { status: 400 });
    assert.ok(!calls.some(call => call.sql.startsWith('INSERT')));
  } finally { pool.query = originalQuery; pool.connect = originalConnect; }
});

test('rental endpoints require authentication, including read access', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/fleet-rentals', router);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/fleet-rentals`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(`${url}/7`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

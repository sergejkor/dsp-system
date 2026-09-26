import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../db.js';
import planning from './carPlanningService.js';

test('expired lease assignment fails before planning rows or manual states are changed', async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes('jsonb_to_recordset') ? [{ car_id: 51 }] : [] };
  };
  try {
    await assert.rejects(planning.savePlanningData({ 51: false }, [{ car_id: 51, plan_date: '2026-08-01', driver_identifier: 'TEST' }]), /outside its lease period/);
    assert.ok(!calls.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim())));
    const guard = calls.find(({ sql }) => sql.includes('jsonb_to_recordset'));
    assert.match(guard.sql, /IS DISTINCT FROM TRIM\(previous.driver_identifier\)/);
    assert.match(guard.sql, /incoming.plan_date > lease.active_to/);
  } finally { pool.query = original; }
});

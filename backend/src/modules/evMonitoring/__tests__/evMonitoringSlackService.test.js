import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvMonitoringSlackService, formatEvMonitoringSlackMessage } from '../evMonitoringSlackService.js';
test('formats an all-clear daily message and reports partial authentication failure', () => {
  const base = { threshold: 90, summary: { totalVehicles: 2, okVehicles: 2 }, vehicles: [], providers: { rivian: { status: 'connected', vehicleCount: 1 }, geotab: { status: 'connected', vehicleCount: 1 } } };
  assert.match(formatEvMonitoringSlackMessage(base, new Date('2026-09-25T04:00:00Z')), /All 2 EVs are at or above 90%/);
  base.providers.geotab = { status: 'auth_required', vehicleCount: 0, errorCode: 'AUTH_REQUIRED' }; assert.match(formatEvMonitoringSlackMessage(base), /Authentication required/);
});

test('Slack delivery uses the Berlin service date as an idempotency key', async () => {
  let state; let sends = 0;
  const client = { query: async (sql) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.startsWith('SELECT status FROM')) return { rows: state ? [{ status: state }] : [] };
    if (sql.startsWith('INSERT INTO ev_monitoring_slack_deliveries')) { state = 'sending'; return { rows: [] }; }
    if (sql.startsWith('UPDATE ev_monitoring_slack_deliveries SET status = \'sent\'')) { state = 'sent'; return { rows: [] }; }
    return { rows: [] };
  }, release: () => {} };
  const service = createEvMonitoringSlackService({ dbPool: { connect: async () => client }, now: () => new Date('2026-09-25T06:00:00Z'), environment: () => ({ EV_MONITORING_SLACK_ENABLED: 'true', EV_MONITORING_SLACK_WEBHOOK_URL: 'https://example.test/webhook' }), fetchImpl: async () => { sends += 1; return { ok: true }; } });
  const result = { checkId: 5, threshold: 90, summary: { totalVehicles: 0, okVehicles: 0 }, vehicles: [], providers: { rivian: { status: 'connected', vehicleCount: 0 }, geotab: { status: 'connected', vehicleCount: 0 } } };
  assert.equal((await service.deliver(result)).status, 'sent'); assert.equal((await service.deliver(result)).status, 'already_sent'); assert.equal(sends, 1);
});

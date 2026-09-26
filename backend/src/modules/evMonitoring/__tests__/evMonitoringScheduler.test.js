import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvMonitoringScheduler } from '../evMonitoringScheduler.js';
test('schedules daily EV checks for 06:00 Berlin and delivery-only retries in the 06:00 hour', async () => {
  const registrations = []; let delivered; const scheduler = createEvMonitoringScheduler({ environment: () => ({ EV_MONITORING_ENABLED: 'true', EV_MONITORING_TIMEZONE: 'Europe/Berlin' }), now: () => new Date('2026-09-25T06:00:00Z'), schedule: (expression, callback, options) => { registrations.push({ expression, callback, options }); return {}; }, check: async (value) => ({ checkId: 1, trigger: value.trigger }), latest: async () => ({ checkId: 1, trigger: 'scheduled', storedAt: '2026-09-25T05:00:00Z' }), deliver: async (value) => { delivered = value; return { status: 'sent' }; } });
  scheduler.start(); assert.deepEqual(registrations.map((r) => r.expression), ['0 6 * * *', '0-30 6 * * *']); assert.equal(registrations[0].options.timezone, 'Europe/Berlin'); await scheduler.tick(); assert.equal(delivered.trigger, 'scheduled'); await scheduler.retry(); assert.equal(delivered.checkId, 1);
});

test('does not start scheduled jobs when EV monitoring is disabled', () => {
  let scheduled = false; const messages = []; const scheduler = createEvMonitoringScheduler({ environment: () => ({ EV_MONITORING_ENABLED: 'false' }), schedule: () => { scheduled = true; }, log: (message) => messages.push(message) });
  assert.equal(scheduler.start(), null); assert.equal(scheduled, false); assert.deepEqual(messages, ['EV Monitoring scheduler is disabled.']);
});

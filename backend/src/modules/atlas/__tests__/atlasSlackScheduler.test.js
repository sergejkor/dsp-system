import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtlasSlackRetryScheduler } from '../atlasSlackScheduler.js';
import { isAtlasSlackRetryWindow } from '../atlasSlackService.js';

test('Slack retry scheduler uses Berlin time, runs Monday through Saturday, and stays inside 08:00-10:30', async () => {
  let current = new Date('2026-09-25T06:00:00.000Z');
  const deliveredDates = [];
  let scheduled;
  const scheduler = createAtlasSlackRetryScheduler({
    schedule: (expression, callback, options) => {
      scheduled = { expression, callback, options };
      return scheduled;
    },
    deliver: async (date) => { deliveredDates.push(date); },
    now: () => current,
  });

  scheduler.start();
  assert.equal(scheduled.expression, '* * * * *');
  assert.equal(scheduled.options.timezone, 'Europe/Berlin');
  await scheduler.tick();
  assert.deepEqual(deliveredDates, ['2026-09-25']);

  current = new Date('2026-09-27T07:00:00.000Z');
  assert.equal(isAtlasSlackRetryWindow(current), false);
  assert.equal((await scheduler.tick()).status, 'outside_window');
  current = new Date('2026-09-25T08:30:00.000Z');
  assert.equal(isAtlasSlackRetryWindow(current), false);
  assert.equal((await scheduler.tick()).status, 'outside_window');
  assert.deepEqual(deliveredDates, ['2026-09-25']);
});

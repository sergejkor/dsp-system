import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasWatcherClock, isAtlasWatcherWindow, runAtlasDayWatch } from '../atlasEmailWatcher.js';

function berlinDateTime(date, hour, minute) {
  const offset = date >= '2026-03-29' && date < '2026-10-25' ? 2 : 1;
  return new Date(`${date}T${String(hour - offset).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
}

test('watcher is enabled Monday through Saturday in its Berlin window', () => {
  for (const date of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
    assert.equal(isAtlasWatcherWindow(berlinDateTime(date, 8, 0)), true, date);
  }
});

test('Sunday, before 08:00, and 10:30 onward are disabled', () => {
  assert.equal(isAtlasWatcherWindow(berlinDateTime('2026-09-27', 9, 0)), false);
  assert.equal(isAtlasWatcherWindow(berlinDateTime('2026-09-24', 7, 59)), false);
  assert.equal(isAtlasWatcherWindow(berlinDateTime('2026-09-24', 10, 30)), false);
  assert.equal(isAtlasWatcherWindow(berlinDateTime('2026-09-24', 10, 31)), false);
  assert.equal(atlasWatcherClock(berlinDateTime('2026-09-27', 9, 0)).weekday, 'Sun');
});

test('already persisted today does not start an IMAP sync', async () => {
  let syncCalls = 0;
  const result = await runAtlasDayWatch({
    serviceDate: '2026-09-24',
    now: () => berlinDateTime('2026-09-24', 8, 0),
    hasPersisted: async () => true,
    sync: async () => { syncCalls += 1; },
    waitForChange: async () => {},
  });
  assert.equal(result.status, 'already-imported');
  assert.equal(syncCalls, 0);
});

test('a sync/persistence failure does not permanently stop monitoring', async () => {
  let persisted = false;
  let syncCalls = 0;
  let current = berlinDateTime('2026-09-24', 8, 0);
  const result = await runAtlasDayWatch({
    serviceDate: '2026-09-24',
    now: () => current,
    hasPersisted: async () => persisted,
    sync: async () => {
      syncCalls += 1;
      if (syncCalls === 1) throw new Error('temporary persistence failure');
      persisted = true;
    },
    waitForChange: async (ms) => { current = new Date(current.getTime() + ms); },
    logger: { warn() {}, error() {} },
  });
  assert.equal(result.status, 'imported');
  assert.equal(syncCalls, 2);
});

test('an IDLE event triggers an immediate mailbox check', async () => {
  let persisted = false;
  let syncCalls = 0;
  const result = await runAtlasDayWatch({
    serviceDate: '2026-09-24',
    now: () => berlinDateTime('2026-09-24', 8, 0),
    hasPersisted: async () => persisted,
    sync: async () => { syncCalls += 1; persisted = syncCalls === 2; },
    waitForChange: async () => 'event',
  });
  assert.equal(result.status, 'imported');
  assert.equal(syncCalls, 2);
});

test('fallback mailbox checks are scheduled every 60 seconds', async () => {
  let persisted = false;
  let syncCalls = 0;
  let current = berlinDateTime('2026-09-24', 8, 0);
  const waits = [];
  const result = await runAtlasDayWatch({
    serviceDate: '2026-09-24',
    now: () => current,
    hasPersisted: async () => persisted,
    sync: async () => { syncCalls += 1; persisted = syncCalls === 2; },
    waitForChange: async (ms) => { waits.push(ms); current = new Date(current.getTime() + ms); },
  });
  assert.equal(result.status, 'imported');
  assert.deepEqual(waits, [60_000]);
});

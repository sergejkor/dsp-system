import cron from 'node-cron';
import { pool } from '../../db.js';
import { atlasMailboxName, createAtlasImapClient } from './atlasImapService.js';
import { syncAtlasEmails, hasAtlasEmailPersistedForDate } from './atlasSyncService.js';

const BERLIN_TIME_ZONE = 'Europe/Berlin';
const WATCH_START_MINUTE = 8 * 60;
const WATCH_END_MINUTE = 10 * 60 + 30;
const FALLBACK_POLL_MS = 60_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const WATCHER_LOCK_NAME = 'atlas-email-morning-watcher';
const completedDates = new Set();
const deadlineLoggedDates = new Set();
let scheduledTask;
let activeDate;
let activeController;
let activePromise;

export function atlasWatcherClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: BERLIN_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    second: Number(parts.second),
    millisecond: now.getMilliseconds(),
  };
}

export function isAtlasWatcherWindow(now = new Date()) {
  const { weekday, minuteOfDay } = atlasWatcherClock(now);
  return weekday !== 'Sun' && minuteOfDay >= WATCH_START_MINUTE && minuteOfDay < WATCH_END_MINUTE;
}

function remainingWindowMs(clock) {
  return Math.max(0,
    (WATCH_END_MINUTE - clock.minuteOfDay) * 60_000 - clock.second * 1000 - clock.millisecond);
}

export async function runAtlasDayWatch({
  serviceDate,
  now = () => new Date(),
  hasPersisted,
  sync,
  waitForChange,
  signal,
  logger = console,
  pollIntervalMs = FALLBACK_POLL_MS,
}) {
  if (await hasPersisted(serviceDate)) return { status: 'already-imported' };
  let nextPollAt = 0;
  let forceCheck = false;

  while (!signal?.aborted) {
    const current = now();
    const clock = atlasWatcherClock(current);
    if (clock.date !== serviceDate || clock.weekday === 'Sun') return { status: 'outside-window' };
    if (clock.minuteOfDay < WATCH_START_MINUTE) return { status: 'outside-window' };
    if (clock.minuteOfDay >= WATCH_END_MINUTE) {
      if (!deadlineLoggedDates.has(serviceDate)) {
        logger.warn('[atlas] Atlas list not received by 10:30');
        deadlineLoggedDates.add(serviceDate);
      }
      return { status: 'deadline' };
    }

    const fallbackDue = current.getTime() >= nextPollAt;
    if (fallbackDue || forceCheck) {
      forceCheck = false;
      if (fallbackDue) nextPollAt = current.getTime() + pollIntervalMs;
      try {
        await sync(serviceDate);
      } catch (error) {
        logger.error(`[atlas] watcher sync failed: ${String(error?.message || error)}`);
      }
      try {
        if (await hasPersisted(serviceDate)) return { status: 'imported' };
      } catch (error) {
        logger.error(`[atlas] watcher persistence check failed: ${String(error?.message || error)}`);
      }
      continue;
    }

    const waitMs = Math.min(nextPollAt - current.getTime(), remainingWindowMs(clock));
    const reason = await waitForChange(Math.max(1, waitMs), signal);
    if (reason === 'event') forceCheck = true;
  }
  return { status: 'stopped' };
}

function createWakeSignal() {
  let pending = false;
  let waiter;
  return {
    notify() {
      pending = true;
      waiter?.('event');
    },
    wait(ms, signal) {
      if (pending) {
        pending = false;
        return Promise.resolve('event');
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (reason) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          waiter = null;
          resolve(reason);
        };
        const onAbort = () => finish('abort');
        const timer = setTimeout(() => finish('timeout'), ms);
        waiter = finish;
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}

function abortableDelay(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function safeErrorMessage(error) {
  const password = String(process.env.ATLAS_IMAP_PASSWORD || '');
  const message = String(error?.message || error);
  return password ? message.replaceAll(password, '[redacted]') : message;
}

async function idleReconnectLoop(wakeSignal, abortSignal) {
  let retryDelay = 1000;
  let idleUnsupported = false;

  while (!abortSignal.aborted && !idleUnsupported) {
    let client;
    let connectedAt = 0;
    let closeOnAbort;
    try {
      client = createAtlasImapClient({ connectionTimeout: 15_000 });
      client.on('error', (error) => {
        console.warn(`[atlas] IDLE connection error: ${safeErrorMessage(error)}`);
        wakeSignal.notify();
      });
      client.on('close', () => wakeSignal.notify());
      client.on('exists', () => wakeSignal.notify());
      closeOnAbort = () => client.close();
      abortSignal.addEventListener('abort', closeOnAbort, { once: true });
      await client.connect();
      await client.mailboxOpen(atlasMailboxName());
      if (!client.capabilities?.has('IDLE')) {
        idleUnsupported = true;
        console.info('[atlas] IMAP IDLE is unsupported; 60-second mailbox checks remain active');
        break;
      }
      console.info('[atlas] IMAP IDLE watcher connected');
      connectedAt = Date.now();
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          client.off('close', finish);
          client.off('error', finish);
          abortSignal.removeEventListener('abort', finish);
          resolve();
        };
        client.once('close', finish);
        client.once('error', finish);
        abortSignal.addEventListener('abort', finish, { once: true });
      });
      if (Date.now() - connectedAt >= 60_000) retryDelay = 1000;
    } catch (error) {
      console.warn(`[atlas] IMAP IDLE reconnect failed: ${safeErrorMessage(error)}`);
    } finally {
      if (closeOnAbort) abortSignal.removeEventListener('abort', closeOnAbort);
      if (client) {
        client.close();
      }
    }
    if (!abortSignal.aborted && !idleUnsupported) {
      await abortableDelay(retryDelay, abortSignal);
      retryDelay = Math.min(retryDelay * 2, MAX_RECONNECT_DELAY_MS);
    }
  }
}

async function runLockedWatcher(serviceDate, controller) {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [WATCHER_LOCK_NAME]);
    locked = lock.rows[0]?.locked === true;
    if (!locked) return { status: 'another-instance' };
    if (await hasAtlasEmailPersistedForDate(serviceDate)) {
      completedDates.add(serviceDate);
      return { status: 'already-imported' };
    }

    const wakeSignal = createWakeSignal();
    const idleController = new AbortController();
    const stopIdle = () => idleController.abort();
    controller.signal.addEventListener('abort', stopIdle, { once: true });
    const idleTask = idleReconnectLoop(wakeSignal, idleController.signal).catch((error) => {
      console.error(`[atlas] watcher IDLE loop stopped: ${safeErrorMessage(error)}`);
    });
    try {
      const result = await runAtlasDayWatch({
        serviceDate,
        hasPersisted: hasAtlasEmailPersistedForDate,
        sync: (date) => syncAtlasEmails({ onlyServiceDate: date }),
        waitForChange: (ms, signal) => wakeSignal.wait(ms, signal),
        signal: controller.signal,
      });
      if (result.status === 'imported' || result.status === 'already-imported') completedDates.add(serviceDate);
      return result;
    } finally {
      idleController.abort();
      controller.signal.removeEventListener('abort', stopIdle);
      await idleTask;
    }
  } finally {
    try {
      if (locked) await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [WATCHER_LOCK_NAME]);
    } finally {
      lockClient.release();
    }
  }
}

async function ensureWatcher(now = new Date()) {
  const clock = atlasWatcherClock(now);
  if (clock.weekday === 'Sun') return;
  if (clock.minuteOfDay < WATCH_START_MINUTE) return;
  if (completedDates.has(clock.date)) return;
  if (activePromise) {
    if (activeDate === clock.date && clock.minuteOfDay < WATCH_END_MINUTE) return;
    activeController?.abort();
    await activePromise.catch(() => {});
  }
  if (clock.minuteOfDay >= WATCH_END_MINUTE) {
    if (await hasAtlasEmailPersistedForDate(clock.date)) completedDates.add(clock.date);
    else if (!deadlineLoggedDates.has(clock.date)) {
      console.warn('[atlas] Atlas list not received by 10:30');
      deadlineLoggedDates.add(clock.date);
    }
    return;
  }
  if (await hasAtlasEmailPersistedForDate(clock.date)) {
    completedDates.add(clock.date);
    return;
  }

  activeDate = clock.date;
  activeController = new AbortController();
  const controller = activeController;
  activePromise = runLockedWatcher(clock.date, controller)
    .catch((error) => console.error(`[atlas] watcher failed; scheduler will retry: ${safeErrorMessage(error)}`))
    .finally(() => {
      if (activeController === controller) {
        activeDate = undefined;
        activeController = undefined;
        activePromise = undefined;
      }
    });
}

export function startAtlasEmailWatcher() {
  if (scheduledTask) return scheduledTask;
  scheduledTask = cron.schedule('* * * * *', () => {
    void ensureWatcher().catch((error) => console.error(`[atlas] watcher scheduling failed: ${safeErrorMessage(error)}`));
  }, { timezone: BERLIN_TIME_ZONE });
  void ensureWatcher().catch((error) => console.error(`[atlas] watcher startup failed: ${safeErrorMessage(error)}`));
  return scheduledTask;
}

export default { startAtlasEmailWatcher };

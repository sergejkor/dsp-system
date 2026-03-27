import cron from 'node-cron';
import { syncKenjoEmployeesToDb } from './kenjoSyncService.js';

let running = false;
let task = null;

function envBool(name, def = false) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

export function startKenjoSyncScheduler() {
  const enabled = envBool('KENJO_SYNC_ENABLED', false);
  if (!enabled) {
    console.log('[kenjo-sync] scheduler disabled (KENJO_SYNC_ENABLED=false)');
    return null;
  }

  // Default: every 3 hours at minute 0.
  const expr = process.env.KENJO_SYNC_CRON || '0 */3 * * *';

  task = cron.schedule(expr, async () => {
    if (running) {
      console.log('[kenjo-sync] skipped: previous run still active');
      return;
    }
    const startedAt = Date.now();
    running = true;
    console.log('[kenjo-sync] started', { mode: 'scheduled' });

    try {
      const result = await syncKenjoEmployeesToDb();
      const elapsedMs = Date.now() - startedAt;
      console.log('[kenjo-sync] completed', { elapsedMs, synced: result?.synced ?? 0 });
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      console.error('[kenjo-sync] failed', { elapsedMs, error: String(err?.message || err) });
    } finally {
      running = false;
    }
  });

  console.log('[kenjo-sync] scheduler started', { cron: expr });
  return task;
}

export function stopKenjoSyncScheduler() {
  if (task) task.stop();
  task = null;
}

export function isKenjoSyncRunning() {
  return running;
}


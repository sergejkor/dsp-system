import cron from 'node-cron';
import { syncGmailReports } from './paveGmailSyncService.js';

let running = false;
let task = null;

function envBool(name, def = false) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

export function startPaveSyncScheduler() {
  const enabled = envBool('PAVE_SYNC_ENABLED', false);
  if (!enabled) {
    console.log('[pave-sync] scheduler disabled (PAVE_SYNC_ENABLED=false)');
    return null;
  }

  const expr = process.env.PAVE_SYNC_CRON || '*/5 * * * *';
  const reprocessFailed = envBool('PAVE_SYNC_REPROCESS_FAILED', false);
  const reprocessPartial = envBool('PAVE_SYNC_REPROCESS_PARTIAL', false);
  const reprocessSparse = envBool('PAVE_SYNC_REPROCESS_SPARSE', false);
  const maxPerRun = Number(process.env.PAVE_SYNC_MAX_EMAILS_PER_RUN || 50);

  task = cron.schedule(expr, async () => {
    if (running) {
      console.log('[pave-sync] skipped: previous run still active');
      return;
    }
    const startedAt = Date.now();
    running = true;
    console.log('[pave-sync] started', {
      mode: 'scheduled',
      reprocessFailed,
      reprocessPartial,
      reprocessSparse,
      maxPerRun,
    });

    try {
      const result = await syncGmailReports({
        mode: 'scheduled',
        limit: maxPerRun,
        force: false,
        reprocessFailed,
        reprocessPartial,
        reprocessSparse,
      });
      const elapsedMs = Date.now() - startedAt;
      console.log('[pave-sync] completed', {
        elapsedMs,
        scanned: result?.scanned ?? 0,
        matched: result?.matched ?? 0,
        imported: result?.imported ?? 0,
        filteredOut: result?.filteredOut ?? 0,
        skipped: result?.skipped ?? 0,
        partial: result?.partial ?? 0,
        failed: result?.failed ?? 0,
        stageBQueued: result?.stageBQueued ?? 0,
        stageBCompleted: result?.stageBCompleted ?? 0,
        timings: result?.timings ?? null,
      });
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      console.error('[pave-sync] failed', { elapsedMs, error: String(err?.message || err) });
    } finally {
      running = false;
    }
  });

  console.log('[pave-sync] scheduler started', { cron: expr });
  return task;
}

export function stopPaveSyncScheduler() {
  if (task) task.stop();
  task = null;
}

export function isPaveSyncRunning() {
  return running;
}


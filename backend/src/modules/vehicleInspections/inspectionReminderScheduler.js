import cron from 'node-cron';
import reminderService from './inspectionReminderService.js';

let task = null;
let running = false;

async function runCycle() {
  if (running) return;
  running = true;
  try {
    const result = await reminderService.processDueReminderTasks();
    if ((result?.processed || 0) > 0 || (result?.failedCount || 0) > 0) {
      console.log('[internal-inspection-reminders] cycle', result);
    }
  } catch (error) {
    console.error('[internal-inspection-reminders] cycle failed', error);
  } finally {
    running = false;
  }
}

export function startInspectionReminderScheduler() {
  if (task) return task;
  if (String(process.env.INTERNAL_INSPECTION_REMINDERS_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('[internal-inspection-reminders] scheduler disabled (INTERNAL_INSPECTION_REMINDERS_ENABLED=false)');
    return null;
  }

  const expression = process.env.INTERNAL_INSPECTION_REMINDERS_CRON || '*/5 * * * *';
  task = cron.schedule(expression, runCycle);
  runCycle().catch(() => {});
  console.log('[internal-inspection-reminders] scheduler started', { cron: expression });
  return task;
}

export function stopInspectionReminderScheduler() {
  if (!task) return;
  task.stop();
  task = null;
}

export default {
  startInspectionReminderScheduler,
  stopInspectionReminderScheduler,
};

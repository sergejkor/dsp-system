import cron from 'node-cron';
import { evMonitoringService, runEvMonitoringCheck } from './evMonitoringService.js';
import { evMonitoringSlackService } from './evMonitoringSlackService.js';
const TIMEZONE = 'Europe/Berlin';
function berlinDate(value) { return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
export function createEvMonitoringScheduler({ schedule = cron.schedule, check = runEvMonitoringCheck, latest = evMonitoringService.latest, deliver = evMonitoringSlackService.deliver, now = () => new Date() } = {}) {
  let task; let retryTask;
  const tick = async () => { const result = await check({ trigger: 'scheduled' }); return deliver(result); };
  const retry = async () => { const result = await latest(); return result && result.storedAt && berlinDate(new Date(result.storedAt)) === berlinDate(now()) ? deliver(result) : { status: 'no_result' }; };
  return { tick, retry, start() {
    if (!task) task = schedule('0 6 * * *', () => { void tick().catch(() => console.error('[ev-monitoring] scheduler failed')); }, { timezone: TIMEZONE });
    if (!retryTask) retryTask = schedule('0-30 6 * * *', () => { void retry().catch(() => console.error('[ev-monitoring] Slack retry failed')); }, { timezone: TIMEZONE });
    return task;
  } };
}
const scheduler = createEvMonitoringScheduler(); export function startEvMonitoringScheduler() { return scheduler.start(); }

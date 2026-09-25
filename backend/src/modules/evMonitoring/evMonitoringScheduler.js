import cron from 'node-cron';
import { evMonitoringService, runEvMonitoringCheck } from './evMonitoringService.js';
import { evMonitoringSlackService } from './evMonitoringSlackService.js';
function serviceDate(value, timezone) { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
export function createEvMonitoringScheduler({ schedule = cron.schedule, check = runEvMonitoringCheck, latest = evMonitoringService.latest, deliver = evMonitoringSlackService.deliver, now = () => new Date(), environment = () => process.env, log = console.log } = {}) {
  let task; let retryTask;
  const settings = () => { const env = environment(); return { enabled: String(env.EV_MONITORING_ENABLED).toLowerCase() === 'true', timezone: env.EV_MONITORING_TIMEZONE || 'Europe/Berlin' }; };
  const tick = async () => { const result = await check({ trigger: 'scheduled' }); return deliver(result); };
  const retry = async () => { const result = await latest(); const { timezone } = settings(); return result && result.storedAt && serviceDate(new Date(result.storedAt), timezone) === serviceDate(now(), timezone) ? deliver(result) : { status: 'no_result' }; };
  return { tick, retry, start() {
    const { enabled, timezone } = settings(); if (!enabled) { log('EV Monitoring scheduler is disabled.'); return null; }
    if (!task) task = schedule('0 6 * * *', () => { void tick().catch(() => console.error('[ev-monitoring] scheduler failed')); }, { timezone });
    if (!retryTask) retryTask = schedule('0-30 6 * * *', () => { void retry().catch(() => console.error('[ev-monitoring] Slack retry failed')); }, { timezone });
    return task;
  } };
}
const scheduler = createEvMonitoringScheduler(); export function startEvMonitoringScheduler() { return scheduler.start(); }

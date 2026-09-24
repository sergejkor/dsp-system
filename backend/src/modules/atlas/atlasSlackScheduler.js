import cron from 'node-cron';
import {
  deliverAtlasToSlack,
  getAtlasBerlinDate,
  isAtlasSlackRetryWindow,
} from './atlasSlackService.js';

const TIME_ZONE = 'Europe/Berlin';

export function createAtlasSlackRetryScheduler({
  schedule = cron.schedule,
  deliver = deliverAtlasToSlack,
  now = () => new Date(),
} = {}) {
  let scheduledTask;

  async function tick() {
    const current = now();
    if (!isAtlasSlackRetryWindow(current)) return { status: 'outside_window' };
    return deliver(getAtlasBerlinDate(current));
  }

  function start() {
    if (scheduledTask) return scheduledTask;
    scheduledTask = schedule('* * * * *', () => {
      void tick().catch(() => console.error('[atlas] Slack retry scheduler tick failed'));
    }, { timezone: TIME_ZONE });
    return scheduledTask;
  }

  return { start, tick };
}

const defaultScheduler = createAtlasSlackRetryScheduler();

export function startAtlasSlackRetryScheduler() {
  return defaultScheduler.start();
}

export default { startAtlasSlackRetryScheduler };

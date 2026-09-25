import { chromium } from 'playwright';

const queues = new Map();

export async function withPersistentContext(provider, userDataDir, work, { playwright = chromium, headless = true } = {}) {
  if (!userDataDir) {
    const error = new Error(`${provider} browser profile is not configured`);
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const previous = queues.get(provider) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const context = await playwright.launchPersistentContext(userDataDir, { headless });
    try { return await work(context); } finally { await context.close(); }
  });
  queues.set(provider, task);
  try { return await task; } finally { if (queues.get(provider) === task) queues.delete(provider); }
}

export function isAuthenticationFailure(error) {
  return error?.code === 'AUTH_REQUIRED' || /unauthori[sz]ed|forbidden|login|sign.?in|auth/i.test(String(error?.message || ''));
}

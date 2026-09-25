import 'dotenv/config';
import { chromium } from 'playwright';
const provider = String(process.argv[2] || '').toLowerCase();
const config = { rivian: { profile: process.env.EV_MONITORING_RIVIAN_PROFILE_DIR, url: process.env.EV_MONITORING_RIVIAN_URL || 'https://business.rivian.com/vehicles/tracker' }, geotab: { profile: process.env.EV_MONITORING_GEOTAB_PROFILE_DIR, url: process.env.EV_MONITORING_GEOTAB_URL || 'https://my.geotab.com/amazon_de_alui/' } }[provider];
if (!config?.profile) { console.error('Usage: node scripts/ev-monitoring-login.js <rivian|geotab> (with the matching profile directory configured)'); process.exit(1); }
const context = await chromium.launchPersistentContext(config.profile, { headless: false }); const page = context.pages()[0] || await context.newPage(); await page.goto(config.url); console.log('Log in manually in this browser. Close the browser window when the authenticated destination is reached.'); await new Promise((resolve) => context.browser()?.on('disconnected', resolve));

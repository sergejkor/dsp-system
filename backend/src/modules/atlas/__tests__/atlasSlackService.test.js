import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptAtlasSlackDeliverySafely,
  createAtlasSlackService,
  formatAtlasSlackMessage,
  isAtlasSlackReady,
} from '../atlasSlackService.js';
import { persistAtlasEmailThenAttemptSlack } from '../atlasSyncService.js';

function createFakeDb({
  hasEmail = true,
  routes = [],
  invalidAssignments = 0,
  now = () => new Date('2026-09-25T06:00:00.000Z'),
} = {}) {
  const state = { delivery: null, released: 0 };
  const client = {
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      if (text.includes('pg_advisory_unlock')) return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      if (text.includes('SELECT status,') && text.includes('FROM atlas_slack_deliveries')) {
        const delivery = state.delivery;
        if (!delivery) return { rows: [], rowCount: 0 };
        const minute = Math.floor(now().getTime() / 60_000);
        return { rows: [{
          status: delivery.status,
          attempted_this_minute: delivery.lastAttemptMinute === minute,
          sending_is_fresh: delivery.status === 'sending' && now().getTime() - delivery.lastAttemptAt < 300_000,
        }], rowCount: 1 };
      }
      if (text.includes('FROM incoming_emails')) return { rows: [{ exists: hasEmail }], rowCount: 1 };
      if (text.includes('FROM atlas_shipments shipment')) {
        const rows = routes.flatMap((route) => Array.from({ length: route.shipmentCount }, (_, index) => ({
          route_code: route.routeCode,
          tracking_id: `${route.routeCode}-${index + 1}`,
          driver_name: route.driverName,
          match_status: route.matchStatus,
        })));
        return { rows, rowCount: rows.length };
      }
      if (text.includes('COUNT(*) FILTER')) {
        return { rows: [{ invalid_count: invalidAssignments }], rowCount: 1 };
      }
      if (text.startsWith('INSERT INTO atlas_slack_deliveries')) {
        const minute = Math.floor(now().getTime() / 60_000);
        state.delivery = {
          status: 'sending',
          payloadHash: params[1],
          attemptCount: (state.delivery?.attemptCount || 0) + 1,
          lastAttemptMinute: minute,
          lastAttemptAt: now().getTime(),
        };
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("SET status = 'failed'")) {
        if (state.delivery) {
          state.delivery.status = 'failed';
          state.delivery.lastError = params[1];
        }
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("SET status = 'sent'")) {
        if (state.delivery) state.delivery.status = 'sent';
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected fake database query: ${text.slice(0, 100)}`);
    },
    release() { state.released += 1; },
  };
  return { state, pool: { async connect() { return client; } } };
}

function readyRoutes() {
  return [
    { routeCode: 'CA_A124', driverName: 'Gennadiy Konika', matchStatus: 'MATCHED', shipmentCount: 4 },
    { routeCode: 'CA_A120', driverName: 'Jamal Hamud', matchStatus: 'MATCHED', shipmentCount: 2 },
  ];
}

function createService({ routes = readyRoutes(), hasEmail = true, invalidAssignments = 0, now, fetchImpl } = {}) {
  const db = createFakeDb({ routes, hasEmail, invalidAssignments, now });
  const service = createAtlasSlackService({
    dbPool: db.pool,
    fetchImpl: fetchImpl || (async () => ({ ok: true, status: 200 })),
    environment: () => ({ ATLAS_SLACK_ENABLED: 'true', ATLAS_SLACK_WEBHOOK_URL: 'https://example.invalid/test-hook' }),
    now,
  });
  return { ...db, ...service };
}

test('all routes must be MATCHED and have a driver and shipments before Slack is ready', () => {
  assert.equal(isAtlasSlackReady({ hasEmail: true, routes: readyRoutes() }), true);
  assert.equal(isAtlasSlackReady({ hasEmail: true, routes: [{ ...readyRoutes()[0], matchStatus: 'UNMATCHED' }] }), false);
  assert.equal(isAtlasSlackReady({ hasEmail: true, routes: [{ ...readyRoutes()[0], matchStatus: 'AMBIGUOUS' }] }), false);
  assert.equal(isAtlasSlackReady({ hasEmail: true, routes: [] }), false);
  assert.equal(isAtlasSlackReady({ hasEmail: false, routes: readyRoutes() }), false);
});

test('message sorts routes and includes driver names, shipment counts, date, and footer', () => {
  const message = formatAtlasSlackMessage('2026-09-25', readyRoutes());
  assert.match(message, /Atlas Shipments – 25\.09\.2026/);
  assert.ok(message.indexOf('CA_A120') < message.indexOf('CA_A124'));
  assert.match(message, /CA_A120\s+Jamal Hamud\s+x2/);
  assert.match(message, /CA_A124\s+Gennadiy Konika\s+x4/);
  assert.match(message, /6 Sendungen · 2 Routen/);
  assert.match(message, /2\/2 Fahrer zugeordnet/);
  assert.match(message, /Automatisch erstellt durch LightCore/);
});

test('unmatched, ambiguous, and empty Atlas results do not send', async () => {
  const cases = [
    { routes: [{ ...readyRoutes()[0], matchStatus: 'UNMATCHED' }] },
    { routes: [{ ...readyRoutes()[0], matchStatus: 'AMBIGUOUS' }] },
    { routes: [] },
    { routes: readyRoutes(), invalidAssignments: 1 },
  ];
  for (const scenario of cases) {
    let sends = 0;
    const service = createService({ ...scenario, fetchImpl: async () => { sends += 1; return { ok: true, status: 200 }; } });
    const result = await service.deliverAtlasToSlack('2026-09-25');
    assert.equal(result.status, 'not_ready');
    assert.equal(sends, 0);
  }
});

test('only one successful Slack delivery is made per service date', async () => {
  let sends = 0;
  let sentText;
  const service = createService({ fetchImpl: async (_url, request) => {
    sends += 1;
    sentText = JSON.parse(request.body).text;
    return { ok: true, status: 200 };
  } });
  assert.equal((await service.deliverAtlasToSlack('2026-09-25')).status, 'sent');
  assert.equal((await service.deliverAtlasToSlack('2026-09-25')).status, 'already_sent');
  assert.equal(sends, 1);
  assert.match(service.state.delivery.payloadHash, /^[a-f0-9]{64}$/);
  assert.match(sentText, /CA_A120/);
});

test('failed webhook attempt is retried on a later minute', async () => {
  let current = new Date('2026-09-25T06:00:00.000Z');
  let sends = 0;
  const service = createService({
    now: () => current,
    fetchImpl: async () => {
      sends += 1;
      return sends === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    },
  });
  assert.equal((await service.deliverAtlasToSlack('2026-09-25')).status, 'failed');
  assert.equal(service.state.delivery.lastError, 'http_503');
  assert.equal((await service.deliverAtlasToSlack('2026-09-25')).status, 'retry_throttled');
  assert.equal(sends, 1);
  current = new Date(current.getTime() + 60_000);
  assert.equal((await service.deliverAtlasToSlack('2026-09-25')).status, 'sent');
  assert.equal(sends, 2);
  assert.equal(service.state.delivery.attemptCount, 2);
});

test('Slack failure is contained after email persistence and does not expose webhook configuration', async () => {
  let persistenceCompleted = false;
  const persisted = await persistAtlasEmailThenAttemptSlack(
    '2026-09-25',
    async () => { persistenceCompleted = true; return 'email-1'; },
    async () => { throw new Error('transport failed'); },
  );
  assert.equal(persistenceCompleted, true);
  assert.equal(persisted, 'email-1');
  const result = await attemptAtlasSlackDeliverySafely('2026-09-25', async () => { throw new Error('offline'); });
  assert.equal(result.status, 'failed');
});

test('historical dates are not automatically sent', async () => {
  let sends = 0;
  const service = createService({ fetchImpl: async () => { sends += 1; return { ok: true, status: 200 }; } });
  assert.equal((await service.deliverAtlasToSlack('2026-09-24')).status, 'historical_date');
  assert.equal(sends, 0);
});

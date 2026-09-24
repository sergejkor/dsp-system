import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtlasQueryService } from '../atlasQueryService.js';

test('Atlas read result counts routes and shipments and keeps tracking IDs with their route', async () => {
  const service = createAtlasQueryService({
    queryFn: async (sql) => {
      if (sql.includes('FROM incoming_emails')) return { rows: [{ exists: true }] };
      if (sql.includes('WITH shipment_routes')) return { rows: [
        { route_code: 'CA_A120', driver_name: 'Jamal Hamud', match_status: 'MATCHED', shipment_count: 2, tracking_ids: ['T-002', 'T-001'] },
        { route_code: 'CA_A124', driver_name: null, match_status: 'UNMATCHED', shipment_count: 1, tracking_ids: ['T-003'] },
      ] };
      if (sql.includes('FROM atlas_slack_deliveries')) return { rows: [{ status: 'sent', sent_at: '2026-09-25T06:05:00.000Z' }] };
      throw new Error('Unexpected read query');
    },
  });

  const previousWebhook = process.env.ATLAS_SLACK_WEBHOOK_URL;
  const testWebhook = 'https://example.invalid/secret-test-value';
  process.env.ATLAS_SLACK_WEBHOOK_URL = testWebhook;
  let result;
  try {
    result = await service.getAtlasResultForDate('2026-09-25');
  } finally {
    if (previousWebhook === undefined) delete process.env.ATLAS_SLACK_WEBHOOK_URL;
    else process.env.ATLAS_SLACK_WEBHOOK_URL = previousWebhook;
  }
  assert.equal(result.serviceDate, '2026-09-25');
  assert.equal(result.hasEmail, true);
  assert.deepEqual(result.summary, { shipments: 3, routes: 2, matched: 1, unmatched: 1, ambiguous: 0 });
  assert.deepEqual(result.slack, { status: 'sent', sentAt: '2026-09-25T06:05:00.000Z' });
  assert.deepEqual(result.routes[0], {
    routeCode: 'CA_A120', driverName: 'Jamal Hamud', matchStatus: 'MATCHED',
    shipmentCount: 2, trackingIds: ['T-001', 'T-002'],
  });
  assert.deepEqual(result.routes[1].trackingIds, ['T-003']);
  assert.equal(JSON.stringify(result).includes(testWebhook), false);
});

test('missing route assignment is represented as UNMATCHED without a guessed driver', async () => {
  const service = createAtlasQueryService({
    queryFn: async (sql) => {
      if (sql.includes('FROM incoming_emails')) return { rows: [{ exists: false }] };
      if (sql.includes('WITH shipment_routes')) return { rows: [
        { route_code: 'CA_A128', driver_name: null, match_status: 'UNMATCHED', shipment_count: 1, tracking_ids: ['T-128'] },
      ] };
      if (sql.includes('FROM atlas_slack_deliveries')) return { rows: [] };
      throw new Error('Unexpected read query');
    },
  });
  const result = await service.getAtlasResultForDate('2026-09-25');
  assert.equal(result.hasEmail, false);
  assert.equal(result.summary.unmatched, 1);
  assert.equal(result.routes[0].driverName, null);
  assert.equal(result.slack.status, 'not_sent');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAtlasShipments } from '../atlasEmailParser.js';

const sample = `Good morning,

Please find below the list of your Atlas shipment of the day

Tracking ID - Route code - Transporter ID

DE5877031713 - CA_A120 -
DE5880541189 - CA_A120 -
DE5878696839 - CA_A123 -
DE5876363415 - CA_A124 -
DE5878287191 - CA_A124 -
DE5879960757 - CA_A124 -
DE5876834108 - CA_A124 -
DE5878478698 - CA_A126 -
DE5880944083 - CA_A128 -
DE5871496004 - CA_A132 -
DE5880692975 - CA_A135 -
DE5880027655 - CA_A135 -

Best regards,

Amazon Deutschland S29 Transport GmbH`;

test('parses the complete real sample and exact route counts', () => {
  const shipments = parseAtlasShipments(sample);
  assert.equal(shipments.length, 12);
  assert.equal(new Set(shipments.map(({ routeCode }) => routeCode)).size, 7);
  const counts = Object.fromEntries([...new Set(shipments.map(({ routeCode }) => routeCode))]
    .map((route) => [route, shipments.filter(({ routeCode }) => routeCode === route).length]));
  assert.deepEqual(counts, {
    CA_A120: 2, CA_A123: 1, CA_A124: 4, CA_A126: 1, CA_A128: 1, CA_A132: 1, CA_A135: 2,
  });
  assert.ok(shipments.every(({ transporterId }) => transporterId === null));
  assert.ok(!shipments.some(({ trackingId }) => /Amazon|regards/i.test(trackingId)));
});

test('deduplicates identical tracking rows and ignores signature text', () => {
  const shipments = parseAtlasShipments(`${sample}\nDE5877031713 - CA_A120 -\nAmazon Deutschland S29 Transport GmbH`);
  assert.equal(shipments.length, 12);
});

test('fails clearly for conflicting duplicate tracking IDs', () => {
  assert.throws(() => parseAtlasShipments(`${sample}\nDE5877031713 - CA_A999 -`), /Conflicting Atlas shipment.*DE5877031713/);
});

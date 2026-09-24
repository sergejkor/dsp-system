import test from 'node:test';
import assert from 'node:assert/strict';
import { toAtlasServiceDate } from '../atlasDateUtils.js';

test('converts the sample email date to the Berlin service date', () => {
  assert.equal(toAtlasServiceDate(new Date('2026-09-24T08:04:00.000Z')), '2026-09-24');
});

test('uses Berlin date when it differs from UTC date near midnight', () => {
  assert.equal(toAtlasServiceDate(new Date('2026-09-23T22:30:00.000Z')), '2026-09-24');
});

test('rejects invalid dates', () => {
  assert.throws(() => toAtlasServiceDate('not-a-date'), /Invalid Atlas email date/);
});

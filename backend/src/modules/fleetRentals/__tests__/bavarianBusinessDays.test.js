import test from 'node:test';
import assert from 'node:assert/strict';
import { bavarianBusinessDays as count } from '../../../../../frontend/src/utils/bavarianBusinessDays.js';

test('business days count Saturdays and inclusive endpoints, excluding Sundays', () => {
  assert.equal(count('2026-09-21', '2026-09-27'), 6);
  assert.equal(count('2026-09-26', '2026-09-26'), 1);
  assert.equal(count('2026-09-27', '2026-09-27'), 0);
  assert.equal(count('2026-09-01', '2026-09-30'), 26);
});
test('fixed holidays include Saturday holidays without double subtracting Sundays', () => {
  for (const day of ['01-01', '01-06', '05-01', '10-03', '11-01', '12-25', '12-26']) {
    assert.equal(count(`2026-${day}`, `2026-${day}`), 0);
  }
  assert.equal(count('2026-10-31', '2026-11-02'), 2);
});
test('movable Easter holidays and DST transitions are calculated per year', () => {
  for (const day of ['2026-04-03', '2026-04-06', '2026-05-14', '2026-05-25', '2026-06-04', '2027-03-26', '2027-03-29', '2027-05-06', '2027-05-17', '2027-05-27']) {
    assert.equal(count(day, day), 0, day);
  }
  assert.equal(count('2026-04-03', '2026-04-06'), 1);
  assert.equal(count('2026-03-28', '2026-03-30'), 2);
});
test('cross-year, leap-day, local holidays and missing dates', () => {
  assert.equal(count('2026-12-24', '2027-01-06'), 8);
  assert.equal(count('2024-02-28', '2024-03-02'), 4);
  assert.equal(count('2026-08-08', '2026-08-15'), 7);
  for (const [from, to] of [['', '2026-09-01'], ['2026-09-02', '2026-09-01'], ['2026-02-30', '2026-03-01']]) assert.equal(count(from, to), null);
});

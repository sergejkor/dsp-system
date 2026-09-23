import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRental, RENTAL_SOURCES } from '../rentalValidation.js';
import { rentalTotals, monthRentalCost, rentalStatus, rentalSource, rentalOverlapsMonth, rentalPricingFields, updateRentalPricing } from '../../../../../frontend/src/utils/rentalCalculations.js';

test('LMR, Rental and Self source have distinct types', () => {
  assert.equal(rentalSource({ fleet_provider: ' LMR ' }), 'lmr');
  assert.equal(rentalSource({ fleet_provider: 'Rental' }), 'rental');
  assert.equal(rentalSource({ fleet_provider: 'Self source' }), 'self');
});

test('calendar only includes rental periods intersecting the selected month', () => {
  const visible = (from, to) => rentalOverlapsMonth({ active_from: from, active_to: to }, '2026-09-01', '2026-09-30');
  assert.equal(visible('2026-08-01', '2026-08-31'), false);
  assert.equal(visible('2026-10-01', '2026-10-31'), false);
  assert.equal(visible(null, null), false);
  assert.equal(visible('2026-08-01', '2026-09-01'), true);
  assert.equal(visible('2026-09-30', '2026-10-31'), true);
  assert.equal(visible('2026-09-01', '2026-09-10'), true);
});

const rental = { active_from: '2026-03-28', active_to: '2026-03-30', daily_rate: '49.99', daily_km: '100',
  odometer_start: '1000', odometer_end: '1350', extra_km_rate: '0.25', revision: 'test' };

test('contract totals retain exact amounts despite rounded daily equivalents', () => {
  const form = { ...rental, total_price: '100', total_km: '1000' };
  assert.equal(rentalPricingFields(form).daily_rate, 33.33);
  assert.equal(rentalPricingFields(form).daily_km, 333.33);
  assert.equal(rentalTotals(form).base, 100);
  assert.equal(rentalTotals(form).allowance, 1000);
  const saved = validateRental(form);
  assert.equal(saved.daily_rate, 33.33);
  assert.equal(saved.daily_km, 333.33);
  assert.equal(rentalTotals(saved).base, 100);
  assert.equal(rentalTotals(saved).allowance, 1000);
});

test('editing either side changes the basis independently for price and kilometres', () => {
  let form = updateRentalPricing(rental, 'total_price', '100');
  form = updateRentalPricing(form, 'total_km', '1000');
  assert.equal(rentalPricingFields(form).daily_rate, 33.33);
  form = updateRentalPricing(form, 'daily_rate', '50');
  assert.equal(rentalPricingFields(form).total_price, 150);
  assert.equal(rentalPricingFields(form).total_km, '1000');
  form = updateRentalPricing(form, 'daily_km', '200');
  assert.equal(rentalPricingFields(form).total_km, 600);
});

test('date changes preserve the last entered side and empty input clears the pair', () => {
  const form = updateRentalPricing({ ...rental, total_price: '100', total_km: '1000' }, 'active_to', '2026-03-31');
  assert.equal(rentalPricingFields(form).daily_rate, 25);
  assert.equal(rentalPricingFields(form).daily_km, 250);
  const daily = updateRentalPricing(rental, 'active_to', '2026-03-31');
  assert.equal(rentalPricingFields(daily).total_price, 199.96);
  assert.equal(rentalPricingFields(daily).total_km, 400);
  assert.equal(rentalPricingFields(updateRentalPricing(form, 'total_price', '')).daily_rate, '');
  assert.equal(rentalPricingFields(updateRentalPricing(form, 'daily_km', '')).total_km, '');
  assert.equal(rentalTotals({ ...form, total_price: '0', total_km: '0' }).base, 0);
});

test('fixed totals prorate by actual contract days for monthly cost', () => {
  const form = { ...rental, active_from: '2026-03-30', active_to: '2026-04-01', total_price: '100' };
  assert.equal(monthRentalCost(form, '2026-03-01', '2026-03-31'), 66.67);
  assert.equal(monthRentalCost(form, '2026-04-01', '2026-04-30'), 33.33);
});

test('includes pickup and return days across DST and calculates excess mileage', () => {
  assert.deepEqual(rentalTotals(rental), { days: 3, base: 149.97, allowance: 300, driven: 350, difference: 50, extra: 12.5, total: 162.47 });
});
test('same-day rentals count once, leap day and year boundary work', () => {
  assert.equal(rentalTotals({ ...rental, active_to: rental.active_from }).days, 1);
  assert.equal(rentalTotals({ active_from: '2024-02-28', active_to: '2024-03-01' }).days, 3);
  assert.equal(rentalTotals({ active_from: '2025-12-31', active_to: '2026-01-01' }).days, 2);
});
test('negative balance never creates a mileage refund', () => {
  const totals = rentalTotals({ ...rental, odometer_end: '1200', extra_km_rate: '' });
  assert.equal(totals.difference, -100);
  assert.equal(totals.extra, 0);
  assert.equal(totals.total, 149.97);
});
test('unknown readings and rates are not treated as zero', () => {
  assert.equal(rentalTotals({ ...rental, odometer_end: '' }).total, null);
  assert.equal(rentalTotals({ ...rental, daily_rate: null }).base, null);
  assert.equal(rentalTotals({ ...rental, daily_km: '' }).allowance, null);
  assert.equal(rentalTotals({ ...rental, extra_km_rate: '' }).extra, null);
  assert.equal(rentalTotals({ ...rental, odometer_start: 0, odometer_end: 0 }).driven, 0);
});
test('monthly totals clip periods at both month boundaries', () => {
  assert.equal(monthRentalCost({ ...rental, active_from: '2026-02-25', active_to: '2026-04-05' }, '2026-03-01', '2026-03-31'), 1549.69);
  assert.equal(monthRentalCost(rental, '2026-04-01', '2026-04-30'), null);
});
test('statuses include last day and distinguish incomplete dates', () => {
  assert.equal(rentalStatus(rental, '2026-03-30'), 'active');
  assert.equal(rentalStatus(rental, '2026-03-31'), 'ended');
  assert.equal(rentalStatus(rental, '2026-03-27'), 'upcoming');
  assert.equal(rentalStatus({ ...rental, active_to: null }, '2026-03-28'), 'missing');
});
test('validation preserves explicit zero and blanks', () => {
  const out = validateRental({ ...rental, daily_rate: 0, daily_km: '', notes: ' contract ' });
  assert.equal(out.daily_rate, 0);
  assert.equal(out.daily_km, null);
  assert.equal(out.notes, 'contract');
  assert.ok(RENTAL_SOURCES.includes('self source'));
});
test('rejects invalid, reversed and partial dates', () => {
  for (const change of [{ active_from: '2026-02-30' }, { active_from: '' }, { active_to: '2025-01-01' }, { active_from: '2026-1-01' }]) {
    assert.throws(() => validateRental({ ...rental, ...change }), { status: 400 });
    assert.equal(rentalTotals({ ...rental, ...change }).days, null);
  }
});
test('rejects negative, non-numeric, overprecise and excessive amounts', () => {
  for (const value of [-1, Infinity, NaN, true, ' ', 'hello', '1.001', '9999999999']) {
    assert.throws(() => validateRental({ ...rental, daily_rate: value }), { status: 400 });
  }
  assert.equal(validateRental({ ...rental, extra_km_rate: '0.1234' }).extra_km_rate, 0.1234);
});
test('rejects inconsistent mileage and oversized notes', () => {
  assert.throws(() => validateRental({ ...rental, odometer_end: 900 }), { status: 400 });
  assert.throws(() => validateRental({ ...rental, odometer_start: '' }), { status: 400 });
  assert.throws(() => validateRental({ ...rental, notes: 'x'.repeat(5001) }), { status: 400 });
  assert.throws(() => validateRental({ ...rental, revision: undefined }), { status: 400 });
});

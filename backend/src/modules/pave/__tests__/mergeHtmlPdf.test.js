import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeHtmlAndPdfReportSummary,
  isGarbageVehicleLabel,
  isLikelyWrongVinFromDom,
} from '../gmail/providers/pave/extractPaveReportSummaryFromPage.js';

test('isGarbageVehicleLabel rejects UI headings', () => {
  assert.equal(isGarbageVehicleLabel('INFORMATION'), true);
  assert.equal(isGarbageVehicleLabel('  information  '), true);
  assert.equal(isGarbageVehicleLabel('2026 MERCEDES ESPRINTER L2H3'), false);
});

test('isGarbageVehicleLabel rejects exterior/interior colour blob', () => {
  assert.equal(
    isGarbageVehicleLabel('EXTERIOR COLOUR Blue Velvet Metallic INTERIOR COLOUR n/a'),
    true,
  );
});

test('isLikelyWrongVinFromDom detects composite vehicle line in VIN field', () => {
  assert.equal(isLikelyWrongVinFromDom('YEAR, MAKE, MODEL 2026 MERCEDES ESPRINTER L2H3'), true);
  assert.equal(isLikelyWrongVinFromDom('W1V3UBFZ*T***4862'), false);
});

test('merge ignores garbage HTML vehicle; email subject vehicle wins', () => {
  const merged = mergeHtmlAndPdfReportSummary(
    { vehicle_label: 'INFORMATION', vin_display: 'W1V3UBFZ*T***8041' },
    {},
    { vehicle_label: '2026 MERCEDES ESPRINTER L2H3' },
  );
  assert.equal(merged.vehicle_label, '2026 MERCEDES ESPRINTER L2H3');
  assert.equal(merged.vin_display, 'W1V3UBFZ*T***8041');
});

test('merge prefers HTML side/damage scores over PDF when both set', () => {
  const merged = mergeHtmlAndPdfReportSummary(
    { front_score: 90, back_score: 80, total_damage_score: 12 },
    { front_score: 10, back_score: 20, total_damage_score: 99 },
    {},
  );
  assert.equal(merged.front_score, 90);
  assert.equal(merged.back_score, 80);
  assert.equal(merged.total_damage_score, 12);
});

test('merge falls back to PDF scores when HTML missing', () => {
  const merged = mergeHtmlAndPdfReportSummary(
    { vin_display: 'X' },
    { left_score: 70, right_score: 71 },
    {},
  );
  assert.equal(merged.left_score, 70);
  assert.equal(merged.right_score, 71);
});

test('merge ignores mis-assigned HTML VIN; uses PDF VIN', () => {
  const merged = mergeHtmlAndPdfReportSummary(
    { vin_display: 'YEAR, MAKE, MODEL 2026 MERCEDES ESPRINTER L2H3' },
    { vin: 'W1V3UBFZ*T***4862' },
    {},
  );
  assert.equal(merged.vin, 'W1V3UBFZ*T***4862');
  assert.equal(merged.vin_display, 'W1V3UBFZ*T***4862');
});

test('merge ignores colour blob HTML vehicle; uses PDF vehicle', () => {
  const merged = mergeHtmlAndPdfReportSummary(
    {
      vehicle_label: 'EXTERIOR COLOUR Blue Velvet Metallic INTERIOR COLOUR n/a',
      vin_display: 'W1V3UBFZ*T***4862',
    },
    { vehicle_label: '2026 MERCEDES ESPRINTER L2H3', vin: 'W1V3UBFZ*T***4862' },
    {},
  );
  assert.equal(merged.vehicle_label, '2026 MERCEDES ESPRINTER L2H3');
});

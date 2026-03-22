import test from 'node:test';
import assert from 'node:assert/strict';
import parsePavePdf, {
  normalizePdfText,
  extractSummaryField,
  extractVehicleCompositeFromPdfText,
  inferSideFromComponent,
  extractDamageItems,
} from '../gmail/providers/pave/parsePavePdf.js';

test('normalizePdfText compacts whitespace', () => {
  const raw = 'A\t\tB\r\n\r\n\r\nC  D';
  assert.equal(normalizePdfText(raw), 'A B\n\nC D');
});

test('extractSummaryField supports label variations', () => {
  const text = `
    Inspection Date: 2026-03-19
    Vehicle: 2021 MERCEDES 314 CDI SPRINTER
    VIN: WDB12345678901234
    Front Score: 88
    Rear Score: 84
    Left Score: 75
    Right Score: 77
    Total Damage Score: 34
    Total Grade: 92
    Windshield Status: OK
  `;
  assert.equal(extractSummaryField(text, 'inspection_date'), '2026-03-19');
  assert.equal(extractSummaryField(text, 'vehicle_label'), '2021 MERCEDES 314 CDI SPRINTER');
  assert.equal(extractSummaryField(text, 'vin'), 'WDB12345678901234');
  assert.equal(extractSummaryField(text, 'front_score'), '88');
  assert.equal(extractSummaryField(text, 'back_score'), '84');
});

test('inferSideFromComponent resolves side tokens', () => {
  assert.equal(inferSideFromComponent('Left Roof Line'), 'Left');
  assert.equal(inferSideFromComponent('Rear Right Door'), 'Right');
  assert.equal(inferSideFromComponent('Front Bumper'), 'Front');
});

test('extractSummaryField German PAVE labels', () => {
  const text = `
    INSPEKTIONSDATUM: 19.03.2026
    FIN: WDB***********1234
    Links 75
    Rechts 77
    Vorne 88
    Hinten 84
    GESAMTNOTE 4 / 5
    Gesamtschadenpunktzahl 34
  `;
  assert.equal(extractSummaryField(text, 'inspection_date'), '19.03.2026');
  assert.match(String(extractSummaryField(text, 'vin') || ''), /WDB/);
  assert.equal(extractSummaryField(text, 'left_score'), '75');
  assert.equal(extractSummaryField(text, 'right_score'), '77');
  assert.equal(extractSummaryField(text, 'front_score'), '88');
  assert.equal(extractSummaryField(text, 'back_score'), '84');
  assert.equal(extractSummaryField(text, 'total_grade'), '4 / 5');
  assert.equal(extractSummaryField(text, 'total_damage_score'), '34');
});

test('extractVehicleCompositeFromPdfText finds year make model', () => {
  const text = 'BAUJAHR, MARKE, MODELL 2019 PEUGEOT BOXER\nINSPEKTIONSDATUM 01.01.2025';
  assert.equal(extractVehicleCompositeFromPdfText(text), '2019 PEUGEOT BOXER');
});

test('extractDamageItems parses German damage section', () => {
  const text = `
    Schadenübersicht
    Links Tür Kratzer mittel Lackierung 72
    Hinten Stoßstange Delle hoch Austausch 41
    Zusammenfassung
  `;
  const items = extractDamageItems(text);
  assert.ok(items.length >= 1);
  assert.ok(items.some((i) => i.side === 'Left' || i.side === 'Back'));
});

test('extractDamageItems parses multiple rows', () => {
  const text = `
    Damage Overview
    Left Roof Line Scratch Medium Repair 72
    Right Rocker Panel Dent High Replace 41
    Rear Right Door Crack Low Paint 55
    Summary
  `;
  const items = extractDamageItems(text);
  assert.ok(items.length >= 2);
  assert.ok(items.some((i) => i.side === 'Left'));
  assert.ok(items.some((i) => i.component && /Rocker Panel/i.test(i.component)));
});

test('parsePavePdf returns partial on invalid buffer', async () => {
  const result = await parsePavePdf(Buffer.from('not a pdf'));
  assert.ok(result);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length > 0);
  assert.ok(Array.isArray(result.items));
});


import test from 'node:test';
import assert from 'node:assert/strict';
import parsePaveEmail from '../gmail/providers/pave/parsePaveEmail.js';
import { isIncomingParseRicher } from '../services/paveDedupeService.js';

test('parsePaveEmail extracts deterministic fields', () => {
  const subject = 'our inspection AMDE-JWLICL014X of 2021 MERCEDES 314 CDI SPRINTER is completed';
  const rawBodyText = 'Please see report: https://dashboard.paveapi.com/park/AMDE-JWLICL014X?l=en';
  const parsed = parsePaveEmail({
    subject,
    fromEmail: 'noreply@paveapi.com',
    rawBodyText,
    rawBodyHtml: '',
  });

  assert.equal(parsed.provider, 'pave');
  assert.equal(parsed.external_report_id, 'AMDE-JWLICL014X');
  assert.equal(parsed.vehicle_label, '2021 MERCEDES 314 CDI SPRINTER');
  assert.equal(parsed.report_url, 'https://dashboard.paveapi.com/park/AMDE-JWLICL014X?l=en');
  assert.equal(parsed.language, 'en');
  assert.equal(parsed.status, 'completed');
});

test('isIncomingParseRicher true when incoming has more summary fields', () => {
  const existing = {
    provider: 'pave',
    external_report_id: 'X1',
    item_count: 1,
    total_grade: null,
    vin: null,
  };
  const incoming = {
    provider: 'pave',
    external_report_id: 'X1',
    total_grade: 91,
    vin: 'WDB123',
    vehicle_label: '2021 MERCEDES 314 CDI SPRINTER',
  };
  const richer = isIncomingParseRicher(existing, incoming, [{}, {}]);
  assert.equal(richer, true);
});

test('isIncomingParseRicher false when incoming is poorer', () => {
  const existing = {
    provider: 'pave',
    external_report_id: 'X1',
    item_count: 3,
    total_grade: 90,
    vin: 'WDB12345678901234',
    vehicle_label: '2021 MERCEDES',
  };
  const incoming = {
    provider: 'pave',
    external_report_id: 'X1',
    total_grade: null,
    vin: null,
  };
  const richer = isIncomingParseRicher(existing, incoming, []);
  assert.equal(richer, false);
});


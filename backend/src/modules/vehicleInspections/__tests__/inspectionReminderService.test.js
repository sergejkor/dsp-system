import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInspectionUrl,
  normalizeReminderConfig,
  renderReminderMessage,
} from '../inspectionReminderService.js';
import { normalizePhoneForWhatsApp } from '../twilioWhatsAppService.js';

test('normalizeReminderConfig applies defaults and clamps interval', () => {
  const config = normalizeReminderConfig({
    enabled: { value: true },
    reminder_start_time: { value: '07:15' },
    reminder_interval_minutes: { value: 2 },
    public_base_url: { value: 'https://fleetcheck.alfamile.com/' },
    default_country_code: { value: '+49' },
  });

  assert.equal(config.enabled, true);
  assert.equal(config.reminderStartTime, '07:15');
  assert.equal(config.reminderStartHours, 7);
  assert.equal(config.reminderStartMinutes, 15);
  assert.equal(config.reminderIntervalMinutes, 5);
  assert.equal(config.publicBaseUrl, 'https://fleetcheck.alfamile.com/');
  assert.equal(config.defaultCountryCode, '+49');
});

test('buildInspectionUrl appends VIN to FleetCheck public URL', () => {
  assert.equal(
    buildInspectionUrl('https://fleetcheck.alfamile.com/', 'W1VTEST123'),
    'https://fleetcheck.alfamile.com/fleet-check?vin=W1VTEST123',
  );
  assert.equal(
    buildInspectionUrl('https://fleetcheck.alfamile.com', ''),
    'https://fleetcheck.alfamile.com/fleet-check',
  );
});

test('renderReminderMessage replaces placeholders with variables', () => {
  const output = renderReminderMessage(
    'Hi {{driverName}}, inspect {{licensePlate}} here: {{inspectionUrl}}',
    {
      driverName: 'Serge',
      licensePlate: 'MA-AB 1234',
      inspectionUrl: 'https://fleetcheck.alfamile.com/fleet-check?vin=ABC',
    },
  );

  assert.equal(
    output,
    'Hi Serge, inspect MA-AB 1234 here: https://fleetcheck.alfamile.com/fleet-check?vin=ABC',
  );
});

test('normalizePhoneForWhatsApp converts local numbers into whatsapp E.164 format', () => {
  assert.equal(normalizePhoneForWhatsApp('01761234567', '+49'), 'whatsapp:+491761234567');
  assert.equal(normalizePhoneForWhatsApp('whatsapp:+491761234567', '+49'), 'whatsapp:+491761234567');
  assert.equal(normalizePhoneForWhatsApp('invalid-number', '+49'), null);
});

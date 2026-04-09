import test from 'node:test';
import assert from 'node:assert/strict';
import zoneProvider from '../cv/zoneProvider.js';

const VEHICLE_TYPES = ['sprinter_high_roof_long', 'peugeot_boxer', 'rivian_edv'];
const SHOTS = ['front_left', 'left_side', 'rear_left', 'rear', 'rear_right', 'right_side', 'front_right', 'front'];

test('ZoneProvider returns practical zone sets for all vehicle types and shots', () => {
  for (const vehicleType of VEHICLE_TYPES) {
    for (const shot of SHOTS) {
      const zones = zoneProvider.getZones(vehicleType, shot, { width: 960, height: 640 });
      assert.ok(Array.isArray(zones));
      assert.ok(zones.length >= 5, `${vehicleType}/${shot} should expose at least 5 zones`);
      for (const zone of zones) {
        assert.ok(zone.w > 0 && zone.h > 0);
        assert.ok(zone.x >= 0 && zone.y >= 0);
        assert.ok(zone.x + zone.w <= 960);
        assert.ok(zone.y + zone.h <= 640);
      }
    }
  }
});

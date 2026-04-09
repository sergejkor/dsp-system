import sprinterZones from './vehicleConfigs/sprinter_high_roof_long.js';
import boxerZones from './vehicleConfigs/peugeot_boxer.js';
import rivianZones from './vehicleConfigs/rivian_edv.js';

const VEHICLE_ZONE_MAP = {
  sprinter_high_roof_long: sprinterZones,
  peugeot_boxer: boxerZones,
  rivian_edv: rivianZones,
};

export class ZoneProvider {
  getZoneConfig(vehicleType, shotType) {
    const byVehicle = VEHICLE_ZONE_MAP[String(vehicleType || '').trim()];
    if (!byVehicle) {
      throw new Error(`Unsupported vehicle_type for zones: ${vehicleType}`);
    }
    const zones = byVehicle[String(shotType || '').trim()];
    if (!Array.isArray(zones) || !zones.length) {
      throw new Error(`Missing zone configuration for ${vehicleType}/${shotType}`);
    }
    return zones;
  }

  getZones(vehicleType, shotType, imageShape) {
    const { width, height } = imageShape || {};
    if (!width || !height) {
      throw new Error('imageShape.width and imageShape.height are required');
    }
    return this.getZoneConfig(vehicleType, shotType).map((zone) => ({
      ...zone,
      x: Math.round(zone.bbox[0] * width),
      y: Math.round(zone.bbox[1] * height),
      w: Math.max(1, Math.round(zone.bbox[2] * width)),
      h: Math.max(1, Math.round(zone.bbox[3] * height)),
    }));
  }
}

export default new ZoneProvider();

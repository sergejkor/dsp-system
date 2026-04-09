import { query } from '../../../db.js';
import vehicleInspectionEvents from '../vehicleInspectionEvents.js';

export class DamageEventPublisher {
  async publishNewDamageEvent(vehicleId, inspectionId, candidateCount, summary = {}) {
    const severity = candidateCount >= 4 ? 'high' : candidateCount >= 2 ? 'medium' : 'low';
    const payload = {
      eventType: 'vehicle_damage_detected',
      vehicleId: String(vehicleId || ''),
      inspectionId: String(inspectionId || ''),
      newDamages: Number(candidateCount || 0),
      severity,
      source: 'inspection_cv_module',
      summary,
    };

    vehicleInspectionEvents.emit('vehicle_damage_detected', payload);
    vehicleInspectionEvents.emit('damage_detected', payload);

    try {
      await query(
        `INSERT INTO vehicle_internal_inspection_events (inspection_id, car_id, event_type, payload_json)
         SELECT $1, i.car_id, $2, $3
         FROM vehicle_internal_inspections i
         WHERE i.id = $1`,
        [Number(inspectionId), payload.eventType, JSON.stringify(payload)],
      );
    } catch (error) {
      console.error('Failed to persist vehicle damage event', error);
    }

    return payload;
  }
}

export default new DamageEventPublisher();

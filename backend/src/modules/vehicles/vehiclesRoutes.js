import { Router } from 'express';
import carsService from '../cars/carsService.js';
import vehicleInspectionsService from '../vehicleInspections/vehicleInspectionsService.js';

const router = Router();

router.get('/by-vin/:vin', async (req, res) => {
  try {
    const vin = String(req.params.vin || '').trim();
    if (!vin) {
      return res.status(400).json({ error: 'VIN is required' });
    }

    const vehicle = await carsService.resolveVehicleByVin(vin);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    if (!vehicle.vehicleType) {
      return res.status(409).json({
        error: 'Vehicle inspection type is not configured for this VIN',
        vehicleId: vehicle.vehicleId,
      });
    }

    return res.json({
      vehicleId: vehicle.vehicleId,
      vehicleType: vehicle.vehicleType,
      carId: vehicle.carId,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      model: vehicle.model,
    });
  } catch (error) {
    console.error('GET /api/vehicles/by-vin/:vin error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to resolve vehicle by VIN') });
  }
});

router.get('/:vehicleId/damage-history', async (req, res) => {
  try {
    const vehicleId = String(req.params.vehicleId || '').trim();
    if (!vehicleId) {
      return res.status(400).json({ error: 'vehicleId is required' });
    }
    const rows = await vehicleInspectionsService.getVehicleDamageHistory(vehicleId);
    return res.json(rows);
  } catch (error) {
    console.error('GET /api/vehicles/:vehicleId/damage-history error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load damage history') });
  }
});

export default router;

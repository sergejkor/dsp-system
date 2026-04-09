import { Router } from 'express';
import carPlanningService from './carPlanningService.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, module: 'car-planning' }));

router.get('/cars', async (_req, res) => {
  try {
    const cars = await carPlanningService.getCarsForPlanning();
    res.json(cars);
  } catch (err) {
    console.error('GET /api/car-planning/cars', err);
    res.status(500).json({ error: err.message || 'Failed to load cars' });
  }
});

router.get('/drivers', async (_req, res) => {
  try {
    const drivers = await carPlanningService.getActiveDrivers();
    res.json(drivers);
  } catch (err) {
    console.error('GET /api/car-planning/drivers', err);
    res.status(500).json({ error: err.message || 'Failed to load drivers' });
  }
});

router.get('/data', async (req, res) => {
  try {
    const datesParam = req.query.dates;
    let dates = [];
    if (typeof datesParam === 'string') {
      dates = datesParam.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const data = await carPlanningService.getPlanningData(dates);
    res.json(data);
  } catch (err) {
    console.error('GET /api/car-planning/data', err);
    res.status(500).json({ error: err.message || 'Failed to load planning data' });
  }
});

router.put('/data', async (req, res) => {
  try {
    const { carStates = {}, slots = [] } = req.body || {};
    await carPlanningService.savePlanningData(carStates, slots);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/car-planning/data', err);
    res.status(400).json({ error: err.message || 'Failed to save planning' });
  }
});

router.get('/report', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) {
      return res.status(400).json({ error: 'Query param date (YYYY-MM-DD) is required' });
    }
    const rows = await carPlanningService.getReport(date);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/car-planning/report', err);
    res.status(500).json({ error: err.message || 'Failed to load report' });
  }
});

router.post('/add-car', async (req, res) => {
  try {
    const { number_plate, vin, source_type, service_type, active_from, active_to } = req.body || {};
    const car = await carPlanningService.addCarWithWindow(
      number_plate,
      vin,
      source_type,
      service_type || null,
      active_from || null,
      active_to || null
    );
    res.json(car);
  } catch (err) {
    console.error('POST /api/car-planning/add-car', err);
    res.status(400).json({ error: err.message || 'Failed to add car' });
  }
});

export default router;

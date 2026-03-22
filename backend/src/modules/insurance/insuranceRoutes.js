import { Router } from 'express';
import { getOverview, listVehicles, getVehicleById, getVehicleByPlate } from './insuranceService.js';
import authMiddleware from '../auth/authMiddleware.js';

const router = Router();

router.use(authMiddleware.requireAuth || ((req, _res, next) => next()));

router.get('/overview', async (req, res) => {
  try {
    const { year } = req.query || {};
    const data = await getOverview(year);
    res.json({ ok: true, overview: data });
  } catch (e) {
    console.error('GET /api/insurance/overview', e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to load overview' });
  }
});

router.get('/vehicles', async (req, res) => {
  try {
    const data = await listVehicles(req.query || {});
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('GET /api/insurance/vehicles', e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to load vehicles' });
  }
});

router.get('/vehicles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid id' });
    }
    const v = await getVehicleById(id);
    if (!v) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, vehicle: v });
  } catch (e) {
    console.error('GET /api/insurance/vehicles/:id', e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to load vehicle' });
  }
});

router.get('/vehicle', async (req, res) => {
  try {
    const { year, plate } = req.query || {};
    const yearInt = Number(year) || new Date().getFullYear();
    const p = String(plate || '').trim();
    if (!p) return res.status(400).json({ ok: false, error: 'Missing plate' });

    const v = await getVehicleByPlate(yearInt, p);
    if (!v) return res.status(404).json({ ok: false, error: 'Not found' });

    res.json({ ok: true, vehicle: v });
  } catch (e) {
    console.error('GET /api/insurance/vehicle', e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to load vehicle' });
  }
});

export default router;


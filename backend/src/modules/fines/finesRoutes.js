import { Router } from 'express';
import finesService from './finesService.js';

const router = Router();

router.get('/employees', async (_req, res) => {
  try {
    const employees = await finesService.getEmployeesForFines();
    res.json(employees);
  } catch (err) {
    console.error('GET /api/fines/employees error', err);
    res.status(500).json({ error: err.message || 'Failed to load employees' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const fines = await finesService.getFines();
    res.json(fines);
  } catch (err) {
    console.error('GET /api/fines error', err);
    res.status(500).json({ error: err.message || 'Failed to load fines' });
  }
});

router.post('/', async (req, res) => {
  try {
    const fine = await finesService.createFine(req.body || {});
    res.status(201).json(fine);
  } catch (err) {
    console.error('POST /api/fines error', err);
    res.status(500).json({ error: err.message || 'Failed to create fine' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const fine = await finesService.updateFine(id, req.body || {});
    res.json(fine);
  } catch (err) {
    console.error('PUT /api/fines/:id error', err);
    res.status(500).json({ error: err.message || 'Failed to update fine' });
  }
});

export default router;


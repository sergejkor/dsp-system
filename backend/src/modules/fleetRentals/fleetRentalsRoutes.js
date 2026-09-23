import { Router } from 'express';
import { requirePermission } from '../auth/authMiddleware.js';
import { listRentals, saveRental, getDrivenRoutes } from './fleetRentalsService.js';

const router = Router();
router.use(requirePermission('page_cars'));
router.get('/driven-routes', async (req, res) => {
  try { res.json(await getDrivenRoutes(req.query.month)); }
  catch (error) {
    if (!error.status) console.error('GET /api/fleet-rentals/driven-routes', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to load driven routes.' });
  }
});
router.get('/', async (_req, res) => {
  try { res.json(await listRentals()); }
  catch (error) {
    console.error('GET /api/fleet-rentals', error);
    res.status(500).json({ error: 'Unable to load rental calendar.' });
  }
});
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid vehicle id.' });
  try { res.json(await saveRental(id, req.body || {})); }
  catch (error) {
    if (!error.status) console.error('PUT /api/fleet-rentals', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to save rental details.' });
  }
});
export default router;

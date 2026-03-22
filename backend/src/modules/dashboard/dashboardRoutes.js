import { Router } from 'express';
import { getDashboardSummary } from './dashboardService.js';

const router = Router();

/**
 * GET /api/dashboard/summary
 * Bundled snapshot for the home dashboard (real DB data).
 */
router.get('/summary', async (_req, res) => {
  try {
    const data = await getDashboardSummary();
    res.json(data);
  } catch (error) {
    console.error('GET /api/dashboard/summary', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

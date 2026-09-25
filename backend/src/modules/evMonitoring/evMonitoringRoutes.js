import { Router } from 'express';
import { evMonitoringService, runEvMonitoringCheck } from './evMonitoringService.js';
const router = Router();
router.post('/refresh', async (_req, res) => { try { res.json(await runEvMonitoringCheck({ trigger: 'page' })); } catch (_error) { const latest = await evMonitoringService.latest(); res.status(502).json({ error: 'LIVE_REFRESH_FAILED', latest }); } });
router.get('/latest', async (_req, res) => { const latest = await evMonitoringService.latest(); if (!latest) return res.status(404).json({ error: 'NO_CHECK_AVAILABLE' }); res.json(latest); });
export default router;

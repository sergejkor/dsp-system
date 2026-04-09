import { Router } from 'express';
import vehicleInspectionsService from './vehicleInspectionsService.js';

const router = Router();
const ALLOWED_ACTIONS = new Set(['confirm_new', 'reject', 'mark_existing', 'uncertain']);

router.get('/queue', async (req, res) => {
  try {
    const rows = await vehicleInspectionsService.listReviewQueue(req.query.limit);
    return res.json(rows);
  } catch (error) {
    console.error('GET /api/review/queue error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load review queue') });
  }
});

router.post('/candidates/:candidateId/action', async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    if (!ALLOWED_ACTIONS.has(action)) {
      return res.status(400).json({ error: 'Invalid review action' });
    }
    const analysis = await vehicleInspectionsService.applyCandidateReviewAction(
      req.params.candidateId,
      req.body?.inspectionId,
      req.user?.id || null,
      action,
      req.body?.comment,
    );
    if (!analysis) {
      return res.status(404).json({ error: 'Damage candidate not found' });
    }
    return res.json(analysis);
  } catch (error) {
    console.error('POST /api/review/candidates/:candidateId/action error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to save review action') });
  }
});

export default router;

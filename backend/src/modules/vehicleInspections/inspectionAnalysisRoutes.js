import { Router } from 'express';
import vehicleInspectionsService from './vehicleInspectionsService.js';

const router = Router();

router.post('/:inspectionId/analyze', async (req, res) => {
  try {
    const analysis = await vehicleInspectionsService.analyzeInspection(req.params.inspectionId, {
      userId: req.user?.id || null,
    });
    return res.json(analysis);
  } catch (error) {
    console.error('POST /api/inspections/:inspectionId/analyze error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to analyze inspection') });
  }
});

router.get('/:inspectionId/analysis', async (req, res) => {
  try {
    const analysis = await vehicleInspectionsService.getInspectionAnalysis(req.params.inspectionId);
    if (!analysis) {
      return res.status(404).json({ error: 'Inspection analysis not found' });
    }
    return res.json(analysis);
  } catch (error) {
    console.error('GET /api/inspections/:inspectionId/analysis error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load inspection analysis') });
  }
});

export default router;

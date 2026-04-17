import { Router } from 'express';
import authMiddleware from '../auth/authMiddleware.js';
import vehicleInspectionsService from './vehicleInspectionsService.js';

const router = Router();

router.use(authMiddleware.requireAuth);

router.get('/health', async (_req, res) => {
  try {
    await vehicleInspectionsService.ensureVehicleInspectionTables();
    res.json({ ok: true, module: 'vehicle-inspections' });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await vehicleInspectionsService.listInspections({
      search: req.query.search,
      status: req.query.status,
      result: req.query.result,
      carId: req.query.carId,
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (error) {
    console.error('GET /api/fleet-inspections error', error);
    res.status(500).json({ error: String(error?.message || error || 'Failed to load inspections') });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const rows = await vehicleInspectionsService.listInspectionTasks({
      search: req.query.search,
      status: req.query.status,
      carId: req.query.carId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (error) {
    console.error('GET /api/fleet-inspections/tasks error', error);
    res.status(500).json({ error: String(error?.message || error || 'Failed to load inspection tasks') });
  }
});

router.post('/tasks/manual-assign', async (req, res) => {
  try {
    const task = await vehicleInspectionsService.assignInspectionTaskManually(req.body || {});
    res.status(201).json(task);
  } catch (error) {
    console.error('POST /api/fleet-inspections/tasks/manual-assign error', error);
    res.status(400).json({ error: String(error?.message || error || 'Failed to assign inspection manually') });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const deleted = await vehicleInspectionsService.deleteInspectionTask(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Inspection task not found' });
    }
    return res.json(deleted);
  } catch (error) {
    console.error('DELETE /api/fleet-inspections/tasks/:id error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to delete inspection task') });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const inspection = await vehicleInspectionsService.getInspectionById(req.params.id);
    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    return res.json(inspection);
  } catch (error) {
    console.error('GET /api/fleet-inspections/:id error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load inspection') });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await vehicleInspectionsService.deleteInspection(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    return res.json(deleted);
  } catch (error) {
    console.error('DELETE /api/fleet-inspections/:id error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to delete inspection') });
  }
});

router.post('/:id/analyze', async (req, res) => {
  try {
    const analysis = await vehicleInspectionsService.analyzeInspection(req.params.id, {
      userId: req.user?.id || null,
    });
    return res.json(analysis);
  } catch (error) {
    console.error('POST /api/fleet-inspections/:id/analyze error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to analyze inspection') });
  }
});

router.get('/:id/analysis', async (req, res) => {
  try {
    const analysis = await vehicleInspectionsService.getInspectionAnalysis(req.params.id);
    if (!analysis) {
      return res.status(404).json({ error: 'Inspection analysis not found' });
    }
    return res.json(analysis);
  } catch (error) {
    console.error('GET /api/fleet-inspections/:id/analysis error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load inspection analysis') });
  }
});

router.get('/:id/photos/:photoId/download', async (req, res) => {
  try {
    const photo = await vehicleInspectionsService.getInspectionPhoto(req.params.id, req.params.photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Inspection photo not found' });
    }
    res.setHeader('Content-Type', photo.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(photo.file_name || `inspection-photo-${photo.id}.jpg`)}"`);
    return res.send(photo.file_content);
  } catch (error) {
    console.error('GET /api/fleet-inspections/:id/photos/:photoId/download error', error);
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load inspection photo') });
  }
});

export default router;

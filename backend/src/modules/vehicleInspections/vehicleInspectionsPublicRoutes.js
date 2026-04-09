import { Router } from 'express';
import multer from 'multer';
import vehicleInspectionsService from './vehicleInspectionsService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
});

function runPhotoUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.array('photos', 12)(req, res, (error) => {
      if (!error) return resolve();
      return reject(error);
    });
  });
}

function sendMulterError(res, error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A photo is too large. Maximum upload size is 25 MB.' });
    }
    return res.status(400).json({ error: error.message || 'Upload failed' });
  }
  return null;
}

router.get('/health', async (_req, res) => {
  try {
    await vehicleInspectionsService.ensureVehicleInspectionTables();
    res.json({ ok: true, module: 'vehicle-inspections-public' });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/', async (req, res) => {
  try {
    await runPhotoUpload(req, res);
    const inspection = await vehicleInspectionsService.submitInspection(
      {
        vin: req.body?.vin,
        operatorName: req.body?.operatorName,
        vehicleType: req.body?.vehicleType,
        source: req.body?.source,
        notes: req.body?.notes,
        shotTypes: req.body?.shotTypes,
      },
      req.files || [],
    );
    return res.status(201).json(inspection);
  } catch (error) {
    if (sendMulterError(res, error)) return;
    console.error('POST /api/public/fleet-inspections error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to submit inspection') });
  }
});

export default router;

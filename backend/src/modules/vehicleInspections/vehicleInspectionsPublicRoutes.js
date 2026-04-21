import { Router } from 'express';
import multer from 'multer';
import vehicleInspectionsService from './vehicleInspectionsService.js';
import { getKenjoUsersList } from '../kenjo/kenjoClient.js';

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

router.get('/operators', async (req, res) => {
  try {
    const search = String(req.query?.search || '').trim();
    if (search.length < 2) {
      return res.json([]);
    }
    const kenjoUsers = await getKenjoUsersList().catch(() => []);
    const q = search.toLowerCase();
    const out = (Array.isArray(kenjoUsers) ? kenjoUsers : [])
      .filter((user) => {
        if (!user) return false;
        if (!(user.isActive ?? true)) return false;
        const name = String(user.displayName || `${user.firstName || ''} ${user.lastName || ''}`).trim().toLowerCase();
        const email = String(user.email || '').trim().toLowerCase();
        const role = String(user.jobTitle || '').trim().toLowerCase();
        const employeeNumber = String(user.employeeNumber || '').trim().toLowerCase();
        const transportationId = String(user.transportationId || '').trim().toLowerCase();
        return (
          name.includes(q)
          || email.includes(q)
          || role.includes(q)
          || employeeNumber.includes(q)
          || transportationId.includes(q)
        );
      })
      .map((user) => {
        const label =
          String(user.displayName || '').trim()
          || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
          || String(user.email || '').trim()
          || String(user.employeeNumber || user.transportationId || user._id || '').trim();
        if (!label) return null;
        const employeeId = String(user.employeeNumber || user._id || label).trim();
        const employeeRef = String(user.employeeNumber || user.transportationId || user._id || label).trim();
        const kenjoUserId = String(user._id || '').trim() || null;
        return {
          id: employeeId,
          employeeId,
          employeeRef,
          kenjoUserId,
          label,
          subtitle: String(user.email || '').trim() || null,
        };
      })
      .filter(Boolean)
      .slice(0, 8);

    return res.json(out);
  } catch (error) {
    console.error('GET /api/public/fleet-inspections/operators error', error);
    return res.status(500).json({ error: 'Failed to load operator suggestions' });
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

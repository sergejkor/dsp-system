import { Router } from 'express';
import multer from 'multer';
import carsService from './carsService.js';
import authMiddleware from '../auth/authMiddleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.get('/health', (_req, res) => res.json({ ok: true, module: 'cars' }));

router.get('/kpis', async (req, res) => {
  try {
    const kpis = await carsService.getCarsKpis();
    res.json(kpis);
  } catch (err) {
    console.error('GET /api/cars/kpis', err);
    res.status(500).json({ error: 'Failed to load cars KPIs' });
  }
});

router.get('/', async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      status: req.query.status,
      vehicle_type: req.query.vehicle_type,
      station: req.query.station,
      fleet_provider: req.query.fleet_provider,
    };
    const cars = await carsService.getCars(filters);
    res.json(cars);
  } catch (err) {
    console.error('GET /api/cars', err);
    res.status(500).json({ error: 'Failed to load cars' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    const car = await carsService.getCarById(id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (err) {
    console.error('GET /api/cars/:id', err);
    res.status(500).json({ error: 'Failed to load car' });
  }
});

router.post('/', async (req, res) => {
  try {
    const car = await carsService.createCar(req.body || {});
    res.status(201).json(car);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Vehicle ID already exists' });
    console.error('POST /api/cars', err);
    res.status(500).json({ error: err.message || 'Failed to create car' });
  }
});

router.put('/:id', authMiddleware.requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    const currentStatusCar = await carsService.getCarById(id);
    if (!currentStatusCar) return res.status(404).json({ error: 'Car not found' });
    const body = req.body || {};

    // If status already Defleeting finalized, restrict who can change it.
    // Everyone may move it back to Active (e.g. correction), but only SuperAdmin
    // can change it to any other status.
    if (
      currentStatusCar.status === 'Defleeting finalized' &&
      body.status &&
      body.status !== currentStatusCar.status &&
      body.status !== 'Active'
    ) {
      if (!req.user || req.user.role_code !== 'super_admin') {
        return res.status(403).json({
          error: 'Only SuperAdmin can change status from Defleeting finalized to this state.',
          code: 'FORBIDDEN',
        });
      }
    }

    const car = await carsService.updateCar(id, body);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (err) {
    console.error('PUT /api/cars/:id', err);
    res.status(500).json({ error: err.message || 'Failed to update car' });
  }
});

router.post('/:id/assign-driver', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { kenjo_employee_id } = req.body || {};
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    if (!kenjo_employee_id) return res.status(400).json({ error: 'kenjo_employee_id is required' });
    const car = await carsService.assignDriver(id, kenjo_employee_id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (err) {
    console.error('POST /api/cars/:id/assign-driver', err);
    res.status(500).json({ error: err.message || 'Failed to assign driver' });
  }
});

router.post('/:id/maintenance', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    const record = await carsService.addMaintenance(id, req.body || {});
    res.status(201).json(record);
  } catch (err) {
    console.error('POST /api/cars/:id/maintenance', err);
    res.status(500).json({ error: err.message || 'Failed to add maintenance' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    await carsService.deleteCar(id);
    res.status(204).send();
  } catch (err) {
    if (err.message && err.message.includes('Decommissioned')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('DELETE /api/cars/:id', err);
    res.status(500).json({ error: err.message || 'Failed to delete car' });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { comment } = req.body || {};
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    if (!comment || String(comment).trim() === '') return res.status(400).json({ error: 'Comment is required' });
    const car = await carsService.getCarById(id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    const row = await carsService.addCarComment(id, comment);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /api/cars/:id/comments', err);
    res.status(500).json({ error: err.message || 'Failed to add comment' });
  }
});

router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid car id' });
    const file = req.file;
    if (!file || !file.buffer) return res.status(400).json({ error: 'File is required' });
    const documentType = req.body?.document_type || 'document';
    const expiryDate = req.body?.expiry_date || null;
    const fileName = file.originalname || null;
    const car = await carsService.getCarById(id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    const row = await carsService.addCarDocument(id, documentType, file.buffer, fileName, expiryDate);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /api/cars/:id/documents', err);
    res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
});

router.get('/:id/documents/:docId/download', async (req, res) => {
  try {
    const carId = parseInt(req.params.id, 10);
    const docId = parseInt(req.params.docId, 10);
    if (!Number.isFinite(carId) || !Number.isFinite(docId)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await carsService.getCarDocumentForDownload(carId, docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!doc.file_content) return res.status(404).json({ error: 'Document has no file content' });
    const name = doc.file_name || `${doc.document_type}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(Buffer.from(doc.file_content));
  } catch (err) {
    console.error('GET /api/cars/:id/documents/:docId/download', err);
    res.status(500).json({ error: err.message || 'Failed to download document' });
  }
});

export default router;

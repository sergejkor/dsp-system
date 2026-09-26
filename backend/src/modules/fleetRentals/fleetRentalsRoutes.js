import { Router } from 'express';
import multer from 'multer';
import { addRentalDocument, listRentalDocuments, readRentalDocument, documentMime } from './rentalDocuments.js';
import { requirePermission } from '../auth/authMiddleware.js';
import { listRentals, saveRental, getDrivenRoutes } from './fleetRentalsService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const validId = value => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 2147483647;
router.use(requirePermission('page_cars'));
router.get('/:id/documents', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid vehicle id.' });
  try { res.json(await listRentalDocuments(Number(req.params.id))); }
  catch (error) { console.error('Rental documents', error); res.status(500).json({ error: 'Unable to load documents.' }); }
});
router.post('/:id/documents', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid vehicle id.' });
  upload.single('file')(req, res, async error => {
    if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Maximum file size is 15 MB.' : 'Unable to receive file.' });
    try { res.status(201).json(await addRentalDocument(Number(req.params.id), req.file, req.body?.document_type)); }
    catch (err) {
      if (!err.status) console.error('Upload rental document', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Unable to upload document.' });
    }
  });
});
router.get('/:id/documents/:docId', async (req, res) => {
  if (!validId(req.params.id) || !validId(req.params.docId)) return res.status(400).json({ error: 'Invalid document id.' });
  try {
    const file = await readRentalDocument(Number(req.params.id), Number(req.params.docId));
    const content = Buffer.from(file.file_content);
    res.attachment(file.file_name || 'document');
    res.setHeader('Content-Type', documentMime(content));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(content);
  } catch (error) {
    if (!error.status) console.error('Read rental document', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to open document.' });
  }
});
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

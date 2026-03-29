import { Router } from 'express';
import multer from 'multer';
import finesService from './finesService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/employees', async (_req, res) => {
  try {
    const employees = await finesService.getEmployeesForFines();
    res.json(employees);
  } catch (err) {
    console.error('GET /api/fines/employees error', err);
    res.status(500).json({ error: err.message || 'Failed to load employees' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const fines = await finesService.getFines();
    res.json(fines);
  } catch (err) {
    console.error('GET /api/fines error', err);
    res.status(500).json({ error: err.message || 'Failed to load fines' });
  }
});

router.post('/', async (req, res) => {
  try {
    const fine = await finesService.createFine(req.body || {});
    res.status(201).json(fine);
  } catch (err) {
    console.error('POST /api/fines error', err);
    res.status(500).json({ error: err.message || 'Failed to create fine' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const fine = await finesService.updateFine(id, req.body || {});
    if (!fine) {
      return res.status(404).json({ error: 'Fine not found' });
    }
    res.json(fine);
  } catch (err) {
    console.error('PUT /api/fines/:id error', err);
    res.status(500).json({ error: err.message || 'Failed to update fine' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const ok = await finesService.deleteFine(id);
    if (!ok) {
      return res.status(404).json({ error: 'Fine not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/fines/:id error', err);
    res.status(500).json({ error: err.message || 'Failed to delete fine' });
  }
});

router.get('/:id/documents', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const rows = await finesService.listFineDocuments(id);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/fines/:id/documents error', err);
    res.status(500).json({ error: err.message || 'Failed to load fine documents' });
  }
});

router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    // #region agent log
    fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H3',location:'backend/src/modules/fines/finesRoutes.js:postDocuments:entry',message:'fine_upload_route_entry',data:{fineIdRaw:req.params.id,fineIdParsed:id,hasFile:!!req.file,fileName:req.file?.originalname||null,size:req.file?.size||0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!req.file?.buffer) return res.status(400).json({ error: 'File is required' });
    const row = await finesService.addFineDocument(id, {
      fileName: req.file.originalname || 'document.bin',
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileContent: req.file.buffer,
    });
    // #region agent log
    fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H3',location:'backend/src/modules/fines/finesRoutes.js:postDocuments:success',message:'fine_upload_route_success',data:{fineId:id,docId:row?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.status(201).json(row);
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H3',location:'backend/src/modules/fines/finesRoutes.js:postDocuments:error',message:'fine_upload_route_error',data:{error:err?.message||'unknown_error'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error('POST /api/fines/:id/documents error', err);
    res.status(500).json({ error: err.message || 'Failed to upload fine document' });
  }
});

router.get('/:id/documents/:docId/download', async (req, res) => {
  try {
    const row = await finesService.getFineDocument(req.params.id, req.params.docId);
    if (!row) return res.status(404).json({ error: 'Document not found' });
    const fileName = row.file_name || `fine-document-${row.id}.bin`;
    const mime = row.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(row.file_content);
  } catch (err) {
    console.error('GET /api/fines/:id/documents/:docId/download error', err);
    res.status(500).json({ error: err.message || 'Failed to download fine document' });
  }
});

router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const ok = await finesService.deleteFineDocument(req.params.id, req.params.docId);
    if (!ok) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/fines/:id/documents/:docId error', err);
    res.status(500).json({ error: err.message || 'Failed to delete fine document' });
  }
});

export default router;


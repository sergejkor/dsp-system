import { Router } from 'express';
import multer from 'multer';
import employeeService from './employeeService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const ALLOWED_DOC_TYPES = new Set(['Dokumente', 'Lohnabrechnung', 'Vertrag', 'Abmahnung', 'AMZL', 'Zertifikat']);

router.get('/health', (_req, res) => res.json({ ok: true, module: 'employees' }));

router.get('/', async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search) : '';
    const onlyActive = req.query.onlyActive === 'true';
    const employees = await employeeService.listEmployees({ search, onlyActive });
    res.json(employees);
  } catch (error) {
    console.error('GET /api/employees error', error);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const employee = await employeeService.getEmployeeById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    console.error('GET /api/employees/:id error', error);
    res.status(500).json({ error: 'Failed to load employee' });
  }
});

router.get('/:id/documents', async (req, res) => {
  try {
    const rows = await employeeService.listEmployeeDocuments(req.params.id);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/employees/:id/documents error', error);
    res.status(500).json({ error: 'Failed to load employee documents' });
  }
});

router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const employeeRef = String(req.params.id || '').trim();
    const documentType = String(req.body?.document_type || '').trim();
    if (!employeeRef) return res.status(400).json({ error: 'Employee id is required' });
    if (!documentType || !ALLOWED_DOC_TYPES.has(documentType)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'File is required' });
    const row = await employeeService.addEmployeeDocument(employeeRef, {
      documentType,
      fileName: req.file.originalname || 'document.bin',
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileContent: req.file.buffer,
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('POST /api/employees/:id/documents error', error);
    res.status(500).json({ error: 'Failed to upload employee document' });
  }
});

router.get('/:id/documents/:docId/download', async (req, res) => {
  try {
    const row = await employeeService.getEmployeeDocument(req.params.id, req.params.docId);
    if (!row) return res.status(404).json({ error: 'Document not found' });
    const fileName = row.file_name || `employee-document-${row.id}.bin`;
    const mime = row.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(row.file_content);
  } catch (error) {
    console.error('GET /api/employees/:id/documents/:docId/download error', error);
    res.status(500).json({ error: 'Failed to download employee document' });
  }
});

router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const ok = await employeeService.deleteEmployeeDocument(req.params.id, req.params.docId);
    if (!ok) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/employees/:id/documents/:docId error', error);
    res.status(500).json({ error: 'Failed to delete employee document' });
  }
});

export default router;

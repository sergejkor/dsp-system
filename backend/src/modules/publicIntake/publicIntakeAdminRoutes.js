import { Router } from 'express';
import multer from 'multer';
import authMiddleware from '../auth/authMiddleware.js';
import publicIntakeService from './publicIntakeService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
});

const requirePersonalAccess = authMiddleware.requirePermission('page_employees');
const requireDamageAccess = authMiddleware.requirePermission('page_damages');
const requireIntakeRead = authMiddleware.requireAnyPermission(['page_employees', 'page_damages']);

function runMultiUpload(req, res, fieldName) {
  return new Promise((resolve, reject) => {
    upload.array(fieldName, 12)(req, res, (error) => {
      if (!error) return resolve();
      return reject(error);
    });
  });
}

function sendMulterError(res, error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A file is too large. Maximum upload size is 25 MB.' });
    }
    return res.status(400).json({ error: error.message || 'Upload failed' });
  }
  return null;
}

function parseDocumentNames(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((value) => String(value || '').trim()).filter(Boolean);
  }
  const normalized = String(rawValue || '').trim();
  if (!normalized) return [];
  return [normalized];
}

router.get('/summary', requireIntakeRead, async (_req, res) => {
  try {
    const data = await publicIntakeService.getPublicIntakeSummary();
    res.json(data);
  } catch (error) {
    console.error('GET /api/intake/summary error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/personal-questionnaires', requirePersonalAccess, async (req, res) => {
  try {
    const rows = await publicIntakeService.listPersonalQuestionnaires({ status: req.query.status });
    res.json(rows);
  } catch (error) {
    console.error('GET /api/intake/personal-questionnaires error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/personal-questionnaires/:id', requirePersonalAccess, async (req, res) => {
  try {
    const row = await publicIntakeService.getPersonalQuestionnaireById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    res.json(row);
  } catch (error) {
    console.error('GET /api/intake/personal-questionnaires/:id error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.patch('/personal-questionnaires/:id', requirePersonalAccess, async (req, res) => {
  try {
    const row = await publicIntakeService.updatePersonalQuestionnaire(req.params.id, req.body?.payload || {}, req.body?.status);
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    res.json(row);
  } catch (error) {
    console.error('PATCH /api/intake/personal-questionnaires/:id error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.delete('/personal-questionnaires/:id', requirePersonalAccess, async (req, res) => {
  try {
    const row = await publicIntakeService.deletePersonalQuestionnaire(req.params.id);
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    res.json({ ok: true, deleted: row });
  } catch (error) {
    console.error('DELETE /api/intake/personal-questionnaires/:id error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.post('/personal-questionnaires/:id/unread', requirePersonalAccess, async (req, res) => {
  try {
    const row = await publicIntakeService.markPersonalQuestionnaireUnread(req.params.id);
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    res.json({ ok: true, submission: row });
  } catch (error) {
    console.error('POST /api/intake/personal-questionnaires/:id/unread error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.post('/personal-questionnaires/:id/files', requirePersonalAccess, async (req, res) => {
  try {
    await runMultiUpload(req, res, 'files');
    const documentNames = parseDocumentNames(req.body?.documentName || req.body?.documentNames);
    const files = await publicIntakeService.addPersonalQuestionnaireFiles(req.params.id, req.files || [], 'admin', documentNames);
    if (!files) return res.status(404).json({ error: 'Submission not found' });
    res.status(201).json(files);
  } catch (error) {
    if (sendMulterError(res, error)) return;
    console.error('POST /api/intake/personal-questionnaires/:id/files error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.get('/personal-questionnaires/:id/files/:fileId/download', requirePersonalAccess, async (req, res) => {
  try {
    const file = await publicIntakeService.getPersonalQuestionnaireFile(req.params.id, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name || `personal-questionnaire-${file.id}`)}"`);
    res.send(file.file_content);
  } catch (error) {
    console.error('GET /api/intake/personal-questionnaires/:id/files/:fileId/download error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/personal-questionnaires/:id/save-and-send', requirePersonalAccess, async (req, res) => {
  try {
    const out = await publicIntakeService.saveAndSendPersonalQuestionnaire(req.params.id);
    if (!out) return res.status(404).json({ error: 'Submission not found' });
    res.json(out);
  } catch (error) {
    console.error('POST /api/intake/personal-questionnaires/:id/save-and-send error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.get('/damage-reports', requireDamageAccess, async (req, res) => {
  try {
    const rows = await publicIntakeService.listDamageReports({ status: req.query.status });
    res.json(rows);
  } catch (error) {
    console.error('GET /api/intake/damage-reports error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/damage-reports/:id', requireDamageAccess, async (req, res) => {
  try {
    const row = await publicIntakeService.getDamageReportById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Damage report not found' });
    res.json(row);
  } catch (error) {
    console.error('GET /api/intake/damage-reports/:id error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.patch('/damage-reports/:id', requireDamageAccess, async (req, res) => {
  try {
    const row = await publicIntakeService.updateDamageReport(req.params.id, req.body?.payload || {}, req.body?.status);
    if (!row) return res.status(404).json({ error: 'Damage report not found' });
    res.json(row);
  } catch (error) {
    console.error('PATCH /api/intake/damage-reports/:id error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.post('/damage-reports/:id/files', requireDamageAccess, async (req, res) => {
  try {
    await runMultiUpload(req, res, 'files');
    const files = await publicIntakeService.addDamageReportFiles(req.params.id, req.files || [], 'admin');
    if (!files) return res.status(404).json({ error: 'Damage report not found' });
    res.status(201).json(files);
  } catch (error) {
    if (sendMulterError(res, error)) return;
    console.error('POST /api/intake/damage-reports/:id/files error', error);
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.get('/damage-reports/:id/files/:fileId/download', requireDamageAccess, async (req, res) => {
  try {
    const file = await publicIntakeService.getDamageReportFile(req.params.id, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name || `damage-report-${file.id}`)}"`);
    res.send(file.file_content);
  } catch (error) {
    console.error('GET /api/intake/damage-reports/:id/files/:fileId/download error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

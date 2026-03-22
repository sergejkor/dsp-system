import { Router } from 'express';
import multer from 'multer';
import scorecardService from './scorecardService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || (file.originalname || '').toLowerCase().endsWith('.pdf');
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are allowed.'), false);
  },
});

router.get('/health', (_req, res) => res.json({ ok: true, module: 'scorecard' }));

router.get('/weeks', async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const weeks = await scorecardService.getWeeksWithUploads(year);
    res.json(weeks);
  } catch (err) {
    console.error('GET /api/scorecard/weeks', err);
    res.status(500).json({ error: 'Failed to load weeks' });
  }
});

router.get('/weeks/:year/:week/employees', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const week = Number(req.params.week);
    if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
      return res.status(400).json({ error: 'Invalid year or week.' });
    }
    const rows = await scorecardService.getEmployeesForWeek(year, week);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/scorecard/weeks/:year/:week/employees', err);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.post('/weeks/:year/:week/upload', upload.single('file'), async (req, res) => {
  try {
    const year = Number(req.params.year);
    const week = Number(req.params.week);
    if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
      return res.status(400).json({ error: 'Invalid year or week. Week must be 1–53.' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Send a PDF in field "file".' });
    }
    const fileName = req.file.originalname || 'scorecard.pdf';
    const result = await scorecardService.saveUpload(year, week, fileName, req.file.buffer);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    if (err.message && err.message.includes('Only PDF')) {
      return res.status(400).json({ error: 'Only PDF files are allowed.', code: 'INVALID_FILE_TYPE' });
    }
    console.error('POST /api/scorecard/weeks/:year/:week/upload', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

export default router;

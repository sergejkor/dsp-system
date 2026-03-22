import { Router } from 'express';
import multer from 'multer';
import calendarService from './calendarService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/health', (_req, res) => res.json({ ok: true, module: 'calendar' }));

router.get('/weeks', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const weeks = await calendarService.getWeeks(year);
    res.json(weeks);
  } catch (err) {
    console.error('GET /api/calendar/weeks', err);
    res.status(500).json({ error: 'Failed to load weeks' });
  }
});

router.get('/month-work-days', async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const rows = await calendarService.getMonthWorkDays(year, month);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/calendar/month-work-days', err);
    res.status(500).json({ error: 'Failed to load month work days' });
  }
});

router.get('/work-days', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const rows = await calendarService.getWorkDaysData(year);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/calendar/work-days', err);
    res.status(500).json({ error: 'Failed to load work days' });
  }
});

router.get('/days', async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    const rows = await calendarService.getCalendarDays(from, to);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/calendar/days', err);
    res.status(500).json({ error: 'Failed to load calendar days' });
  }
});

router.get('/month-days', async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const rows = await calendarService.getMonthDaysWithUploads(year, month);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/calendar/month-days', err);
    res.status(500).json({ error: 'Failed to load month days' });
  }
});

router.post('/days/:dayKey/upload', upload.single('file'), async (req, res) => {
  try {
    const dayKey = req.params.dayKey;
    if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      return res.status(400).json({ error: 'Invalid day. Use YYYY-MM-DD.' });
    }
    const dayOfWeek = new Date(dayKey + 'T12:00:00').getDay();
    if (dayOfWeek === 0) {
      return res.status(400).json({
        error: 'File upload is not allowed on Sunday.',
        code: 'SUNDAY_NOT_ALLOWED',
      });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Send a file in field "file".' });
    }
    const fileName = req.file.originalname || 'upload.xlsx';
    const result = await calendarService.saveUpload(dayKey, fileName, req.file.buffer);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    if (err.message === 'DATE_MISMATCH') {
      return res.status(400).json({
        error: 'The date inside the Excel file does not match the selected day. Upload a file for the correct date.',
        code: 'DATE_MISMATCH',
      });
    }
    if (err.message === 'NO_DATE_IN_FILE') {
      return res.status(400).json({
        error: 'No date found. Add the day date in the file (e.g. "Datum" column) or in the file name (e.g. report_2025-03-13.xlsx).',
        code: 'NO_DATE_IN_FILE',
      });
    }
    if (err.message === 'ALREADY_HAS_FILE') {
      return res.status(400).json({
        error: 'This day already has a file. Only one file per day is allowed.',
        code: 'ALREADY_HAS_FILE',
      });
    }
    console.error('POST /api/calendar/days/:dayKey/upload', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

export default router;

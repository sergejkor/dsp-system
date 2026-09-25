import { Router } from 'express';
import { query } from '../../db.js';
import { requirePermission } from '../auth/authMiddleware.js';
import { getAtlasResultForDate } from './atlasQueryService.js';

const router = Router();

router.use(requirePermission('page_car_planning'));

function isValidServiceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function compatibilityStatus(slackStatus) {
  if (slackStatus === 'sent') return 'sent';
  if (slackStatus === 'sending') return 'sending';
  if (slackStatus === 'failed') return 'uncertain';
  return 'waiting';
}

async function getSharedExcelStatus(serviceDate) {
  const result = await query(`
    SELECT file_name, uploaded_at, expires_at, octet_length(file_content)::int AS bytes
    FROM car_planning_daily_excels
    WHERE plan_date = $1
      AND expires_at > NOW()
  `, [serviceDate]);
  return result.rows[0] || null;
}

router.get('/status', async (req, res) => {
  const serviceDate = String(req.query.date || '');
  if (!isValidServiceDate(serviceDate)) {
    return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date.' });
  }

  try {
    const [atlas, sharedExcel] = await Promise.all([
      getAtlasResultForDate(serviceDate),
      getSharedExcelStatus(serviceDate),
    ]);
    return res.json({
      date: serviceDate,
      enabled: String(process.env.ATLAS_SLACK_ENABLED || '').trim().toLowerCase() === 'true',
      status: compatibilityStatus(atlas.slack.status),
      routes: atlas.summary.routes,
      sharedExcel,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to read Atlas status.' });
  }
});

export default router;

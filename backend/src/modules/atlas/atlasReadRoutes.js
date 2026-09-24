import { Router } from 'express';
import { getAtlasResultForDate } from './atlasQueryService.js';

const router = Router();

function isValidServiceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.get('/:serviceDate', async (req, res) => {
  const { serviceDate } = req.params;
  if (!isValidServiceDate(serviceDate)) {
    return res.status(400).json({ error: 'serviceDate must be a valid YYYY-MM-DD date.' });
  }
  try {
    return res.json(await getAtlasResultForDate(serviceDate));
  } catch {
    return res.status(500).json({ error: 'Unable to read Atlas results.' });
  }
});

export default router;

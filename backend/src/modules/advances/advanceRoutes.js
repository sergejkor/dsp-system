import { Router } from 'express';
import * as advanceService from './advanceService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const employeeId = req.query.employeeId ?? req.query.kenjo_employee_id;
    const month = req.query.month ?? null;
    if (!employeeId) {
      return res.status(400).json({ error: 'Query employeeId is required' });
    }
    const advances = await advanceService.getAdvances(employeeId, month);
    res.json(advances);
  } catch (error) {
    console.error('GET /advances error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/', async (req, res) => {
  try {
    const { employeeId, kenjo_employee_id, month, lines } = req.body || {};
    const id = String(employeeId ?? kenjo_employee_id ?? '').trim();
    const m = month ? String(month).trim().slice(0, 7) : '';
    if (!id) {
      return res.status(400).json({ error: 'employeeId is required' });
    }
    if (!m || !/^\d{4}-\d{2}$/.test(m)) {
      return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    }
    const lineList = Array.isArray(lines) ? lines : [];
    const result = await advanceService.saveAdvances(id, m, lineList);
    res.status(201).json(result);
  } catch (error) {
    console.error('POST /advances error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

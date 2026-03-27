import express from 'express';
import { getFinanceBundle } from './financeService.js';
import authMiddleware from '../auth/authMiddleware.js';

const router = express.Router();

router.get('/', authMiddleware.requirePermission('page_finance'), async (_req, res) => {
  try {
    const data = await getFinanceBundle();
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'finance_load_failed' });
  }
});

export default router;

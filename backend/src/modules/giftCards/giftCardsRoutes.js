import { Router } from 'express';
import giftCardsService from './giftCardsService.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, module: 'gift-cards' }));

router.get('/eligible', async (req, res) => {
  try {
    const weeksParam = req.query.weeks;
    const from = req.query.from || req.query.fromDate;
    const to = req.query.to || req.query.toDate;
    let weekKeys = [];
    if (weeksParam && typeof weeksParam === 'string') {
      weekKeys = weeksParam.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (weekKeys.length === 0 && (!from || !to)) {
      return res.status(400).json({ error: 'Query params weeks (e.g. 2025-10,2025-11) or from and to (YYYY-MM-DD) are required.' });
    }
    const rows = await giftCardsService.getEligible(from, to, weekKeys);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/gift-cards/eligible', err);
    res.status(500).json({ error: err.message || 'Failed to load eligible employees' });
  }
});

router.put('/save', async (req, res) => {
  try {
    const { period_month, periodMonth, transporter_id, transporterId, issued, gift_card_amount, giftCardAmount } = req.body || {};
    const period = period_month || periodMonth;
    const tid = transporter_id || transporterId;
    if (!period || !tid) {
      return res.status(400).json({ error: 'Body must include period_month (YYYY-MM) and transporter_id.' });
    }
    const result = await giftCardsService.saveGiftCard(period, tid, !!issued, gift_card_amount ?? giftCardAmount ?? 0);
    res.json(result);
  } catch (err) {
    console.error('PUT /api/gift-cards/save', err);
    res.status(500).json({ error: err.message || 'Failed to save gift card' });
  }
});

router.get('/issued', async (req, res) => {
  try {
    const rows = await giftCardsService.getIssued();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/gift-cards/issued', err);
    res.status(500).json({ error: err.message || 'Failed to load issued gift cards' });
  }
});

export default router;

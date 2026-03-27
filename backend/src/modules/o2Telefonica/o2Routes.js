import { Router } from 'express';
import { query } from '../../db.js';
import authMiddleware from '../auth/authMiddleware.js';

const router = Router();

router.use(authMiddleware.requirePermission('page_o2_telefonica'));

/** List all O2 Telefonica entries (users with phone and SIM). */
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, kenjo_user_id, name, phone_number, sim_card_number, pin1, pin2, puk1, puk2
       FROM o2_telefonica
       ORDER BY name NULLS LAST, id`
    );
    res.json(result?.rows ?? []);
  } catch (error) {
    console.error('GET /o2-telefonica error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Create a new O2 entry. */
router.post('/', async (req, res) => {
  try {
    const { name, phone_number, sim_card_number, pin1, pin2, puk1, puk2, kenjo_user_id } = req.body || {};
    const result = await query(
      `INSERT INTO o2_telefonica (kenjo_user_id, name, phone_number, sim_card_number, pin1, pin2, puk1, puk2, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, kenjo_user_id, name, phone_number, sim_card_number, pin1, pin2, puk1, puk2`,
      [
        kenjo_user_id ? String(kenjo_user_id).trim() || null : null,
        name ? String(name).trim().slice(0, 255) || null : null,
        phone_number ? String(phone_number).trim().slice(0, 255) || null : null,
        sim_card_number ? String(sim_card_number).trim().slice(0, 255) || null : null,
        pin1 ? String(pin1).trim().slice(0, 50) || null : null,
        pin2 ? String(pin2).trim().slice(0, 50) || null : null,
        puk1 ? String(puk1).trim().slice(0, 50) || null : null,
        puk2 ? String(puk2).trim().slice(0, 50) || null : null,
      ]
    );
    const row = result?.rows?.[0];
    if (!row) return res.status(500).json({ error: 'Insert failed' });
    res.status(201).json(row);
  } catch (error) {
    console.error('POST /o2-telefonica error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Update an O2 entry (e.g. PIN/PUK). */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { name, phone_number, sim_card_number, pin1, pin2, puk1, puk2, kenjo_user_id } = req.body || {};
    const hasKenjoUserId = Object.prototype.hasOwnProperty.call(req.body || {}, 'kenjo_user_id');
    await query(
      `UPDATE o2_telefonica SET
        kenjo_user_id = CASE WHEN $10 THEN $2 ELSE kenjo_user_id END,
        name = COALESCE($3, name),
        phone_number = COALESCE($4, phone_number),
        sim_card_number = COALESCE($5, sim_card_number),
        pin1 = COALESCE($6, pin1),
        pin2 = COALESCE($7, pin2),
        puk1 = COALESCE($8, puk1),
        puk2 = COALESCE($9, puk2),
        updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        kenjo_user_id != null ? String(kenjo_user_id).trim() || null : null,
        name != null ? String(name).trim().slice(0, 255) || null : undefined,
        phone_number != null ? String(phone_number).trim().slice(0, 255) || null : undefined,
        sim_card_number != null ? String(sim_card_number).trim().slice(0, 255) || null : undefined,
        pin1 != null ? String(pin1).trim().slice(0, 50) || null : undefined,
        pin2 != null ? String(pin2).trim().slice(0, 50) || null : undefined,
        puk1 != null ? String(puk1).trim().slice(0, 50) || null : undefined,
        puk2 != null ? String(puk2).trim().slice(0, 50) || null : undefined,
        hasKenjoUserId,
      ]
    );
    const result = await query(`SELECT id, kenjo_user_id, name, phone_number, sim_card_number, pin1, pin2, puk1, puk2 FROM o2_telefonica WHERE id = $1`, [id]);
    const row = result?.rows?.[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (error) {
    console.error('PUT /o2-telefonica/:id error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Delete an O2 entry. */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    await query(`DELETE FROM o2_telefonica WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /o2-telefonica/:id error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

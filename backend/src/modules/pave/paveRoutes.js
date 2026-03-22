/**
 * PAVE internal API and webhook. All data from our DB; PAVE only called server-side.
 */
import { Router } from 'express';
import { query } from '../../db.js';
import paveService from './paveService.js';
import {
  syncGmailReports,
  listPaveGmailReports,
  listPaveGmailReportsForCar,
  getPaveGmailReportDetail,
  getPaveGmailInspectionStats,
  getCarsWithoutPaveInspection,
} from './paveGmailSyncService.js';
import { portalCredentials } from './gmail/pavePortalCredentials.js';
import { backfillPaveReports } from './paveBackfillService.js';
import fs from 'fs/promises';

const router = Router();

/** Optional role check - for now allow all; can add req.user.role later */
function requireRole(...roles) {
  return (req, res, next) => next();
}

router.get('/health', (_req, res) => res.json({ ok: true, module: 'pave' }));

router.get('/sessions', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      status: req.query.status,
      source_type: req.query.source_type,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      car_id: req.query.car_id,
      driver_id: req.query.driver_id,
    };
    const list = await paveService.listSessions(filters);
    res.json(list);
  } catch (err) {
    console.error('GET /api/pave/sessions', err);
    res.status(500).json({ error: err.message || 'Failed to list sessions' });
  }
});

// ------------------------------------------------------------
// Gmail vehicle report ingestion (backend-driven)
// ------------------------------------------------------------
router.post('/sync', requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
  try {
    const {
      limit = 20,
      force = false,
      reprocessFailed = false,
      reprocessPartial = false,
      reprocessSparse = false,
    } = req.body || {};
    const result = await syncGmailReports({
      mode: 'manual',
      limit,
      force,
      reprocessFailed,
      reprocessPartial,
      reprocessSparse,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /api/pave/sync failed:', err);
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

router.post('/backfill', requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      maxEmails = 500,
      provider = 'pave',
      // Do not default sender: Gmail `from:PAVE` rarely matches real From headers → scanned=0.
      sender = '',
      subjectContains = '',
      reprocessExisting = false,
    } = req.body || {};

    const result = await backfillPaveReports({
      dateFrom,
      dateTo,
      maxEmails,
      provider,
      sender,
      subjectContains,
      reprocessExisting,
    });
    res.json(result);
  } catch (err) {
    console.error('POST /api/pave/backfill failed:', err);
    res.status(500).json({ success: false, error: err.message || 'Backfill failed' });
  }
});

/**
 * Portal login used by Gmail sync (REPORT_PORTAL_*). Exposed so the UI can copy / bookmarklet-fill
 * the PAVE web form (browsers cannot auto-fill third-party pages from our app).
 */
router.get('/portal/credentials', requireRole('admin', 'manager', 'dispatcher', 'viewer'), (_req, res) => {
  const { username, password } = portalCredentials();
  const configured = Boolean(username && password);
  res.json({
    ok: true,
    configured,
    username: configured ? username : null,
    password: configured ? password : null,
  });
});

router.get('/gmail/inspection-stats', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (_req, res) => {
  try {
    const stats = await getPaveGmailInspectionStats();
    res.json(stats);
  } catch (err) {
    console.error('GET /api/pave/gmail/inspection-stats failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load inspection stats' });
  }
});

router.get('/gmail/cars-without-inspection', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (_req, res) => {
  try {
    const data = await getCarsWithoutPaveInspection();
    res.json(data);
  } catch (err) {
    console.error('GET /api/pave/gmail/cars-without-inspection failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load cars without inspection' });
  }
});

router.get('/gmail/by-car/:carId/reports', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const carId = Number(req.params.carId);
    if (!Number.isFinite(carId)) return res.status(400).json({ error: 'Invalid car id' });
    const list = await listPaveGmailReportsForCar(carId);
    res.json(list);
  } catch (err) {
    console.error('GET /api/pave/gmail/by-car/:carId/reports failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load reports for car' });
  }
});

router.get('/gmail/reports', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const filters = {
      plate_number: req.query.plate_number,
      driver_name: req.query.driver_name,
      report_type: req.query.report_type,
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    };
    const list = await listPaveGmailReports(filters);
    res.json(list);
  } catch (err) {
    console.error('GET /api/pave/gmail/reports failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load reports' });
  }
});

router.get('/gmail/reports/:id', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (!Number.isFinite(reportId)) return res.status(400).json({ error: 'Invalid id' });
    const detail = await getPaveGmailReportDetail(reportId);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json(detail);
  } catch (err) {
    console.error('GET /api/pave/gmail/reports/:id failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load report detail' });
  }
});

router.get('/gmail/reports/:id/download', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (!Number.isFinite(reportId)) return res.status(400).json({ error: 'Invalid id' });
    const row = (await query(
      `SELECT pr.id AS pave_report_id, dr.file_path, dr.file_name, dr.mime_type
       FROM pave_reports pr
       JOIN downloaded_reports dr ON dr.id = pr.downloaded_report_id
       WHERE pr.id = $1`,
      [reportId]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'File not found' });
    if (!row.file_path) return res.status(404).json({ error: 'File path missing' });

    const buf = await fs.readFile(row.file_path);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(row.file_name || 'report')}"`,
    );
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.send(buf);
  } catch (err) {
    console.error('GET /api/pave/gmail/reports/:id/download failed:', err);
    res.status(500).json({ error: err.message || 'Failed to download' });
  }
});

router.post('/sessions', requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
  try {
    const session = await paveService.createSession(req.body || {});
    res.status(201).json(session);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.body?.message || err.message });
    console.error('POST /api/pave/sessions', err);
    res.status(500).json({ error: err.message || 'Failed to create session' });
  }
});

router.get('/sessions/:id', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.getSessionById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('GET /api/pave/sessions/:id', err);
    res.status(500).json({ error: err.message || 'Failed to load session' });
  }
});

router.patch('/sessions/:id', requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.updateSession(id, req.body || {});
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('PATCH /api/pave/sessions/:id', err);
    res.status(500).json({ error: err.message || 'Failed to update session' });
  }
});

router.delete('/sessions/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const fromPave = req.query.from_pave === 'true';
    await paveService.deleteSession(id, fromPave);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/pave/sessions/:id', err);
    res.status(500).json({ error: err.message || 'Failed to delete session' });
  }
});

router.post('/sessions/:id/resync', requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.resyncSession(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('POST /api/pave/sessions/:id/resync', err);
    res.status(500).json({ error: err.message || 'Resync failed' });
  }
});

router.post('/sessions/:id/resend-sms', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.resendSms(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('POST /api/pave/sessions/:id/resend-sms', err);
    res.status(500).json({ error: err.message || 'Resend SMS failed' });
  }
});

router.get('/sessions/:id/photos', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.getSessionById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session.photos || []);
  } catch (err) {
    console.error('GET /api/pave/sessions/:id/photos', err);
    res.status(500).json({ error: err.message || 'Failed to load photos' });
  }
});

router.get('/sessions/:id/notes', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.getSessionById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session.notes || []);
  } catch (err) {
    console.error('GET /api/pave/sessions/:id/notes', err);
    res.status(500).json({ error: err.message || 'Failed to load notes' });
  }
});

router.get('/sessions/:id/damages', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.getSessionById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session.damages || []);
  } catch (err) {
    console.error('GET /api/pave/sessions/:id/damages', err);
    res.status(500).json({ error: err.message || 'Failed to load damages' });
  }
});

router.get('/sessions/:id/timeline', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await paveService.getSessionById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const webhooks = (await query('SELECT event_name, received_at, processed, processing_error FROM pave_webhook_events WHERE session_key = $1 ORDER BY received_at DESC', [session.session_key])).rows || [];
    res.json({
      session: { created_at: session.created_at, inspect_started_at: session.inspect_started_at, inspect_ended_at: session.inspect_ended_at, last_webhook_at: session.last_webhook_at, last_synced_at: session.last_synced_at, status: session.status },
      webhooks,
    });
  } catch (err) {
    console.error('GET /api/pave/sessions/:id/timeline', err);
    res.status(500).json({ error: err.message || 'Failed to load timeline' });
  }
});

router.get('/analytics/summary', requireRole('admin', 'manager', 'dispatcher', 'viewer'), async (req, res) => {
  try {
    const kpis = await paveService.getKpis();
    res.json(kpis);
  } catch (err) {
    console.error('GET /api/pave/analytics/summary', err);
    res.status(500).json({ error: err.message || 'Failed to load analytics' });
  }
});

router.get('/export', requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
  try {
    const list = await paveService.listSessions({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      status: req.query.status,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pave-sessions.csv"');
    const headers = ['id', 'session_key', 'status', 'vin', 'vehicle', 'driver_id', 'car_id', 'license_plate', 'started_at', 'ended_at', 'grade', 'damage_count', 'odom', 'source_type', 'created_at'];
    const rows = list.map((s) => [
      s.id,
      s.session_key,
      s.status,
      s.vin || '',
      (s.vehicle || '').replace(/"/g, '""'),
      s.driver_id || '',
      s.car_id || '',
      s.license_plate || '',
      s.inspect_started_at || '',
      s.inspect_ended_at || '',
      s.overall_grade || '',
      s.damage_count ?? '',
      s.odom_reading ?? '',
      s.source_type || '',
      s.created_at,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    res.send('\ufeff' + csv);
  } catch (err) {
    console.error('GET /api/pave/export', err);
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

/** Webhook: PAVE sends events here. Persist and process. */
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionKey = body.session_key ?? body.sessionKey ?? body.data?.session_key;
    const eventName = body.event ?? body.event_name ?? body.type;
    if (!sessionKey || !eventName) {
      return res.status(400).json({ error: 'session_key and event required' });
    }
    const { id, processed } = await paveService.persistWebhook(sessionKey, eventName, body);
    res.status(200).json({ received: true, event_id: id, processed });
  } catch (err) {
    console.error('POST /api/pave/webhook', err);
    res.status(500).json({ error: err.message || 'Webhook failed' });
  }
});

router.get('/settings/callbacks', requireRole('admin'), async (req, res) => {
  try {
    const list = await paveService.listCallbacks();
    res.json(list);
  } catch (err) {
    console.error('GET /api/pave/settings/callbacks', err);
    res.status(500).json({ error: err.message || 'Failed to list callbacks' });
  }
});

router.post('/settings/callbacks', requireRole('admin'), async (req, res) => {
  try {
    const result = await paveService.createCallback(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    console.error('POST /api/pave/settings/callbacks', err);
    res.status(500).json({ error: err.body?.message || err.message || 'Failed to create callback' });
  }
});

router.put('/settings/callbacks/:event', requireRole('admin'), async (req, res) => {
  try {
    const event = req.params.event;
    const result = await paveService.updateCallback(event, req.body || {});
    res.json(result);
  } catch (err) {
    console.error('PUT /api/pave/settings/callbacks/:event', err);
    res.status(500).json({ error: err.body?.message || err.message || 'Failed to update callback' });
  }
});

router.delete('/settings/callbacks/:event', requireRole('admin'), async (req, res) => {
  try {
    const event = req.params.event;
    await paveService.deleteCallback(event);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/pave/settings/callbacks/:event', err);
    res.status(500).json({ error: err.message || 'Failed to delete callback' });
  }
});

/** Return URL redirect: when PAVE redirects user back with sessionKey */
router.get('/return/:sessionKey', (req, res) => {
  const sessionKey = req.params.sessionKey;
  res.redirect(302, `/pave?return=${encodeURIComponent(sessionKey)}`);
});

export default router;

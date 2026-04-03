import { Router } from 'express';
import * as analyticsService from './analyticsService.js';
import * as savedViewsService from './savedViewsService.js';

const router = Router();

function getUserId(req) {
  return req.user?.id != null ? Number(req.user.id) : null;
}

/**
 * GET /api/analytics/overview
 * Query: datePreset, startDate, endDate, compareMode, stationId, driverId, payrollMonth
 */
router.get('/overview', async (req, res) => {
  try {
    const params = {
      datePreset: req.query.datePreset,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      compareMode: req.query.compareMode,
      stationId: req.query.stationId,
      driverId: req.query.driverId,
      payrollMonth: req.query.payrollMonth,
      insuranceYear: req.query.insuranceYear,
    };
    const data = await analyticsService.getOverview(params);
    res.json(data);
  } catch (error) {
    console.error('GET /api/analytics/overview', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * GET /api/analytics/filters/meta
 */
router.get('/filters/meta', async (req, res) => {
  try {
    const meta = await analyticsService.getFiltersMeta();
    res.json(meta);
  } catch (error) {
    console.error('GET /api/analytics/filters/meta', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * GET /api/analytics/saved-views
 */
router.get('/saved-views', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const views = await savedViewsService.getSavedViews(userId);
    res.json(views);
  } catch (error) {
    console.error('GET /api/analytics/saved-views', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * POST /api/analytics/saved-views
 */
router.post('/saved-views', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const view = await savedViewsService.createSavedView(userId, req.body || {});
    res.status(201).json(view);
  } catch (error) {
    console.error('POST /api/analytics/saved-views', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * PATCH /api/analytics/saved-views/:id
 */
router.patch('/saved-views/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid view id' });
    const view = await savedViewsService.updateSavedView(id, userId, req.body || {});
    if (!view) return res.status(404).json({ error: 'View not found' });
    res.json(view);
  } catch (error) {
    console.error('PATCH /api/analytics/saved-views/:id', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * DELETE /api/analytics/saved-views/:id
 */
router.delete('/saved-views/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid view id' });
    const deleted = await savedViewsService.deleteSavedView(id, userId);
    if (!deleted) return res.status(404).json({ error: 'View not found' });
    res.status(204).send();
  } catch (error) {
    console.error('DELETE /api/analytics/saved-views/:id', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * GET /api/analytics/operations, /drivers, /payroll, /attendance, /routes, /performance, /safety, /fleet, /hr, /compliance
 */
const domainKeys = ['operations', 'drivers', 'payroll', 'attendance', 'timeoff', 'routes', 'performance', 'safety', 'fleet', 'hr', 'compliance', 'insurance', 'damages'];
domainKeys.forEach((domain) => {
  router.get(`/${domain}`, async (req, res) => {
    try {
      const params = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        groupBy: req.query.groupBy,
        limit: req.query.limit ? Number(req.query.limit) : 100,
        payrollMonth: req.query.payrollMonth,
        insuranceYear: req.query.insuranceYear,
        question: req.query.question,
        year: req.query.year,
        employeeIds: req.query.employeeIds,
      };
      const data = await analyticsService.getDomainData(domain, params);
      res.json(data);
    } catch (error) {
      console.error(`GET /api/analytics/${domain}`, error);
      res.status(500).json({ error: String(error?.message || error) });
    }
  });
});

/**
 * GET /api/analytics/drilldown/:metricKey
 */
router.get('/drilldown/:metricKey', async (req, res) => {
  try {
    const metricKey = req.params.metricKey;
    const params = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      payrollMonth: req.query.payrollMonth,
    };
    const data = await analyticsService.getDrilldown(metricKey, params);
    res.json(data);
  } catch (error) {
    console.error('GET /api/analytics/drilldown/:metricKey', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/**
 * GET /api/analytics/export/csv
 * Query: domain, startDate, endDate, payrollMonth. Returns CSV for table data.
 */
router.get('/export/csv', async (req, res) => {
  try {
    const domain = req.query.domain || 'overview';
    const params = {
      datePreset: req.query.datePreset,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      payrollMonth: req.query.payrollMonth,
      insuranceYear: req.query.insuranceYear,
      year: req.query.year,
      employeeIds: req.query.employeeIds,
      limit: 5000,
    };
    let table = [];
    if (domain === 'overview') {
      const data = await analyticsService.getOverview(params);
      table = (data.kpis || []).map((k) => ({ key: k.key, label: k.label, value: k.value, format: k.format }));
    } else {
      const data = await analyticsService.getDomainData(domain, params);
      table = data.table || [];
    }
    const headers = table.length ? Object.keys(table[0]) : [];
    const csv = [headers.join(',')].concat(table.map((r) => headers.map((h) => (r[h] != null ? String(r[h]).replace(/"/g, '""') : '').replace(/\n/g, ' ')).map((c) => `"${c}"`).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${domain}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('GET /api/analytics/export/csv', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/export/block', async (req, res) => {
  try {
    const format = String(req.body?.format || 'xlsx').trim().toLowerCase();
    const title = String(req.body?.title || 'analytics-block').trim() || 'analytics-block';
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const safeName = title.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'analytics-block';

    if (format === 'pdf') {
      const buffer = await analyticsService.buildAnalyticsPdfBuffer(title, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
      return res.send(buffer);
    }

    const buffer = analyticsService.rowsToWorksheetBuffer(title, rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    console.error('POST /api/analytics/export/block', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

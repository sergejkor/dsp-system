import { Router } from 'express';
import multer from 'multer';
import * as payrollService from './payrollService.js';
import { exportPayrollToAdp } from './payrollExportAdp.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/health', (_req, res) => res.json({ ok: true, module: 'payroll' }));

router.get('/calculate', async (req, res) => {
  try {
    const month = req.query.month;
    const from = req.query.from;
    const to = req.query.to;
    if (!month || !from || !to) {
      return res.status(400).json({ error: 'Query params month (YYYY-MM), from, to (YYYY-MM-DD) are required' });
    }
    const result = await payrollService.calculatePayroll(month, from, to);
    res.json(result);
  } catch (error) {
    console.error('GET /payroll/calculate error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/history', async (_req, res) => {
  try {
    const result = await payrollService.listPayrollHistory();
    res.json(result);
  } catch (error) {
    console.error('GET /payroll/history error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/history/:periodId', async (req, res) => {
  try {
    const result = await payrollService.getPayrollHistorySnapshot(req.params.periodId);
    res.json(result);
  } catch (error) {
    console.error('GET /payroll/history/:periodId error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.put('/abzug', async (req, res) => {
  try {
    const { period_id, periodId, employee_id, employeeId, lines } = req.body || {};
    const period = period_id || periodId;
    const employee = employee_id || employeeId;
    if (!period || !employee) {
      return res.status(400).json({ error: 'Body must include period_id (YYYY-MM) and employee_id' });
    }
    await payrollService.saveAbzug(period, employee, lines ?? []);
    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /payroll/abzug error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.put('/bonus', async (req, res) => {
  try {
    const { period_id, periodId, employee_id, employeeId, amount, comment } = req.body || {};
    const period = period_id || periodId;
    const employee = employee_id || employeeId;
    if (!period || !employee) {
      return res.status(400).json({ error: 'Body must include period_id (YYYY-MM) and employee_id' });
    }
    await payrollService.saveBonus(period, employee, amount, comment ?? '');
    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /payroll/bonus error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/manual-entry', async (req, res) => {
  try {
    const { period_id, periodId, employee_id, employeeId, working_days, total_bonus, abzug, bonus, vorschuss } = req.body || {};
    const period = period_id || periodId;
    const employee = employee_id || employeeId;
    if (!period || !employee) {
      return res.status(400).json({ error: 'Body must include period_id (YYYY-MM) and employee_id' });
    }
    await payrollService.saveManualEntry(period, employee, {
      working_days,
      total_bonus,
      abzug,
      bonus,
      vorschuss,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('POST /payroll/manual-entry error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/kpi', async (req, res) => {
  try {
    const kenjoEmployeeId = req.query.kenjo_employee_id ?? req.query.kenjoEmployeeId;
    const employeeNumber = req.query.employee_number ?? req.query.employeeNumber;
    const rows = await payrollService.getKpiByEmployee(kenjoEmployeeId, employeeNumber);
    res.json(rows);
  } catch (error) {
    console.error('GET /payroll/kpi error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/kpi/comment', async (req, res) => {
  try {
    const { employee_id, year, week, comment } = req.body || {};
    if (!employee_id || year == null || week == null) {
      return res.status(400).json({ error: 'employee_id, year and week are required.' });
    }
    const result = await payrollService.saveKpiComment(employee_id, year, week, comment);
    res.json(result);
  } catch (error) {
    console.error('POST /payroll/kpi/comment error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/export-adp', async (req, res) => {
  try {
    const { month, rows, from, to, result } = req.body || {};
    if (!month || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Body must include month (YYYY-MM) and rows (array of payroll rows)' });
    }
    const buffer = await exportPayrollToAdp(month, rows);
    try {
      await payrollService.savePayrollHistorySnapshot(
        month,
        result && typeof result === 'object'
          ? result
          : { month, from: from || null, to: to || null, rows },
        from || result?.from || null,
        to || result?.to || null,
      );
    } catch (snapshotError) {
      console.error('POST /payroll/export-adp snapshot save error', snapshotError);
    }
    const safeMonth = String(month).replace(/\D/g, '').slice(0, 6) || 'export';
    const filename = `Variable_Daten_Alfamile_${safeMonth}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('POST /payroll/export-adp error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/payslips/preview', upload.array('files', 500), async (req, res) => {
  try {
    const files = (req.files || []).filter((f) => String(f.mimetype || '').toLowerCase().includes('pdf'));
    if (!files.length) return res.status(400).json({ error: 'Upload at least one PDF file' });
    const out = await payrollService.previewPayslipImport(files);
    res.json(out);
  } catch (error) {
    console.error('POST /payroll/payslips/preview error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/payslips/import', async (req, res) => {
  try {
    const { batchId, resolutions } = req.body || {};
    if (!batchId || !Array.isArray(resolutions)) {
      return res.status(400).json({ error: 'batchId and resolutions are required' });
    }
    const out = await payrollService.importPayslipBatch(batchId, resolutions);
    res.json(out);
  } catch (error) {
    console.error('POST /payroll/payslips/import error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

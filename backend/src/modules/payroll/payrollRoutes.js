import { Router } from 'express';
import multer from 'multer';
import * as payrollService from './payrollService.js';
import { exportPayrollToAdp } from './payrollExportAdp.js';
import { exportPayrollTableToExcel } from './payrollExportTable.js';
import { exportPayrollTableToPdf } from './payrollExportPdf.js';
import authMiddleware from '../auth/authMiddleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware.requirePermission('page_payroll'));

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
    const rows = await payrollService.listPayrollHistory();
    res.json(rows);
  } catch (error) {
    console.error('GET /payroll/history error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/history/:periodId', async (req, res) => {
  try {
    const snapshot = await payrollService.getPayrollHistorySnapshot(req.params.periodId);
    if (!snapshot) return res.status(404).json({ error: 'Payroll history not found' });
    res.json(snapshot);
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
    const { period_id, periodId, employee_id, employeeId, working_days, total_bonus, abzug, verpfl_mehr, fahrt_geld, bonus, vorschuss } = req.body || {};
    const period = period_id || periodId;
    const employee = employee_id || employeeId;
    if (!period || !employee) {
      return res.status(400).json({ error: 'Body must include period_id (YYYY-MM) and employee_id' });
    }
    await payrollService.saveManualEntry(period, employee, {
      working_days,
      total_bonus,
      abzug,
      verpfl_mehr,
      fahrt_geld,
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
    const { month, from, to, rows, result } = req.body || {};
    if (!month || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Body must include month (YYYY-MM) and rows (array of payroll rows)' });
    }
    await payrollService.savePayrollHistorySnapshot({
      month,
      from,
      to,
      result: result && typeof result === 'object' ? result : { month, from, to, rows },
    });
    const buffer = await exportPayrollToAdp(month, rows);
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

router.post('/export-table', async (req, res) => {
  try {
    const { month, rows } = req.body || {};
    if (!month || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Body must include month (YYYY-MM) and rows (array of payroll rows)' });
    }
    const buffer = await exportPayrollTableToExcel(month, rows);
    const safeMonth = String(month).replace(/\D/g, '').slice(0, 6) || 'export';
    const filename = `Payroll_${safeMonth}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('POST /payroll/export-table error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/export-pdf', async (req, res) => {
  try {
    const { month, rows } = req.body || {};
    if (!month || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Body must include month (YYYY-MM) and rows (array of payroll rows)' });
    }
    const buffer = await exportPayrollTableToPdf(month, rows);
    const safeMonth = String(month).replace(/\D/g, '').slice(0, 6) || 'export';
    const filename = `Payroll_${safeMonth}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('POST /payroll/export-pdf error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

function isLikelyPdfFile(f) {
  const mt = String(f?.mimetype || '').toLowerCase();
  if (mt.includes('pdf')) return true;
  const name = String(f?.originalname || '').toLowerCase();
  return name.endsWith('.pdf');
}

function runMulterArray(req, res, fieldName, maxCount) {
  return new Promise((resolve, reject) => {
    upload.array(fieldName, maxCount)(req, res, (error) => {
      if (!error) return resolve();
      return reject(error);
    });
  });
}

router.post('/payslips/preview', async (req, res) => {
  try {
    await runMulterArray(req, res, 'files', 500);
    const files = (req.files || []).filter(isLikelyPdfFile);
    if (!files.length) return res.status(400).json({ error: 'Upload at least one PDF file' });
    const out = await payrollService.previewPayslipImport(files);
    res.json(out);
  } catch (error) {
    console.error('POST /payroll/payslips/preview error', error);
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'PDF file is too large. Maximum upload size is 50 MB.' });
      }
      return res.status(400).json({ error: error.message || 'Upload failed' });
    }
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

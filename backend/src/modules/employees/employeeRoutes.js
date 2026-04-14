import { Router } from 'express';
import multer from 'multer';
import employeeService from './employeeService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const ALLOWED_DOC_TYPES = new Set(['Dokumente', 'Lohnabrechnung', 'Vertrag', 'Abmahnung', 'AMZL', 'Zertifikat']);

router.get('/health', (_req, res) => res.json({ ok: true, module: 'employees' }));

router.get('/', async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search) : '';
    const onlyActive = req.query.onlyActive === 'true';
    const employees = await employeeService.listEmployees({ search, onlyActive });
    res.json(employees);
  } catch (error) {
    console.error('GET /api/employees error', error);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.put('/:id/local-settings', async (req, res) => {
  try {
    const row = await employeeService.updateEmployeeLocalSettings(req.params.id, {
      vacationDaysOverride: req.body?.vacationDaysOverride,
      vacationDaysOverrideYear: req.body?.vacationDaysOverrideYear,
      totalYearVacation: req.body?.totalYearVacation,
      totalYearVacationYear: req.body?.totalYearVacationYear,
    });
    if (!row) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(row);
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message === 'employee_id is required' ||
      message === 'No supported local settings provided' ||
      message === 'Vacation days override must be a non-negative number'
    ) {
      return res.status(400).json({ error: message });
    }
    console.error('PUT /api/employees/:id/local-settings error', error);
    res.status(500).json({ error: 'Failed to update employee local settings' });
  }
});

router.get('/:id/vacation-summary', async (req, res) => {
  try {
    const summary = await employeeService.getEmployeeVacationSummary(req.params.id, req.query?.year);
    res.json(summary);
  } catch (error) {
    console.error('GET /api/employees/:id/vacation-summary error', error);
    res.status(500).json({ error: 'Failed to load employee vacation summary' });
  }
});

router.get('/:id/contract-extensions', async (req, res) => {
  try {
    const rows = await employeeService.listEmployeeContractExtensions(req.params.id);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/employees/:id/contract-extensions error', error);
    res.status(500).json({ error: 'Failed to load contract extensions' });
  }
});

router.post('/:id/contract-extensions', async (req, res) => {
  try {
    const row = await employeeService.addEmployeeContractExtension(req.params.id, {
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
    });
    res.status(201).json(row);
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message === 'employee_ref is required' ||
      message === 'Valid start and end dates are required' ||
      message === 'End date must be on or after start date' ||
      message === 'Only two contract extensions can be added'
    ) {
      return res.status(400).json({ error: message });
    }
    console.error('POST /api/employees/:id/contract-extensions error', error);
    res.status(500).json({ error: 'Failed to save contract extension' });
  }
});

router.get('/:id/contracts', async (req, res) => {
  try {
    const rows = await employeeService.listEmployeeContracts(req.params.id);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/employees/:id/contracts error', error);
    res.status(500).json({ error: 'Failed to load contracts' });
  }
});

router.post('/:id/contracts', async (req, res) => {
  try {
    const row = await employeeService.addEmployeeContract(req.params.id, {
      startDate: req.body?.startDate,
      endDate: req.body?.endDate ?? null,
    });
    res.status(201).json(row);
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message === 'employee_ref is required' ||
      message === 'Valid start date is required' ||
      message === 'End date must be on or after start date'
    ) {
      return res.status(400).json({ error: message });
    }
    console.error('POST /api/employees/:id/contracts error', error);
    res.status(500).json({ error: 'Failed to save contract' });
  }
});

router.post('/:id/contracts/terminate', upload.single('file'), async (req, res) => {
  try {
    const row = await employeeService.terminateEmployeeContract(req.params.id, {
      contractStartDate: req.body?.contractStartDate,
      contractEndDate: req.body?.contractEndDate ?? null,
      terminationDate: req.body?.terminationDate,
      terminationType: req.body?.terminationType,
      terminationInitiator: req.body?.terminationInitiator ?? null,
      documentFile: req.file?.buffer
        ? {
            fileName: req.file.originalname || 'termination-document.bin',
            mimeType: req.file.mimetype || 'application/octet-stream',
            fileContent: req.file.buffer,
          }
        : null,
    });
    res.status(201).json(row);
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message === 'employee_ref is required' ||
      message === 'Valid contract start date is required' ||
      message === 'Valid termination date is required' ||
      message === 'Valid termination type is required' ||
      message === 'Valid ordinary termination initiator is required' ||
      message === 'Termination date must be on or after contract start date' ||
      message === 'Termination date must not be after contract end date'
    ) {
      return res.status(400).json({ error: message });
    }
    console.error('POST /api/employees/:id/contracts/terminate error', error);
    res.status(500).json({ error: 'Failed to terminate contract' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const employee = await employeeService.getEmployeeById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    console.error('GET /api/employees/:id error', error);
    res.status(500).json({ error: 'Failed to load employee' });
  }
});

router.get('/:id/rescues', async (req, res) => {
  try {
    const rows = await employeeService.listEmployeeRescues(req.params.id);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/employees/:id/rescues error', error);
    res.status(500).json({ error: 'Failed to load rescues' });
  }
});

router.post('/:id/rescues', async (req, res) => {
  try {
    const row = await employeeService.addEmployeeRescue(req.params.id, {
      rescueDate: req.body?.rescueDate,
    });
    res.status(201).json(row);
  } catch (error) {
    const message = String(error?.message || error);
    if (message === 'employee_ref is required' || message === 'Valid rescue date is required') {
      return res.status(400).json({ error: message });
    }
    console.error('POST /api/employees/:id/rescues error', error);
    res.status(500).json({ error: 'Failed to save rescue' });
  }
});

router.delete('/:id/rescues/:rescueId', async (req, res) => {
  try {
    const ok = await employeeService.deleteEmployeeRescue(req.params.id, req.params.rescueId);
    if (!ok) return res.status(404).json({ error: 'Rescue not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/employees/:id/rescues/:rescueId error', error);
    res.status(500).json({ error: 'Failed to delete rescue' });
  }
});

router.get('/:id/documents', async (req, res) => {
  try {
    const rows = await employeeService.listEmployeeDocuments(req.params.id);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/employees/:id/documents error', error);
    res.status(500).json({ error: 'Failed to load employee documents' });
  }
});

router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const employeeRef = String(req.params.id || '').trim();
    const documentType = String(req.body?.document_type || '').trim();
    // #region agent log
    fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H4',location:'backend/src/modules/employees/employeeRoutes.js:postDocuments:entry',message:'employee_upload_route_entry',data:{employeeRef,documentType,allowedType:ALLOWED_DOC_TYPES.has(documentType),hasFile:!!req.file,fileName:req.file?.originalname||null,size:req.file?.size||0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!employeeRef) return res.status(400).json({ error: 'Employee id is required' });
    if (!documentType || !ALLOWED_DOC_TYPES.has(documentType)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'File is required' });
    const row = await employeeService.addEmployeeDocument(employeeRef, {
      documentType,
      fileName: req.file.originalname || 'document.bin',
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileContent: req.file.buffer,
    });
    // #region agent log
    fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H4',location:'backend/src/modules/employees/employeeRoutes.js:postDocuments:success',message:'employee_upload_route_success',data:{employeeRef,docId:row?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.status(201).json(row);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7400/ingest/9746dfd7-4235-4773-8200-b09630016922',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'54b2a9'},body:JSON.stringify({sessionId:'54b2a9',runId:'pre-fix',hypothesisId:'H4',location:'backend/src/modules/employees/employeeRoutes.js:postDocuments:error',message:'employee_upload_route_error',data:{error:error?.message||'unknown_error'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error('POST /api/employees/:id/documents error', error);
    res.status(500).json({ error: 'Failed to upload employee document' });
  }
});

router.get('/:id/documents/:docId/download', async (req, res) => {
  try {
    const row = await employeeService.getEmployeeDocument(req.params.id, req.params.docId);
    if (!row) return res.status(404).json({ error: 'Document not found' });
    const fileName = row.file_name || `employee-document-${row.id}.bin`;
    const mime = row.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(row.file_content);
  } catch (error) {
    console.error('GET /api/employees/:id/documents/:docId/download error', error);
    res.status(500).json({ error: 'Failed to download employee document' });
  }
});

router.delete('/:id/documents/:docId/import-source', async (req, res) => {
  try {
    const out = await employeeService.deleteImportedSourceDocuments(req.params.id, req.params.docId);
    if (out?.notFound) return res.status(404).json({ error: 'Document not found' });
    if (out?.noImportSource) {
      return res.status(400).json({ error: 'This document is not linked to an import source yet' });
    }
    res.json({
      ok: true,
      deleted: out.deleted || 0,
      import_source_key: out.importSourceKey || null,
      import_source_name: out.importSourceName || null,
    });
  } catch (error) {
    console.error('DELETE /api/employees/:id/documents/:docId/import-source error', error);
    res.status(500).json({ error: 'Failed to delete imported source documents' });
  }
});

router.delete('/:id/documents', async (req, res) => {
  try {
    const docIds = Array.isArray(req.body?.docIds) ? req.body.docIds : [];
    if (!docIds.length) {
      return res.status(400).json({ error: 'docIds array is required' });
    }
    const deleted = await employeeService.deleteEmployeeDocumentsBulk(req.params.id, docIds);
    res.json({ ok: true, deleted });
  } catch (error) {
    console.error('DELETE /api/employees/:id/documents error', error);
    res.status(500).json({ error: 'Failed to delete employee documents' });
  }
});

router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const ok = await employeeService.deleteEmployeeDocument(req.params.id, req.params.docId);
    if (!ok) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/employees/:id/documents/:docId error', error);
    res.status(500).json({ error: 'Failed to delete employee document' });
  }
});

export default router;

import { Router } from 'express';
import multer from 'multer';
import { requirePermission } from '../auth/authMiddleware.js';
import * as service from './tourImportService.js';
import { CONFIG } from './tourImportCore.js';
import inspectionReminderService from '../vehicleInspections/inspectionReminderService.js';

export function requirePlanner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!['super_admin', 'admin', 'dispatcher'].includes(req.user.role_code)) return res.status(403).json({ error: 'Dispatcher or administrator role required.' });
  next();
}
const router = Router();
router.use(requirePlanner, requirePermission('page_car_planning'));
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: CONFIG.maxBytes, files: 1, fields: 2 } }).single('file');
const handler = fn => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(e.status || (e.code === '23505' || e.code === '40P01' ? 409 : 400)).json({ error: e.code === '23505' ? 'Assignment conflict. Recalculate the plan.' : e.message }); }
};
router.get('/options', handler(() => service.options()));
router.get('/updated-plan', handler(req => service.updatedPlan(req.query.date)));
router.post('/upload', (req, res, next) => receive(req, res, error => error ? res.status(400).json({ error: error.message }) : next()), handler(req => {
  if (!req.file) throw new Error('Select an Excel file.');
  return service.upload(req.file.buffer, req.file.originalname, req.body.date, req.body.station, req.user.id);
}));
router.post('/:id/preview', handler(req => service.preview(req.params.id, req.user.id, req.body.edits || {}, req.body.excluded || [], true, req.body.physicalChange || null)));
router.post('/:id/rescue', handler(req => service.addRescue(req.params.id, req.user.id, req.body.employeeId, req.body.entryTime, req.body.entryDayOffset, req.body.version)));
router.post('/:id/apply', handler(async req => {
  const result = await service.apply(req.params.id, req.user.id, req.body.selected, req.body.version, req.body.partial === true);
  // Assignment commit is complete. Do not report it as failed if a downstream
  // reminder reconciliation needs retrying by the existing reminder scheduler.
  try { await inspectionReminderService.syncTasksForPlanDates([result.date]); }
  catch { result.inspectionSyncPending = true; }
  return result;
}));
export default router;

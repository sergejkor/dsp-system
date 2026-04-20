import { Router } from 'express';
import multer from 'multer';
import { query } from '../../db.js';
import vehicleInspectionsService from './vehicleInspectionsService.js';
import employeeService from '../employees/employeeService.js';
import { getKenjoUsersList } from '../kenjo/kenjoClient.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
});

function runPhotoUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.array('photos', 12)(req, res, (error) => {
      if (!error) return resolve();
      return reject(error);
    });
  });
}

function sendMulterError(res, error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A photo is too large. Maximum upload size is 25 MB.' });
    }
    return res.status(400).json({ error: error.message || 'Upload failed' });
  }
  return null;
}

router.get('/health', async (_req, res) => {
  try {
    await vehicleInspectionsService.ensureVehicleInspectionTables();
    res.json({ ok: true, module: 'vehicle-inspections-public' });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/operators', async (req, res) => {
  try {
    const search = String(req.query?.search || '').trim();
    if (search.length < 2) {
      return res.json([]);
    }

    const employees = await employeeService.listEmployees({ search, onlyActive: true });
    const searchTerm = `%${search.toLowerCase()}%`;
    const kenjoRows = await query(
      `SELECT
         kenjo_user_id::text AS kenjo_user_id,
         employee_number::text AS employee_number,
         transporter_id::text AS transporter_id,
         first_name,
         last_name,
         display_name,
         NULL::text AS email,
         is_active
       FROM kenjo_employees
       WHERE COALESCE(is_active, FALSE) = TRUE
         AND (
           LOWER(COALESCE(display_name, '')) LIKE $1
           OR LOWER(COALESCE(first_name, '')) LIKE $1
           OR LOWER(COALESCE(last_name, '')) LIKE $1
           OR LOWER(COALESCE(employee_number::text, '')) LIKE $1
           OR LOWER(COALESCE(transporter_id::text, '')) LIKE $1
           OR LOWER(
             TRIM(
               CONCAT_WS(
                 ' ',
                 COALESCE(first_name, ''),
                 COALESCE(last_name, ''),
                 COALESCE(display_name, ''),
                 COALESCE(employee_number::text, ''),
                 COALESCE(transporter_id::text, '')
               )
             )
           ) LIKE $1
         )
       ORDER BY
         LOWER(COALESCE(display_name, CONCAT_WS(' ', first_name, last_name), employee_number::text, transporter_id::text)),
         kenjo_user_id::text
       LIMIT 100`,
      [searchTerm]
    ).catch(() => ({ rows: [] }));

    const kenjoUsers = await getKenjoUsersList().catch(() => []);
    const remoteRows = (Array.isArray(kenjoUsers) ? kenjoUsers : []).filter((row) => {
      const haystack = [
        row?.displayName,
        row?.firstName,
        row?.lastName,
        row?.email,
        row?.employeeNumber,
        row?.transportationId,
        [row?.firstName, row?.lastName].filter(Boolean).join(' '),
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
      return Boolean(row?.isActive ?? true) && haystack.includes(search.toLowerCase());
    });

    const seen = new Set();
    const normalizeOperator = (row) => {
      const label =
        String(row?.display_name || '').trim() ||
        [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() ||
        String(row?.email || '').trim() ||
        String(row?.employee_id || row?.employee_number || row?.transporter_id || row?.id || row?.kenjo_user_id || '').trim();
      if (!label) return null;

      const employeeId = String(row?.employee_id || row?.employee_number || row?.id || row?.kenjo_user_id || label).trim();
      const employeeRef = String(row?.employee_id || row?.employee_number || row?.transporter_id || row?.id || row?.kenjo_user_id || label).trim();
      const kenjoUserId = String(row?.kenjo_user_id || '').trim() || null;
      const dedupeKey = [kenjoUserId, employeeRef, label.toLowerCase()].filter(Boolean).join('|');
      if (!dedupeKey || seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id: employeeId,
        employeeId,
        employeeRef,
        kenjoUserId,
        label,
        subtitle: String(row?.email || '').trim() || null,
      };
    };

    const out = [...(employees || []), ...(kenjoRows.rows || []), ...remoteRows]
      .map(normalizeOperator)
      .filter(Boolean)
      .slice(0, 8);

    return res.json(out);
  } catch (error) {
    console.error('GET /api/public/fleet-inspections/operators error', error);
    return res.status(500).json({ error: 'Failed to load operator suggestions' });
  }
});

router.post('/', async (req, res) => {
  try {
    await runPhotoUpload(req, res);
    const inspection = await vehicleInspectionsService.submitInspection(
      {
        vin: req.body?.vin,
        operatorName: req.body?.operatorName,
        vehicleType: req.body?.vehicleType,
        source: req.body?.source,
        notes: req.body?.notes,
        shotTypes: req.body?.shotTypes,
      },
      req.files || [],
    );
    return res.status(201).json(inspection);
  } catch (error) {
    if (sendMulterError(res, error)) return;
    console.error('POST /api/public/fleet-inspections error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to submit inspection') });
  }
});

export default router;

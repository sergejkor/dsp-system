import { Router } from 'express';
import kenjoDirectoryService from './kenjoDirectoryService.js';
import {
  getKenjoUsersList,
  getKenjoEmployeeByIdReadable,
  getTimeOffRequests,
  createKenjoAttendance,
  updateEmployeeWork,
  updateEmployeePersonals,
  updateEmployeeAddresses,
  updateEmployeeHomes,
  updateEmployeeFinancials,
  deactivateEmployee,
  getKenjoCustomFields,
} from './kenjoClient.js';
import kenjoCompareService from './kenjoCompareService.js';
import { query } from '../../db.js';
import { syncKenjoEmployeesToDb } from './kenjoSyncService.js';
import authMiddleware from '../auth/authMiddleware.js';

const router = Router();
const requireEmployeeAccess = authMiddleware.requirePermission('page_employees');
const requireSyncAccess = authMiddleware.requirePermission('page_sync_kenjo');
const requireCalendarAccess = authMiddleware.requirePermission('page_kenjo_calendar');
const requireKenjoReadAccess = authMiddleware.requireAnyPermission([
  'page_employees',
  'page_sync_kenjo',
  'page_kenjo_calendar',
]);
const requireKenjoTimeOffAccess = authMiddleware.requireAnyPermission([
  'page_kenjo_calendar',
  'page_sync_kenjo',
]);

async function getKenjoUsersListFallback() {
  const res = await query(
    `SELECT
       k.kenjo_user_id AS _id,
       COALESCE(NULLIF(TRIM(k.display_name), ''), NULLIF(TRIM(CONCAT_WS(' ', k.first_name, k.last_name)), ''), k.kenjo_user_id) AS display_name,
       k.first_name,
       k.last_name,
       COALESCE(e.email, '') AS email,
       COALESCE(k.job_title, '') AS job_title,
       COALESCE(k.is_active, true) AS is_active,
       COALESCE(k.transporter_id, '') AS transportation_id,
       COALESCE(k.employee_number, '') AS employee_number,
       k.start_date::text AS start_date,
       k.contract_end::text AS contract_end
     FROM kenjo_employees k
     LEFT JOIN LATERAL (
       SELECT emp.email
       FROM employees emp
       WHERE emp.kenjo_user_id = k.kenjo_user_id
       ORDER BY emp.is_active DESC NULLS LAST, emp.id DESC
       LIMIT 1
     ) e ON TRUE
     ORDER BY COALESCE(NULLIF(TRIM(k.last_name), ''), NULLIF(TRIM(k.display_name), ''), k.kenjo_user_id) ASC,
              COALESCE(NULLIF(TRIM(k.first_name), ''), '') ASC`
  );

  return (res.rows || []).map((row) => ({
    _id: String(row._id || '').trim(),
    displayName: String(row.display_name || '').trim(),
    firstName: String(row.first_name || '').trim(),
    lastName: String(row.last_name || '').trim(),
    email: String(row.email || '').trim(),
    jobTitle: String(row.job_title || '').trim(),
    isActive: row.is_active !== false,
    transportationId: String(row.transportation_id || '').trim(),
    employeeNumber: String(row.employee_number || '').trim(),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
    contractEnd: row.contract_end ? String(row.contract_end).slice(0, 10) : '',
    source: 'fallback_db',
  }));
}

router.get('/health', requireKenjoReadAccess, (_req, res) => res.json({ ok: true, module: 'kenjo' }));

router.get('/info', requireKenjoReadAccess, (_req, res) => {
  res.json(kenjoDirectoryService.getKenjoModuleInfo());
});

router.get('/users', requireKenjoReadAccess, async (_req, res) => {
  try {
    const users = await getKenjoUsersList();
    res.json(users || []);
  } catch (error) {
    console.error('Kenjo /users error', error);
    try {
      const fallbackUsers = await getKenjoUsersListFallback();
      res.json(fallbackUsers);
    } catch (fallbackError) {
      console.error('Kenjo /users fallback error', fallbackError);
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

router.get('/custom-fields', requireEmployeeAccess, async (_req, res) => {
  try {
    const fields = await getKenjoCustomFields();
    res.json(fields || []);
  } catch (error) {
    console.error('Kenjo /custom-fields error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Sync kenjo_employees from Kenjo API (user-accounts + works). Fills transporter_id, PN, names, etc. for payroll KPI matching. */
router.post('/sync-employees', requireSyncAccess, async (_req, res) => {
  try {
    const result = await syncKenjoEmployeesToDb();
    res.json(result);
  } catch (error) {
    console.error('Kenjo POST /sync-employees error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/employees/:id', requireEmployeeAccess, async (req, res) => {
  try {
    const employee = await getKenjoEmployeeByIdReadable(req.params.id);
    if (!employee || !employee.id) {
      return res.status(404).json({ error: 'Employee not found in Kenjo' });
    }
    const locRes = await query(
      `SELECT fuehrerschein_aufstellungsdatum, fuehrerschein_aufstellungsbehoerde
       FROM kenjo_employees WHERE kenjo_user_id = $1`,
      [req.params.id]
    );
    const row = locRes.rows[0];
    const dspLocal = {
      fuehrerschein_aufstellungsdatum: row?.fuehrerschein_aufstellungsdatum
        ? String(row.fuehrerschein_aufstellungsdatum).slice(0, 10)
        : '',
      fuehrerschein_aufstellungsbehoerde: row?.fuehrerschein_aufstellungsbehoerde
        ? String(row.fuehrerschein_aufstellungsbehoerde)
        : '',
    };
    const o2Res = await query(
      `SELECT id, kenjo_user_id, name, phone_number, sim_card_number
       FROM o2_telefonica
       WHERE kenjo_user_id = $1
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [req.params.id],
    );
    const o2Row = o2Res?.rows?.[0] || null;
    const o2Phone = o2Row?.phone_number ? String(o2Row.phone_number).trim() : '';
    const mergedEmployee = {
      ...employee,
      work: {
        ...(employee.work || {}),
        workMobile: o2Phone || employee?.work?.workMobile || '',
      },
    };
    res.json({ ...mergedEmployee, dspLocal, o2Telefonica: o2Row });
  } catch (error) {
    console.error('Kenjo /employees/:id error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.put('/employees/:id/work', requireEmployeeAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { contractEnd } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Employee id is required' });
    }
    const body = {};
    if (contractEnd !== undefined) body.contractEnd = contractEnd === '' || contractEnd === null ? null : String(contractEnd).slice(0, 10);
    await updateEmployeeWork(id, body);
    res.json({ ok: true });
  } catch (error) {
    console.error('Kenjo PUT /employees/:id/work error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.put('/employees/:id/deactivate', requireEmployeeAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { terminationDate, reason } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Employee id is required' });
    }
    const termDate = toDateOnly(terminationDate) || (terminationDate && String(terminationDate).trim().slice(0, 10)) || null;
    if (termDate) {
      await updateEmployeeWork(id, { contractEnd: termDate });
    }
    await deactivateEmployee(id);
    await query(
      `INSERT INTO employee_terminations (kenjo_employee_id, termination_date, reason, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, termDate || null, reason ? String(reason).trim().slice(0, 2000) : null],
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Kenjo PUT /employees/:id/deactivate error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

function toDateOnly(v) {
  if (v == null || v === '') return undefined;
  const s = String(v).trim();
  const iso = s.includes('T') ? s.split('T')[0] : s;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

function shiftDate(dateStr, days) {
  const base = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  base.setDate(base.getDate() + Number(days || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function overlapsDateRange(startDate, endDate, rangeStart, rangeEnd) {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  const from = String(rangeStart || '').slice(0, 10);
  const to = String(rangeEnd || '').slice(0, 10);
  if (!start || !end || !from || !to) return false;
  return start <= to && end >= from;
}

router.put('/employees/:id/profile', requireEmployeeAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { personal, work, address, home, financial, dspLocal } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Employee id is required' });
    }
    const errors = [];
    if (personal && typeof personal === 'object') {
      try {
        await updateEmployeePersonals(id, personal);
      } catch (e) {
        errors.push('personals: ' + (e?.message || e));
      }
    }
    if (work && typeof work === 'object') {
      try {
        const workBody = { ...work };
        delete workBody.managerName;
        if (workBody.startDate !== undefined) workBody.startDate = toDateOnly(workBody.startDate) ?? workBody.startDate;
        if (workBody.contractEnd !== undefined) workBody.contractEnd = toDateOnly(workBody.contractEnd) ?? workBody.contractEnd;
        if (workBody.probationUntil !== undefined) workBody.probationUntil = toDateOnly(workBody.probationUntil) ?? workBody.probationUntil;
        await updateEmployeeWork(id, workBody);
      } catch (e) {
        errors.push('work: ' + (e?.message || e));
      }
    }
    if (address && typeof address === 'object') {
      try {
        await updateEmployeeAddresses(id, address);
      } catch (e) {
        errors.push('addresses: ' + (e?.message || e));
      }
    }
    if (home && typeof home === 'object') {
      try {
        await updateEmployeeHomes(id, home);
      } catch (e) {
        errors.push('homes: ' + (e?.message || e));
      }
    }
    if (financial && typeof financial === 'object') {
      try {
        await updateEmployeeFinancials(id, financial);
      } catch (e) {
        errors.push('financials: ' + (e?.message || e));
      }
    }
    if (dspLocal && typeof dspLocal === 'object') {
      try {
        const rawD = dspLocal.fuehrerschein_aufstellungsdatum;
        const rawB = dspLocal.fuehrerschein_aufstellungsbehoerde;
        const dateVal =
          rawD === '' || rawD == null
            ? null
            : String(rawD).trim().slice(0, 10);
        const behVal =
          rawB === '' || rawB == null ? null : String(rawB).trim().slice(0, 2000);
        const up = await query(
          `UPDATE kenjo_employees
           SET fuehrerschein_aufstellungsdatum = $2::date,
               fuehrerschein_aufstellungsbehoerde = $3,
               updated_at = NOW()
           WHERE kenjo_user_id = $1`,
          [id, dateVal, behVal]
        );
        if (up.rowCount === 0) {
          await query(
            `INSERT INTO kenjo_employees (
               kenjo_user_id, first_name, last_name, display_name, is_active,
               fuehrerschein_aufstellungsdatum, fuehrerschein_aufstellungsbehoerde, updated_at
             ) VALUES ($1, '', '', '', true, $2::date, $3, NOW())
             ON CONFLICT (kenjo_user_id) DO UPDATE SET
               fuehrerschein_aufstellungsdatum = EXCLUDED.fuehrerschein_aufstellungsdatum,
               fuehrerschein_aufstellungsbehoerde = EXCLUDED.fuehrerschein_aufstellungsbehoerde,
               updated_at = NOW()`,
            [id, dateVal, behVal]
          );
        }
      } catch (e) {
        errors.push('dspLocal: ' + (e?.message || e));
      }
    }
    if (errors.length > 0) {
      return res.status(500).json({ error: errors.join('; ') });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Kenjo PUT /employees/:id/profile error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/compare', requireSyncAccess, async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    const minDiff = req.query.minDiff;
    if (!from || !to) {
      return res.status(400).json({ error: 'Query params from and to (YYYY-MM-DD) are required' });
    }
    const result = await kenjoCompareService.compareCortexWithKenjo(from, to, minDiff);
    res.json(result);
  } catch (error) {
    console.error('Kenjo /compare error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/compare-debug', requireSyncAccess, async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) {
      return res.status(400).json({ error: 'Query params from and to (YYYY-MM-DD) are required' });
    }
    const debug = await kenjoCompareService.getCompareDebug(from, to);
    res.json(debug);
  } catch (error) {
    console.error('Kenjo /compare-debug error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/conflicts/ignore', requireSyncAccess, async (req, res) => {
  try {
    const { conflictKey } = req.body || {};
    if (!conflictKey || typeof conflictKey !== 'string') {
      return res.status(400).json({ error: 'Body must include conflictKey' });
    }
    await kenjoCompareService.ignoreConflict(conflictKey.trim());
    res.json({ ok: true });
  } catch (error) {
    console.error('Kenjo /conflicts/ignore error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/conflicts/fix', requireSyncAccess, async (req, res) => {
  try {
    const { attendanceId, startTime, endTime, userId, date } = req.body || {};
    if (!attendanceId) {
      return res.status(400).json({ error: 'Body must include attendanceId' });
    }
    await kenjoCompareService.fixConflictInKenjo(attendanceId, startTime, endTime, { userId, date });
    res.json({ ok: true });
  } catch (error) {
    console.error('Kenjo /conflicts/fix error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/attendances/create', requireSyncAccess, async (req, res) => {
  try {
    const { userId, date, startTime, endTime } = req.body || {};
    if (!userId || !date) {
      return res.status(400).json({ error: 'Body must include userId and date' });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Body must include startTime and endTime' });
    }
    await createKenjoAttendance(userId, date, startTime, endTime);
    res.json({ ok: true });
  } catch (error) {
    console.error('Kenjo /attendances/create error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

async function buildKenjoNameMap() {
  const users = await getKenjoUsersList();
  const nameById = new Map();
  (users || []).forEach((u) => {
    const id = String(u._id || u.id || '').trim();
    if (id) nameById.set(id, u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || id);
  });
  return nameById;
}

async function syncTimeOffMonth(year, month, nameById) {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDate = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
  const expandedFrom = shiftDate(firstDay, -31);
  const expandedTo = shiftDate(to, 31);

  // Keep month data fully fresh: remove existing rows overlapping this month,
  // then reinsert what Kenjo currently returns for the same range.
  await query(
    `DELETE FROM kenjo_time_off
     WHERE start_date <= $2::date AND end_date >= $1::date`,
    [firstDay, to],
  );

  const list = await getTimeOffRequests(expandedFrom, expandedTo);
  let total = 0;
  for (const item of list || []) {
    const reqId = String(item._id || item.id || '').trim();
    if (!reqId) continue;
    const userId = String(item._userId ?? item.userId ?? item.user_id ?? '').trim();
    const fromVal = item.from ?? item.startDate ?? item.start;
    const toVal = item.to ?? item.endDate ?? item.end;
    const startDate = toDateOnly(fromVal);
    const endDate = toDateOnly(toVal);
    if (!overlapsDateRange(startDate, endDate, firstDay, to)) continue;
    const typeId = String(item._timeOffTypeId ?? item.timeOffTypeId ?? item.time_off_type_id ?? item.type ?? '').trim() || null;
    const typeName = String(item.description ?? item.timeOffTypeName ?? item.time_off_type_name ?? item.typeName ?? item._timeOffType?.name ?? '').trim() || null;
    const status = String(item.status ?? '').trim() || null;
    const partFrom = item.partOfDayFrom ?? item.part_of_day_from ?? null;
    const partTo = item.partOfDayTo ?? item.part_of_day_to ?? null;
    const employeeName = (userId && nameById.get(userId)) || null;

    await query(
      `INSERT INTO kenjo_time_off (
        kenjo_request_id, kenjo_user_id, employee_name, start_date, end_date,
        time_off_type, time_off_type_name, status, part_of_day_from, part_of_day_to, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (kenjo_request_id) DO UPDATE SET
        kenjo_user_id = EXCLUDED.kenjo_user_id,
        employee_name = EXCLUDED.employee_name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        time_off_type = EXCLUDED.time_off_type,
        time_off_type_name = EXCLUDED.time_off_type_name,
        status = EXCLUDED.status,
        part_of_day_from = EXCLUDED.part_of_day_from,
        part_of_day_to = EXCLUDED.part_of_day_to,
        synced_at = NOW()`,
      [
        reqId,
        userId || null,
        employeeName,
        startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
        endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null,
        typeId,
        typeName,
        status,
        partFrom,
        partTo,
      ],
    );
    total++;
  }
  return total;
}

/** Sync time-off requests from Kenjo API into kenjo_time_off table. Uses monthly chunks so all records are returned (API may paginate on large ranges). */
router.post('/sync-time-off', requireKenjoTimeOffAccess, async (_req, res) => {
  try {
    const nameById = await buildKenjoNameMap();

    const monthParam = String(_req.query.month || '').trim().slice(0, 7);
    const hasMonthParam = /^\d{4}-\d{2}$/.test(monthParam);
    const now = new Date();
    const ranges = [];
    if (hasMonthParam) {
      const [yy, mm] = monthParam.split('-').map(Number);
      ranges.push({ startYear: yy, endYear: yy, startMonth: mm, endMonth: mm });
    } else {
      ranges.push({ startYear: now.getFullYear() - 2, endYear: now.getFullYear() + 1, startMonth: 1, endMonth: 12 });
    }
    let total = 0;
    for (const range of ranges) {
      for (let y = range.startYear; y <= range.endYear; y++) {
        const monthStart = y === range.startYear ? range.startMonth : 1;
        const monthEnd = y === range.endYear ? range.endMonth : 12;
        for (let month = monthStart; month <= monthEnd; month++) {
          total += await syncTimeOffMonth(y, month, nameById);
        }
      }
    }

    res.json({ ok: true, synced: total, month: hasMonthParam ? monthParam : null });
  } catch (error) {
    console.error('Kenjo POST /sync-time-off error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Get raw time-off response from Kenjo API (no DB). Query: from, to (YYYY-MM-DD), max 92 days. */
router.get('/time-off/raw', requireKenjoTimeOffAccess, async (req, res) => {
  try {
    const from = String(req.query.from || '').trim().slice(0, 10);
    const to = String(req.query.to || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Query params from and to (YYYY-MM-DD) are required' });
    }
    const list = await getTimeOffRequests(from, to);
    res.json({ from, to, count: (list || []).length, data: list || [] });
  } catch (error) {
    console.error('Kenjo GET /time-off/raw error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Get time-off records for a month (YYYY-MM). Returns rows that overlap the month. */
router.get('/time-off', requireKenjoTimeOffAccess, async (req, res) => {
  try {
    const month = String(req.query.month || '').trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Query param month (YYYY-MM) is required' });
    }
    const [y, m] = month.split('-').map(Number);
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0);
    const lastDayStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const expandedFrom = shiftDate(firstDay, -31);
    const expandedTo = shiftDate(lastDayStr, 31);

    // Always fetch live month data from Kenjo and return it directly.
    // This avoids stale DB cache being shown in UI.
    const nameById = await buildKenjoNameMap();
    const liveList = await getTimeOffRequests(expandedFrom, expandedTo);
    const rows = (liveList || []).map((item) => {
      const reqId = String(item._id || item.id || '').trim();
      const userId = String(item._userId ?? item.userId ?? item.user_id ?? '').trim();
      const fromVal = item.from ?? item.startDate ?? item.start;
      const toVal = item.to ?? item.endDate ?? item.end;
      const startDate = toDateOnly(fromVal);
      const endDate = toDateOnly(toVal);
      const typeId = String(item._timeOffTypeId ?? item.timeOffTypeId ?? item.time_off_type_id ?? item.type ?? '').trim() || null;
      const typeName = String(item.description ?? item.timeOffTypeName ?? item.time_off_type_name ?? item.typeName ?? item._timeOffType?.name ?? '').trim() || null;
      const status = String(item.status ?? '').trim() || null;
      const partFrom = item.partOfDayFrom ?? item.part_of_day_from ?? null;
      const partTo = item.partOfDayTo ?? item.part_of_day_to ?? null;
      const employeeName = (userId && nameById.get(userId)) || null;
      return {
        kenjo_request_id: reqId || null,
        kenjo_user_id: userId || null,
        employee_name: employeeName,
        start_date: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
        end_date: endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null,
        time_off_type: typeId,
        time_off_type_name: typeName,
        status,
        part_of_day_from: partFrom,
        part_of_day_to: partTo,
      };
    }).filter((r) => r.start_date && r.end_date && overlapsDateRange(r.start_date, r.end_date, firstDay, lastDayStr));

    rows.sort((a, b) => {
      const da = String(a.start_date || '');
      const db = String(b.start_date || '');
      if (da !== db) return da.localeCompare(db);
      return String(a.employee_name || '').localeCompare(String(b.employee_name || ''));
    });

    // Keep local DB cache in sync, but do not block response.
    syncTimeOffMonth(y, m, nameById).catch((err) => {
      console.error('Kenjo background sync-time-off month refresh failed', err);
    });

    res.json(rows);
  } catch (error) {
    console.error('Kenjo GET /time-off error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

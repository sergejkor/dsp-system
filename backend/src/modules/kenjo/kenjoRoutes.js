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

const router = Router();

async function ensureKenjoEmployeeLocalColumns() {
  await query(`
    CREATE TABLE IF NOT EXISTS kenjo_employees (
      id SERIAL PRIMARY KEY,
      kenjo_user_id VARCHAR(255) NOT NULL UNIQUE,
      employee_number VARCHAR(64),
      transporter_id VARCHAR(255),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      display_name VARCHAR(255),
      job_title VARCHAR(255),
      start_date DATE,
      contract_end DATE,
      is_active BOOLEAN DEFAULT true,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE kenjo_employees
    ADD COLUMN IF NOT EXISTS fuehrerschein_aufstellungsdatum DATE,
    ADD COLUMN IF NOT EXISTS fuehrerschein_aufstellungsbehoerde TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
    ADD COLUMN IF NOT EXISTS contract_signed_date DATE
  `);
}

router.get('/health', (_req, res) => res.json({ ok: true, module: 'kenjo' }));

router.get('/info', (_req, res) => {
  res.json(kenjoDirectoryService.getKenjoModuleInfo());
});

router.get('/users', async (_req, res) => {
  try {
    const users = await getKenjoUsersList();
    res.json(users || []);
  } catch (error) {
    console.error('Kenjo /users error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/custom-fields', async (_req, res) => {
  try {
    const fields = await getKenjoCustomFields();
    res.json(fields || []);
  } catch (error) {
    console.error('Kenjo /custom-fields error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

/** Sync kenjo_employees from Kenjo API (user-accounts + works). Fills transporter_id, PN, names, etc. for payroll KPI matching. */
router.post('/sync-employees', async (_req, res) => {
  try {
    const result = await syncKenjoEmployeesToDb();
    res.json(result);
  } catch (error) {
    console.error('Kenjo POST /sync-employees error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/employees/:id', async (req, res) => {
  try {
    await ensureKenjoEmployeeLocalColumns();
    const target = await resolveKenjoTargetEmployee(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Employee not found in Kenjo' });
    }
    const { employee, kenjoUserId } = target;
    const locRes = await query(
      `SELECT fuehrerschein_aufstellungsdatum, fuehrerschein_aufstellungsbehoerde, whatsapp_number, contract_signed_date
       FROM kenjo_employees WHERE kenjo_user_id = $1`,
      [kenjoUserId]
    );
    const row = locRes.rows[0];
    const dspLocal = {
      fuehrerschein_aufstellungsdatum: formatDateOnlyForClient(row?.fuehrerschein_aufstellungsdatum),
      fuehrerschein_aufstellungsbehoerde: row?.fuehrerschein_aufstellungsbehoerde
        ? String(row.fuehrerschein_aufstellungsbehoerde)
        : '',
      whatsapp_number: row?.whatsapp_number
        ? String(row.whatsapp_number)
        : '',
      contract_signed_date: formatDateOnlyForClient(row?.contract_signed_date),
    };
    const o2Res = await query(
      `SELECT id, kenjo_user_id, name, phone_number, sim_card_number
       FROM o2_telefonica
       WHERE kenjo_user_id = $1
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [kenjoUserId],
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

router.put('/employees/:id/work', async (req, res) => {
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

router.put('/employees/:id/deactivate', async (req, res) => {
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

function formatDateOnlyForClient(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const normalized = toDateOnly(value);
  if (normalized) return normalized;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function resolveDateOnlyForDb(value) {
  if (value === '' || value == null) {
    return { mode: 'clear', value: null };
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { mode: 'set', value: formatDateOnlyForClient(value) };
  }
  const normalized = toDateOnly(value);
  if (normalized) {
    return { mode: 'set', value: normalized };
  }
  return { mode: 'keep', value: null };
}

async function saveEmployeeDspLocal(kenjoUserId, dspLocal) {
  await ensureKenjoEmployeeLocalColumns();
  const rawD = dspLocal?.fuehrerschein_aufstellungsdatum;
  const rawB = dspLocal?.fuehrerschein_aufstellungsbehoerde;
  const rawW = dspLocal?.whatsapp_number;
  const rawContractSigned = dspLocal?.contract_signed_date;
  const { mode: dateMode, value: dateVal } = resolveDateOnlyForDb(rawD);
  const { mode: contractSignedMode, value: contractSignedVal } = resolveDateOnlyForDb(rawContractSigned);
  const behVal =
    rawB === '' || rawB == null ? null : String(rawB).trim().slice(0, 2000);
  const whatsappVal =
    rawW === '' || rawW == null ? null : String(rawW).trim().slice(0, 255);

  await query(
    `INSERT INTO kenjo_employees (
       kenjo_user_id,
       first_name,
       last_name,
       display_name,
       is_active,
       fuehrerschein_aufstellungsdatum,
       fuehrerschein_aufstellungsbehoerde,
       whatsapp_number,
       contract_signed_date,
       updated_at
     ) VALUES (
       $1,
       '',
       '',
       '',
       true,
       CASE WHEN $5 = 'keep' THEN NULL ELSE $2::date END,
       $3,
       $4,
       CASE WHEN $6 = 'keep' THEN NULL ELSE $7::date END,
       NOW()
     )
     ON CONFLICT (kenjo_user_id) DO UPDATE SET
       fuehrerschein_aufstellungsdatum = CASE
         WHEN $5 = 'keep' THEN kenjo_employees.fuehrerschein_aufstellungsdatum
         ELSE EXCLUDED.fuehrerschein_aufstellungsdatum
       END,
       fuehrerschein_aufstellungsbehoerde = EXCLUDED.fuehrerschein_aufstellungsbehoerde,
       whatsapp_number = EXCLUDED.whatsapp_number,
       contract_signed_date = CASE
         WHEN $6 = 'keep' THEN kenjo_employees.contract_signed_date
         ELSE EXCLUDED.contract_signed_date
       END,
       updated_at = NOW()`,
    [kenjoUserId, dateVal, behVal, whatsappVal, dateMode, contractSignedMode, contractSignedVal]
  );
}

async function resolveKenjoTargetEmployee(employeeRef) {
  const employee = await getKenjoEmployeeByIdReadable(employeeRef);
  const kenjoUserId = String(employee?.id || employee?._id || '').trim();
  if (!employee || !kenjoUserId) return null;
  return { employee, kenjoUserId };
}

router.put('/employees/:id/profile', async (req, res) => {
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
        const target = await resolveKenjoTargetEmployee(id);
        if (!target) {
          errors.push('dspLocal: Employee not found in Kenjo');
        } else {
          await saveEmployeeDspLocal(target.kenjoUserId, dspLocal);
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

router.put('/employees/:id/internal-profile', async (req, res) => {
  try {
    const { id } = req.params;
    const { dspLocal } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Employee id is required' });
    }
    if (!dspLocal || typeof dspLocal !== 'object') {
      return res.status(400).json({ error: 'dspLocal payload is required' });
    }
    const target = await resolveKenjoTargetEmployee(id);
    if (!target) {
      return res.status(404).json({ error: 'Employee not found in Kenjo' });
    }
    await saveEmployeeDspLocal(target.kenjoUserId, dspLocal);
    res.json({ ok: true, kenjo_user_id: target.kenjoUserId });
  } catch (error) {
    console.error('Kenjo PUT /employees/:id/internal-profile error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/compare', async (req, res) => {
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

router.get('/compare-debug', async (req, res) => {
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

router.post('/conflicts/ignore', async (req, res) => {
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

router.post('/conflicts/fix', async (req, res) => {
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

router.post('/attendances/create', async (req, res) => {
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

  // Keep month data fully fresh: remove existing rows overlapping this month,
  // then reinsert what Kenjo currently returns for the same range.
  await query(
    `DELETE FROM kenjo_time_off
     WHERE start_date <= $2::date AND end_date >= $1::date`,
    [firstDay, to],
  );

  const list = await getTimeOffRequests(firstDay, to);
  let total = 0;
  for (const item of list || []) {
    const reqId = String(item._id || item.id || '').trim();
    if (!reqId) continue;
    const userId = String(item._userId ?? item.userId ?? item.user_id ?? '').trim();
    const fromVal = item.from ?? item.startDate ?? item.start;
    const toVal = item.to ?? item.endDate ?? item.end;
    const startDate = toDateOnly(fromVal);
    const endDate = toDateOnly(toVal);
    const typeId = String(item._timeOffTypeId ?? item.timeOffTypeId ?? item.time_off_type_id ?? item.type ?? '').trim() || null;
    const typeName = String(item._timeOffType?.name ?? item.timeOffTypeName ?? item.time_off_type_name ?? item.typeName ?? item.type ?? item.description ?? '').trim() || null;
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
router.post('/sync-time-off', async (_req, res) => {
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
router.get('/time-off/raw', async (req, res) => {
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
router.get('/time-off', async (req, res) => {
  try {
    const month = String(req.query.month || '').trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Query param month (YYYY-MM) is required' });
    }
    const [y, m] = month.split('-').map(Number);
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0);
    const lastDayStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    // Always fetch live month data from Kenjo and return it directly.
    // This avoids stale DB cache being shown in UI.
    const nameById = await buildKenjoNameMap();
    const liveList = await getTimeOffRequests(firstDay, lastDayStr);
    const rows = (liveList || []).map((item) => {
      const reqId = String(item._id || item.id || '').trim();
      const userId = String(item._userId ?? item.userId ?? item.user_id ?? '').trim();
      const fromVal = item.from ?? item.startDate ?? item.start;
      const toVal = item.to ?? item.endDate ?? item.end;
      const startDate = toDateOnly(fromVal);
      const endDate = toDateOnly(toVal);
      const typeId = String(item._timeOffTypeId ?? item.timeOffTypeId ?? item.time_off_type_id ?? item.type ?? '').trim() || null;
      const typeName = String(item._timeOffType?.name ?? item.timeOffTypeName ?? item.time_off_type_name ?? item.typeName ?? item.type ?? item.description ?? '').trim() || null;
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
    }).filter((r) => r.start_date && r.end_date);

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

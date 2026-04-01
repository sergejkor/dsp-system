import { query } from '../../db.js';
import { getKenjoUsersList, getKenjoAttendances } from '../kenjo/kenjoClient.js';
import settingsService from '../settings/settingsService.js';
import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import employeeService from '../employees/employeeService.js';

/**
 * Get ISO year and week number for a date string YYYY-MM-DD.
 */
function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const year = monday.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil((((monday - start) / 86400000) + start.getDay() + 1) / 7);
  return { year, week };
}

function getISOWeekRange(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4, 12, 0, 0));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function clampIsoDateRange(start, end, min, max) {
  const clampedStart = start < min ? min : start;
  const clampedEnd = end > max ? max : end;
  return {
    start: clampedStart,
    end: clampedEnd,
  };
}

/**
 * Get list of { year, week } for all weeks overlapping [fromDate, toDate].
 */
function getWeeksInRange(fromDate, toDate) {
  const weeks = [];
  const seen = new Set();
  const from = new Date(fromDate + 'T12:00:00');
  const to = new Date(toDate + 'T12:00:00');
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    const { year, week } = getISOWeek(s);
    const key = `${year}-${week}`;
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push({ year, week });
    }
  }
  weeks.sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);
  return weeks;
}

/**
 * Count working days per user in a date range from Kenjo attendances.
 * Returns Map<userId, number> and Map<userId, Map<weekKey, days>> for days per week.
 */
function countWorkingDaysFromAttendances(attendances, fromDate, toDate) {
  const from = fromDate.slice(0, 10);
  const to = toDate.slice(0, 10);
  const distinctByUserCorrect = new Map();
  const byUserWeekDays = new Map();
  for (const a of attendances || []) {
    const uid = String(a.userId ?? a.user_id ?? a.employeeId ?? a._id ?? '').trim();
    const rawDate = a.date ?? a.day ?? a.startTime ?? a.start_time ?? '';
    const dateStr = String(rawDate).trim().slice(0, 10);
    if (!uid || !dateStr || dateStr.length < 10 || dateStr < from || dateStr > to) continue;
    if (!distinctByUserCorrect.has(uid)) distinctByUserCorrect.set(uid, new Set());
    distinctByUserCorrect.get(uid).add(dateStr);
    const { year, week } = getISOWeek(dateStr);
    const wk = `${year}-${week}`;
    if (!byUserWeekDays.has(uid)) byUserWeekDays.set(uid, new Map());
    const wm = byUserWeekDays.get(uid);
    if (!wm.has(wk)) wm.set(wk, new Set());
    wm.get(wk).add(dateStr);
  }
  const workingDaysInRange = new Map();
  for (const [uid, set] of distinctByUserCorrect) workingDaysInRange.set(uid, set.size);
  const daysPerWeek = new Map();
  for (const [uid, wm] of byUserWeekDays) {
    const weekCounts = new Map();
    for (const [wk, set] of wm) weekCounts.set(wk, set.size);
    daysPerWeek.set(uid, weekCounts);
  }
  return { workingDaysInRange, daysPerWeek };
}

/**
 * Calculate payroll table for a month and KPI period (from–to).
 * Returns array of row objects for frontend table.
 */
export async function calculatePayroll(month, fromDate, toDate) {
  const monthStr = String(month || '').trim().slice(0, 7);
  const from = String(fromDate || '').trim().slice(0, 10);
  const to = String(toDate || '').trim().slice(0, 10);
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) throw new Error('month (YYYY-MM) is required');
  if (!from || !to || from > to) throw new Error('from and to dates (YYYY-MM-DD) are required');

  const [y, m] = monthStr.split('-').map(Number);
  const monthStart = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const weeksInPeriod = getWeeksInRange(from, to);
  const numWeeks = weeksInPeriod.length;

  // Formula settings (defaults match current hardcoded logic).
  let payrollFormula = {
    fantastic_threshold: 93,
    great_threshold: 85,
    fair_threshold: 85,
    fantastic_plus_bonus_eur: 17,
    fantastic_bonus_eur: 5,
  };
  try {
    const p = await settingsService.getByGroupKey('payroll');
    payrollFormula = {
      fantastic_threshold: Number(p?.payroll_fantastic_threshold?.value ?? 93),
      great_threshold: Number(p?.payroll_great_threshold?.value ?? 85),
      fair_threshold: Number(p?.payroll_fair_threshold?.value ?? 85),
      fantastic_plus_bonus_eur: Number(p?.payroll_fantastic_plus_bonus_eur?.value ?? 17),
      fantastic_bonus_eur: Number(p?.payroll_fantastic_bonus_eur?.value ?? 5),
    };
  } catch (_) {}

  const weekPlaceholders = weeksInPeriod.length > 0
    ? weeksInPeriod.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
    : '';
  const weekParams = weeksInPeriod.flatMap((w) => [w.year, w.week]);

  let kpiRows = { rows: [] };
  let workDaysRows = { rows: [] };
  let weeklyFactsRows = { rows: [] };
  if (weeksInPeriod.length > 0) {
    const [kpiRes, workDaysRes, weeklyFactsRes] = await Promise.all([
      query(
        `SELECT employee_id, year, week, kpi FROM kpi_data WHERE (year, week) IN (${weekPlaceholders})`,
        weekParams
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT employee_id, year, week, worked_days FROM work_days_data WHERE (year, week) IN (${weekPlaceholders})`,
        weekParams
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT employee_id, year, week, kpi, worked_days, quality_bonus_week FROM weekly_facts WHERE (year, week) IN (${weekPlaceholders})`,
        weekParams
      ).catch(() => ({ rows: [] })),
    ]);
    kpiRows = kpiRes;
    workDaysRows = workDaysRes;
    weeklyFactsRows = weeklyFactsRes;
  }

  const [users, attendancesMonth, attendancesPeriod, abzugRows, vorschussRows, bonusRows, kenjoEmployeesRows] = await Promise.all([
    getKenjoUsersList(),
    getKenjoAttendances(monthStart, monthEnd),
    getKenjoAttendances(from, to),
    query(
      `SELECT employee_id, line_no, amount, comment FROM payroll_abzug_items WHERE period_id = $1 ORDER BY employee_id, line_no`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT kenjo_employee_id, SUM(amount) AS total FROM vorschuss WHERE month = $1 GROUP BY kenjo_employee_id`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT employee_id, SUM(amount) AS total FROM payroll_bonus_items WHERE period_id = $1 GROUP BY employee_id`,
      [monthStr]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT kenjo_user_id, transporter_id FROM kenjo_employees WHERE transporter_id IS NOT NULL AND transporter_id != ''`
    ).catch(() => ({ rows: [] })),
  ]);

  const { workingDaysInRange: workingDaysInMonthMap } = countWorkingDaysFromAttendances(attendancesMonth, monthStart, monthEnd);
  const { daysPerWeek: daysPerWeekPeriod } = countWorkingDaysFromAttendances(attendancesPeriod, from, to);

  const kpiByKey = new Map();
  for (const r of (kpiRows?.rows || [])) {
    const empId = String(r.employee_id ?? '').trim().toLowerCase();
    const key = `${empId}-${r.year}-${r.week}`;
    kpiByKey.set(key, Number(r.kpi) || 0);
  }

  const daysByEmployeeWeek = new Map();
  for (const r of (workDaysRows?.rows || [])) {
    const empId = String(r.employee_id ?? '').trim().toLowerCase();
    const key = `${empId}-${r.year}-${r.week}`;
    daysByEmployeeWeek.set(key, Number(r.worked_days) || 0);
  }

  const weeklyFactsByKey = new Map();
  for (const r of (weeklyFactsRows?.rows || [])) {
    const empId = String(r.employee_id ?? '').trim().toLowerCase();
    const key = `${empId}-${r.year}-${r.week}`;
    weeklyFactsByKey.set(key, {
      kpi: Number(r.kpi) || 0,
      worked_days: Number(r.worked_days) || 0,
      quality_bonus_week: Number(r.quality_bonus_week) || 0,
    });
  }

  const abzugByEmployee = new Map();
  const abzugLinesByEmployee = new Map();
  for (const r of abzugRows?.rows || []) {
    const eid = String(r.employee_id ?? '').trim();
    if (!eid) continue;
    const lineNo = Number(r.line_no) ?? 0;
    const amount = Number(r.amount) || 0;
    const comment = (r.comment != null && r.comment !== undefined) ? String(r.comment).trim() : '';
    if (!abzugByEmployee.has(eid)) {
      abzugByEmployee.set(eid, 0);
      abzugLinesByEmployee.set(eid, [
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
      ]);
    }
    abzugByEmployee.set(eid, (abzugByEmployee.get(eid) || 0) + amount);
    const lines = abzugLinesByEmployee.get(eid);
    if (lineNo >= 0 && lineNo <= 2) lines[lineNo] = { amount, comment };
  }
  for (const [eid, total] of abzugByEmployee) {
    if (!abzugLinesByEmployee.has(eid)) {
      abzugLinesByEmployee.set(eid, [
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
      ]);
    }
  }
  const vorschussByEmployee = new Map((vorschussRows?.rows || []).map((r) => [String(r.kenjo_employee_id).trim(), Number(r.total) || 0]));
  const bonusByEmployeeCorrect = new Map((bonusRows?.rows || []).map((r) => [String(r.employee_id).trim(), Number(r.total) || 0]));

  // Kenjo user ID -> Amazon transporter ID (from local kenjo_employees; kpi_data uses transporter ID)
  const transporterIdByKenjoId = new Map();
  for (const r of kenjoEmployeesRows?.rows || []) {
    const kid = String(r.kenjo_user_id ?? '').trim();
    const tid = String(r.transporter_id ?? '').trim();
    if (kid && tid) transporterIdByKenjoId.set(kid.toLowerCase(), tid);
  }

  const periodDays = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000) + 1;

  const KENJO_TYPE_KRANK = '685e7223e6bac64cb0a27e39';
  const KENJO_TYPE_URLAUB = '685e7223e6bac64cb0a27e38';

  const timeOffRows = await query(
    `SELECT kenjo_user_id,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            time_off_type FROM kenjo_time_off
     WHERE start_date <= $2::date AND end_date >= $1::date
       AND (status IS NULL OR status = 'Processed')`,
    [monthStart, monthEnd]
  ).catch(() => ({ rows: [] }));

  function toDateStr(val) {
    if (val == null) return '';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const s = String(val).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }

  const timeOffDaysByEmployee = new Map();
  for (const r of timeOffRows?.rows || []) {
    const eid = String(r.kenjo_user_id ?? '').trim();
    if (!eid) continue;
    const typeId = String(r.time_off_type ?? '').trim();
    if (typeId !== KENJO_TYPE_KRANK && typeId !== KENJO_TYPE_URLAUB) continue;
    const start = toDateStr(r.start_date);
    const end = toDateStr(r.end_date);
    if (!start || !end) continue;
    const startT = new Date(start + 'T12:00:00').getTime();
    const endT = new Date(end + 'T12:00:00').getTime();
    const monthStartT = new Date(monthStart + 'T12:00:00').getTime();
    const monthEndT = new Date(monthEnd + 'T12:00:00').getTime();
    let count = 0;
    for (let t = Math.max(startT, monthStartT); t <= Math.min(endT, monthEndT); t += 86400000) {
      const d = new Date(t);
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    }
    if (!timeOffDaysByEmployee.has(eid)) timeOffDaysByEmployee.set(eid, { krank_days: 0, urlaub_days: 0 });
    const rec = timeOffDaysByEmployee.get(eid);
    if (typeId === KENJO_TYPE_KRANK) rec.krank_days += count;
    else if (typeId === KENJO_TYPE_URLAUB) rec.urlaub_days += count;
  }

  const rows = [];
  const weeklyFactsToUpsert = [];
  const debugSample = [];
  const DEBUG_SAMPLE_SIZE = 8;
  let employeesWithTransporterId = 0;
  let employeesWithNonZeroBonus = 0;
  const weeklySummaryMap = new Map(
    weeksInPeriod.map(({ year, week }) => {
      const weekRange = clampIsoDateRange(getISOWeekRange(year, week).start, getISOWeekRange(year, week).end, from, to);
      return [
        `${year}-${week}`,
        {
          year,
          week,
          period_from: weekRange.start,
          period_to: weekRange.end,
          total_working_days: 0,
          total_bonus: 0,
          kpi_sum: 0,
          kpi_count: 0,
          employee_count: 0,
        },
      ];
    })
  );

  for (const u of users || []) {
    const uid = String(u._id || '').trim();
    const pn = u.employeeNumber ?? u.employee_number ?? '';
    const fromApi = (u.transportationId || u.transporterId || '').trim();
    const fromLocal = transporterIdByKenjoId.get(uid.toLowerCase());
    const transporterId = (fromLocal || fromApi).trim();
    const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '';
    const workingDays = workingDaysInMonthMap.get(uid) ?? 0;
    const abzug = abzugByEmployee.get(uid) ?? 0;
    const vorschuss = vorschussByEmployee.get(uid) ?? 0;
    const bonus = bonusByEmployeeCorrect.get(uid) ?? 0;

    let totalBonus = 0;
    const employeeWeeklyBreakdown = [];
    const daysPerWeekUser = daysPerWeekPeriod.get(uid);
    const pnStr = String(pn ?? '').trim();
    const uidLower = uid.toLowerCase();
    const pnStrLower = pnStr.toLowerCase();
    const transLower = transporterId.toLowerCase();
    if (transporterId) employeesWithTransporterId++;

    let debugFirstWeek = null;
    for (const { year, week } of weeksInPeriod) {
      const weekKey = `${year}-${week}`;
      const weekSummary = weeklySummaryMap.get(weekKey);
      const savedFact =
        weeklyFactsByKey.get(`${uidLower}-${year}-${week}`) ??
        weeklyFactsByKey.get(`${pnStrLower}-${year}-${week}`) ??
        weeklyFactsByKey.get(`${transLower}-${year}-${week}`);
      // Use saved fact only if it has non-zero bonus; otherwise recalc from kpi_data (stale 0 would block correct bonus)
      if (savedFact && (savedFact.quality_bonus_week || 0) > 0) {
        totalBonus += savedFact.quality_bonus_week;
        employeeWeeklyBreakdown.push({
          year,
          week,
          period_from: weekSummary?.period_from || from,
          period_to: weekSummary?.period_to || to,
          working_days: Math.round((Number(savedFact.worked_days) || 0) * 100) / 100,
          kpi: Math.round((Number(savedFact.kpi) || 0) * 100) / 100,
          weekly_bonus: Math.round((Number(savedFact.quality_bonus_week) || 0) * 100) / 100,
          source: 'weekly_facts',
        });
        if (weekSummary) {
          weekSummary.total_working_days += Number(savedFact.worked_days) || 0;
          weekSummary.total_bonus += Number(savedFact.quality_bonus_week) || 0;
          weekSummary.kpi_sum += Number(savedFact.kpi) || 0;
          weekSummary.kpi_count += 1;
          weekSummary.employee_count += 1;
        }
        if (!debugFirstWeek) {
          debugFirstWeek = { year, week, source: 'weekly_facts', kpi: savedFact.kpi, daysInWeek: savedFact.worked_days, rate: null, qualityBonusWeek: savedFact.quality_bonus_week };
        }
        continue;
      }
      const daysFromDb =
        daysByEmployeeWeek.get(`${uidLower}-${year}-${week}`) ??
        daysByEmployeeWeek.get(`${pnStrLower}-${year}-${week}`) ??
        daysByEmployeeWeek.get(`${transLower}-${year}-${week}`);
      const daysFromKenjo = daysPerWeekUser?.get(weekKey) ?? 0;
      let daysInWeek = daysFromDb ?? daysFromKenjo;
      const kpiKeyByKenjo = `${uidLower}-${year}-${week}`;
      const kpiKeyByPn = `${pnStrLower}-${year}-${week}`;
      const kpiKeyByTrans = `${transLower}-${year}-${week}`;
      const kpiByKenjo = kpiByKey.get(kpiKeyByKenjo) ?? 0;
      const kpiByPn = kpiByKey.get(kpiKeyByPn) ?? 0;
      const kpiByTrans = kpiByKey.get(kpiKeyByTrans) ?? 0;
      const kpiFromKpiData = kpiByKenjo || kpiByPn || kpiByTrans || 0;
      let rate = 0;
      if (kpiFromKpiData > payrollFormula.fantastic_threshold) rate = payrollFormula.fantastic_plus_bonus_eur;
      else if (kpiFromKpiData > payrollFormula.great_threshold) rate = payrollFormula.fantastic_bonus_eur;
      else if (kpiFromKpiData < payrollFormula.fair_threshold) rate = 0;
      else rate = 0;
      if (daysInWeek === 0 && rate > 0 && workingDays > 0 && numWeeks > 0) {
        daysInWeek = Math.max(1, Math.round((workingDays / numWeeks) * 100) / 100);
      }
      const qualityBonusWeek = Math.round(daysInWeek * rate * 100) / 100;
      totalBonus += qualityBonusWeek;
      employeeWeeklyBreakdown.push({
        year,
        week,
        period_from: weekSummary?.period_from || from,
        period_to: weekSummary?.period_to || to,
        working_days: Math.round((Number(daysInWeek) || 0) * 100) / 100,
        kpi: Math.round((Number(kpiFromKpiData) || 0) * 100) / 100,
        weekly_bonus: qualityBonusWeek,
        source: 'calculated',
      });
      if (weekSummary && (daysInWeek > 0 || kpiFromKpiData > 0 || qualityBonusWeek > 0)) {
        weekSummary.total_working_days += Number(daysInWeek) || 0;
        weekSummary.total_bonus += Number(qualityBonusWeek) || 0;
        weekSummary.kpi_sum += Number(kpiFromKpiData) || 0;
        weekSummary.kpi_count += 1;
        weekSummary.employee_count += 1;
      }
      if (!debugFirstWeek) {
        debugFirstWeek = { year, week, kpiByKenjo, kpiByPn, kpiByTrans, kpiUsed: kpiFromKpiData, daysInWeek, rate, qualityBonusWeek };
      }
      weeklyFactsToUpsert.push({
        employee_id: uid,
        year,
        week,
        kpi: kpiFromKpiData,
        worked_days: daysInWeek,
        quality_bonus_week: qualityBonusWeek,
      });
    }

    if (totalBonus > 0) employeesWithNonZeroBonus++;

    if (debugSample.length < DEBUG_SAMPLE_SIZE) {
      debugSample.push({
        name,
        pn,
        kenjo_id: uid.slice(0, 12) + '…',
        transporter_id: transporterId ? transporterId.slice(0, 12) + (transporterId.length > 12 ? '…' : '') : '(empty)',
        has_transporter_id: !!transporterId,
        total_bonus: Math.round(totalBonus * 100) / 100,
        first_week: debugFirstWeek,
      });
    }

    const afterAbzug = totalBonus - abzug;
    const maxVerpfl = workingDays * 14;
    const verpflMehr = afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl;
    const fahrtGeld = afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0;

    const abzugLines = abzugLinesByEmployee.get(uid) || [
      { amount: 0, comment: '' },
      { amount: 0, comment: '' },
      { amount: 0, comment: '' },
    ];
    // Only include employees who have at least one working day in the calculation month
    const timeOff = timeOffDaysByEmployee.get(uid) || { krank_days: 0, urlaub_days: 0 };
    if (workingDays > 0) {
      rows.push({
        kenjo_employee_id: uid,
        name,
        pn,
        weeks: numWeeks,
        working_days: workingDays,
        period_days: periodDays,
        total_bonus: Math.round(totalBonus * 100) / 100,
        abzug: Math.round(abzug * 100) / 100,
        abzug_lines: abzugLines.map((l) => ({ amount: Math.round((Number(l.amount) || 0) * 100) / 100, comment: l.comment || '' })),
        after_abzug: Math.round(afterAbzug * 100) / 100,
        verpfl_mehr: Math.round(verpflMehr * 100) / 100,
        fahrt_geld: Math.round(fahrtGeld * 100) / 100,
        bonus: Math.round(bonus * 100) / 100,
        eintrittsdatum: u.startDate || null,
        austrittsdatum: u.contractEnd || null,
        vorschuss: Math.round(vorschuss * 100) / 100,
        krank_days: timeOff.krank_days,
        urlaub_days: timeOff.urlaub_days,
        weekly_breakdown: employeeWeeklyBreakdown,
      });
    }
  }

  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const manualRows = await query(
    `SELECT kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss FROM payroll_manual_entries WHERE period_id = $1`,
    [monthStr]
  ).catch(() => ({ rows: [] }));

  const manualByEmployee = new Map();
  for (const r of manualRows?.rows || []) {
    const eid = String(r.kenjo_employee_id ?? '').trim();
    if (!eid) continue;
    manualByEmployee.set(eid, {
      working_days: Number(r.working_days) || 0,
      total_bonus: Number(r.total_bonus) || 0,
      abzug: Number(r.abzug) || 0,
      bonus: Number(r.bonus) || 0,
      vorschuss: Number(r.vorschuss) || 0,
    });
  }

  const userIdToUser = new Map((users || []).map((u) => [String(u._id || u.id || '').trim(), u]));

  const rowsWithManual = [];
  const seenIds = new Set();
  for (const row of rows) {
    const eid = row.kenjo_employee_id;
    const manual = manualByEmployee.get(eid);
    if (manual) {
      manualByEmployee.delete(eid);
      const afterAbzug = Math.round((manual.total_bonus - manual.abzug) * 100) / 100;
      const maxVerpfl = manual.working_days * 14;
      const verpflMehr = Math.round((afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl) * 100) / 100;
      const fahrtGeld = Math.round((afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0) * 100) / 100;
      rowsWithManual.push({
        ...row,
        working_days: manual.working_days,
        total_bonus: Math.round(manual.total_bonus * 100) / 100,
        abzug: Math.round(manual.abzug * 100) / 100,
        abzug_lines: [
          { amount: Math.round(manual.abzug * 100) / 100, comment: '' },
          { amount: 0, comment: '' },
          { amount: 0, comment: '' },
        ],
        after_abzug: afterAbzug,
        verpfl_mehr: verpflMehr,
        fahrt_geld: fahrtGeld,
        bonus: Math.round(manual.bonus * 100) / 100,
        vorschuss: Math.round(manual.vorschuss * 100) / 100,
        krank_days: row.krank_days ?? 0,
        urlaub_days: row.urlaub_days ?? 0,
        weekly_breakdown: row.weekly_breakdown || [],
      });
    } else {
      rowsWithManual.push(row);
    }
    seenIds.add(eid);
  }
  for (const [eid, manual] of manualByEmployee) {
    const u = userIdToUser.get(eid);
    const name = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || eid;
    const pn = u?.employeeNumber ?? u?.employee_number ?? '';
    const afterAbzug = Math.round((manual.total_bonus - manual.abzug) * 100) / 100;
    const maxVerpfl = manual.working_days * 14;
    const verpflMehr = Math.round((afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl) * 100) / 100;
    const fahrtGeld = Math.round((afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0) * 100) / 100;
    const timeOff = timeOffDaysByEmployee.get(eid) || { krank_days: 0, urlaub_days: 0 };
    rowsWithManual.push({
      kenjo_employee_id: eid,
      name,
      pn,
      working_days: manual.working_days,
      period_days: periodDays,
      total_bonus: Math.round(manual.total_bonus * 100) / 100,
      abzug: Math.round(manual.abzug * 100) / 100,
      abzug_lines: [
        { amount: Math.round(manual.abzug * 100) / 100, comment: '' },
        { amount: 0, comment: '' },
        { amount: 0, comment: '' },
      ],
      after_abzug: afterAbzug,
      verpfl_mehr: verpflMehr,
      fahrt_geld: fahrtGeld,
      bonus: Math.round(manual.bonus * 100) / 100,
      eintrittsdatum: u?.startDate || null,
      austrittsdatum: u?.contractEnd || null,
      vorschuss: Math.round(manual.vorschuss * 100) / 100,
      krank_days: timeOff.krank_days,
      urlaub_days: timeOff.urlaub_days,
      weekly_breakdown: [],
    });
  }
  rowsWithManual.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  for (const row of weeklyFactsToUpsert) {
    await query(
      `INSERT INTO weekly_facts (employee_id, year, week, kpi, worked_days, quality_bonus_week, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (employee_id, year, week) DO UPDATE SET
         kpi = EXCLUDED.kpi,
         worked_days = EXCLUDED.worked_days,
         quality_bonus_week = EXCLUDED.quality_bonus_week,
         updated_at = NOW()`,
      [row.employee_id, row.year, row.week, row.kpi, row.worked_days, row.quality_bonus_week]
    );
  }

  const debug = {
    summary: {
      total_employees: (users || []).length,
      employees_with_transporter_id: employeesWithTransporterId,
      employees_with_non_zero_bonus: employeesWithNonZeroBonus,
      kpi_data_rows: (kpiRows?.rows || []).length,
      work_days_data_rows: (workDaysRows?.rows || []).length,
      kenjo_employees_rows: (kenjoEmployeesRows?.rows || []).length,
      weeks_in_period: numWeeks,
      period_from: from,
      period_to: to,
    },
    sample_kpi_keys: Array.from(kpiByKey.keys()).slice(0, 5),
    sample: debugSample,
  };

  const weekly_breakdown = weeksInPeriod.map(({ year, week }) => {
    const item = weeklySummaryMap.get(`${year}-${week}`) || {};
    const avgKpi = item.kpi_count ? item.kpi_sum / item.kpi_count : 0;
    return {
      year,
      week,
      period_from: item.period_from || from,
      period_to: item.period_to || to,
      employee_count: item.employee_count || 0,
      total_working_days: Math.round((Number(item.total_working_days) || 0) * 100) / 100,
      average_kpi: Math.round(avgKpi * 100) / 100,
      total_bonus: Math.round((Number(item.total_bonus) || 0) * 100) / 100,
    };
  });

  return { month: monthStr, from, to, period_days: periodDays, rows: rowsWithManual, weekly_breakdown, debug };
}

/**
 * Save Abzug for one employee in a period (month). Three lines: line_no 0, 1, 2 with amount and comment each.
 */
export async function saveAbzug(periodId, employeeId, lines) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  const arr = Array.isArray(lines) ? lines : [];
  const three = [
    { amount: Number(arr[0]?.amount) || 0, comment: String(arr[0]?.comment ?? '').trim().slice(0, 500) },
    { amount: Number(arr[1]?.amount) || 0, comment: String(arr[1]?.comment ?? '').trim().slice(0, 500) },
    { amount: Number(arr[2]?.amount) || 0, comment: String(arr[2]?.comment ?? '').trim().slice(0, 500) },
  ];
  for (let lineNo = 0; lineNo < 3; lineNo++) {
    const { amount, comment } = three[lineNo];
    if (Number.isNaN(amount) || amount < 0) throw new Error('amount must be a non-negative number');
    await query(
      `INSERT INTO payroll_abzug_items (period_id, employee_id, line_no, amount, comment, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (period_id, employee_id, line_no) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
      [period, empId, lineNo, amount, comment || '']
    );
  }
  return { ok: true };
}

/**
 * Save bonus for one employee in a period (month). Upserts line_no 0 in payroll_bonus_items.
 */
export async function saveBonus(periodId, employeeId, amount, comment) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt < 0) throw new Error('amount must be a non-negative number');
  const cmt = String(comment ?? '').trim().slice(0, 500);
  await query(
    `INSERT INTO payroll_bonus_items (period_id, employee_id, line_no, amount, comment, updated_at)
     VALUES ($1, $2, 0, $3, $4, NOW())
     ON CONFLICT (period_id, employee_id, line_no) DO UPDATE SET amount = EXCLUDED.amount, comment = EXCLUDED.comment, updated_at = NOW()`,
    [period, empId, amt, cmt]
  );
  return { ok: true };
}

/**
 * Save a manual payroll entry for one employee in a period (month).
 */
export async function saveManualEntry(periodId, employeeId, payload) {
  const period = String(periodId || '').trim().slice(0, 7);
  const empId = String(employeeId || '').trim();
  if (!period || !/^\d{4}-\d{2}$/.test(period) || !empId) throw new Error('period_id (YYYY-MM) and employee_id are required');
  const working_days = Number(payload.working_days) || 0;
  const total_bonus = Number(payload.total_bonus) || 0;
  const abzug = Number(payload.abzug) || 0;
  const bonus = Number(payload.bonus) || 0;
  const vorschuss = Number(payload.vorschuss) || 0;
  await query(
    `INSERT INTO payroll_manual_entries (period_id, kenjo_employee_id, working_days, total_bonus, abzug, bonus, vorschuss, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (period_id, kenjo_employee_id) DO UPDATE SET
       working_days = EXCLUDED.working_days,
       total_bonus = EXCLUDED.total_bonus,
       abzug = EXCLUDED.abzug,
       bonus = EXCLUDED.bonus,
       vorschuss = EXCLUDED.vorschuss,
       updated_at = NOW()`,
    [period, empId, working_days, total_bonus, abzug, bonus, vorschuss]
  );
  return { ok: true };
}

/**
 * Get KPI data by weeks for an employee. Matches by kenjo_employee_id, transporter_id (from kenjo_employees), or employee_number (PN).
 */
export async function getKpiByEmployee(kenjoEmployeeId, employeeNumber) {
  const kid = String(kenjoEmployeeId || '').trim();
  const pn = String(employeeNumber ?? '').trim();
  if (!kid && !pn) return [];

  const kenjoRow = await query(
    `SELECT transporter_id FROM kenjo_employees WHERE kenjo_user_id = $1`,
    [kid]
  ).catch(() => ({ rows: [] }));
  const transporterId = (kenjoRow?.rows?.[0]?.transporter_id ?? '').trim();

  const ids = [kid, transporterId, pn].filter(Boolean).map((id) => id.toLowerCase());
  if (ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `LOWER(d.employee_id) = $${i + 1}`).join(' OR ');
  const result = await query(
    `SELECT d.employee_id, d.year, d.week, d.kpi, c.comment
     FROM kpi_data d
     LEFT JOIN kpi_comments c
       ON c.employee_id = d.employee_id AND c.year = d.year AND c.week = d.week
     WHERE ${placeholders}
     ORDER BY d.year DESC, d.week DESC`,
    ids
  ).catch(() => ({ rows: [] }));
  return result?.rows ?? [];
}

export async function saveKpiComment(employeeId, year, week, comment) {
  const empId = String(employeeId || '').trim();
  const y = Number(year);
  const w = Number(week);
  if (!empId || !Number.isFinite(y) || !Number.isFinite(w)) {
    throw new Error('employee_id, year, week are required');
  }
  const text = (comment ?? '').toString().trim();
  await query(
    `INSERT INTO kpi_comments (employee_id, year, week, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, year, week) DO UPDATE SET
       comment = EXCLUDED.comment,
       updated_at = NOW()`,
    [empId, y, w, text]
  );
  return { ok: true };
}

const PAYSLIP_BATCH_TTL_MS = 30 * 60 * 1000;
const payslipImportBatches = new Map();

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function detectNameFromPdfText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);
  for (const line of lines) {
    if (line.length < 4 || line.length > 80) continue;
    if (/\d/.test(line)) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (/lohn|abrechnung|monat|jahr|employee|gehalt|salary/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    return line;
  }
  return '';
}

function isLikelyCompanyLine(line) {
  return /\b(gmbh|ug|ag|kg|ohg|mbh|ltd|llc|inc|logistik|logistics|transport|transporte|delivery|alfamile|amazon)\b/i.test(String(line || ''));
}

function isLikelyStreetLine(line) {
  return /\b(\d{1,4}[a-z]?\s*$|str\.?$|strasse\b|straße\b|weg\b|allee\b|platz\b|gasse\b|ring\b|ufer\b)/i.test(String(line || ''));
}

function isLikelyPostalCityLine(line) {
  return /\b\d{5}\b/.test(String(line || ''));
}

function isLikelyPersonNameLine(line) {
  const value = String(line || '').trim();
  if (!value || value.length < 4 || value.length > 80) return false;
  if (/\d/.test(value)) return false;
  if (isLikelyCompanyLine(value)) return false;
  if (/lohn|abrechnung|monat|jahr|salary|gehalt|nettobezug|brutto/i.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Za-zÄÖÜäöüß'`.-]+$/.test(word));
}

function normalizeDetectedName(line) {
  const value = String(line || '')
    .replace(/^(frau|herr)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return isLikelyPersonNameLine(value) ? value : '';
}

function extractRecipientBlock(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);
  if (!lines.length) return { block: '', detectedName: '' };

  const titleIdx = lines.findIndex((l) => /^(frau|herr)\b/i.test(l));
  if (titleIdx >= 0) {
    const start = Math.max(0, titleIdx - 1);
    const end = Math.min(lines.length, titleIdx + 5);
    const block = lines.slice(start, end).join('\n');
    const sameLineName = normalizeDetectedName(lines[titleIdx]);
    if (sameLineName) {
      return { block, detectedName: sameLineName };
    }
    const nextCandidates = [lines[titleIdx + 1], lines[titleIdx + 2]];
    const nextLineName = nextCandidates.map(normalizeDetectedName).find(Boolean) || '';
    return { block, detectedName: nextLineName };
  }

  for (let i = 1; i < lines.length; i += 1) {
    if (!isLikelyStreetLine(lines[i])) continue;
    const nameCandidates = [lines[i - 1], lines[i - 2]].map(normalizeDetectedName).filter(Boolean);
    if (!nameCandidates.length) continue;
    const blockStart = Math.max(0, i - 2);
    let blockEnd = Math.min(lines.length, i + 3);
    if (lines[i + 1] && isLikelyPostalCityLine(lines[i + 1])) {
      blockEnd = Math.min(lines.length, i + 4);
    }
    return {
      block: lines.slice(blockStart, blockEnd).join('\n'),
      detectedName: nameCandidates[0],
    };
  }

  const fallbackName = lines.map(normalizeDetectedName).find(Boolean) || detectNameFromPdfText(lines.join('\n'));
  const fallbackIndex = fallbackName ? lines.findIndex((line) => normalizeDetectedName(line) === fallbackName) : -1;
  if (fallbackIndex >= 0) {
    const start = Math.max(0, fallbackIndex);
    const end = Math.min(lines.length, fallbackIndex + 4);
    return { block: lines.slice(start, end).join('\n'), detectedName: fallbackName };
  }

  const block = lines.slice(0, 5).join('\n');
  return { block, detectedName: fallbackName };
}

/**
 * Split a PDF into one buffer per page so batch payslip files yield one import row (and one saved doc) per employee page.
 */
async function splitPdfToPageBuffers(buffer) {
  try {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const n = src.getPageCount();
    if (!Number.isFinite(n) || n <= 0) return [buffer];
    if (n === 1) return [buffer];
    const out = [];
    for (let i = 0; i < n; i++) {
      const doc = await PDFDocument.create();
      const [copied] = await doc.copyPages(src, [i]);
      doc.addPage(copied);
      const bytes = await doc.save();
      out.push(Buffer.from(bytes));
    }
    return out;
  } catch {
    return [buffer];
  }
}

async function parsePayslipPageBuffer(pageBuffer) {
  let detectedName = '';
  let previewText = '';
  let parser;
  try {
    parser = new PDFParse({ data: pageBuffer });
    const parsed = await parser.getText();
    const extracted = extractRecipientBlock(parsed?.text || '');
    detectedName = extracted.detectedName || '';
    previewText = extracted.block || '';
  } catch {
    detectedName = '';
    previewText = '';
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        /* ignore */
      }
    }
  }
  return { detectedName, previewText };
}

async function getEmployeeNamePool() {
  const [kenjoRes, employeesRes] = await Promise.all([
    query(
      `SELECT kenjo_user_id, first_name, last_name, display_name
       FROM kenjo_employees
       WHERE kenjo_user_id IS NOT NULL AND kenjo_user_id != ''`
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT id::text AS id_text, employee_id, kenjo_user_id, first_name, last_name, display_name
       FROM employees`
    ).catch(() => ({ rows: [] })),
  ]);

  const byId = new Map();

  function upsertEntry(id, names = [], priority = 0) {
    const canonicalId = String(id || '').trim();
    if (!canonicalId) return;
    const cleanNames = uniqueStrings(names);
    if (!cleanNames.length) return;
    const existing = byId.get(canonicalId) || {
      id: canonicalId,
      name: cleanNames[0],
      normalizedNames: [],
      priority,
    };
    if (!existing.name || cleanNames[0].length > existing.name.length) {
      existing.name = cleanNames[0];
    }
    existing.priority = Math.max(existing.priority || 0, priority || 0);
    existing.normalizedNames = uniqueStrings([
      ...(existing.normalizedNames || []),
      ...cleanNames.map((name) => normalizeName(name)).filter(Boolean),
    ]);
    byId.set(canonicalId, existing);
  }

  for (const row of kenjoRes.rows || []) {
    const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    upsertEntry(row.kenjo_user_id, [full, row.display_name, row.kenjo_user_id], 2);
  }

  for (const row of employeesRes.rows || []) {
    const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    const canonicalId = row.kenjo_user_id || row.employee_id || row.id_text;
    upsertEntry(canonicalId, [
      row.display_name,
      full,
      row.employee_id,
      row.kenjo_user_id,
      row.id_text,
    ], 1);
  }

  const byName = new Map();
  for (const entry of byId.values()) {
    const nameKey =
      normalizeName(entry.name) ||
      (Array.isArray(entry.normalizedNames) ? entry.normalizedNames[0] : '') ||
      entry.id;
    if (!nameKey) continue;
    const existing = byName.get(nameKey);
    if (!existing) {
      byName.set(nameKey, { ...entry });
      continue;
    }
    const winner =
      (entry.priority || 0) > (existing.priority || 0)
        ? { ...entry }
        : { ...existing };
    winner.name =
      String(entry.name || '').length > String(existing.name || '').length
        ? entry.name
        : existing.name;
    winner.normalizedNames = uniqueStrings([
      ...(existing.normalizedNames || []),
      ...(entry.normalizedNames || []),
    ]);
    winner.priority = Math.max(existing.priority || 0, entry.priority || 0);
    byName.set(nameKey, winner);
  }

  return [...byName.values()].filter((entry) => entry.id && entry.name);
}

function findEmployeeMatches(detectedName, pool) {
  const n = normalizeName(detectedName);
  if (!n) return [];
  const parts = n.split(' ').filter(Boolean);
  const scored = [];
  for (const employee of pool || []) {
    const candidates = Array.isArray(employee.normalizedNames)
      ? employee.normalizedNames
      : [employee.normalized].filter(Boolean);
    let bestScore = 0;
    for (const candidate of candidates) {
      if (!candidate) continue;
      let score = 0;
      if (candidate === n) score = 100;
      else if (` ${candidate} ` === ` ${n} `) score = 98;
      else {
        const candidateParts = candidate.split(' ').filter(Boolean);
        const sharedParts = parts.filter((part) => candidateParts.includes(part));
        const sharedCount = sharedParts.length;
        const detectedLast = parts.length >= 2 ? parts[parts.length - 1] : '';
        const candidateLast = candidateParts.length >= 2 ? candidateParts[candidateParts.length - 1] : '';
        const lastNameMatches = detectedLast && candidateLast && detectedLast === candidateLast;
        const detectedFirstNames = parts.slice(0, -1);
        const candidateFirstNames = candidateParts.slice(0, -1);
        const sharedFirstNameCount = detectedFirstNames.filter((part) => candidateFirstNames.includes(part)).length;

        if (parts.length >= 2 && sharedCount === parts.length && candidateParts.length === parts.length) {
          score = 95;
        } else if (lastNameMatches && sharedFirstNameCount >= 1) {
          // Softer rule for double first names in payslips:
          // surname plus at least one first-name token is usually enough to identify the employee.
          score = 92 + Math.min(sharedFirstNameCount, 2);
        } else if (parts.length >= 2 && sharedCount === parts.length) {
          score = 88;
        } else if (sharedCount >= 2) {
          score = 70 + sharedCount * 4;
        } else if (sharedCount === 1 && parts.length === 1) {
          score = 60;
        } else if (candidate.includes(n) || n.includes(candidate)) {
          score = 55;
        }
      }
      if (score > bestScore) bestScore = score;
    }
    if (bestScore > 0) {
      scored.push({ ...employee, score: bestScore });
    }
  }
  scored.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  return scored;
}

function chooseAutoMatch(matches) {
  if (!Array.isArray(matches) || !matches.length) return null;
  const [best, second] = matches;
  if (!best) return null;
  if ((best.score || 0) >= 100) return best;
  if ((best.score || 0) >= 95 && (!second || (best.score - (second.score || 0)) >= 3)) return best;
  if ((best.score || 0) >= 88 && (!second || (best.score - (second.score || 0)) >= 8)) return best;
  return null;
}

export async function previewPayslipImport(files) {
  const employeePool = await getEmployeeNamePool();
  /** Sent once per preview — avoids huge JSON when many pages × full employee list (proxy / memory limits). */
  const employeeOptions = employeePool.map((m) => ({ id: m.id, name: m.name }));
  const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const docs = [];
  const items = [];
  let docSeq = 0;
  for (let i = 0; i < (files || []).length; i++) {
    const f = files[i];
    if (!f?.buffer?.length) continue;
    const baseFileName = f.originalname || `payslip-${i + 1}.pdf`;
    const sourceKey = `${batchId}_src_${i + 1}`;
    const pageBuffers = await splitPdfToPageBuffers(f.buffer);
    for (let p = 0; p < pageBuffers.length; p++) {
      const fileId = `${batchId}_${docSeq}`;
      docSeq += 1;
      const pageLabel =
        pageBuffers.length > 1 ? `Dokument ${p + 1} von ${pageBuffers.length}` : 'Dokument';
      const pageBuffer = pageBuffers[p];
      const { detectedName, previewText } = await parsePayslipPageBuffer(pageBuffer);
      const matches = findEmployeeMatches(detectedName, employeePool);
      const autoMatch = chooseAutoMatch(matches);
      docs.push({
        fileId,
        importGroupId: batchId,
        importSourceKey: sourceKey,
        importSourceName: baseFileName,
        fileName: pageBuffers.length > 1 ? `${baseFileName} (page ${p + 1}/${pageBuffers.length})` : baseFileName,
        mimeType: f.mimetype || 'application/pdf',
        fileContent: pageBuffer,
        matchedEmployeeRef: autoMatch?.id || null,
      });
      items.push({
        fileId,
        fileName: pageLabel,
        pageIndex: pageBuffers.length > 1 ? p + 1 : null,
        pageCount: pageBuffers.length > 1 ? pageBuffers.length : null,
        detectedName: detectedName || null,
        previewText: previewText || null,
        matchedEmployeeRef: autoMatch?.id || null,
        matchedEmployeeName: autoMatch?.name || null,
        conflict: !autoMatch,
        matchIds: matches.map((m) => m.id),
      });
    }
  }
  payslipImportBatches.set(batchId, {
    createdAt: Date.now(),
    docs,
  });
  for (const [id, b] of payslipImportBatches.entries()) {
    if (Date.now() - (b.createdAt || 0) > PAYSLIP_BATCH_TTL_MS) payslipImportBatches.delete(id);
  }
  if (!items.length) {
    throw new Error('No PDF pages could be processed. Check the file is a valid PDF.');
  }
  return { batchId, employeeOptions, items };
}

export async function importPayslipBatch(batchId, resolutions) {
  const batch = payslipImportBatches.get(String(batchId || '').trim());
  if (!batch) throw new Error('Import batch expired. Please upload files again.');
  const byFileId = new Map((batch.docs || []).map((d) => [d.fileId, d]));
  let imported = 0;
  const conflicts = [];
  for (const r of (resolutions || [])) {
    const fileId = String(r?.fileId || '').trim();
    const action = String(r?.action || 'import').trim();
    const employeeRef = String(r?.employeeRef || '').trim();
    const doc = byFileId.get(fileId);
    if (!doc) continue;
    if (action === 'delete') continue;
    if (!employeeRef) {
      conflicts.push({ fileId, fileName: doc.fileName, error: 'Employee not selected' });
      continue;
    }
    await employeeService.addEmployeeDocument(employeeRef, {
      documentType: 'Lohnabrechnung',
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileContent: doc.fileContent,
      importGroupId: doc.importGroupId,
      importSourceKey: doc.importSourceKey,
      importSourceName: doc.importSourceName,
    });
    imported++;
  }
  payslipImportBatches.delete(String(batchId || '').trim());
  return { ok: true, imported, conflicts };
}

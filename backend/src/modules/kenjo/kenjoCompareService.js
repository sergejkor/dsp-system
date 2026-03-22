import { query } from '../../db.js';
import {
  getKenjoUsersForMatch,
  getKenjoAttendances,
  updateKenjoAttendance,
} from './kenjoClient.js';

const TOLERANCE_MIN = 1;
/** Default min difference to show a conflict (can be overridden by API param). */
const DEFAULT_MIN_DIFF_DISPLAY_MIN = 15;
const ALLOWED_MIN_DIFF = [5, 10, 15, 20];

function parseTimeToMinutes(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const sec = match[3] ? parseInt(match[3], 10) : 0;
    return h * 60 + m + sec / 60;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  return null;
}

function timeToIso(dayKey, timeStr) {
  if (!dayKey || !timeStr) return null;
  const m = parseTimeToMinutes(timeStr);
  if (m == null) return null;
  const h = Math.floor(m / 60);
  const min = Math.floor(m % 60);
  return `${dayKey}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;
}

function isoToMinutes(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

function norm(v) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normalize day_key from DB (Date or string) to YYYY-MM-DD. */
function toDayKeyString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/** Strip Cortex suffixes like " AlfaMile Gmt", " AlfaMile", " Gmt" and return normalized name. */
function normalizeCortexName(driverName) {
  let s = String(driverName ?? '').trim();
  s = s.replace(/\s+AlfaMile\s+Gmt$/i, '').replace(/\s+AlfaMile$/i, '').replace(/\s+Gmt$/i, '').trim();
  return norm(s);
}

/** Parse "LastName, FirstName" or "LastName, FirstName suffix" into { first, last } and return name variants. */
function cortexNameVariants(driverName) {
  const normalized = normalizeCortexName(driverName);
  if (!normalized) return [];
  const set = new Set([normalized]);
  const commaIdx = normalized.indexOf(',');
  if (commaIdx > 0) {
    const last = normalized.slice(0, commaIdx).trim();
    const first = normalized.slice(commaIdx + 1).trim();
    if (first && last) {
      set.add(`${first} ${last}`);
      set.add(`${last} ${first}`);
      set.add(norm(`${last} ${first}`));
      set.add(norm(`${first} ${last}`));
    }
  }
  return [...set];
}

function nameVariants(first, last) {
  if (!first && !last) return [];
  const f = norm(first);
  const l = norm(last);
  const set = new Set();
  if (f && l) {
    set.add(`${f} ${l}`);
    set.add(`${l} ${f}`);
    set.add(`${l},${f}`);
    set.add(`${l}, ${f}`);
  }
  if (f) set.add(f);
  if (l) set.add(l);
  return [...set];
}

/** Parse "LastName, FirstName" into { first, last } (normalized). */
function parseCortexName(driverName) {
  const n = normalizeCortexName(driverName);
  if (!n) return { first: '', last: '' };
  const commaIdx = n.indexOf(',');
  if (commaIdx > 0) {
    return {
      last: n.slice(0, commaIdx).trim(),
      first: n.slice(commaIdx + 1).trim(),
    };
  }
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { first: parts[0], last: parts[parts.length - 1] };
  return { first: n, last: '' };
}

function matchUser(users, driverName, transporterId) {
  const tid = norm(transporterId);
  const cortexVariants = cortexNameVariants(driverName);
  const name = norm(driverName);
  const { first: cortexFirst, last: cortexLast } = parseCortexName(driverName);

  const idNorm = (v) => (v != null ? String(v).trim().toLowerCase() : '');

  for (const u of users || []) {
    const uid = String(u._id || u.id || '').trim();
    if (!uid) continue;

    if (tid) {
      const t = idNorm(u.transportationId || u.transporterId);
      const empNum = idNorm(u.employeeNumber || u.employee_number);
      if (t === tid || empNum === tid || idNorm(uid) === tid) return uid;
    }

    if (!name && cortexVariants.length === 0) continue;

    const dn = norm(u.displayName || '');
    const first = norm(u.firstName || '');
    const last = norm(u.lastName || '');
    const variants = nameVariants(u.firstName, u.lastName);

    const matchStr = (a, b) => a && b && (a === b || a.includes(b) || b.includes(a));

    if (cortexLast && cortexFirst && last === cortexLast && first === cortexFirst) return uid;
    if (cortexLast && last === cortexLast && (!cortexFirst || first === cortexFirst || first.includes(cortexFirst) || cortexFirst.includes(first))) return uid;
    if (cortexFirst && first === cortexFirst && (!cortexLast || last === cortexLast)) return uid;

    if (variants.some((v) => cortexVariants.some((c) => matchStr(c, v)))) return uid;
    if (dn && cortexVariants.some((v) => matchStr(v, dn))) return uid;
    if (name && dn && matchStr(name, dn)) return uid;

    const emailLocal = (u.email || '').split('@')[0];
    if (emailLocal && norm(emailLocal).length >= 3 && (name && name.includes(norm(emailLocal)) || cortexVariants.some((v) => v.includes(norm(emailLocal))))) return uid;
  }
  return null;
}

/** True if value looks like "LastName, FirstName" (not company name like "AlfaMile GmbH"). */
function looksLikeDriverName(val) {
  const s = String(val ?? '').trim();
  if (s.length < 3) return false;
  if (/GmbH|Gmt\s*$/i.test(s)) return false;
  if (/^[A-Za-zäöüÄÖÜß\-']+\s*,\s*[A-Za-zäöüÄÖÜß\-']+/.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((w) => /^[A-Za-zäöüÄÖÜß\-',]+$/.test(w)) && !/^AlfaMile$/i.test(words[0]);
}

/** True if value looks like time HH:MM or HH:MM:SS */
function looksLikeTime(val) {
  const s = String(val ?? '').trim();
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s);
}

/** From raw_data JSON pick transporter/driver name and app login/logout if main fields are empty. */
function enrichFromRaw(row) {
  const r = row.raw_data;
  let raw = {};
  if (r && typeof r === 'object') raw = r;
  else if (typeof r === 'string') try { raw = JSON.parse(r); } catch { /**/ }
  if (Object.keys(raw).length === 0) return row;

  const pick = (exactKeys, optionalSubstr) => {
    for (const k of exactKeys) {
      const v = raw[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    if (optionalSubstr) {
      for (const key of Object.keys(raw)) {
        const lower = key.toLowerCase();
        if (optionalSubstr.every((s) => lower.includes(s))) {
          const v = raw[key];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
    }
    return '';
  };

  let driverName = row.driver_name && String(row.driver_name).trim() ? row.driver_name : pick(['Name des Fahrers', 'Transporter-Name des Fa DSP', 'Transporter-Name', 'driver_name', 'Driver', 'Driver Name'], ['fahrer', 'name']);
  if (!driverName) {
    for (const key of Object.keys(raw)) {
      const v = raw[key];
      if (v != null && looksLikeDriverName(v)) {
        driverName = String(v).trim();
        break;
      }
    }
  }

  let appLogin = row.app_login && String(row.app_login).trim() ? row.app_login : pick(['App-Anmeldung:', 'App-Anmeld', 'App Anmeld', 'app_login', 'App Login', 'login'], ['app', 'anmeld']);
  if (!appLogin) {
    for (const key of Object.keys(raw)) {
      if (/anmeld|login|ein/i.test(key.toLowerCase()) && looksLikeTime(raw[key])) {
        appLogin = String(raw[key]).trim();
        break;
      }
    }
  }

  let appLogout = row.app_logout && String(row.app_logout).trim() ? row.app_logout : pick(['App-Abmeldung:', 'App-Abmeld', 'App Abmeld', 'app_logout', 'App Logout', 'logout'], ['app', 'abmeld']);
  if (!appLogout) {
    for (const key of Object.keys(raw)) {
      if (/abmeld|logout|aus/i.test(key.toLowerCase()) && looksLikeTime(raw[key])) {
        appLogout = String(raw[key]).trim();
        break;
      }
    }
  }

  const transporterId = row.transporter_id && String(row.transporter_id).trim() ? row.transporter_id : pick(['Transporter-ID', 'transporter_id', 'Transporter ID', 'transportationId'], ['transporter', 'id']);

  const dayKey = toDayKeyString(row.day_key);

  return {
    ...row,
    day_key: dayKey || row.day_key,
    driver_name: driverName || row.driver_name,
    transporter_id: transporterId || row.transporter_id,
    app_login: appLogin || row.app_login,
    app_logout: appLogout || row.app_logout,
  };
}

/**
 * Load Cortex data from daily_upload_rows for date range.
 */
async function getCortexData(fromDate, toDate) {
  const from = fromDate && fromDate.match(/^\d{4}-\d{2}-\d{2}$/) ? fromDate : null;
  const to = toDate && toDate.match(/^\d{4}-\d{2}-\d{2}$/) ? toDate : null;
  if (!from || !to) return [];
  const res = await query(
    `SELECT day_key, driver_name, transporter_id, app_login, app_logout, raw_data
     FROM daily_upload_rows
     WHERE day_key >= $1 AND day_key <= $2
     ORDER BY day_key, driver_name`,
    [from, to]
  );
  return (res.rows || []).map(enrichFromRaw);
}

/**
 * Return debug info: sample Cortex rows (with keys from raw_data), sample Kenjo users, sample attendances.
 */
async function getCompareDebug(fromDate, toDate) {
  const from = fromDate && fromDate.match(/^\d{4}-\d{2}-\d{2}$/) ? fromDate : null;
  const to = toDate && toDate.match(/^\d{4}-\d{2}-\d{2}$/) ? toDate : null;
  if (!from || !to) return { error: 'Invalid from/to' };

  const [cortexRows, users, attendances] = await Promise.all([
    getCortexData(from, to),
    getKenjoUsersForMatch().then((u) => (Array.isArray(u) ? u : [])),
    getKenjoAttendances(from, to),
  ]);

  const firstRaw = cortexRows[0]?.raw_data;
  let rawKeys = [];
  if (firstRaw) {
    const raw = typeof firstRaw === 'string' ? (() => { try { return JSON.parse(firstRaw); } catch { return {}; } })() : firstRaw;
    rawKeys = Object.keys(raw);
  }

  return {
    cortexSample: cortexRows.slice(0, 5).map((r) => ({
      day_key: r.day_key,
      driver_name: r.driver_name,
      transporter_id: r.transporter_id,
      app_login: r.app_login,
      app_logout: r.app_logout,
    })),
    cortexRawKeys: rawKeys,
    kenjoUsersCount: users.length,
    kenjoUsersSample: users.slice(0, 5).map((u) => ({
      _id: u._id,
      displayName: u.displayName,
      firstName: u.firstName,
      lastName: u.lastName,
      transportationId: u.transportationId,
      employeeNumber: u.employeeNumber,
    })),
    kenjoAttendancesCount: attendances.length,
    kenjoAttendancesSample: (attendances || []).slice(0, 5).map((a) => ({
      _id: a._id,
      userId: a.userId ?? a.user_id ?? a.employeeId,
      date: a.date,
      startTime: a.startTime ?? a.start_time,
      endTime: a.endTime ?? a.end_time,
    })),
  };
}

/**
 * Get set of ignored conflict keys (user_id_dayKey).
 */
async function getIgnoredConflictKeys() {
  try {
    const res = await query(
      `SELECT conflict_key FROM kenjo_ignored_conflicts`
    );
    return new Set((res.rows || []).map((r) => String(r.conflict_key || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Add conflict to ignored list.
 */
async function ignoreConflict(conflictKey) {
  await query(
    `INSERT INTO kenjo_ignored_conflicts (conflict_key) VALUES ($1) ON CONFLICT (conflict_key) DO NOTHING`,
    [String(conflictKey).trim()]
  );
}

/**
 * Compare Cortex and Kenjo data for date range; return { stats, conflicts }.
 * minDiffMinutes: only include conflicts with at least this many minutes difference (5, 10, 15, or 20).
 */
async function compareCortexWithKenjo(fromDate, toDate, minDiffMinutes) {
  const from = fromDate && fromDate.match(/^\d{4}-\d{2}-\d{2}$/) ? fromDate : null;
  const to = toDate && toDate.match(/^\d{4}-\d{2}-\d{2}$/) ? toDate : null;
  if (!from || !to) return { stats: {}, conflicts: [] };
  const minDisplay = ALLOWED_MIN_DIFF.includes(Number(minDiffMinutes)) ? Number(minDiffMinutes) : DEFAULT_MIN_DIFF_DISPLAY_MIN;

  const [cortexRows, users, attendances, ignoredSet] = await Promise.all([
    getCortexData(from, to),
    getKenjoUsersForMatch().then((u) => (Array.isArray(u) ? u : [])),
    getKenjoAttendances(from, to),
    getIgnoredConflictKeys(),
  ]);

  const kenjoByUserDay = new Map();
  for (const a of attendances) {
    const uid = String(a.userId ?? a.user_id ?? a.employeeId ?? a._id ?? '').trim();
    const day = (a.date ? String(a.date) : (a.startTime || a.start_time || '')).slice(0, 10);
    if (!uid || !day || day.length < 10) continue;
    const key = `${uid}_${day}`;
    if (!kenjoByUserDay.has(key)) kenjoByUserDay.set(key, []);
    kenjoByUserDay.get(key).push(a);
  }

  const stats = {
    totalExcelRows: cortexRows.length,
    totalKenjoRows: attendances.length,
    totalMatched: 0,
    conflicts: 0,
    unmatchedExcel: 0,
    unmatchedKenjo: 0,
  };

  const conflicts = [];
  const unmatchedCortex = [];
  const kenjoNoMatch = [];

  for (const row of cortexRows) {
    const driverName = row.driver_name || row.driverName || '';
    const transporterId = row.transporter_id || row.transporterId || '';
    const dayKey = row.day_key || '';
    const cortexStart = parseTimeToMinutes(row.app_login);
    const cortexEnd = parseTimeToMinutes(row.app_logout);

    const userId = matchUser(users, driverName, transporterId);
    if (!userId) {
      stats.unmatchedExcel++;
      unmatchedCortex.push({
        date: dayKey,
        name: driverName || '—',
        transporter_id: transporterId || '—',
        app_login: row.app_login ? String(row.app_login).trim() : '—',
        app_logout: row.app_logout ? String(row.app_logout).trim() : '—',
      });
      continue;
    }

    const kKey = `${userId}_${dayKey}`;
    if (ignoredSet.has(kKey)) continue;

    const kenjoList = kenjoByUserDay.get(kKey) || [];
    const kenjo = kenjoList[0];
    if (!kenjo) {
      stats.unmatchedKenjo++;
      kenjoNoMatch.push({
        date: dayKey,
        name: driverName || '—',
        transporter_id: transporterId || '—',
        app_login: row.app_login ? String(row.app_login).trim() : '—',
        app_logout: row.app_logout ? String(row.app_logout).trim() : '—',
        userId,
      });
      continue;
    }

    stats.totalMatched++;

    const kenjoStartIso = kenjo.startTime || kenjo.start_time;
    const kenjoEndIso = kenjo.endTime || kenjo.end_time;
    const kenjoStartMin = isoToMinutes(kenjoStartIso);
    const kenjoEndMin = isoToMinutes(kenjoEndIso);

    const diffStartMin = cortexStart != null && kenjoStartMin != null ? cortexStart - kenjoStartMin : null;
    const diffEndMin = cortexEnd != null && kenjoEndMin != null ? cortexEnd - kenjoEndMin : null;

    const hasDiff = (diffStartMin != null && Math.abs(diffStartMin) > TOLERANCE_MIN) ||
      (diffEndMin != null && Math.abs(diffEndMin) > TOLERANCE_MIN);

    if (!hasDiff) continue;

    const meetsMinDisplay = (diffStartMin != null && Math.abs(diffStartMin) >= minDisplay) ||
      (diffEndMin != null && Math.abs(diffEndMin) >= minDisplay);
    if (!meetsMinDisplay) continue;

    const excelStartStr = row.app_login ? String(row.app_login).trim() : '—';
    const excelEndStr = row.app_logout ? String(row.app_logout).trim() : '—';

    conflicts.push({
      conflictKey: kKey,
      date: dayKey,
      name: driverName || transporterId || '—',
      excelStart: excelStartStr,
      excelEnd: excelEndStr,
      kenjoStartIso: kenjoStartIso || null,
      kenjoEndIso: kenjoEndIso || null,
      diffStartMin: diffStartMin != null ? Math.round(diffStartMin) : null,
      diffEndMin: diffEndMin != null ? Math.round(diffEndMin) : null,
      kenjoAttendanceId: kenjo._id || kenjo.id,
      userId,
      cortexStartIso: timeToIso(dayKey, row.app_login),
      cortexEndIso: timeToIso(dayKey, row.app_logout),
    });
  }

  stats.conflicts = conflicts.length;
  return { stats, conflicts, unmatchedCortex, kenjoNoMatch };
}

/** Convert ISO or "HH:MM" to Kenjo format "HH:MM:SS". */
function toKenjoTimeFormat(value) {
  if (!value) return null;
  const s = String(value).trim();
  const match = s.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    const sec = (match[3] || '00').padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }
  const simple = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (simple) {
    const h = simple[1].padStart(2, '0');
    const m = simple[2].padStart(2, '0');
    const sec = (simple[3] || '00').padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }
  return null;
}

/**
 * Push Cortex times to Kenjo for one attendance.
 * Kenjo API expects startTime/endTime as "HH:MM:SS", not ISO.
 */
async function fixConflictInKenjo(attendanceId, startTimeIso, endTimeIso) {
  const startTime = toKenjoTimeFormat(startTimeIso);
  const endTime = toKenjoTimeFormat(endTimeIso);
  await updateKenjoAttendance(attendanceId, {
    startTime: startTime || undefined,
    endTime: endTime || undefined,
  });
}

export default {
  compareCortexWithKenjo,
  getCompareDebug,
  ignoreConflict,
  fixConflictInKenjo,
  getIgnoredConflictKeys,
};

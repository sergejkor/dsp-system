import XLSX from 'xlsx';
import JSZip from 'jszip';

export const CONFIG = Object.freeze({ historyDays: 60, recentTypeDays: 10, dominantTypeShare: 0.9, frequencyWeight: 100, maxRows: 300, maxBytes: 5 * 1024 * 1024 });
export const TYPES = ['Medium VN', 'Standard Parcel', 'EV 2.0', 'Rivian'];
const clean = v => String(v ?? '').replace(/\s+/gu, ' ').trim();
const norm = v => clean(v).toLowerCase().replace(/\s*\/\s*/g, '/');
export function resolveType(value) {
  const s = norm(value), hits = [];
  if (/\b350cf\/81kwh\b/.test(s) || s === 'ev 2.0') hits.push('EV 2.0');
  if (/\b500cf\/100kwh\b/.test(s) || s === 'rivian') hits.push('Rivian');
  if (/\bmedium van\b/.test(s) || s === 'medium vn') hits.push('Medium VN');
  if (s === 'standard parcel') hits.push('Standard Parcel');
  if (!hits.length && /^nursery level\b/.test(s) && !/\blow[\s-]*(?:emission|mission)\b|\bmedium\s+(?:van|vn)\b/.test(s)) hits.push('Standard Parcel');
  return hits.length === 1 ? hits[0] : null;
}
export function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid planning date (YYYY-MM-DD).');
  return date;
}
// Keep wall-clock time as TIME WITHOUT TIME ZONE. No UTC conversion, including DST days.
export function departure(value) {
  if (value === '' || value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    const minutes = Math.min(1439, Math.floor((value % 1) * 1440 + 1e-7));
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const m = clean(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) throw new Error('Invalid departure time');
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
export function entryTimeFromDeparture(value, leadMinutes = 25) {
  if (!value) return { time: null, dayOffset: 0 };
  const normalized = departure(value);
  const [hours, minutes] = normalized.split(':').map(Number);
  const shifted = hours * 60 + minutes - leadMinutes;
  const dayOffset = shifted < 0 ? -1 : 0;
  const wrapped = (shifted + 1440) % 1440;
  return {
    time: `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`,
    dayOffset,
  };
}
export async function parseWorkbook(buffer, filename) {
  if (!/\.xlsx$/i.test(filename) || buffer.length < 4 || buffer.length > CONFIG.maxBytes || buffer.readUInt16LE(0) !== 0x4b50) throw new Error('Select an .xlsx file, maximum 5 MB.');
  const zip = await JSZip.loadAsync(buffer);
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    total += entry._data?.uncompressedSize || 0;
    if (/vbaProject|externalLinks/i.test(entry.name)) throw new Error('Macros and external links are not supported.');
  }
  if (total > 30 * 1024 * 1024 || Object.keys(zip.files).length > 2000) throw new Error('Workbook is too large when expanded.');
  const book = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellDates: false });
  const name = book.SheetNames.find(n => norm(n) === 'strecken');
  if (!name) throw new Error('Worksheet Strecken is missing.');
  const sheet = book.Sheets[name];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (range.e.r > 10000 || range.e.c > 500) throw new Error('Worksheet dimensions exceed the import limit.');
  const headers = ['Routencode', 'Transporter-ID', 'Name des Fahrers', 'Zustelldienst-Typ', 'Geplante Abfahrtszeit'];
  let headerRow = -1, cols;
  for (let r = range.s.r; r <= Math.min(range.e.r, 30); r++) {
    const values = Array.from({ length: range.e.c + 1 }, (_, c) => norm(sheet[XLSX.utils.encode_cell({ r, c })]?.v));
    if (!values.includes(norm(headers[0]))) continue;
    cols = headers.map(h => values.indexOf(norm(h)));
    for (let i = 0; i < headers.length; i++) {
      if (cols[i] < 0) throw new Error(`Missing column: ${headers[i]}`);
      if (values.lastIndexOf(norm(headers[i])) !== cols[i]) throw new Error(`Duplicate column: ${headers[i]}`);
    }
    headerRow = r; break;
  }
  if (headerRow < 0) throw new Error(`Missing columns: ${headers.join(', ')}`);
  const rows = [], seen = new Map();
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const cells = cols.map(c => sheet[XLSX.utils.encode_cell({ r, c })]);
    const raw = Object.fromEntries(headers.map((h, i) => [h, cells[i]?.v ?? '']));
    if (Object.values(raw).every(v => !clean(v))) continue;
    const errors = [];
    if (cells.some(c => c?.f || c?.t === 'e')) errors.push('FORMULA_OR_CELL_ERROR');
    const route = clean(raw.Routencode);
    // The leftmost assignment is current; the remaining values are driver history.
    const ids = [clean(String(cells[1]?.w ?? raw['Transporter-ID']).split('|')[0])];
    const names = [clean(String(raw['Name des Fahrers']).split('|')[0])];
    const participants = ids.map((id, i) => ({ transporterId: id, name: names[i] || '' }));
    const type = resolveType(raw['Zustelldienst-Typ']);
    if (!type) errors.push('UNKNOWN_TYPE');
    if (!route) errors.push('MISSING_ROUTE');
    let time = null;
    try { time = departure(raw['Geplante Abfahrtszeit']); } catch { errors.push('INVALID_TIME'); }
    const entry = entryTimeFromDeparture(time);
    const signature = JSON.stringify(raw);
    if (seen.get(route)?.signature === signature) { seen.get(route).row.duplicateRows.push(r + 1); continue; }
    if (seen.has(route)) { errors.push('DUPLICATE_ROUTE'); seen.get(route).row.errors.push('DUPLICATE_ROUTE'); }
    const row = { rowNumber: r + 1, route, raw, participants, originalNames: names, type,
      time, departureTime: time, entryTime: entry.time, entryDayOffset: entry.dayOffset, errors, duplicateRows: [] };
    seen.set(route, { signature, row }); rows.push(row);
  }
  if (!rows.length || rows.length > CONFIG.maxRows) throw new Error(`Expected 1–${CONFIG.maxRows} tours.`);
  return rows;
}

export function resolveDrivers(rows, employees, edits = {}) {
  const result = rows.map(source => {
    const row = { ...source, errors: [...source.errors] }, edit = edits[row.rowNumber] || {};
    const departureTime = source.departureTime ?? source.time ?? null;
    const entry = entryTimeFromDeparture(departureTime);
    row.departureTime = departureTime;
    row.entryTime = entry.time;
    row.entryDayOffset = entry.dayOffset;
    const participants = row.participants.map(p => ({ ...p, matches: employees.filter(e => String(e.transporter_id ?? '').trim() === p.transporterId && p.transporterId).map(e => e.id) }));
    row.participants = participants;
    const chosen = edit.driverId || (source.isRescue ? source.rescueDriverId : null) || (participants.length === 1 && participants[0].matches.length === 1 ? participants[0].matches[0] : null);
    row.driverId = employees.some(e => e.id === chosen) ? chosen : null;
    row.warnings = [];
    if (participants.length === 1 && row.driverId && norm(participants[0].name) !== norm(employees.find(e => e.id === row.driverId)?.display_name)) row.warnings.push('NAME_MISMATCH');
    if (!row.driverId) row.errors.push(participants.length > 1 ? 'SELECT_PRIMARY_DRIVER' : 'RESOLVE_DRIVER');
    row.carId = edit.carId ? Number(edit.carId) : null; row.locked = !!edit.locked;
    row.systemCarId = Number(edit.systemCarId ?? edit.carId) || null;
    row.systemLocked = !!(edit.systemLocked ?? edit.locked);
    row.approveChange = !!edit.approveChange;
    return row;
  });
  const counts = new Map();
  for (const row of result) if (row.driverId) counts.set(row.driverId, (counts.get(row.driverId) || 0) + 1);
  for (const row of result) if (counts.get(row.driverId) > 1) row.errors.push('DRIVER_MULTIPLE_TOURS');
  return result;
}

export function unavailable(car, date, excluded = []) {
  if (excluded.includes(car.id)) return 'EXCLUDED';
  if (car.deactivated) return 'DEACTIVATED';
  if (['maintenance', 'grounded', 'out of service', 'defleeted', 'decommissioned'].includes(norm(car.status))) return 'UNAVAILABLE_STATUS';
  if (car.active_from && date < car.active_from || car.active_to && date > car.active_to) return 'LEASE_PERIOD';
  if (car.planned_workshop_from && date >= car.planned_workshop_from && date <= (car.planned_workshop_to || car.planned_workshop_from)) return 'WORKSHOP';
  return null;
}
export function historyStats(history, employees, date, cars = []) {
  const scores = new Map(), days = new Map(), seen = new Set(), driverDays = new Map();
  for (const h of history) {
    const age = Math.round((Date.parse(date) - Date.parse(h.plan_date)) / 86400000);
    if (!(age > 0 && age <= CONFIG.historyDays)) continue;
    const matches = employees.filter(e => h.employee_id ? e.id === h.employee_id : [e.id, e.transporter_id, e.employee_number, e.display_name].filter(Boolean).includes(h.driver_identifier));
    if (matches.length !== 1) continue;
    const driver = matches[0].id;
    if (!driverDays.has(driver)) driverDays.set(driver, new Map());
    const dates = driverDays.get(driver);
    if (!dates.has(h.plan_date)) dates.set(h.plan_date, new Set());
    dates.get(h.plan_date).add(cars.find(c => c.id === h.car_id)?.service_type || 'UNKNOWN');
    const key = `${matches[0].id}|${h.car_id}`, dayKey = `${key}|${h.plan_date}`;
    if (seen.has(dayKey)) continue;
    seen.add(dayKey); scores.set(key, (scores.get(key) || 0) + CONFIG.frequencyWeight + CONFIG.historyDays - age);
    days.set(key, (days.get(key) || 0) + 1);
  }
  const types = new Map();
  for (const [driver, dates] of driverDays) {
    const counts = new Map();
    for (const values of dates.values()) if (values.size === 1) {
      const type = [...values][0];
      if (TYPES.includes(type)) counts.set(type, (counts.get(type) || 0) + 1);
    }
    const recent = [...dates].sort(([a], [b]) => b.localeCompare(a)).slice(0, CONFIG.recentTypeDays);
    const recentCounts = new Map();
    for (const [, values] of recent) if (values.size === 1) {
      const type = [...values][0];
      if (TYPES.includes(type)) recentCounts.set(type, (recentCounts.get(type) || 0) + 1);
    }
    const recentDominant = recent.length === CONFIG.recentTypeDays && [...recentCounts].find(([, count]) => count / recent.length >= CONFIG.dominantTypeShare);
    const dominant = [...counts].find(([, count]) => count / dates.size >= CONFIG.dominantTypeShare);
    if (recentDominant) types.set(driver, { type: recentDominant[0], days: recentDominant[1], totalDays: recent.length });
    else if (dominant) types.set(driver, { type: dominant[0], days: dominant[1], totalDays: dates.size });
  }
  return { scores, days, types };
}
export function historyScores(history, employees, date) {
  return historyStats(history, employees, date).scores;
}

// Rectangular Hungarian assignment; dummy columns permit unfilled tours. Forbidden
// edges never compete with dummy edges. Cardinality dominates preference and stability.
export function maximumAssignment(weights) {
  const n = weights.length;
  if (!n) return [];
  const m = weights[0].length, u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = -weights[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0]);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const result = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}

export const isElectric = type => type === 'EV 2.0' || type === 'Rivian';

export function assignmentsConflict(a, b) {
  return a.physical === b.physical || a.system === b.system ||
    (!(a.isRescue || b.isRescue) && (a.physical === b.system || a.system === b.physical));
}
export function allocate(rows, cars, scores, allowed) {
  const deadline = performance.now() + 3000;
  const sorted = rows.map(r => ({ ...r, systemCarId: r.systemCarId ?? r.carId,
    systemLocked: r.systemLocked ?? r.locked, errors: [...r.errors] }))
    .sort((a, b) => a.route.localeCompare(b.route, 'en') || a.rowNumber - b.rowNumber);
  const fleet = [...cars].sort((a, b) => a.id - b.id);
  for (const row of sorted) {
    row.systemCandidates = fleet.filter(c => (row.isRescue || c.service_type === row.type) && !allowed(row, c, 'system')).map(c => c.id);
    // The dispatcher may choose any currently available physical vehicle.  When
    // its type differs from the route type, the separately allocated system
    // vehicle remains the route-compatible QR vehicle.
    row.candidates = fleet.filter(c => !allowed(row, c, 'physical')).map(c => c.id);
  }
  const pins = sorted.map(row => ({ physical: row.locked ? row.carId : null, system: row.systemLocked ? row.systemCarId : null, isRescue: !!row.isRescue, row }));
  const pinConflict = (a, b) => (a.physical && b.physical && a.physical === b.physical) ||
    (a.system && b.system && a.system === b.system) || (!(a.isRescue || b.isRescue) &&
      ((a.physical && b.system && a.physical === b.system) || (a.system && b.physical && a.system === b.physical)));
  for (const row of sorted) {
    if ((row.locked && !row.candidates.includes(row.carId)) ||
      (row.systemLocked && !row.systemCandidates.includes(row.systemCarId)) ||
      pins.some(p => p.row !== row && pinConflict(p, pins.find(q => q.row === row)))) row.errors.push('INVALID_LOCK');
  }
  // An option reserves both real cars. Same-car DIRECT uses only one resource.
  // Relaxing either resource gives a Hungarian upper bound. Branch-and-bound
  // therefore proves the global optimum without a greedy substitution pass.
  const n = sorted.length, scale = 3 * n + 1, hasRescue = sorted.some(r => r.isRescue);
  const maxScore = Math.max(0, ...scores.values());
  const evWeight = (n * maxScore * scale + 3 * n + 1);
  const rescueHistoryWeight = (n + 1) * evWeight;
  // Close as many tours as possible, then protect Excel's electric tours
  // before spending electric vehicles on conventional-tour substitutions.
  const electricTourWeight = hasRescue ? (n + 1) * rescueHistoryWeight : (n + 1) * evWeight;
  const coverageWeight = (n + 1) * electricTourWeight;
  const options = sorted.map(row => {
    if (row.errors.length) return [];
    const result = [];
    for (const physical of fleet) {
      if (!row.candidates.includes(physical.id) || (row.locked && row.carId !== physical.id)) continue;
      for (const system of fleet) {
        if (!row.systemCandidates.includes(system.id) || (row.systemLocked && row.systemCarId !== system.id)) continue;
        if (pins.some(p => p.row !== row && pinConflict(p, { physical: physical.id, system: system.id, isRescue: !!row.isRescue }))) continue;
        result.push({ physical: physical.id, system: system.id, isRescue: !!row.isRescue, weight: coverageWeight +
          (!row.isRescue && isElectric(row.type) ? electricTourWeight : 0) +
          (isElectric(physical.service_type) ? evWeight : 0) +
          (scores.get(`${row.driverId}|${physical.id}`) || 0) * (row.isRescue ? rescueHistoryWeight / Math.max(1, maxScore) : scale) +
          Number(row.carId === physical.id) + Number(row.systemCarId === system.id) + (row.isRescue && physical.id === system.id ? 1 : 0) });
      }
    }
    if (!result.length && (row.locked || row.systemLocked)) row.errors.push('INVALID_LOCK');
    return result.sort((a, b) => b.weight - a.weight || a.physical - b.physical || a.system - b.system);
  });
  let bestWeight = -1, best = Array(n).fill(null);
  const chosen = Array(n).fill(null);
  const visited = new Map();
  function search(pending, used, weight) {
    if (performance.now() > deadline) {
      throw Object.assign(new Error('Allocation exceeded the time limit. Adjust vehicle locks or exclusions and recalculate.'), { status: 503 });
    }
    const stateKey = `${pending.join(',')}|${(hasRescue ? used.map(o => `${o.physical}:${o.system}:${Number(o.isRescue)}`).sort() : [...new Set(used.flatMap(o => [o.physical,o.system]))].sort((a,b)=>a-b)).join(',')}`;
    if ((visited.get(stateKey) ?? -1) >= weight) return;
    // Bound memory as well as time; forgetting a state only repeats work.
    if (visited.size < 50000) visited.set(stateKey, weight);
    if (!pending.length) {
      if (weight > bestWeight) { bestWeight = weight; best = [...chosen]; }
      return;
    }
    const choices = pending.map(i => options[i].filter(o => !used.some(other => assignmentsConflict(o, other))));
    if (pending.some((i, j) => options[i].length && (sorted[i].locked || sorted[i].systemLocked) && !choices[j].length)) return;
    const free = hasRescue ? fleet : fleet.filter(c => !used.some(o => o.physical === c.id || o.system === c.id));
    let bound = Infinity, physicalMatch;
    for (const resource of ['physical', 'system']) {
      const matrix = choices.map(list => {
        const byId = new Map();
        for (const o of list) byId.set(o[resource], Math.max(byId.get(o[resource]) || 0, o.weight));
        return [...free.map(c => byId.get(c.id) ?? -coverageWeight), ...pending.map(() => 0)];
      });
      const match = maximumAssignment(matrix);
      if (resource === 'physical') physicalMatch = match.map((col, j) => matrix[j][col] > 0 ? free[col]?.id : null);
      bound = Math.min(bound, match.reduce((sum, col, i) => sum + matrix[i][col], 0));
    }
    if (weight + bound <= bestWeight) return;
    // A system-only matching may promise more electric assignments than there
    // are physical EVs. Price that shared capacity in a second valid relaxation.
    const electricIds = new Set(free.filter(c => isElectric(c.service_type) && !used.some(o => o.physical === c.id)).map(c => c.id));
    const capacityMatrix = choices.map(list => {
      const byId = new Map();
      for (const o of list) {
        const adjusted = o.weight - (electricIds.has(o.physical) ? evWeight : 0);
        byId.set(o.system, Math.max(byId.get(o.system) || 0, adjusted));
      }
      return [...free.map(c => byId.get(c.id) ?? -coverageWeight), ...pending.map(() => 0)];
    });
    const capacityMatch = maximumAssignment(capacityMatrix);
    bound = Math.min(bound, capacityMatch.reduce((sum, col, i) => sum + capacityMatrix[i][col], 0) + electricIds.size * evWeight);
    if (weight + bound <= bestWeight) return;
    // Usually both relaxations can be reconciled immediately. Match donors for
    // the globally optimal physical proposal before branching on scarce pairs.
    const physicalOwner = new Map(physicalMatch.map((id, j) => [id, j]));
    const donorOptions = choices.map((list, j) => list.filter(o => o.physical === physicalMatch[j] &&
      (!physicalOwner.has(o.system) || physicalOwner.get(o.system) === j || sorted[pending[j]].isRescue || sorted[pending[physicalOwner.get(o.system)]].isRescue)));
    const donorMatrix = donorOptions.map(list => [...free.map(c => list.find(o => o.system === c.id)?.weight ?? -coverageWeight), ...pending.map(() => 0)]);
    const donors = maximumAssignment(donorMatrix);
    const completion = donors.map((col, j) => donorOptions[j].find(o => o.system === free[col]?.id) || null);
    if (pending.every((i, j) => !options[i].length || (!sorted[i].locked && !sorted[i].systemLocked) || completion[j])) {
      const total = weight + completion.reduce((sum, o) => sum + (o?.weight || 0), 0);
      if (total > bestWeight) {
        bestWeight = total; best = [...chosen];
        pending.forEach((i, j) => { best[i] = completion[j]; });
      }
    }
    if (weight + bound <= bestWeight) return;
    let position = 0;
    for (let j = 1; j < pending.length; j++) if (choices[j].length < choices[position].length) position = j;
    const i = pending[position], rest = pending.filter(index => index !== i);
    for (const option of choices[position]) {
      chosen[i] = option;
      search(rest, [...used, option], weight + option.weight);
      if (weight + bound <= bestWeight) break;
    }
    chosen[i] = null;
    if (weight + bound > bestWeight && (!options[i].length || (!sorted[i].locked && !sorted[i].systemLocked))) search(rest, used, weight);
  }
  search(sorted.map((_, i) => i), [], 0);
  return sorted.map((row, i) => {
    const option = best[i];
    if (bestWeight < 0 && (row.locked || row.systemLocked) && !row.errors.includes('INVALID_LOCK')) row.errors.push('INVALID_LOCK');
    row.carId = option?.physical || null;
    row.systemCarId = option?.system || null;
    row.physicalVehicleType = fleet.find(c => c.id === row.carId)?.service_type || null;
    row.systemVehicleType = fleet.find(c => c.id === row.systemCarId)?.service_type || null;
    row.assignmentMode = !option ? null : row.carId === row.systemCarId ? 'DIRECT' : 'EV_SUBSTITUTION';
    const score = scores.get(`${row.driverId}|${row.carId}`) || 0;
    const bestScore = Math.max(0, ...row.candidates.map(id => scores.get(`${row.driverId}|${id}`) || 0));
    row.reason = row.errors.length ? 'IMPORT_ERROR' : !option ? 'NO_AVAILABLE_CAR' :
      row.assignmentMode === 'EV_SUBSTITUTION' ? 'EV_SUBSTITUTION' : row.locked || row.systemLocked ? 'MANUAL_LOCK' :
      !score ? 'NO_HISTORY' : score === bestScore ? 'USUAL_CAR' : 'FAMILIAR_ALTERNATIVE';
    return row;
  });
}

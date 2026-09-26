import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../../db.js';
import { CONFIG, TYPES, validateDate, parseWorkbook, resolveType, resolveDrivers, unavailable, historyStats, allocate, isElectric, assignmentsConflict } from './tourImportCore.js';
import { storeDailyExcel } from './dailyExcelService.js';
import { uploadAssignments } from '../atlas/atlasService.js';

const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

// A driver only needs Abfahrtskontrolle when starting on a different vehicle.
// Importing a plan previously defaulted every newly written assignment to true,
// losing this day-to-day continuity rule.
async function needsAbfahrtskontrolle(client, planDate, carId, employeeId, driverName) {
  const { rowCount } = await client.query(`SELECT 1 FROM car_planning
    WHERE plan_date = $1::date - 1
      AND car_id = $2
      AND ($3::text IS NOT NULL AND employee_id = $3
        OR lower(trim(COALESCE(driver_identifier, ''))) = lower(trim($4)))
    LIMIT 1`, [planDate, carId, employeeId || null, driverName || '']);
  return rowCount === 0;
}

export async function snapshot(client, date) {
  const cars = (await client.query(`SELECT c.id, c.vehicle_id, c.license_plate, c.vin, c.service_type, COALESCE(c.station, '') AS station,
    c.status, c.assigned_driver_id, s.deactivated, s.active_from::text, s.active_to::text,
    c.planned_workshop_from::text, c.planned_workshop_to::text
    FROM cars c LEFT JOIN car_planning_car_state s ON s.car_id=c.id ORDER BY c.id`)).rows;
  const employees = (await client.query(`SELECT kenjo_user_id AS id, transporter_id, employee_number,
    COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), display_name, kenjo_user_id) AS display_name
    FROM kenjo_employees WHERE is_active=true ORDER BY kenjo_user_id`)).rows;
  const plans = (await client.query(`SELECT *, plan_date::text AS plan_date FROM car_planning WHERE plan_date=$1 ORDER BY car_id`, [date])).rows;
  const history = (await client.query(`SELECT car_id, plan_date::text, driver_identifier, employee_id FROM car_planning
    WHERE plan_date >= $1::date - $2::int AND plan_date < $1::date AND NULLIF(TRIM(driver_identifier), '') IS NOT NULL
    ORDER BY plan_date, car_id`, [date, CONFIG.historyDays])).rows;
  const exclusions = (await client.query('SELECT car_id FROM car_planning_exclusions WHERE plan_date=$1 ORDER BY car_id', [date])).rows.map(r => r.car_id);
  return { cars: cars.map(car => ({ ...car, service_type: resolveType(car.service_type) })), employees, plans, history, exclusions };
}
export async function options() {
  return ['DBX9']; // Compatibility for frontends that still show a station selector.
}
export async function upload(buffer, name, date, station, author) {
  validateDate(date);
  station = 'DBX9'; // The deployment uses one fleet; station is metadata only.
  const rows = await parseWorkbook(buffer, name), id = randomUUID();
  // The one daily source feeds both vehicle planning and Atlas.
  await uploadAssignments(buffer, name, date);
  await storeDailyExcel(date, name, buffer);
  await pool.query(`INSERT INTO car_planning_import_drafts(id, author_id, plan_date, station, source_name, source_hash, rows)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, String(author), date, station, name.slice(0, 255), hash(buffer), JSON.stringify(rows)]);
  return preview(id, author, {}, undefined, false);
}
export async function updatedPlan(date) {
  validateDate(date);
  const { rows } = await pool.query(`SELECT route_code, driver_identifier, entry_time::text AS entry_time,
    entry_day_offset FROM car_planning WHERE plan_date=$1 AND route_code IS NOT NULL
    ORDER BY entry_day_offset, entry_time, route_code`, [date]);
  return { date, rows: rows.map(row => ({ route: row.route_code, driver: row.driver_identifier,
    entryTime: row.entry_time?.slice(0, 5) || null, entryDayOffset: Number(row.entry_day_offset || 0) })) };
}
async function draftFor(client, id, author, lock = false) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) fail('Invalid draft.');
  const d = (await client.query(`SELECT *, plan_date::text AS plan_date FROM car_planning_import_drafts WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
  if (!d || d.author_id !== String(author)) fail('Draft not found.', 404);
  if (d.applied_at) fail('This draft has already been applied. Import again to review changes.', 409);
  return d;
}
export function buildProposal(d, state, edits = {}, excluded, distribute = true, manualRowNumber = null) {
  const fleet = state.cars;
  excluded ??= state.exclusions.filter(id => fleet.some(c => c.id === id));
  if (!Array.isArray(excluded) || excluded.some(id => !fleet.some(c => c.id === id))) fail('Invalid excluded vehicle.');
  const allExcluded = [...new Set([...state.exclusions.filter(id => !fleet.some(c => c.id === id)), ...excluded])];
  const rows = resolveDrivers(d.rows, state.employees, edits);
  for (const row of rows) {
    const driver = state.employees.find(e => e.id === row.driverId);
    const aliases = driver ? [driver.id, driver.transporter_id, driver.employee_number,
      ...(state.employees.filter(e => e.display_name === driver.display_name).length === 1 ? [driver.display_name] : [])].filter(Boolean) : [];
    const legacy = state.plans.filter(p => !p.route_code && (!p.employee_id || p.employee_id === row.driverId)
      && aliases.includes(p.driver_identifier) && fleet.some(c => c.id === p.car_id));
    const routePlans = state.plans.filter(p => p.route_code === row.route);
    if (routePlans.length > 1) fail('Multiple saved assignments exist for this route. Resolve duplicate plans before importing.', 409);
    const existing = routePlans[0] || (legacy.length === 1 ? legacy[0] : null);
    row.existing = existing || null;
    if (existing) {
      if (!Object.hasOwn(edits[row.rowNumber] || {}, 'carId')) row.carId = existing.car_id;
      if (!Object.hasOwn(edits[row.rowNumber] || {}, 'locked')) row.locked = !!existing.assignment_locked;
      if (!Object.hasOwn(edits[row.rowNumber] || {}, 'systemCarId')) row.systemCarId = edits[row.rowNumber]?.locked && edits[row.rowNumber]?.carId ? Number(edits[row.rowNumber].carId) : existing.system_vehicle_id ?? existing.car_id;
      if (!Object.hasOwn(edits[row.rowNumber] || {}, 'systemLocked')) row.systemLocked = !!(existing.system_vehicle_locked ?? existing.assignment_locked);
      // A unique legacy assignment already identifies this driver. Filling its
      // missing Excel metadata is not a driver/type change. Actual replacements
      // and explicit locks still require confirmation.
      const legacyPromotion = !existing.route_code && legacy.length === 1;
      const driverChanged = existing.employee_id !== row.driverId && !(legacyPromotion && !existing.employee_id);
      const typeChanged = existing.required_type !== row.type && !(legacyPromotion && !existing.required_type);
      if ((driverChanged || typeChanged || (existing.assignment_locked && (!row.locked || row.carId !== existing.car_id)) || ((existing.system_vehicle_locked ?? existing.assignment_locked) && (!row.systemLocked || row.systemCarId !== (existing.system_vehicle_id ?? existing.car_id)))) && !row.approveChange) row.errors.push('CONFIRM_EXISTING_CHANGE');
    }
    // Legacy identities may be names, employee numbers, Transporter IDs, or Kenjo IDs.
    if (state.plans.some(p => p.id !== existing?.id && !rows.some(r => r.route === p.route_code) && (p.employee_id === row.driverId || aliases.includes(p.driver_identifier)))) row.errors.push('DRIVER_ALREADY_PLANNED');
  }
  const allowed = (row, car, role = 'physical') => unavailable(car, d.plan_date, allExcluded)
    || (car.assigned_driver_id && car.assigned_driver_id !== row.driverId ? 'RESERVED_DRIVER' : null)
    || (state.plans.some(p => ((role === 'physical' ? p.car_id : (p.system_vehicle_id ?? p.car_id)) === car.id || (!(row.isRescue || p.required_type === 'Rescue') && [p.car_id, p.system_vehicle_id].includes(car.id))) && p.id !== row.existing?.id && !rows.some(r => r.existing?.id === p.id && !r.errors.length) && (p.driver_identifier || p.route_code || p.abfahrtskontrolle)) ? 'ALREADY_PLANNED' : null);
  const history = historyStats(state.history, state.employees, d.plan_date, fleet);
  for (const row of rows) {
    const dominant = history.types.get(row.driverId);
    // Electric history is a vehicle preference, not a prohibition against the
    // electric category explicitly requested by today's Excel assignment.
    row.historyPhysicalType = row.isRescue || (isElectric(row.type) && isElectric(dominant?.type) && row.type !== dominant.type)
      ? null : dominant?.type || null;
    row.historyTypeDays = dominant?.days || 0;
    row.historyTotalDays = dominant?.totalDays || 0;
  }
  let result;
  if (manualRowNumber === null) result = allocate(rows, fleet, history.scores, allowed);
  else {
    // Revalidate one correction; other routes reserve both cars and keep their values.
    const target = rows.find(r => r.rowNumber === manualRowNumber);
    const others = rows.filter(r => r !== target);
    const reserved = (row, car, role, peers) => peers.some(other =>
      (role === 'system' ? other.systemCarId : other.carId) === car.id ||
      (!(row.isRescue || other.isRescue) && [other.carId, other.systemCarId].includes(car.id)));
    result = allocate([target], fleet, history.scores, (r, c, role) => allowed(r, c, role) || (reserved(r, c, role, others) ? 'ALREADY_PLANNED' : null));
    for (const row of others) {
      const [checked] = allocate([{ ...row, locked: !!row.carId, systemLocked: !!row.systemCarId }], fleet, history.scores,
        (r, c, role) => allowed(r, c, role) || (reserved(r, c, role, others.filter(other => other !== row)) ? 'ALREADY_PLANNED' : null));
      result.push({ ...checked, carId: row.carId, systemCarId: row.systemCarId,
        locked: row.locked, systemLocked: row.systemLocked,
        assignmentMode: row.carId && row.systemCarId ? (row.carId === row.systemCarId ? 'DIRECT' : 'EV_SUBSTITUTION') : null,
        physicalVehicleType: fleet.find(c => c.id === row.carId)?.service_type || null,
        systemVehicleType: fleet.find(c => c.id === row.systemCarId)?.service_type || null,
        reason: checked.errors.length ? 'IMPORT_ERROR' : row.carId ? checked.reason : 'NO_AVAILABLE_CAR' });
    }
  }
  if (!distribute) result = result.map(row => ({ ...row, carId: row.existing?.car_id || null, systemCarId: row.existing ? (row.existing.system_vehicle_id ?? row.existing.car_id) : null, assignmentMode: row.existing ? (row.existing.system_vehicle_id && row.existing.system_vehicle_id !== row.existing.car_id ? 'EV_SUBSTITUTION' : 'DIRECT') : null, reason: row.errors.length ? 'IMPORT_ERROR' : 'REVIEW' }));
  const summary = TYPES.map(type => {
    const demand = rows.filter(r => r.type === type).length;
    const available = fleet.filter(c => c.service_type === type && !unavailable(c, d.plan_date, allExcluded) && !state.plans.some(p => [p.car_id, p.system_vehicle_id].includes(c.id) && !rows.some(r => r.existing?.id === p.id) && (p.driver_identifier || p.route_code || p.abfahrtskontrolle))).length;
    const assigned = result.filter(r => r.type === type && r.carId && !r.errors.length).length;
    const shortage = Math.max(0, demand - available);
    const unfilled = result.filter(r => r.type === type && !r.errors.length && !r.carId).length;
    return { type, demand, available, assigned, shortage, conflicts: result.filter(r => r.type === type && r.errors.length).length, constraintConflicts: Math.max(0, unfilled - shortage) };
  });
  for (const row of result) {
    const usual = fleet.filter(car => history.days.has(`${row.driverId}|${car.id}`))
      .sort((a, b) => history.days.get(`${row.driverId}|${b.id}`) - history.days.get(`${row.driverId}|${a.id}`)
        || (history.scores.get(`${row.driverId}|${b.id}`) - history.scores.get(`${row.driverId}|${a.id}`)) || a.id - b.id)[0];
    row.usualCarId = usual?.id || null;
    row.usualCarDays = usual ? history.days.get(`${row.driverId}|${usual.id}`) : 0;
    row.assignedCarDays = history.days.get(`${row.driverId}|${row.carId}`) || 0;
    row.historyDays = CONFIG.historyDays;
    const old = row.existing;
    row.change = !old ? 'ADDED' : old.car_id !== row.carId || old.employee_id !== row.driverId || old.required_type !== row.type
      || (old.departure_time || '').slice(0, 5) !== (row.departureTime || '')
      || (old.entry_time || '').slice(0, 5) !== (row.entryTime || '')
      || Number(old.entry_day_offset || 0) !== row.entryDayOffset
      || !!old.assignment_locked !== row.locked || (old.system_vehicle_id ?? old.car_id) !== row.systemCarId
      || !!(old.system_vehicle_locked ?? old.assignment_locked) !== row.systemLocked ? 'CHANGED' : 'UNCHANGED';
    if (row.reason === 'NO_AVAILABLE_CAR') row.reason = row.historyPhysicalType && !row.candidates.length ? 'HISTORY_TYPE_UNAVAILABLE' : summary.find(s => s.type === row.type)?.shortage > 0 ? 'TYPE_SHORTAGE' : 'CONSTRAINT_CONFLICT';
    if (!row.errors.length && !row.carId) {
      const occupied = new Set(result.filter(other => other !== row).flatMap(other => [other.carId, other.systemCarId]).filter(Boolean));
      row.reviewReason = !row.systemCandidates.some(id => !occupied.has(id)) ? 'SYSTEM_TYPE_UNAVAILABLE'
        : row.historyPhysicalType ? 'HISTORY_TYPE_UNAVAILABLE' : row.reason;
    } else row.reviewReason = row.errors[0] || null;
  }
  result.sort((a, b) => (a.entryDayOffset - b.entryDayOffset)
    || String(a.entryTime || '99:99').localeCompare(String(b.entryTime || '99:99'))
    || a.route.localeCompare(b.route, 'en') || a.rowNumber - b.rowNumber);
  const availableEV = fleet.filter(c => isElectric(c.service_type) && !unavailable(c, d.plan_date, allExcluded));
  const physicalIds = new Set([...result.filter(r => !r.errors.length).map(r => r.carId),
    ...state.plans.filter(p => !rows.some(r => r.existing?.id === p.id) && (p.driver_identifier || p.route_code)).map(p => p.car_id)]);
  const assignedEV = availableEV.filter(c => physicalIds.has(c.id));
  const evSummary = {
    available: availableEV.length, assigned: assignedEV.length, remaining: availableEV.length - assignedEV.length,
    utilization: availableEV.length ? assignedEV.length / availableEV.length : null,
    conventionalAssigned: fleet.filter(c => ['Medium VN', 'Standard Parcel'].includes(c.service_type) && physicalIds.has(c.id)).length,
    unfilledRoutes: result.filter(r => !r.carId).length,
    systemConflicts: result.filter(r => r.errors.includes('INVALID_LOCK') || (r.driverId && !r.systemCarId)).length,
    remainingVehicles: availableEV.filter(c => !physicalIds.has(c.id)).map(c => ({ carId: c.id,
      reason: state.plans.some(p => [p.car_id, p.system_vehicle_id].includes(c.id) && !rows.some(r => r.existing?.id === p.id)) ? 'ALREADY_RESERVED' :
        !rows.some(r => !allowed(r, c) && (r.type === c.service_type || ['Medium VN', 'Standard Parcel'].includes(r.type))) ? 'NO_COMPATIBLE_ROUTE' :
        !result.some(r => !r.errors.length && r.systemCandidates.length && !r.locked && r.candidates.includes(c.id)) ? 'NO_UNLOCKED_ROUTE_WITH_SYSTEM_VEHICLE' : 'COVERAGE_OR_RESERVATION_CONSTRAINT' })),
  };
  const proposal = { rows: result, summary, evSummary, excluded, savedExclusions: state.exclusions, snapshotVersion: hash(state), distributed: distribute };
  return { ...proposal, version: hash(proposal) };
}
export async function preview(id, author, edits, excluded, distribute = true, physicalChange = null) {
  return transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const d = await draftFor(client, id, author, true), state = await snapshot(client, d.plan_date);
    let manualRowNumber = null;
    if (physicalChange) {
      const previous = d.proposal;
      if (!previous?.distributed || previous.version !== physicalChange.version) fail('Draft changed. Recalculate before editing the vehicle.', 409);
      const target = previous.rows.find(r => r.rowNumber === physicalChange.rowNumber);
      const carId = Number(physicalChange.carId);
      const car = state.cars.find(c => c.id === carId);
      if (!target || !Number.isInteger(carId) || !car) fail('Invalid vehicle correction.');
      edits = Object.fromEntries(previous.rows.map(r => [r.rowNumber, { driverId: r.driverId, carId: r.carId,
        systemCarId: r.systemCarId, locked: r.locked, systemLocked: r.systemLocked, approveChange: r.approveChange }]));
      const patch = edits[target.rowNumber];
      patch.carId = carId; patch.locked = true;
      // Same-type corrections are direct unless the dispatcher explicitly pinned QR.
      if (!patch.systemLocked && car.service_type === target.type) patch.systemCarId = carId;
      const old = target.existing;
      // Clicking a replacement explicitly approves a vehicle-only correction,
      // but never approves a changed route/driver/type or an unrelated QR pin.
      if (old?.route_code === target.route && old.employee_id === target.driverId && old.required_type === target.type &&
        (!(old.system_vehicle_locked ?? old.assignment_locked) || (patch.systemLocked && patch.systemCarId === (old.system_vehicle_id ?? old.car_id)))) patch.approveChange = true;
      excluded = previous.excluded;
      // Keep the selected vehicle fixed, then reallocate every other unlocked
      // imported tour. This permits a dispatcher to take a vehicle currently
      // proposed for another imported driver without creating a duplicate.
      manualRowNumber = null;
    }
    const proposal = buildProposal(d, state, edits, excluded, distribute, manualRowNumber);
    await client.query('UPDATE car_planning_import_drafts SET proposal=$2 WHERE id=$1', [id, JSON.stringify(proposal)]);
    return { id, date: d.plan_date, station: d.station, source: d.source_name, ...proposal, cars: state.cars, employees: state.employees };
  });
}
export async function addRescue(id, author, employeeId, entryTime, entryDayOffset, expectedVersion) {
  return transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const d = await draftFor(client, id, author, true), state = await snapshot(client, d.plan_date);
    const previous = d.proposal;
    if (!previous?.distributed || previous.version !== expectedVersion) fail('Draft changed. Recalculate before adding Rescue.', 409);
    const employee = state.employees.find(e => e.id === employeeId);
    if (!employee || previous.rows.some(r => r.driverId === employeeId || r.participants.some(p => p.matches?.includes(employeeId) || (employee.transporter_id && p.transporterId === String(employee.transporter_id).trim())))) fail('Driver is already included in the import or unavailable.');
    if (state.plans.some(p => p.employee_id === employeeId || [employeeId, employee.transporter_id, employee.employee_number, employee.display_name].filter(Boolean).includes(p.driver_identifier))) fail('Driver is already assigned on this date.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entryTime || '') || ![0,-1].includes(entryDayOffset)) fail('Invalid Rescue entry time.');
    if (d.rows.length >= CONFIG.maxRows) fail('Too many tours.');
    const [h,m] = entryTime.split(':').map(Number), minutes = h*60+m+25;
    if (entryDayOffset !== (minutes >= 1440 ? -1 : 0)) fail('Invalid Rescue entry date.');
    const departureTime = `${String(Math.floor(minutes%1440/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    const rowNumber = Math.max(...d.rows.map(r=>r.rowNumber)) + 1;
    const rescue = {route:`RESCUE_${employeeId}`,rowNumber,isRescue:true,rescueDriverId:employeeId,type:'Rescue',departureTime,
      participants:[{name:employee.display_name,transporterId:String(employee.transporter_id || '')}],raw:{},errors:[],duplicateRows:[]};
    const rows = [...d.rows,rescue];
    const edits = Object.fromEntries(previous.rows.map(r=>[r.rowNumber,{driverId:r.driverId,carId:r.carId,systemCarId:r.systemCarId,locked:r.locked,systemLocked:r.systemLocked,approveChange:r.approveChange}]));
    const proposal = buildProposal({...d,rows},state,edits,previous.excluded);
    const added = proposal.rows.find(r=>r.rowNumber===rowNumber);
    if (!added?.carId || !added?.systemCarId || added.errors.length) fail('No available physical vehicle and QR for Rescue.');
    await client.query('UPDATE car_planning_import_drafts SET rows=$2, proposal=$3 WHERE id=$1',[id,JSON.stringify(rows),JSON.stringify(proposal)]);
    return {id,date:d.plan_date,station:d.station,source:d.source_name,...proposal,cars:state.cars,employees:state.employees};
  });
}
export async function apply(id, author, selected, expectedVersion, partial = false) {
  return transaction(async client => {
    const d = await draftFor(client, id, author, true);
    // All planning writers, including legacy endpoints, must wait. Snapshot is read
    // after acquiring locks, and all selected changes commit together.
    await client.query('LOCK TABLE car_planning, cars, car_planning_car_state, car_planning_exclusions, kenjo_employees IN SHARE ROW EXCLUSIVE MODE');
    const state = await snapshot(client, d.plan_date), proposal = d.proposal;
    if (!proposal?.distributed || proposal.version !== expectedVersion || hash(state) !== proposal.snapshotVersion) fail('Plan or availability changed. Recalculate before applying.', 409);
    if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) fail('Select tours to apply.');
    const chosen = proposal.rows.filter(r => selected.includes(r.rowNumber));
    if (chosen.length !== selected.length || chosen.some(r => r.errors.length || (!r.carId || !r.systemCarId))) fail('Selected tours contain unresolved errors.');
    if (!partial && chosen.length !== proposal.rows.length) fail('Confirm partial application explicitly.');
    const edits = Object.fromEntries(proposal.rows.map(r => [r.rowNumber, { driverId: r.driverId, carId: r.carId, systemCarId: r.systemCarId, locked: !!r.carId, systemLocked: !!r.systemCarId, approveChange: r.approveChange }]));
    const checked = buildProposal(d, state, edits, proposal.excluded);
    if (checked.rows.some(r => selected.includes(r.rowNumber) && (r.errors.length || !r.carId))) fail('Assignment constraints changed. Recalculate.', 409);
    const replacingIds = chosen.map(r => r.existing?.id).filter(Boolean);
    for (const row of chosen) {
      const driver = state.employees.find(e => e.id === row.driverId);
      const aliases = [driver.id, driver.transporter_id, driver.employee_number, driver.display_name].filter(Boolean);
      if (state.plans.some(p => !replacingIds.includes(p.id) && ((assignmentsConflict({physical:p.car_id,system:p.system_vehicle_id ?? p.car_id,isRescue:p.required_type === 'Rescue'}, {physical:row.carId,system:row.systemCarId,isRescue:row.isRescue}) && (p.driver_identifier || p.route_code || p.abfahrtskontrolle)) || p.employee_id === row.driverId || aliases.includes(p.driver_identifier)))) fail('Selected tours depend on other existing tours. Select those tours too or recalculate.', 409);
    }
    await client.query("SELECT set_config('lightcore.tour_import', 'on', true)");
    const changes = [];
    const changedIds = chosen.filter(r => r.change !== 'UNCHANGED').map(r => r.existing?.id).filter(Boolean);
    if (changedIds.length) await client.query('DELETE FROM car_planning WHERE id=ANY($1::int[])', [changedIds]);
    for (const row of chosen) {
      if (row.change === 'UNCHANGED') continue;
      const old = state.plans.find(p => p.id === row.existing?.id);
      const driverName = state.employees.find(e => e.id === row.driverId).display_name;
      const needsInspection = await needsAbfahrtskontrolle(client, d.plan_date, row.carId, row.driverId, driverName);
      // Empty inspection-only slots are blocked by candidate validation; only an
      // entirely empty legacy slot can be replaced here.
      await client.query("DELETE FROM car_planning WHERE car_id=$1 AND plan_date=$2 AND route_code IS NULL AND NULLIF(TRIM(driver_identifier),'') IS NULL AND abfahrtskontrolle=false", [row.carId, d.plan_date]);
      await client.query(`INSERT INTO car_planning(car_id, plan_date, driver_identifier, abfahrtskontrolle,
        route_code, station, employee_id, required_type, departure_time, entry_time, entry_day_offset, import_source, assignment_locked, system_vehicle_id, system_vehicle_locked)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [row.carId, d.plan_date, driverName, needsInspection ? (old?.abfahrtskontrolle ?? true) : false,
        row.route, d.station, row.driverId, row.type, row.departureTime, row.entryTime, row.entryDayOffset,
        JSON.stringify({ hash: d.source_hash, name: d.source_name, rowNumber: row.rowNumber, raw: row.raw, participants: row.participants }), row.locked, row.systemCarId, row.systemLocked]);
      changes.push({ route: row.route, before: old || null, after: { carId: row.carId, systemCarId: row.systemCarId, systemLocked: row.systemLocked, assignmentMode: row.assignmentMode, employeeId: row.driverId,
        type: row.type, departureTime: row.departureTime, entryTime: row.entryTime, entryDayOffset: row.entryDayOffset, locked: row.locked } });
    }
    await client.query(`DELETE FROM car_planning_exclusions WHERE plan_date=$1 AND car_id=ANY($2::int[]) AND NOT(car_id=ANY($3::int[]))`, [d.plan_date, state.cars.map(c => c.id), proposal.excluded]);
    for (const carId of proposal.excluded) await client.query('INSERT INTO car_planning_exclusions(plan_date,car_id,author_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [d.plan_date, carId, String(author)]);
    await client.query(`INSERT INTO car_planning_import_audit(draft_id,author_id,plan_date,station,source_hash,changes) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, String(author), d.plan_date, d.station, d.source_hash, JSON.stringify({ changes, excluded: proposal.excluded, previousExclusions: state.exclusions, remaining: proposal.rows.filter(r => !selected.includes(r.rowNumber)).map(r => r.route), result: 'confirmed' })]);
    await client.query('UPDATE car_planning_import_drafts SET applied_at=NOW() WHERE id=$1', [id]);
    return { ok: true, date: d.plan_date, applied: chosen.length, changed: changes.length, remaining: proposal.rows.length - chosen.length };
  });
}

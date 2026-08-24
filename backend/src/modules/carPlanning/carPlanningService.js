import { query } from '../../db.js';
import pushService from '../push/pushService.js';
import inspectionReminderService from '../vehicleInspections/inspectionReminderService.js';

let carPlanningWorkshopColumnsReady = false;
const DEFAULT_FLEETCHECK_PUBLIC_BASE_URL =
  String(process.env.FLEETCHECK_PUBLIC_BASE_URL || 'https://fleetcheck.alfamile.com').trim()
  || 'https://fleetcheck.alfamile.com';
const ASSIGNMENT_PUSH_COPY = {
  en: {
    title: "Today's car assignment",
    withInspection: (assignmentLabel) => `Today you will drive ${assignmentLabel}. Please complete the vehicle inspection before departure.`,
    withoutInspection: (assignmentLabel) => `Today you will drive ${assignmentLabel}. No vehicle inspection is required today.`,
  },
  de: {
    title: 'Heutige Fahrzeugzuteilung',
    withInspection: (assignmentLabel) => `Heute fährst du ${assignmentLabel}. Bitte führe vor der Abfahrt die Fahrzeuginspektion durch.`,
    withoutInspection: (assignmentLabel) => `Heute fährst du ${assignmentLabel}. Heute ist keine Fahrzeuginspektion erforderlich.`,
  },
  ru: {
    title: 'Назначение автомобиля на сегодня',
    withInspection: (assignmentLabel) => `Сегодня вы едете на автомобиле ${assignmentLabel}. Пожалуйста, выполните осмотр автомобиля перед выездом.`,
    withoutInspection: (assignmentLabel) => `Сегодня вы едете на автомобиле ${assignmentLabel}. Сегодня осмотр автомобиля не требуется.`,
  },
  fr: {
    title: "Attribution du véhicule aujourd'hui",
    withInspection: (assignmentLabel) => `Aujourd’hui, vous conduirez ${assignmentLabel}. Veuillez effectuer l’inspection du véhicule avant le départ.`,
    withoutInspection: (assignmentLabel) => `Aujourd’hui, vous conduirez ${assignmentLabel}. Aucune inspection du véhicule n’est requise aujourd’hui.`,
  },
  it: {
    title: 'Assegnazione veicolo di oggi',
    withInspection: (assignmentLabel) => `Oggi guiderai ${assignmentLabel}. Completa l’ispezione del veicolo prima della partenza.`,
    withoutInspection: (assignmentLabel) => `Oggi guiderai ${assignmentLabel}. Oggi non è richiesta alcuna ispezione del veicolo.`,
  },
  es: {
    title: 'Asignación de vehículo de hoy',
    withInspection: (assignmentLabel) => `Hoy conducirás ${assignmentLabel}. Completa la inspección del vehículo antes de salir.`,
    withoutInspection: (assignmentLabel) => `Hoy conducirás ${assignmentLabel}. Hoy no se requiere inspección del vehículo.`,
  },
  pl: {
    title: 'Dzisiejszy przydział pojazdu',
    withInspection: (assignmentLabel) => `Dziś pojedziesz pojazdem ${assignmentLabel}. Wykonaj inspekcję pojazdu przed wyjazdem.`,
    withoutInspection: (assignmentLabel) => `Dziś pojedziesz pojazdem ${assignmentLabel}. Dziś inspekcja pojazdu nie jest wymagana.`,
  },
  uk: {
    title: 'Сьогоднішнє призначення автомобіля',
    withInspection: (assignmentLabel) => `Сьогодні ви їдете на автомобілі ${assignmentLabel}. Будь ласка, виконайте огляд автомобіля перед виїздом.`,
    withoutInspection: (assignmentLabel) => `Сьогодні ви їдете на автомобілі ${assignmentLabel}. Сьогодні огляд автомобіля не потрібен.`,
  },
  nl: {
    title: 'Voertuigtoewijzing van vandaag',
    withInspection: (assignmentLabel) => `Vandaag rijd je met ${assignmentLabel}. Rond voor vertrek de voertuiginspectie af.`,
    withoutInspection: (assignmentLabel) => `Vandaag rijd je met ${assignmentLabel}. Vandaag is geen voertuiginspectie nodig.`,
  },
  ro: {
    title: 'Alocarea vehiculului pentru azi',
    withInspection: (assignmentLabel) => `Astăzi vei conduce ${assignmentLabel}. Te rugăm să finalizezi inspecția vehiculului înainte de plecare.`,
    withoutInspection: (assignmentLabel) => `Astăzi vei conduce ${assignmentLabel}. Astăzi nu este necesară inspecția vehiculului.`,
  },
  hu: {
    title: 'Mai járműbeosztás',
    withInspection: (assignmentLabel) => `Ma a(z) ${assignmentLabel} járművet vezeted. Indulás előtt végezd el a járműellenőrzést.`,
    withoutInspection: (assignmentLabel) => `Ma a(z) ${assignmentLabel} járművet vezeted. Ma nincs szükség járműellenőrzésre.`,
  },
  ar: {
    title: 'تخصيص السيارة لليوم',
    withInspection: (assignmentLabel) => `اليوم ستقود ${assignmentLabel}. يرجى إكمال فحص المركبة قبل الانطلاق.`,
    withoutInspection: (assignmentLabel) => `اليوم ستقود ${assignmentLabel}. لا يلزم فحص المركبة اليوم.`,
  },
};

function getAssignmentPushCopy(locale) {
  return ASSIGNMENT_PUSH_COPY[String(locale || '').toLowerCase()] || ASSIGNMENT_PUSH_COPY.en;
}

function stringOrNull(value, maxLen = 5000) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

async function ensureCarPlanningWorkshopColumns() {
  if (carPlanningWorkshopColumnsReady) return;
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_from DATE`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_to DATE`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_name TEXT`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_workshop_comment TEXT`);
  await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS service_type TEXT`);
  carPlanningWorkshopColumnsReady = true;
}

function toDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function isDateWithinRange(dateYmd, fromYmd, toYmd) {
  if (!dateYmd || !fromYmd) return false;
  const endYmd = toYmd || fromYmd;
  return dateYmd >= fromYmd && dateYmd <= endYmd;
}

function isStatusAutoDeactivated(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return [
    'maintenance',
    'grounded',
    'out of service',
    'defleeted',
    'decommissioned',
  ].includes(normalized);
}

function buildFleetcheckAssignmentUrl(vin, options = {}) {
  const safeBase = DEFAULT_FLEETCHECK_PUBLIC_BASE_URL.replace(/\/+$/, '');
  const normalizedVin = stringOrNull(vin, 64);
  const params = new URLSearchParams();
  if (normalizedVin) {
    params.set('vin', normalizedVin);
  }
  params.set('notice', 'assignment');
  params.set('fromPush', '1');
  if (stringOrNull(options.licensePlate, 64)) {
    params.set('plate', stringOrNull(options.licensePlate, 64));
  }
  if (stringOrNull(options.vehicleId, 255)) {
    params.set('vehicleId', stringOrNull(options.vehicleId, 255));
  }
  if (stringOrNull(options.planDate, 32)) {
    params.set('planDate', stringOrNull(options.planDate, 32));
  }
  if (typeof options.requiresInspection === 'boolean') {
    params.set('requiresInspection', options.requiresInspection ? '1' : '0');
  }
  const suffix = params.toString();
  return suffix ? `${safeBase}/fleet-check?${suffix}` : `${safeBase}/fleet-check`;
}

async function resolvePlanningDriverContact(driverIdentifier) {
  const normalizedDriver = stringOrNull(driverIdentifier, 255);
  if (!normalizedDriver) {
    return {
      driverName: null,
      employeeRef: null,
      kenjoUserId: null,
    };
  }

  const res = await query(
    `SELECT
       ke.employee_number::text AS employee_number,
       ke.kenjo_user_id::text AS kenjo_user_id,
       ke.transporter_id::text AS transporter_id,
       ke.display_name,
       ke.first_name,
       ke.last_name
     FROM kenjo_employees ke
     WHERE LOWER(COALESCE(ke.display_name, '')) = LOWER($1::text)
        OR LOWER(TRIM(COALESCE(ke.first_name, '') || ' ' || COALESCE(ke.last_name, ''))) = LOWER($1::text)
        OR LOWER(COALESCE(ke.employee_number::text, '')) = LOWER($1::text)
        OR LOWER(COALESCE(ke.transporter_id::text, '')) = LOWER($1::text)
        OR LOWER(COALESCE(ke.kenjo_user_id::text, '')) = LOWER($1::text)
     ORDER BY ke.is_active DESC, ke.id ASC
     LIMIT 1`,
    [normalizedDriver],
  ).catch(() => ({ rows: [] }));

  const row = res.rows?.[0];
  return {
    driverName:
      stringOrNull(row?.display_name, 255)
      || stringOrNull([row?.first_name, row?.last_name].filter(Boolean).join(' '), 255)
      || normalizedDriver,
    employeeRef: stringOrNull(row?.employee_number, 128) || stringOrNull(row?.transporter_id, 128),
    kenjoUserId: stringOrNull(row?.kenjo_user_id, 128),
  };
}

async function resolvePlanningDriverAliases(identity = {}) {
  const rawCandidates = [
    stringOrNull(identity.employeeRef, 128),
    stringOrNull(identity.employeeId, 128),
    stringOrNull(identity.kenjoUserId, 128),
    stringOrNull(identity.displayName, 255),
  ].filter(Boolean);
  if (!rawCandidates.length) return [];

  const lowerCandidates = [...new Set(rawCandidates.map((value) => value.toLowerCase()))];
  const res = await query(
    `SELECT
       ke.employee_number::text AS employee_number,
       ke.kenjo_user_id::text AS kenjo_user_id,
       ke.transporter_id::text AS transporter_id,
       ke.display_name,
       ke.first_name,
       ke.last_name
     FROM kenjo_employees ke
     WHERE ke.employee_number::text = ANY($1::text[])
        OR ke.transporter_id::text = ANY($1::text[])
        OR ke.kenjo_user_id::text = ANY($1::text[])
        OR LOWER(COALESCE(ke.display_name, '')) = ANY($2::text[])
        OR LOWER(TRIM(COALESCE(ke.first_name, '') || ' ' || COALESCE(ke.last_name, ''))) = ANY($2::text[])
     ORDER BY ke.is_active DESC, ke.id ASC
     LIMIT 5`,
    [rawCandidates, lowerCandidates],
  ).catch(() => ({ rows: [] }));

  const aliases = new Set(lowerCandidates);
  for (const row of res.rows || []) {
    [
      row?.employee_number,
      row?.transporter_id,
      row?.kenjo_user_id,
      row?.display_name,
      [row?.first_name, row?.last_name].filter(Boolean).join(' '),
    ].forEach((value) => {
      const normalized = stringOrNull(value, 255);
      if (normalized) aliases.add(normalized.toLowerCase());
    });
  }
  return [...aliases];
}

async function getTodayAssignmentForDriver(identity = {}) {
  const aliases = await resolvePlanningDriverAliases(identity);
  if (!aliases.length) return null;

  const res = await query(
    `SELECT
       p.plan_date::text AS plan_date,
       p.driver_identifier,
       p.abfahrtskontrolle,
       c.id AS car_id,
       c.vehicle_id,
       c.license_plate,
       c.vin,
       c.service_type
     FROM car_planning p
     INNER JOIN cars c ON c.id = p.car_id
     WHERE p.plan_date = CURRENT_DATE
       AND LOWER(COALESCE(p.driver_identifier, '')) = ANY($1::text[])
     ORDER BY p.abfahrtskontrolle DESC, c.vehicle_id ASC, c.id ASC
     LIMIT 1`,
    [aliases],
  ).catch(() => ({ rows: [] }));

  const row = res.rows?.[0];
  if (!row) return null;

  return {
    car_id: row.car_id,
    plan_date: toDateOnly(row.plan_date),
    driver_identifier: stringOrNull(row.driver_identifier, 255),
    abfahrtskontrolle: Boolean(row.abfahrtskontrolle),
    vehicle_id: stringOrNull(row.vehicle_id, 255),
    license_plate: stringOrNull(row.license_plate, 64),
    vin: stringOrNull(row.vin, 64),
    service_type: stringOrNull(row.service_type, 128),
  };
}

function normalizeNotificationSlots(slots = []) {
  const deduped = new Map();
  for (const slot of Array.isArray(slots) ? slots : []) {
    const carId = Number.parseInt(slot?.car_id, 10);
    const planDate = (slot?.plan_date || '').toString().slice(0, 10);
    const driverIdentifier = stringOrNull(slot?.driver_identifier, 255);
    if (!Number.isFinite(carId) || !planDate || !driverIdentifier) continue;
    deduped.set(`${carId}|${planDate}`, {
      carId,
      planDate,
      driverIdentifier,
      requiresInspection: Boolean(slot?.abfahrtskontrolle),
    });
  }
  return [...deduped.values()];
}

/**
 * Get all cars for planning grid (vehicle_id, id, license_plate, etc.).
 */
async function getCarsForPlanning() {
  await ensureCarPlanningWorkshopColumns();
  const res = await query(
    `SELECT c.id, c.vehicle_id, c.license_plate, c.status,
            c.service_type,
            c.planned_workshop_from::text AS planned_workshop_from,
            c.planned_workshop_to::text AS planned_workshop_to,
            c.planned_workshop_name,
            c.planned_workshop_comment
     FROM cars c
     ORDER BY c.vehicle_id`
  );
  return (res.rows || []).map((row) => ({
    ...row,
    planned_workshop_from: toDateOnly(row.planned_workshop_from),
    planned_workshop_to: toDateOnly(row.planned_workshop_to),
  }));
}

/**
 * Get car planning state (deactivated per car).
 */
async function getCarStates() {
  const res = await query(
    `SELECT car_id, deactivated, active_from, active_to FROM car_planning_car_state`
  );
  const map = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  (res.rows || []).forEach((r) => {
    let deactivated = !!r.deactivated;
    const from = r.active_from ? new Date(r.active_from) : null;
    const to = r.active_to ? new Date(r.active_to) : null;
    if (!deactivated) {
      if (from && today < from) deactivated = true;
      if (to && today > to) deactivated = true;
    }
    map.set(r.car_id, deactivated);
  });
  return map;
}

/**
 * Get active drivers (for dropdown) from kenjo_employees.
 */
async function getActiveDrivers() {
  const res = await query(
    `SELECT kenjo_user_id AS id, transporter_id, employee_number,
            first_name, last_name,
            COALESCE(TRIM(first_name || ' ' || last_name), transporter_id, kenjo_user_id) AS display_name
     FROM kenjo_employees
     WHERE is_active = true
     ORDER BY last_name, first_name`
  );
  return (res.rows || []).map((r) => ({
    id: r.id,
    transporter_id: r.transporter_id,
    employee_number: r.employee_number,
    first_name: r.first_name,
    last_name: r.last_name,
    display_name: r.display_name || r.transporter_id || r.id,
  }));
}

/**
 * Get planning data for given dates: car states + slots (car_id, plan_date, driver_identifier, abfahrtskontrolle).
 */
async function getPlanningData(dates) {
  await ensureCarPlanningWorkshopColumns();
  if (!Array.isArray(dates) || dates.length === 0) {
    return { carStates: {}, slots: [] };
  }
  const dateList = dates.map((d) => (d || '').toString().slice(0, 10)).filter(Boolean);
  if (dateList.length === 0) return { carStates: {}, slots: [] };

  const [stateRes, slotsRes] = await Promise.all([
    query(`SELECT car_id, deactivated FROM car_planning_car_state`),
    query(
      `SELECT car_id, plan_date::text AS plan_date, driver_identifier, abfahrtskontrolle
       FROM car_planning
       WHERE plan_date = ANY($1::date[])`,
      [dateList]
    ),
  ]);

  const carStates = {};
  (stateRes.rows || []).forEach((r) => {
    carStates[r.car_id] = !!r.deactivated;
  });

  const slots = (slotsRes.rows || []).map((r) => ({
    car_id: r.car_id,
    plan_date: r.plan_date,
    driver_identifier: r.driver_identifier,
    abfahrtskontrolle: !!r.abfahrtskontrolle,
  }));

  return { carStates, slots };
}

/**
 * Save planning: car states (deactivated) and slots (car_id, plan_date, driver_identifier, abfahrtskontrolle).
 */
async function savePlanningData(carStates = {}, slots = []) {
  await ensureCarPlanningWorkshopColumns();
  const carIds = Object.keys(carStates).map((k) => parseInt(k, 10)).filter(Number.isFinite);
  for (const carId of carIds) {
    await query(
      `INSERT INTO car_planning_car_state (car_id, deactivated, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (car_id) DO UPDATE SET deactivated = EXCLUDED.deactivated, updated_at = NOW()`,
      [carId, !!carStates[carId]]
    );
  }

  const dateList = [...new Set(slots.map((s) => (s.plan_date || '').toString().slice(0, 10)).filter(Boolean))];
  const deduped = new Map();
  slots.forEach((s) => {
    const key = `${s.car_id}|${(s.plan_date || '').toString().slice(0, 10)}`;
    deduped.set(key, s);
  });

  if (dateList.length > 0) {
    await query(
      `DELETE FROM car_planning WHERE plan_date = ANY($1::date[])`,
      [dateList]
    );
  }

  const workshopWindowByCarId = new Map();
  const statusByCarId = new Map();
  const workshopCarIds = [...new Set([...deduped.values()].map((s) => parseInt(s.car_id, 10)).filter(Number.isFinite))];
  if (workshopCarIds.length > 0) {
    const workshopCarsRes = await query(
      `SELECT id, status, planned_workshop_from::text AS planned_workshop_from, planned_workshop_to::text AS planned_workshop_to
       FROM cars
       WHERE id = ANY($1::int[])`,
      [workshopCarIds]
    );
    for (const row of workshopCarsRes.rows || []) {
      statusByCarId.set(row.id, row.status || '');
      workshopWindowByCarId.set(row.id, {
        from: toDateOnly(row.planned_workshop_from),
        to: toDateOnly(row.planned_workshop_to),
      });
    }
  }

  for (const s of deduped.values()) {
    const planDate = (s.plan_date || '').toString().slice(0, 10);
    if (!planDate) continue;
    const carId = parseInt(s.car_id, 10);
    if (!Number.isFinite(carId)) continue;
    const hasDriver = (s.driver_identifier || '').toString().trim();
    const hasControl = !!s.abfahrtskontrolle;
    if (!hasDriver && !hasControl) continue;
    if (isStatusAutoDeactivated(statusByCarId.get(carId))) {
      throw new Error(`Car ${carId} is not available for planning because of its current status`);
    }
    const workshopWindow = workshopWindowByCarId.get(carId);
    if (workshopWindow?.from && isDateWithinRange(planDate, workshopWindow.from, workshopWindow.to)) {
      throw new Error(`Car ${carId} has a planned workshop appointment on ${planDate}`);
    }
    await query(
      `INSERT INTO car_planning (car_id, plan_date, driver_identifier, abfahrtskontrolle, updated_at)
       VALUES ($1, $2, NULLIF(TRIM($3), ''), $4, NOW())`,
      [carId, planDate, (s.driver_identifier || '').toString(), hasControl]
    );
  }

  if (dateList.length > 0) {
    await inspectionReminderService.syncTasksForPlanDates(dateList);
  }

  return { ok: true };
}

async function savePlanningDataAndNotifyDrivers(carStates = {}, slots = []) {
  await savePlanningData(carStates, slots);

  const notificationSlots = normalizeNotificationSlots(slots);
  const summary = {
    attempted: notificationSlots.length,
    sent: 0,
    unresolved: 0,
    noDevice: 0,
    failed: 0,
  };

  if (!notificationSlots.length) {
    return { ok: true, notifications: summary };
  }

  const carIds = [...new Set(notificationSlots.map((slot) => slot.carId))];
  const carsRes = await query(
    `SELECT id, vehicle_id, license_plate, vin
     FROM cars
     WHERE id = ANY($1::int[])`,
    [carIds],
  );
  const carById = new Map((carsRes.rows || []).map((row) => [row.id, row]));

  for (const slot of notificationSlots) {
    const car = carById.get(slot.carId);
    if (!car) {
      summary.failed += 1;
      continue;
    }

    const driverContact = await resolvePlanningDriverContact(slot.driverIdentifier);
    if (!driverContact.employeeRef && !driverContact.kenjoUserId) {
      summary.unresolved += 1;
      continue;
    }

    const licensePlate = stringOrNull(car.license_plate, 64);
    const vehicleId = stringOrNull(car.vehicle_id, 255);
    const assignmentLabel = licensePlate || vehicleId || `car ${slot.carId}`;
    const requiresInspection = Boolean(slot.requiresInspection);
    const targetUrl = buildFleetcheckAssignmentUrl(car.vin, {
      licensePlate,
      vehicleId,
      planDate: slot.planDate,
      requiresInspection,
    });
    const pushResult = await pushService.sendNotificationToEmployee(
      {
        kenjoUserId: driverContact.kenjoUserId,
        employeeRef: driverContact.employeeRef,
      },
      {
        url: targetUrl,
        tag: `car-planning-${slot.planDate}-${slot.carId}`,
        data: {
          url: targetUrl,
          planDate: slot.planDate,
          carId: slot.carId,
          vehicleId,
          licensePlate,
          vin: stringOrNull(car.vin, 64),
          requiresInspection,
        },
        buildForLocale: (locale) => {
          const localized = getAssignmentPushCopy(locale);
          return {
            title: localized.title,
            body: requiresInspection
              ? localized.withInspection(assignmentLabel)
              : localized.withoutInspection(assignmentLabel),
            url: targetUrl,
            tag: `car-planning-${slot.planDate}-${slot.carId}`,
            data: {
              url: targetUrl,
              planDate: slot.planDate,
              carId: slot.carId,
              vehicleId,
              licensePlate,
              vin: stringOrNull(car.vin, 64),
              requiresInspection,
            },
          };
        },
      },
    );

    if (pushResult?.sentCount > 0) {
      summary.sent += 1;
      continue;
    }
    if (pushResult?.deviceCount === 0) {
      summary.noDevice += 1;
      continue;
    }
    summary.failed += 1;
  }

  return { ok: true, notifications: summary };
}

/**
 * Report for a single date: list of { vehicle_id, driver_identifier } for that day.
 */
async function getReport(date) {
  const d = (date || '').toString().slice(0, 10);
  if (!d) return [];
  const res = await query(
    `SELECT c.vehicle_id, c.license_plate, p.driver_identifier, p.abfahrtskontrolle
     FROM car_planning p
     JOIN cars c ON c.id = p.car_id
     WHERE p.plan_date = $1
       AND (
         p.abfahrtskontrolle = true
         OR (p.driver_identifier IS NOT NULL AND TRIM(p.driver_identifier) != '')
       )
     ORDER BY c.vehicle_id`,
    [d]
  );
  return (res.rows || []).map((r) => ({
    vehicle_id: r.vehicle_id,
    license_plate: r.license_plate,
    driver_identifier: r.driver_identifier,
    abfahrtskontrolle: !!r.abfahrtskontrolle,
  }));
}

/** Return one archived assignment without loading the full planning grid. */
async function getHistoricalAssignment(carId, date) {
  const id = Number.parseInt(carId, 10);
  const planDate = String(date || '').slice(0, 10);
  if (!Number.isFinite(id) || !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    throw new Error('car_id and date (YYYY-MM-DD) are required');
  }
  const result = await query(
    `SELECT c.id AS car_id, c.vehicle_id, c.license_plate, p.plan_date::text AS plan_date,
            p.driver_identifier, p.abfahrtskontrolle
       FROM cars c
       LEFT JOIN car_planning p ON p.car_id = c.id AND p.plan_date = $2::date
      WHERE c.id = $1`,
    [id, planDate]
  );
  const row = result.rows?.[0];
  if (!row || !String(row.driver_identifier || '').trim()) return null;
  return {
    car_id: row.car_id,
    vehicle_id: row.vehicle_id,
    license_plate: row.license_plate,
    plan_date: toDateOnly(row.plan_date),
    driver_identifier: row.driver_identifier,
    abfahrtskontrolle: !!row.abfahrtskontrolle,
  };
}

async function addCarWithWindow(numberPlate, vin, sourceType, serviceType, activeFrom, activeTo) {
  await ensureCarPlanningWorkshopColumns();
  const plate = (numberPlate || '').toString().trim();
  if (!plate) throw new Error('number_plate is required');
  const vinStr = (vin || '').toString().trim() || null;
  const src = (sourceType || '').toString().trim() || null;
  const svc = (serviceType || '').toString().trim() || null;
  const carRes = await query(
    `INSERT INTO cars (vehicle_id, license_plate, vin, status, fleet_provider, service_type, created_at, updated_at)
     VALUES ($1, $2, $3, 'Active', $4, $5, NOW(), NOW())
     RETURNING id, vehicle_id, license_plate, service_type`,
    [plate, plate, vinStr, src, svc]
  );
  const car = carRes.rows[0];
  await query(
    `INSERT INTO car_planning_car_state (car_id, deactivated, active_from, active_to, updated_at)
     VALUES ($1, false, $2, $3, NOW())
     ON CONFLICT (car_id) DO UPDATE SET active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to, updated_at = NOW()`,
    [car.id, activeFrom || null, activeTo || null]
  );
  return car;
}

export default {
  getCarsForPlanning,
  getCarStates,
  getActiveDrivers,
  getPlanningData,
  savePlanningData,
  savePlanningDataAndNotifyDrivers,
  getTodayAssignmentForDriver,
  getReport,
  getHistoricalAssignment,
  addCarWithWindow,
};

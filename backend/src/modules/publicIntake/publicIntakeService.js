import { query } from '../../db.js';
import employeeService from '../employees/employeeService.js';
import {
  createKenjoEmployee,
  getKenjoCompanies,
  updateEmployeeAddresses,
  updateEmployeeFinancials,
  updateEmployeeHomes,
  updateEmployeePersonals,
  updateEmployeeWork,
} from '../kenjo/kenjoClient.js';

let tablesReady = false;
let kenjoCompanyIdCache = null;

function stringOrNull(value, maxLen = 5000) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function dateOnlyOrNull(value) {
  const normalized = stringOrNull(value, 32);
  if (!normalized) return null;
  const iso = normalized.includes('T') ? normalized.split('T')[0] : normalized;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function displayNameFromPayload(payload) {
  const personal = payload?.personal || {};
  const parts = [
    payload?.displayName,
    personal.displayName,
    [payload?.firstName, payload?.lastName].filter(Boolean).join(' '),
    [personal.firstName, personal.middleName, personal.lastName].filter(Boolean).join(' '),
  ]
    .map((value) => stringOrNull(value, 255))
    .filter(Boolean);
  return parts[0] || '';
}

function extractPersonalSummary(payload) {
  const personal = payload?.personal || {};
  const account = payload?.account || {};
  const home = payload?.home || {};
  const work = payload?.work || {};

  return {
    firstName: stringOrNull(payload?.firstName || personal.firstName, 255),
    lastName: stringOrNull(payload?.lastName || personal.lastName, 255),
    email: stringOrNull(payload?.email || account.email || home.privateEmail, 255),
    phone: stringOrNull(home.phone || home.mobilePhone || home.personalMobile || personal.mobile, 255),
    startDate: dateOnlyOrNull(work.startDate),
  };
}

function extractDamageSummary(payload) {
  return {
    reporterName: stringOrNull(payload?.reporterName, 255),
    reporterEmail: stringOrNull(payload?.reporterEmail, 255),
    reporterPhone: stringOrNull(payload?.reporterPhone, 255),
    driverName: stringOrNull(payload?.driverName, 255),
    licensePlate: stringOrNull(payload?.licensePlate, 64),
    incidentDate: dateOnlyOrNull(payload?.incidentDate),
  };
}

function sanitizeFileList(files) {
  return Array.isArray(files)
    ? files.filter((file) => file?.buffer && file.originalname).slice(0, 12)
    : [];
}

async function ensurePublicIntakeTables() {
  if (tablesReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      employee_id VARCHAR(255) NOT NULL UNIQUE,
      pn VARCHAR(255),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      display_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(255),
      start_date DATE,
      contract_end DATE,
      transporter_id VARCHAR(255),
      kenjo_user_id VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_id VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pn VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date DATE`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_end DATE`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS transporter_id VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS kenjo_user_id VARCHAR(255)`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`).catch(() => null);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_id_unique ON employees (employee_id)`).catch(() => null);

  await query(`
    CREATE TABLE IF NOT EXISTS personal_questionnaire_submissions (
      id SERIAL PRIMARY KEY,
      status VARCHAR(32) NOT NULL DEFAULT 'submitted',
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(255),
      start_date DATE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      employee_ref VARCHAR(255),
      kenjo_employee_id VARCHAR(255),
      last_error TEXT,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'submitted'`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS first_name VARCHAR(255)`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS last_name VARCHAR(255)`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS phone VARCHAR(255)`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS start_date DATE`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS employee_ref VARCHAR(255)`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS kenjo_employee_id VARCHAR(255)`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS last_error TEXT`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS notification_read_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`ALTER TABLE personal_questionnaire_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`CREATE INDEX IF NOT EXISTS idx_personal_questionnaire_status ON personal_questionnaire_submissions (status, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS personal_questionnaire_files (
      id SERIAL PRIMARY KEY,
      submission_id INT NOT NULL REFERENCES personal_questionnaire_submissions(id) ON DELETE CASCADE,
      source_kind VARCHAR(16) NOT NULL DEFAULT 'public',
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_content BYTEA NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE personal_questionnaire_files ADD COLUMN IF NOT EXISTS source_kind VARCHAR(16) NOT NULL DEFAULT 'public'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_personal_questionnaire_files_submission ON personal_questionnaire_files (submission_id, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS public_damage_reports (
      id SERIAL PRIMARY KEY,
      status VARCHAR(32) NOT NULL DEFAULT 'submitted',
      reporter_name VARCHAR(255),
      reporter_email VARCHAR(255),
      reporter_phone VARCHAR(255),
      driver_name VARCHAR(255),
      license_plate VARCHAR(64),
      incident_date DATE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_error TEXT,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'submitted'`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS reporter_name VARCHAR(255)`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS reporter_email VARCHAR(255)`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS reporter_phone VARCHAR(255)`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255)`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS license_plate VARCHAR(64)`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS incident_date DATE`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS last_error TEXT`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
  await query(`CREATE INDEX IF NOT EXISTS idx_public_damage_reports_status ON public_damage_reports (status, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS public_damage_report_files (
      id SERIAL PRIMARY KEY,
      report_id INT NOT NULL REFERENCES public_damage_reports(id) ON DELETE CASCADE,
      source_kind VARCHAR(16) NOT NULL DEFAULT 'public',
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_content BYTEA NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE public_damage_report_files ADD COLUMN IF NOT EXISTS source_kind VARCHAR(16) NOT NULL DEFAULT 'public'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_public_damage_report_files_report ON public_damage_report_files (report_id, created_at DESC)`);

  tablesReady = true;
}

async function insertFiles(tableName, fkColumn, fkValue, files, sourceKind, customNames = []) {
  const safeFiles = sanitizeFileList(files);
  if (!safeFiles.length) return;

  for (const [index, file] of safeFiles.entries()) {
    const desiredName = stringOrNull(customNames[index], 1000);
    const finalFileName = desiredName || String(file.originalname || 'document.bin').trim().slice(0, 1000);
    await query(
      `INSERT INTO ${tableName} (${fkColumn}, source_kind, file_name, mime_type, file_content)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        fkValue,
        String(sourceKind || 'public').trim() || 'public',
        finalFileName,
        stringOrNull(file.mimetype, 255),
        file.buffer,
      ]
    );
  }
}

async function listFiles(tableName, fkColumn, fkValue) {
  const res = await query(
    `SELECT id, ${fkColumn} AS owner_id, source_kind, file_name, mime_type, created_at
     FROM ${tableName}
     WHERE ${fkColumn} = $1
     ORDER BY created_at DESC, id DESC`,
    [fkValue]
  );
  return res.rows || [];
}

async function getFile(tableName, fkColumn, fkValue, fileId) {
  const res = await query(
    `SELECT id, ${fkColumn} AS owner_id, source_kind, file_name, mime_type, file_content, created_at
     FROM ${tableName}
     WHERE ${fkColumn} = $1 AND id = $2
     LIMIT 1`,
    [fkValue, Number(fileId)]
  );
  return res.rows[0] || null;
}

function normalizePersonalPayload(payload) {
  const personalFirstName = stringOrNull(payload?.firstName || payload?.personal?.firstName, 255);
  const personalLastName = stringOrNull(payload?.lastName || payload?.personal?.lastName, 255);
  const topLevelEmail = stringOrNull(payload?.email || payload?.account?.email || payload?.home?.privateEmail, 255);
  return {
    firstName: personalFirstName,
    lastName: personalLastName,
    displayName: stringOrNull(
      payload?.displayName ||
      payload?.personal?.displayName ||
      [personalFirstName, personalLastName].filter(Boolean).join(' '),
      255
    ),
    email: topLevelEmail,
    taxClass: stringOrNull(payload?.taxClass, 8),
    account: compactObject({
      email: topLevelEmail,
      language: stringOrNull(payload?.account?.language, 64) || 'Deutsch',
    }),
    personal: compactObject({
      firstName: personalFirstName,
      middleName: stringOrNull(payload?.personal?.middleName, 255),
      lastName: personalLastName,
      displayName: stringOrNull(payload?.personal?.displayName, 255),
      birthName: stringOrNull(payload?.personal?.birthName, 255),
      salutation: stringOrNull(payload?.personal?.salutation, 64),
      nationality: stringOrNull(payload?.personal?.nationality, 128),
      gender: stringOrNull(payload?.personal?.gender, 64),
      mobile: stringOrNull(payload?.personal?.mobile, 255),
      birthPlace: stringOrNull(payload?.personal?.birthPlace, 255),
      birthDate: dateOnlyOrNull(payload?.personal?.birthDate || payload?.personal?.birthdate),
      birthdate: dateOnlyOrNull(payload?.personal?.birthdate || payload?.personal?.birthDate),
    }),
    work: compactObject({
      startDate: dateOnlyOrNull(payload?.work?.startDate),
      contractEnd: dateOnlyOrNull(payload?.work?.contractEnd),
      probationUntil: dateOnlyOrNull(payload?.work?.probationUntil),
      jobTitle: stringOrNull(payload?.work?.jobTitle, 255),
      transportationId: stringOrNull(payload?.work?.transportationId, 255),
      employeeNumber: stringOrNull(payload?.work?.employeeNumber || payload?.externalId, 255),
      weeklyHours: numberOrNull(payload?.work?.weeklyHours) ?? 40,
      managerName: stringOrNull(payload?.work?.managerName, 255),
      workMobile: stringOrNull(payload?.work?.workMobile, 255),
    }),
    address: compactObject({
      street: stringOrNull(payload?.address?.street, 255),
      streetName: stringOrNull(payload?.address?.streetName, 255),
      houseNumber: stringOrNull(payload?.address?.houseNumber, 64),
      addressLine1: stringOrNull(payload?.address?.addressLine1, 255),
      zipCode: stringOrNull(payload?.address?.zipCode || payload?.address?.postalCode, 32),
      postalCode: stringOrNull(payload?.address?.postalCode || payload?.address?.zipCode, 32),
      city: stringOrNull(payload?.address?.city, 255),
      country: stringOrNull(payload?.address?.country, 128),
    }),
    home: compactObject({
      privateEmail: stringOrNull(payload?.home?.privateEmail, 255),
      phone: stringOrNull(payload?.home?.phone, 255),
      mobilePhone: stringOrNull(payload?.home?.mobilePhone, 255),
      personalMobile: stringOrNull(payload?.home?.personalMobile, 255),
      maritalStatus: stringOrNull(payload?.home?.maritalStatus, 64),
      childrenHas: stringOrNull(payload?.home?.childrenHas, 16),
      childrenCount: numberOrNull(payload?.home?.childrenCount),
      childrenNames: stringOrNull(payload?.home?.childrenNames, 2000),
      childrenDetails: Array.isArray(payload?.home?.childrenDetails)
        ? payload.home.childrenDetails.slice(0, 6).map((item) => compactObject({
            name: stringOrNull(item?.name, 255),
            birthdate: dateOnlyOrNull(item?.birthdate),
          }))
        : undefined,
    }),
    financial: compactObject({
      bankName: stringOrNull(payload?.financial?.bankName, 255),
      accountHolderName: stringOrNull(payload?.financial?.accountHolderName, 255),
      iban: stringOrNull(payload?.financial?.iban, 128),
      bic: stringOrNull(payload?.financial?.bic, 64),
      taxId: stringOrNull(payload?.financial?.taxId || payload?.financial?.steuerId, 128),
      steuerId: stringOrNull(payload?.financial?.steuerId || payload?.financial?.taxId, 128),
      socialSecurityNumber: stringOrNull(payload?.financial?.socialSecurityNumber || payload?.financial?.nationalInsuranceNumber, 128),
      nationalInsuranceNumber: stringOrNull(payload?.financial?.nationalInsuranceNumber || payload?.financial?.socialSecurityNumber, 128),
      insuranceCompany: stringOrNull(payload?.financial?.insuranceCompany, 255),
      churchTax: stringOrNull(payload?.financial?.churchTax, 16),
      churchTaxType: stringOrNull(payload?.financial?.churchTaxType, 255),
    }),
    dspLocal: compactObject({
      fuehrerschein_aufstellungsdatum: dateOnlyOrNull(payload?.dspLocal?.fuehrerschein_aufstellungsdatum),
      fuehrerschein_aufstellungsbehoerde: stringOrNull(payload?.dspLocal?.fuehrerschein_aufstellungsbehoerde, 255),
      fuehrerschein_ablaufsdatum: dateOnlyOrNull(payload?.dspLocal?.fuehrerschein_ablaufsdatum),
    }),
    uniform: compactObject({
      jacke: stringOrNull(payload?.uniform?.jacke, 16),
      hose: stringOrNull(payload?.uniform?.hose, 16),
      shirt: stringOrNull(payload?.uniform?.shirt, 16),
      schuhe: stringOrNull(payload?.uniform?.schuhe, 16),
    }),
    extra: compactObject({
      drivingLicenseNumber: stringOrNull(payload?.extra?.drivingLicenseNumber, 128),
      drivingLicenseExpiry: dateOnlyOrNull(payload?.extra?.drivingLicenseExpiry),
      notes: stringOrNull(payload?.extra?.notes, 5000),
    }),
  };
}

function normalizeDamagePayload(payload) {
  return compactObject({
    reporterName: stringOrNull(payload?.reporterName, 255),
    reporterEmail: stringOrNull(payload?.reporterEmail, 255),
    reporterPhone: stringOrNull(payload?.reporterPhone, 255),
    driverName: stringOrNull(payload?.driverName, 255),
    licensePlate: stringOrNull(payload?.licensePlate, 64),
    incidentDate: dateOnlyOrNull(payload?.incidentDate),
    incidentTime: stringOrNull(payload?.incidentTime, 32),
    location: stringOrNull(payload?.location, 255),
    description: stringOrNull(payload?.description, 8000),
    damageSummary: stringOrNull(payload?.damageSummary, 4000),
    witnesses: stringOrNull(payload?.witnesses, 4000),
  });
}

function validatePersonalQuestionnaireRequired(payload) {
  const personal = payload?.personal || {};
  const address = payload?.address || {};
  const home = payload?.home || {};
  const financial = payload?.financial || {};
  const uniform = payload?.uniform || {};

  const missing = [];
  if (!stringOrNull(payload?.firstName || personal.firstName)) missing.push('First name');
  if (!stringOrNull(payload?.lastName || personal.lastName)) missing.push('Last name');
  if (!dateOnlyOrNull(personal.birthdate || personal.birthDate)) missing.push('Birth day');
  if (!stringOrNull(personal.birthPlace)) missing.push('Birth place');
  if (!stringOrNull(personal.birthName)) missing.push('Birth name');
  if (!stringOrNull(personal.gender)) missing.push('Gender');
  if (!stringOrNull(personal.nationality)) missing.push('Nationality');
  if (!stringOrNull(home.maritalStatus)) missing.push('Marital status');
  if (!stringOrNull(address.streetName || address.street)) missing.push('Street name');
  if (!stringOrNull(address.houseNumber)) missing.push('House number');
  if (!stringOrNull(address.postalCode || address.zipCode)) missing.push('Postal code');
  if (!stringOrNull(address.city)) missing.push('City');
  if (!stringOrNull(financial.taxId || financial.steuerId)) missing.push('Tax ID');
  if (!stringOrNull(uniform.jacke)) missing.push('Jacke');
  if (!stringOrNull(uniform.hose)) missing.push('Hose');
  if (!stringOrNull(uniform.shirt)) missing.push('Shirt');
  if (!stringOrNull(uniform.schuhe)) missing.push('Schuhe');

  const childrenHas = stringOrNull(home.childrenHas, 16);
  if (!childrenHas) {
    missing.push('Children');
  } else if (childrenHas === 'Ja') {
    const count = numberOrNull(home.childrenCount);
    if (count == null) {
      missing.push('How many kids?');
    } else {
      const details = Array.isArray(home.childrenDetails) ? home.childrenDetails : [];
      for (let index = 0; index < count; index += 1) {
        if (!stringOrNull(details[index]?.name)) missing.push(`Child name ${index + 1}`);
        if (!dateOnlyOrNull(details[index]?.birthdate)) missing.push(`Child birth date ${index + 1}`);
      }
    }
  }
  return missing;
}

export async function submitPersonalQuestionnaire(payload, files) {
  await ensurePublicIntakeTables();
  const normalized = normalizePersonalPayload(payload);
  const summary = extractPersonalSummary(normalized);

  const missing = validatePersonalQuestionnaireRequired(normalized);
  if (missing.length) {
    throw new Error(`Please fill in the required fields: ${missing.join(', ')}`);
  }

  const res = await query(
    `INSERT INTO personal_questionnaire_submissions (
       status, first_name, last_name, email, phone, start_date, payload, submitted_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW(), NOW())
     RETURNING id, status, created_at`,
    [
      'submitted',
      summary.firstName,
      summary.lastName,
      summary.email,
      summary.phone,
      summary.startDate,
      JSON.stringify(normalized),
    ]
  );

  const row = res.rows[0];
  await insertFiles('personal_questionnaire_files', 'submission_id', row.id, files, 'public');
  return row;
}

export async function submitDamageReport(payload, files) {
  await ensurePublicIntakeTables();
  const normalized = normalizeDamagePayload(payload);
  const summary = extractDamageSummary(normalized);

  if (!summary.reporterName || !summary.driverName || !summary.incidentDate) {
    throw new Error('Reporter name, driver name and incident date are required');
  }

  const res = await query(
    `INSERT INTO public_damage_reports (
       status, reporter_name, reporter_email, reporter_phone, driver_name, license_plate, incident_date, payload,
       submitted_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW(), NOW())
     RETURNING id, status, created_at`,
    [
      'submitted',
      summary.reporterName,
      summary.reporterEmail,
      summary.reporterPhone,
      summary.driverName,
      summary.licensePlate,
      summary.incidentDate,
      JSON.stringify(normalized),
    ]
  );

  const row = res.rows[0];
  await insertFiles('public_damage_report_files', 'report_id', row.id, files, 'public');
  return row;
}

export async function listPersonalQuestionnaires({ status } = {}) {
  await ensurePublicIntakeTables();
  const params = [];
  const where = [];
  if (status && status !== 'all') {
    params.push(String(status).trim());
    where.push(`s.status = $${params.length}`);
  }
  const res = await query(
      `SELECT
         s.id,
         s.status,
         s.first_name,
         s.last_name,
         s.email,
         s.phone,
         s.start_date,
         s.employee_ref,
         s.kenjo_employee_id,
         s.last_error,
         s.notification_read_at,
         (s.notification_read_at IS NULL) AS is_new,
         s.created_at,
         s.updated_at,
         s.sent_at,
         COUNT(f.id)::int AS file_count
     FROM personal_questionnaire_submissions s
     LEFT JOIN personal_questionnaire_files f ON f.submission_id = s.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY s.id
     ORDER BY
       CASE WHEN s.status IN ('submitted', 'reviewing', 'error') THEN 0 ELSE 1 END,
       s.created_at DESC,
       s.id DESC`,
    params
  );
  return res.rows || [];
}

export async function getPersonalQuestionnaireById(id) {
  await ensurePublicIntakeTables();
  await query(
    `UPDATE personal_questionnaire_submissions
     SET notification_read_at = COALESCE(notification_read_at, NOW())
     WHERE id = $1`,
    [Number(id)]
  );
  const res = await query(
    `SELECT *, (notification_read_at IS NULL) AS is_new
     FROM personal_questionnaire_submissions
     WHERE id = $1
     LIMIT 1`,
    [Number(id)]
  );
  const submission = res.rows[0] || null;
  if (!submission) return null;
  const files = await listFiles('personal_questionnaire_files', 'submission_id', Number(id));
  return { ...submission, files };
}

export async function updatePersonalQuestionnaire(id, payload, status) {
  await ensurePublicIntakeTables();
  const normalized = normalizePersonalPayload(payload);
  const summary = extractPersonalSummary(normalized);
  const nextStatus = stringOrNull(status, 32) || 'reviewing';
  const res = await query(
    `UPDATE personal_questionnaire_submissions
     SET status = $2,
         first_name = $3,
         last_name = $4,
         email = $5,
         phone = $6,
         start_date = $7,
         payload = $8::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [Number(id), nextStatus, summary.firstName, summary.lastName, summary.email, summary.phone, summary.startDate, JSON.stringify(normalized)]
  );
  return res.rows[0] || null;
}

export async function deletePersonalQuestionnaire(id) {
  await ensurePublicIntakeTables();
  const res = await query(
    `DELETE FROM personal_questionnaire_submissions
     WHERE id = $1
     RETURNING id, status, employee_ref, kenjo_employee_id`,
    [Number(id)]
  );
  return res.rows[0] || null;
}

export async function markPersonalQuestionnaireUnread(id) {
  await ensurePublicIntakeTables();
  const res = await query(
    `UPDATE personal_questionnaire_submissions
     SET notification_read_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, first_name, last_name, email, notification_read_at`,
    [Number(id)]
  );
  return res.rows[0] || null;
}

export async function addPersonalQuestionnaireFiles(id, files, sourceKind = 'admin', customNames = []) {
  await ensurePublicIntakeTables();
  const submissionId = Number(id);
  const row = await getPersonalQuestionnaireById(submissionId);
  if (!row) return null;
  await insertFiles('personal_questionnaire_files', 'submission_id', submissionId, files, sourceKind, customNames);
  return listFiles('personal_questionnaire_files', 'submission_id', submissionId);
}

export async function getPersonalQuestionnaireFile(id, fileId) {
  await ensurePublicIntakeTables();
  return getFile('personal_questionnaire_files', 'submission_id', Number(id), Number(fileId));
}

export async function listDamageReports({ status } = {}) {
  await ensurePublicIntakeTables();
  const params = [];
  const where = [];
  if (status && status !== 'all') {
    params.push(String(status).trim());
    where.push(`r.status = $${params.length}`);
  }
  const res = await query(
    `SELECT
       r.id,
       r.status,
       r.reporter_name,
       r.reporter_email,
       r.reporter_phone,
       r.driver_name,
       r.license_plate,
       r.incident_date,
       r.last_error,
       r.created_at,
       r.updated_at,
       COUNT(f.id)::int AS file_count
     FROM public_damage_reports r
     LEFT JOIN public_damage_report_files f ON f.report_id = r.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY r.id
     ORDER BY
       CASE WHEN r.status IN ('submitted', 'reviewing', 'error') THEN 0 ELSE 1 END,
       r.created_at DESC,
       r.id DESC`,
    params
  );
  return res.rows || [];
}

export async function getDamageReportById(id) {
  await ensurePublicIntakeTables();
  const res = await query(`SELECT * FROM public_damage_reports WHERE id = $1 LIMIT 1`, [Number(id)]);
  const report = res.rows[0] || null;
  if (!report) return null;
  const files = await listFiles('public_damage_report_files', 'report_id', Number(id));
  return { ...report, files };
}

export async function updateDamageReport(id, payload, status) {
  await ensurePublicIntakeTables();
  const normalized = normalizeDamagePayload(payload);
  const summary = extractDamageSummary(normalized);
  const nextStatus = stringOrNull(status, 32) || 'reviewing';
  const res = await query(
    `UPDATE public_damage_reports
     SET status = $2,
         reporter_name = $3,
         reporter_email = $4,
         reporter_phone = $5,
         driver_name = $6,
         license_plate = $7,
         incident_date = $8,
         payload = $9::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      Number(id),
      nextStatus,
      summary.reporterName,
      summary.reporterEmail,
      summary.reporterPhone,
      summary.driverName,
      summary.licensePlate,
      summary.incidentDate,
      JSON.stringify(normalized),
    ]
  );
  return res.rows[0] || null;
}

export async function addDamageReportFiles(id, files, sourceKind = 'admin') {
  await ensurePublicIntakeTables();
  const reportId = Number(id);
  const row = await getDamageReportById(reportId);
  if (!row) return null;
  await insertFiles('public_damage_report_files', 'report_id', reportId, files, sourceKind);
  return listFiles('public_damage_report_files', 'report_id', reportId);
}

export async function getDamageReportFile(id, fileId) {
  await ensurePublicIntakeTables();
  return getFile('public_damage_report_files', 'report_id', Number(id), Number(fileId));
}

async function resolveKenjoCompanyId() {
  if (kenjoCompanyIdCache) return kenjoCompanyIdCache;
  const fromEnv = stringOrNull(process.env.KENJO_COMPANY_ID, 255);
  if (fromEnv) {
    kenjoCompanyIdCache = fromEnv;
    return kenjoCompanyIdCache;
  }
  const companies = await getKenjoCompanies();
  const first = Array.isArray(companies) ? companies[0] : null;
  const id = stringOrNull(first?._id || first?.id || first?.companyId, 255);
  if (!id) {
    throw new Error('Unable to resolve Kenjo companyId. Set KENJO_COMPANY_ID in backend environment.');
  }
  kenjoCompanyIdCache = id;
  return kenjoCompanyIdCache;
}

function extractKenjoEmployeeId(response) {
  const candidates = [
    response?._id,
    response?.id,
    response?.employeeId,
    response?.userId,
    response?.data?._id,
    response?.data?.id,
    response?.employee?._id,
    response?.employee?.id,
  ];
  for (const candidate of candidates) {
    const normalized = stringOrNull(candidate, 255);
    if (normalized) return normalized;
  }
  return null;
}

async function upsertLocalEmployeeFromSubmission(submission, kenjoEmployeeId) {
  const payload = submission?.payload || {};
  const personal = payload.personal || {};
  const work = payload.work || {};
  const account = payload.account || {};
  const home = payload.home || {};
  const employeeRef = stringOrNull(kenjoEmployeeId, 255) || `pf-${submission.id}`;
  const displayName = displayNameFromPayload(payload) || `${submission.first_name || ''} ${submission.last_name || ''}`.trim();

  await query(
    `INSERT INTO employees (
       employee_id, pn, first_name, last_name, display_name, email, phone,
       start_date, contract_end, transporter_id, kenjo_user_id, is_active, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
     ON CONFLICT (employee_id) DO UPDATE SET
       pn = EXCLUDED.pn,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       display_name = EXCLUDED.display_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       start_date = EXCLUDED.start_date,
       contract_end = EXCLUDED.contract_end,
       transporter_id = EXCLUDED.transporter_id,
       kenjo_user_id = EXCLUDED.kenjo_user_id,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [
      employeeRef,
      stringOrNull(work.employeeNumber || payload.externalId, 255),
      stringOrNull(payload.firstName || personal.firstName, 255),
      stringOrNull(payload.lastName || personal.lastName, 255),
      stringOrNull(displayName, 255),
      stringOrNull(payload.email || account.email || home.privateEmail, 255),
      stringOrNull(home.phone || home.mobilePhone || home.personalMobile || personal.mobile, 255),
      dateOnlyOrNull(work.startDate),
      dateOnlyOrNull(work.contractEnd),
      stringOrNull(work.transportationId, 255),
      stringOrNull(kenjoEmployeeId, 255),
      false,
    ]
  );

  await query(
    `INSERT INTO kenjo_employees (
       kenjo_user_id, employee_number, transporter_id, first_name, last_name, display_name,
       job_title, start_date, contract_end, is_active, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW())
     ON CONFLICT (kenjo_user_id) DO UPDATE SET
       employee_number = EXCLUDED.employee_number,
       transporter_id = EXCLUDED.transporter_id,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       display_name = EXCLUDED.display_name,
       job_title = EXCLUDED.job_title,
       start_date = EXCLUDED.start_date,
       contract_end = EXCLUDED.contract_end,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [
      employeeRef,
      stringOrNull(work.employeeNumber || payload.externalId, 255),
      stringOrNull(work.transportationId, 255),
      stringOrNull(payload.firstName || personal.firstName, 255),
      stringOrNull(payload.lastName || personal.lastName, 255),
      stringOrNull(displayName, 255),
      stringOrNull(work.jobTitle, 255),
      dateOnlyOrNull(work.startDate),
      dateOnlyOrNull(work.contractEnd),
    ]
  ).catch(() => null);

  return employeeRef;
}

async function copySubmissionFilesToEmployee(submissionId, employeeRef) {
  const files = await listFiles('personal_questionnaire_files', 'submission_id', Number(submissionId));
  for (const file of files) {
    const full = await getPersonalQuestionnaireFile(submissionId, file.id);
    if (!full?.file_content) continue;
    await employeeService.addEmployeeDocument(employeeRef, {
      documentType: 'Dokumente',
      fileName: file.file_name || `personal-questionnaire-${submissionId}.bin`,
      mimeType: file.mime_type || 'application/octet-stream',
      fileContent: full.file_content,
    });
  }
}

export async function saveAndSendPersonalQuestionnaire(id) {
  await ensurePublicIntakeTables();
  const submission = await getPersonalQuestionnaireById(id);
  if (!submission) return null;
  if (['sent', 'sent_with_warnings'].includes(String(submission.status || '')) && submission.employee_ref) {
    return {
      id: submission.id,
      status: submission.status,
      employee_ref: submission.employee_ref,
      kenjo_employee_id: submission.kenjo_employee_id,
      alreadySent: true,
      warnings: submission.last_error ? [submission.last_error] : [],
    };
  }

  const payload = submission.payload || {};
  const personal = payload.personal || {};
  const account = payload.account || {};
  const work = payload.work || {};
  const address = payload.address || {};
  const home = payload.home || {};
  const financial = payload.financial || {};

  const firstName = stringOrNull(payload.firstName || personal.firstName);
  const lastName = stringOrNull(payload.lastName || personal.lastName);
  const email = stringOrNull(payload.email || account.email || home.privateEmail);

  if (!firstName || !lastName || !email) {
    throw new Error('First name, last name and email are required before Save and Send');
  }

  const companyId = await resolveKenjoCompanyId();
  const createBody = {
    account: compactObject({
      email: stringOrNull(email, 255),
      language: stringOrNull(account.language, 16) || 'de',
    }),
    personal: compactObject({
      firstName: stringOrNull(firstName, 255),
      lastName: stringOrNull(lastName, 255),
    }),
    work: compactObject({
      companyId,
      weeklyHours: numberOrNull(work.weeklyHours) ?? 40,
      startDate: dateOnlyOrNull(work.startDate),
      jobTitle: stringOrNull(work.jobTitle, 255),
      transportationId: stringOrNull(work.transportationId, 255),
      employeeNumber: stringOrNull(work.employeeNumber, 255),
    }),
  };

  let createResponse;
  try {
    createResponse = await createKenjoEmployee(createBody);
  } catch (error) {
    const message = String(error?.message || error);
    await query(
      `UPDATE personal_questionnaire_submissions
       SET status = 'error', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [Number(id), message]
    );
    throw error;
  }

  const kenjoEmployeeId = extractKenjoEmployeeId(createResponse);
  if (!kenjoEmployeeId) {
    const message = 'Kenjo create employee succeeded but returned no employee id';
    await query(
      `UPDATE personal_questionnaire_submissions
       SET status = 'error', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [Number(id), message]
    );
    throw new Error(message);
  }

  const warnings = [];
  const runKenjoSectionUpdate = async (label, fn, body) => {
    const clean = compactObject(body);
    if (!Object.keys(clean).length) return;
    try {
      await fn(kenjoEmployeeId, clean);
    } catch (error) {
      warnings.push(`${label}: ${String(error?.message || error)}`);
    }
  };

  await runKenjoSectionUpdate('personal', updateEmployeePersonals, {
    firstName: stringOrNull(firstName, 255),
    middleName: stringOrNull(personal.middleName, 255),
    lastName: stringOrNull(lastName, 255),
    birthName: stringOrNull(personal.birthName, 255),
    salutation: stringOrNull(personal.salutation, 64),
    nationality: stringOrNull(personal.nationality, 128),
    gender: stringOrNull(personal.gender, 64),
    mobile: stringOrNull(personal.mobile, 255),
    birthPlace: stringOrNull(personal.birthPlace, 255),
    birthDate: dateOnlyOrNull(personal.birthDate || personal.birthdate),
  });
  await runKenjoSectionUpdate('work', updateEmployeeWork, {
    startDate: dateOnlyOrNull(work.startDate),
    contractEnd: dateOnlyOrNull(work.contractEnd),
    probationUntil: dateOnlyOrNull(work.probationUntil),
    jobTitle: stringOrNull(work.jobTitle, 255),
    transportationId: stringOrNull(work.transportationId, 255),
    employeeNumber: stringOrNull(work.employeeNumber, 255),
    weeklyHours: numberOrNull(work.weeklyHours),
  });
  await runKenjoSectionUpdate('address', updateEmployeeAddresses, {
    street: stringOrNull(address.street, 255),
    streetName: stringOrNull(address.streetName, 255),
    houseNumber: stringOrNull(address.houseNumber, 64),
    addressLine1: stringOrNull(address.addressLine1, 255),
    zipCode: stringOrNull(address.zipCode || address.postalCode, 32),
    postalCode: stringOrNull(address.postalCode || address.zipCode, 32),
    city: stringOrNull(address.city, 255),
    country: stringOrNull(address.country, 128),
  });
  await runKenjoSectionUpdate('home', updateEmployeeHomes, {
    privateEmail: stringOrNull(home.privateEmail, 255),
    phone: stringOrNull(home.phone, 255),
    mobilePhone: stringOrNull(home.mobilePhone, 255),
    personalMobile: stringOrNull(home.personalMobile, 255),
    maritalStatus: stringOrNull(home.maritalStatus, 64),
  });
  await runKenjoSectionUpdate('financial', updateEmployeeFinancials, {
    bankName: stringOrNull(financial.bankName, 255),
    accountHolderName: stringOrNull(financial.accountHolderName, 255),
    iban: stringOrNull(financial.iban, 128),
    bic: stringOrNull(financial.bic, 64),
    taxId: stringOrNull(financial.taxId || financial.steuerId, 128),
    steuerId: stringOrNull(financial.steuerId || financial.taxId, 128),
    socialSecurityNumber: stringOrNull(financial.socialSecurityNumber || financial.nationalInsuranceNumber, 128),
    nationalInsuranceNumber: stringOrNull(financial.nationalInsuranceNumber || financial.socialSecurityNumber, 128),
  });

  const employeeRef = await upsertLocalEmployeeFromSubmission(submission, kenjoEmployeeId);
  await copySubmissionFilesToEmployee(submission.id, employeeRef);

  const nextStatus = warnings.length ? 'sent_with_warnings' : 'sent';
  await query(
    `UPDATE personal_questionnaire_submissions
     SET status = $2,
         employee_ref = $3,
         kenjo_employee_id = $4,
         sent_at = NOW(),
         last_error = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [Number(id), nextStatus, employeeRef, kenjoEmployeeId, warnings.length ? warnings.join('; ') : null]
  );

  return {
    id: submission.id,
    status: nextStatus,
    employee_ref: employeeRef,
    kenjo_employee_id: kenjoEmployeeId,
    warnings,
  };
}

export async function getPublicIntakeSummary() {
  await ensurePublicIntakeTables();
  const [personalCountsRes, personalUnreadRes, damageCountsRes, recentPersonalRes, recentDamageRes] = await Promise.all([
    query(`
      SELECT status, COUNT(*)::int AS count
      FROM personal_questionnaire_submissions
      GROUP BY status
    `),
    query(`
      SELECT COUNT(*)::int AS count
      FROM personal_questionnaire_submissions
      WHERE notification_read_at IS NULL
    `),
    query(`
      SELECT status, COUNT(*)::int AS count
      FROM public_damage_reports
      GROUP BY status
    `),
    query(`
      SELECT id, status, first_name, last_name, email, created_at
      FROM personal_questionnaire_submissions
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `),
    query(`
      SELECT id, status, reporter_name, driver_name, license_plate, incident_date, created_at
      FROM public_damage_reports
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `),
  ]);

  const toMap = (rows) => Object.fromEntries((rows || []).map((row) => [String(row.status || ''), Number(row.count || 0)]));
  const personalCounts = toMap(personalCountsRes.rows || []);
  const personalUnread = Number(personalUnreadRes.rows?.[0]?.count || 0);
  const damageCounts = toMap(damageCountsRes.rows || []);

  return {
    personalQuestionnaires: {
      pending: (personalCounts.submitted || 0) + (personalCounts.reviewing || 0) + (personalCounts.error || 0),
      sent: (personalCounts.sent || 0) + (personalCounts.sent_with_warnings || 0),
      unread: personalUnread,
      byStatus: personalCounts,
      recent: recentPersonalRes.rows || [],
    },
    damageReports: {
      pending: (damageCounts.submitted || 0) + (damageCounts.reviewing || 0) + (damageCounts.error || 0),
      resolved: damageCounts.resolved || 0,
      byStatus: damageCounts,
      recent: recentDamageRes.rows || [],
    },
  };
}

const publicIntakeService = {
  submitPersonalQuestionnaire,
  submitDamageReport,
  listPersonalQuestionnaires,
  getPersonalQuestionnaireById,
  updatePersonalQuestionnaire,
  deletePersonalQuestionnaire,
  markPersonalQuestionnaireUnread,
  addPersonalQuestionnaireFiles,
  getPersonalQuestionnaireFile,
  listDamageReports,
  getDamageReportById,
  updateDamageReport,
  addDamageReportFiles,
  getDamageReportFile,
  saveAndSendPersonalQuestionnaire,
  getPublicIntakeSummary,
  ensurePublicIntakeTables,
};

export default publicIntakeService;

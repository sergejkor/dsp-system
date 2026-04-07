import { query } from '../../db.js';
import employeeService from '../employees/employeeService.js';
import {
  createKenjoEmployee,
  getKenjoCompanies,
  getKenjoOffices,
  getKenjoUserAccounts,
  getKenjoUsersList,
  updateEmployeeAccounts,
  updateEmployeeAddresses,
  updateEmployeeFinancials,
  updateEmployeeHomes,
  updateEmployeePersonals,
  updateEmployeeWork,
} from '../kenjo/kenjoClient.js';
import { sendPersonalQuestionnaireNotification, sendDamageReportNotification } from './publicIntakeNotificationService.js';

let tablesReady = false;
let kenjoCompanyIdCache = null;
let kenjoDbx9OfficeIdCache = null;

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

function kenjoDateTimeOrNull(value) {
  const date = dateOnlyOrNull(value);
  return date ? `${date}T00:00:00.000Z` : null;
}

function normalizeKenjoLanguage(value) {
  const normalized = stringOrNull(value, 64);
  if (!normalized) return 'de';

  const key = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['de', 'deutsch', 'german', 'deutschland'].includes(key)) return 'de';
  if (['en', 'english', 'englisch'].includes(key)) return 'en';
  if (['es', 'spanish', 'espanol', 'español', 'spanisch'].includes(key)) return 'es';
  return 'de';
}

function normalizeKenjoGender(value) {
  const normalized = stringOrNull(value, 64);
  if (!normalized) return null;
  const key = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['mannlich', 'männlich', 'male', 'man'].includes(key)) return 'male';
  if (['weiblich', 'female', 'woman'].includes(key)) return 'female';
  if (['nicht-binar', 'nicht-binar', 'nicht binar', 'nichtbinary', 'non-binary', 'non binary', 'nonbinary'].includes(key)) {
    return 'nonBinary';
  }
  return null;
}

function normalizeKenjoMaritalStatus(value) {
  const normalized = stringOrNull(value, 64);
  if (!normalized) return null;
  const key = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['ledig', 'single'].includes(key)) return 'single';
  if (['verheiratet', 'married'].includes(key)) return 'married';
  if (['geschieden', 'divorced'].includes(key)) return 'divorced';
  if (['verwitwet', 'widowed'].includes(key)) return 'widowed';
  return null;
}

const KENJO_REGION_LOCALES = ['de', 'en', 'ru', 'fr', 'it', 'es', 'pl', 'uk', 'nl', 'ro', 'hu', 'ar'];
const KENJO_REGION_CODES = [
  'AF', 'AL', 'DZ', 'US', 'AD', 'AO', 'AR', 'AM', 'AU', 'AT', 'AZ',
  'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'GB', 'BN', 'BG', 'BF', 'MM', 'BI',
  'KH', 'CM', 'CA', 'CV', 'CF', 'TD', 'CL', 'CN', 'CO', 'KM', 'CG', 'CR', 'HR', 'CU', 'CY', 'CZ',
  'DK', 'DJ', 'DO', 'NL', 'TL', 'EC', 'EG', 'AE', 'GQ', 'ER', 'EE', 'ET',
  'FJ', 'PH', 'FI', 'FR', 'GA', 'GM', 'GE', 'DE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GY',
  'HT', 'HN', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IL', 'IT', 'CI',
  'JM', 'JP', 'JO', 'KZ', 'KE', 'KW', 'KG', 'LA', 'LV', 'LB', 'LR', 'LY', 'LI', 'LT', 'LU',
  'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MR', 'MU', 'MX', 'MD', 'MC', 'MN', 'ME', 'MA', 'MZ',
  'NA', 'NP', 'NZ', 'NI', 'NE', 'NG', 'KP', 'MK', 'NO', 'OM', 'PK', 'PS', 'PA', 'PG', 'PY', 'PE', 'PL', 'PT',
  'QA', 'RO', 'RU', 'RW', 'LC', 'SV', 'WS', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SO', 'ZA', 'KR', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY',
  'TW', 'TJ', 'TZ', 'TH', 'TG', 'TO', 'TT', 'TN', 'TR', 'TM', 'UG', 'UA', 'UY', 'UZ', 'VE', 'VN', 'YE', 'ZM', 'ZW',
];

let kenjoRegionNameToCode = null;

function getKenjoRegionNameToCodeMap() {
  if (kenjoRegionNameToCode) return kenjoRegionNameToCode;

  const map = new Map();
  for (const code of KENJO_REGION_CODES) {
    map.set(code.toLowerCase(), code);
  }

  KENJO_REGION_LOCALES.forEach((locale) => {
    let formatter = null;
    try {
      formatter = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      formatter = null;
    }
    if (!formatter) return;

    KENJO_REGION_CODES.forEach((code) => {
      const label = stringOrNull(formatter.of(code), 128);
      if (!label) return;
      map.set(
        label
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
        code
      );
    });
  });

  map.set('schottland', 'GB');
  map.set('wales', 'GB');
  map.set('vereinigtes konigreich', 'GB');
  map.set('vereinigte staaten', 'US');

  kenjoRegionNameToCode = map;
  return map;
}

function normalizeKenjoCountryCode(value) {
  const normalized = stringOrNull(value, 128);
  if (!normalized) return null;
  const cleaned = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return getKenjoRegionNameToCodeMap().get(cleaned) || null;
}

const KENJO_NATIONALITY_BY_CODE = {
  AF: 'Afghan', AL: 'Albanian', DZ: 'Algerian', US: 'American', AD: 'Andorran', AO: 'Angolan', AR: 'Argentine',
  AM: 'Armenian', AU: 'Australian', AT: 'Austrian', AZ: 'Azerbaijani', BS: 'Bahamian', BH: 'Bahraini',
  BD: 'Bangladeshi', BB: 'Barbadian', BY: 'Belarusian', BE: 'Belgian', BZ: 'Belizean', BJ: 'Beninese',
  BT: 'Bhutanese', BO: 'Bolivian', BA: 'Bosnian', BW: 'Botswanan', BR: 'Brazilian', GB: 'British',
  BN: 'Bruneian', BG: 'Bulgarian', BF: 'Burkinabe', MM: 'Burmese', BI: 'Burundian', KH: 'Cambodian',
  CM: 'Cameroonian', CA: 'Canadian', CV: 'Cape Verdean', CF: 'Central African', TD: 'Chadian', CL: 'Chilean',
  CN: 'Chinese', CO: 'Colombian', KM: 'Comorian', CG: 'Congolese', CR: 'Costa Rican', HR: 'Croatian',
  CU: 'Cuban', CY: 'Cypriot', CZ: 'Czech', DK: 'Danish', DJ: 'Djiboutian', DO: 'Dominican', NL: 'Dutch',
  TL: 'East Timorese', EC: 'Ecuadorian', EG: 'Egyptian', AE: 'Emirati', GQ: 'Equatorial Guinean',
  ER: 'Eritrean', EE: 'Estonian', ET: 'Ethiopian', FJ: 'Fijian', PH: 'Filipino', FI: 'Finnish',
  FR: 'French', GA: 'Gabonese', GM: 'Gambian', GE: 'Georgian', DE: 'German', GH: 'Ghanaian', GR: 'Greek',
  GD: 'Grenadian', GT: 'Guatemalan', GN: 'Guinean', GY: 'Guyanese', HT: 'Haitian', HN: 'Honduran',
  HU: 'Hungarian', IS: 'Icelandic', IN: 'Indian', ID: 'Indonesian', IR: 'Iranian', IQ: 'Iraqi', IE: 'Irish',
  IL: 'Israeli', IT: 'Italian', CI: 'Ivorian', JM: 'Jamaican', JP: 'Japanese', JO: 'Jordanian', KZ: 'Kazakh',
  KE: 'Kenyan', KW: 'Kuwaiti', KG: 'Kyrgyz', LA: 'Lao', LV: 'Latvian', LB: 'Lebanese', LR: 'Liberian',
  LY: 'Libyan', LI: 'Liechtensteiner', LT: 'Lithuanian', LU: 'Luxembourgish', MG: 'Malagasy', MW: 'Malawian',
  MY: 'Malaysian', MV: 'Maldivian', ML: 'Malian', MT: 'Maltese', MR: 'Mauritanian', MU: 'Mauritian',
  MX: 'Mexican', MD: 'Moldovan', MC: 'Monegasque', MN: 'Mongolian', ME: 'Montenegrin', MA: 'Moroccan',
  MZ: 'Mozambican', NA: 'Namibian', NP: 'Nepalese', NZ: 'New Zealander', NI: 'Nicaraguan', NE: 'Nigerien',
  NG: 'Nigerian', KP: 'North Korean', MK: 'North Macedonian', NO: 'Norwegian', OM: 'Omani', PK: 'Pakistani',
  PS: 'Palestinian', PA: 'Panamanian', PG: 'Papua New Guinean', PY: 'Paraguayan', PE: 'Peruvian',
  PL: 'Polish', PT: 'Portuguese', QA: 'Qatari', RO: 'Romanian', RU: 'Russian', RW: 'Rwandan',
  LC: 'Saint Lucian', SV: 'Salvadoran', WS: 'Samoan', SA: 'Saudi', SN: 'Senegalese', RS: 'Serbian',
  SC: 'Seychellois', SL: 'Sierra Leonean', SG: 'Singaporean', SK: 'Slovak', SI: 'Slovenian', SO: 'Somali',
  ZA: 'South African', KR: 'South Korean', ES: 'Spanish', LK: 'Sri Lankan', SD: 'Sudanese', SR: 'Surinamese',
  SE: 'Swedish', CH: 'Swiss', SY: 'Syrian', TW: 'Taiwanese', TJ: 'Tajik', TZ: 'Tanzanian', TH: 'Thai',
  TG: 'Togolese', TO: 'Tongan', TT: 'Trinidadian', TN: 'Tunisian', TR: 'Turkish', TM: 'Turkmen',
  UG: 'Ugandan', UA: 'Ukrainian', UY: 'Uruguayan', UZ: 'Uzbek', VE: 'Venezuelan', VN: 'Vietnamese',
  YE: 'Yemeni', ZM: 'Zambian', ZW: 'Zimbabwean',
};

function normalizeKenjoGenderForTenant(value) {
  const normalized = stringOrNull(value, 64);
  if (!normalized) return null;
  const key = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['female', 'woman', 'weiblich'].includes(key)) return 'Female';
  if (['male', 'man'].includes(key) || key.includes('nnlich')) return 'Male';
  if (['nicht binar', 'nichtbinary', 'non-binary', 'non binary', 'nonbinary'].includes(key)) return 'Non-Binary';
  return null;
}

function normalizeKenjoNationality(value) {
  const normalized = stringOrNull(value, 128);
  if (!normalized) return null;
  const cleaned = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (cleaned === 'schottland' || cleaned === 'scotland') return 'Scottish';
  if (cleaned === 'wales') return 'Welsh';
  const code = getKenjoRegionNameToCodeMap().get(cleaned);
  return (code && KENJO_NATIONALITY_BY_CODE[code]) || normalized;
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

function formatKenjoExternalId(value) {
  const normalized = stringOrNull(value, 255);
  if (!normalized) return null;
  const trimmed = normalized.trim();
  if (/^E-\d{6,}$/i.test(trimmed)) return `E-${trimmed.slice(2).replace(/\D/g, '')}`;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  return `E-${digits.padStart(6, '0')}`;
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
    reporterName: stringOrNull(payload?.opponentName || payload?.reporterName, 255),
    reporterEmail: stringOrNull(payload?.opponentEmail || payload?.reporterEmail, 255),
    reporterPhone: stringOrNull(payload?.opponentPhone || payload?.reporterPhone, 255),
    driverName: stringOrNull(payload?.driverName, 255),
    licensePlate: stringOrNull(payload?.licensePlate, 64),
    incidentDate: dateOnlyOrNull(payload?.incidentDate),
  };
}

function sanitizeFileList(files) {
  return Array.isArray(files)
    ? files.filter((file) => file?.buffer && file.originalname).slice(0, 15)
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
  await query(`ALTER TABLE public_damage_reports ADD COLUMN IF NOT EXISTS notification_read_at TIMESTAMP WITH TIME ZONE`);
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
      managerKenjoId: stringOrNull(payload?.work?.managerKenjoId, 255),
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
    reporterName: stringOrNull(payload?.reporterName || payload?.opponentName, 255),
    reporterEmail: stringOrNull(payload?.reporterEmail || payload?.opponentEmail, 255),
    reporterPhone: stringOrNull(payload?.reporterPhone || payload?.opponentPhone, 255),
    opponentName: stringOrNull(payload?.opponentName || payload?.reporterName, 255),
    opponentEmail: stringOrNull(payload?.opponentEmail || payload?.reporterEmail, 255),
    opponentPhone: stringOrNull(payload?.opponentPhone || payload?.reporterPhone, 255),
    driverName: stringOrNull(payload?.driverName, 255),
    licensePlate: stringOrNull(payload?.licensePlate, 64),
    incidentDate: dateOnlyOrNull(payload?.incidentDate),
    incidentTime: stringOrNull(payload?.incidentTime, 32),
    location: stringOrNull(payload?.location, 255),
    streetName: stringOrNull(payload?.streetName || payload?.street, 255),
    houseNumber: stringOrNull(payload?.houseNumber, 64),
    zipCode: stringOrNull(payload?.zipCode || payload?.postalCode, 32),
    city: stringOrNull(payload?.city, 255),
    opponentInsuranceNumber: stringOrNull(payload?.opponentInsuranceNumber, 128),
    policeOnSite: payload?.policeOnSite === true,
    policeStation: stringOrNull(payload?.policeStation, 255),
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
  try {
    await sendPersonalQuestionnaireNotification({
      submissionId: row.id,
      summary,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error('Failed to send Personalfragebogen notification email:', error);
  }
  return row;
}

export async function submitDamageReport(payload, files) {
  await ensurePublicIntakeTables();
  const normalized = normalizeDamagePayload(payload);
  const summary = extractDamageSummary(normalized);

  if (!summary.reporterName || !summary.driverName || !summary.incidentDate) {
    throw new Error('Opponent name, driver name and incident date are required');
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
  try {
    await sendDamageReportNotification({
      reportId: row.id,
      summary,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error('Failed to send Schadenmeldung notification email:', error);
  }
  return row;
}

export async function getDamageReportFormOptions() {
  await ensurePublicIntakeTables();

  const driverRows = [];
  const seenDriverKeys = new Set();

  function pickFirstString(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value == null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return null;
  }

  function composeName(row, firstNameKeys = [], lastNameKeys = []) {
    const first = pickFirstString(row, firstNameKeys) || '';
    const last = pickFirstString(row, lastNameKeys) || '';
    const full = `${first} ${last}`.trim();
    return full || null;
  }

  function pushDrivers(rows) {
    for (const row of rows || []) {
      const name = String(row?.name || '').trim();
      if (!name) continue;
      const email = String(row?.email || '').trim() || null;
      const key = `${name.toLowerCase()}|${(email || '').toLowerCase()}`;
      if (seenDriverKeys.has(key)) continue;
      seenDriverKeys.add(key);
      driverRows.push({ name, email });
    }
  }

  // Primary source: live users from Kenjo API.
  const kenjoUsers = await getKenjoUsersList().catch(() => []);
  pushDrivers(
    (Array.isArray(kenjoUsers) ? kenjoUsers : []).map((user) => {
      const firstName = pickFirstString(user, ['firstName', 'first_name', 'givenName', 'given_name']);
      const lastName = pickFirstString(user, ['lastName', 'last_name', 'familyName', 'family_name']);
      const displayName =
        pickFirstString(user, ['displayName', 'display_name', 'name', 'fullName', 'full_name']) ||
        [firstName, lastName].filter(Boolean).join(' ').trim();
      return {
        name: displayName || pickFirstString(user, ['email', 'workEmail', 'work_email']),
        email: pickFirstString(user, ['email', 'workEmail', 'work_email']),
      };
    })
  );

  const employeesRawRes = await query(`SELECT * FROM employees ORDER BY id DESC LIMIT 2000`).catch(() => ({ rows: [] }));
  pushDrivers(
    (employeesRawRes.rows || [])
      .filter((row) => {
        const active = row?.is_active;
        if (active === false || String(active).toLowerCase() === 'false' || Number(active) === 0) return false;
        return true;
      })
      .map((row) => ({
        name:
          pickFirstString(row, ['display_name', 'name', 'full_name']) ||
          composeName(row, ['first_name', 'firstname', 'firstName'], ['last_name', 'lastname', 'lastName']) ||
          pickFirstString(row, ['email', 'work_email', 'private_email']),
        email: pickFirstString(row, ['email', 'work_email', 'private_email']),
      }))
  );

  const kenjoRawRes = await query(`SELECT * FROM kenjo_employees ORDER BY id DESC LIMIT 4000`).catch(() => ({ rows: [] }));
  pushDrivers(
    (kenjoRawRes.rows || [])
      .filter((row) => {
        const active = row?.is_active;
        if (active === false || String(active).toLowerCase() === 'false' || Number(active) === 0) return false;
        return true;
      })
      .map((row) => ({
        name:
          pickFirstString(row, ['display_name', 'full_name', 'name']) ||
          composeName(row, ['first_name', 'firstname', 'firstName'], ['last_name', 'lastname', 'lastName']) ||
          pickFirstString(row, ['email', 'work_email', 'personal_email']),
        email: pickFirstString(row, ['email', 'work_email', 'personal_email']),
      }))
  );

  const settingsUsersRawRes = await query(`SELECT * FROM settings_users ORDER BY id DESC LIMIT 2000`).catch(() => ({ rows: [] }));
  pushDrivers(
    (settingsUsersRawRes.rows || [])
      .filter((row) => {
        const status = String(row?.status || '').trim().toLowerCase();
        if (status && (status === 'inactive' || status === 'suspended')) return false;
        const active = row?.is_active;
        if (active === false || String(active).toLowerCase() === 'false' || Number(active) === 0) return false;
        return true;
      })
      .map((row) => ({
        name:
          pickFirstString(row, ['full_name', 'display_name', 'name']) ||
          composeName(row, ['first_name', 'firstname', 'firstName'], ['last_name', 'lastname', 'lastName']) ||
          pickFirstString(row, ['email', 'work_email', 'private_email']),
        email: pickFirstString(row, ['email', 'work_email', 'private_email']),
      }))
  );

  // Fallback for environments where employee/user master tables are empty:
  // collect driver names from operational tables used in daily workflow.
  if (!driverRows.length) {
    const carPlanningNamesRes = await query(
      `
        SELECT DISTINCT NULLIF(TRIM(driver_name), '') AS name
        FROM car_planning
        WHERE NULLIF(TRIM(driver_name), '') IS NOT NULL
        ORDER BY 1 ASC
        LIMIT 1000
      `
    ).catch(() => ({ rows: [] }));
    pushDrivers((carPlanningNamesRes.rows || []).map((row) => ({ name: row.name, email: null })));

    const damagesNamesRes = await query(
      `
        SELECT DISTINCT NULLIF(TRIM(driver_name), '') AS name
        FROM damages
        WHERE NULLIF(TRIM(driver_name), '') IS NOT NULL
        ORDER BY 1 ASC
        LIMIT 1000
      `
    ).catch(() => ({ rows: [] }));
    pushDrivers((damagesNamesRes.rows || []).map((row) => ({ name: row.name, email: null })));

    const publicReportsNamesRes = await query(
      `
        SELECT DISTINCT NULLIF(TRIM(driver_name), '') AS name
        FROM public_damage_reports
        WHERE NULLIF(TRIM(driver_name), '') IS NOT NULL
        ORDER BY 1 ASC
        LIMIT 1000
      `
    ).catch(() => ({ rows: [] }));
    pushDrivers((publicReportsNamesRes.rows || []).map((row) => ({ name: row.name, email: null })));
  }

  const carsRes = await query(
    `
      SELECT
        c.id,
        NULLIF(TRIM(c.license_plate), '') AS license_plate,
        NULLIF(TRIM(c.vehicle_id), '') AS vehicle_id,
        NULLIF(TRIM(c.model), '') AS model
      FROM cars c
      WHERE NULLIF(TRIM(c.license_plate), '') IS NOT NULL
      ORDER BY c.license_plate ASC
      LIMIT 1000
    `
  ).catch(() => ({ rows: [] }));

  const drivers = driverRows.map((row, index) => ({
    id: `driver-${index + 1}`,
    name: String(row.name || '').trim(),
    email: row.email || null,
  }));

  const cars = (carsRes.rows || []).map((row) => ({
    id: Number(row.id),
    licensePlate: String(row.license_plate || '').trim(),
    vehicleId: row.vehicle_id || null,
    model: row.model || null,
    label: [row.license_plate, row.vehicle_id, row.model].filter(Boolean).join(' · '),
  }));

  return { drivers, cars };
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
      r.notification_read_at,
      (r.notification_read_at IS NULL) AS is_new,
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
  await query(
    `UPDATE public_damage_reports
     SET notification_read_at = COALESCE(notification_read_at, NOW())
     WHERE id = $1`,
    [Number(id)]
  );
  const res = await query(`SELECT *, (notification_read_at IS NULL) AS is_new FROM public_damage_reports WHERE id = $1 LIMIT 1`, [Number(id)]);
  const report = res.rows[0] || null;
  if (!report) return null;
  const files = await listFiles('public_damage_report_files', 'report_id', Number(id));
  return { ...report, files };
}

export async function markDamageReportUnread(id) {
  await ensurePublicIntakeTables();
  const res = await query(
    `UPDATE public_damage_reports
     SET notification_read_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, reporter_name, driver_name, license_plate, notification_read_at`,
    [Number(id)]
  );
  return res.rows[0] || null;
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

async function resolveKenjoDbx9OfficeId() {
  if (kenjoDbx9OfficeIdCache) return kenjoDbx9OfficeIdCache;
  const offices = await getKenjoOffices().catch(() => []);
  const match = (Array.isArray(offices) ? offices : []).find((office) => {
    const name = String(office?.name || '').trim().toLowerCase();
    const code = String(office?.code || '').trim().toLowerCase();
    return name.includes('dbx9') || code === 'dbx9';
  });
  kenjoDbx9OfficeIdCache = stringOrNull(match?._id || match?.id, 255);
  return kenjoDbx9OfficeIdCache;
}

function extractKenjoEmployeeId(response) {
  const candidates = [
    response?._id,
    response?.id,
    response?.employeeId,
    response?.userId,
    response?.account?._id,
    response?.account?.id,
    response?.account?.employeeId,
    response?.user?._id,
    response?.user?.id,
    response?.data?._id,
    response?.data?.id,
    response?.data?.employeeId,
    response?.data?.account?._id,
    response?.data?.account?.id,
    response?.employee?._id,
    response?.employee?.id,
    response?.employee?.employeeId,
    response?.data?.employee?._id,
    response?.data?.employee?.id,
    response?.data?.employee?.employeeId,
  ];
  for (const candidate of candidates) {
    const normalized = stringOrNull(candidate, 255);
    if (normalized) return normalized;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveKenjoEmployeeIdByEmail(email) {
  const normalizedEmail = stringOrNull(email, 255)?.toLowerCase();
  if (!normalizedEmail) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accounts = await getKenjoUserAccounts().catch(() => []);
    const match = Array.isArray(accounts)
      ? accounts.find((item) => {
          const candidate = stringOrNull(item?.email || item?.account?.email, 255)?.toLowerCase();
          return candidate === normalizedEmail;
        })
      : null;

    const resolved = extractKenjoEmployeeId(match);
    if (resolved) return resolved;

    if (attempt < 2) {
      await sleep(1000);
    }
  }

  return null;
}

async function resolveKenjoEmployeeIdByIdentity({ email, employeeNumber, externalId, firstName, lastName }) {
  const normalizedEmail = stringOrNull(email, 255)?.toLowerCase();
  const normalizedEmployeeNumber = stringOrNull(employeeNumber, 255);
  const normalizedExternalId = stringOrNull(externalId, 255);
  const normalizedFullName = [stringOrNull(firstName, 255), stringOrNull(lastName, 255)].filter(Boolean).join(' ').trim().toLowerCase();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accounts = await getKenjoUserAccounts().catch(() => []);
    const accountMatch = Array.isArray(accounts)
      ? accounts.find((item) => {
          const candidateEmail = stringOrNull(item?.email || item?.account?.email, 255)?.toLowerCase();
          const candidateExternalId = stringOrNull(item?.externalId || item?.account?.externalId, 255);
          return (
            (normalizedEmail && candidateEmail === normalizedEmail) ||
            (normalizedExternalId && candidateExternalId === normalizedExternalId)
          );
        })
      : null;

    const accountResolved = extractKenjoEmployeeId(accountMatch);
    if (accountResolved) return accountResolved;

    const users = await getKenjoUsersList().catch(() => []);
    const userMatch = Array.isArray(users)
      ? users.find((item) => {
          const candidateEmail = stringOrNull(item?.email, 255)?.toLowerCase();
          const candidateEmployeeNumber = stringOrNull(item?.employeeNumber, 255);
          const candidateName = stringOrNull(item?.displayName || [item?.firstName, item?.lastName].filter(Boolean).join(' '), 255)?.toLowerCase();
          return (
            (normalizedEmail && candidateEmail === normalizedEmail) ||
            (normalizedEmployeeNumber && candidateEmployeeNumber === normalizedEmployeeNumber) ||
            (normalizedFullName && candidateName === normalizedFullName)
          );
        })
      : null;

    const userResolved = extractKenjoEmployeeId(userMatch);
    if (userResolved) return userResolved;

    if (attempt < 2) {
      await sleep(1000);
    }
  }

  return null;
}

async function resolveManagerKenjoIdByName(managerName) {
  const normalized = stringOrNull(managerName, 255);
  if (!normalized) return null;
  const trimmed = normalized.trim();
  const compact = trimmed.toLowerCase().replace(/\s+/g, ' ');

  const localRes = await query(
    `SELECT kenjo_user_id, display_name, first_name, last_name
     FROM employees
     WHERE is_active = true
       AND kenjo_user_id IS NOT NULL
       AND (
         LOWER(TRIM(COALESCE(display_name, ''))) = $1
         OR LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))) = $1
       )
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`,
    [compact]
  ).catch(() => ({ rows: [] }));

  const localId = stringOrNull(localRes.rows?.[0]?.kenjo_user_id, 255);
  if (localId) return localId;

  const kenjoRes = await query(
    `SELECT kenjo_user_id, display_name, first_name, last_name
     FROM kenjo_employees
     WHERE is_active = true
       AND (
         LOWER(TRIM(COALESCE(display_name, ''))) = $1
         OR LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))) = $1
       )
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`,
    [compact]
  ).catch(() => ({ rows: [] }));

  const cachedId = stringOrNull(kenjoRes.rows?.[0]?.kenjo_user_id, 255);
  if (cachedId) return cachedId;

  try {
    const accountsJson = await getKenjoUserAccounts();
    const accounts = Array.isArray(accountsJson)
      ? accountsJson
      : Array.isArray(accountsJson?.data)
        ? accountsJson.data
        : Array.isArray(accountsJson?.items)
          ? accountsJson.items
          : [];
    const liveMatch = accounts.find((item) => {
      const display = String(item?.displayName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const fullName = [item?.firstName, item?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      return display === compact || fullName === compact;
    });
    return stringOrNull(liveMatch?._id || liveMatch?.id, 255);
  } catch {
    return null;
  }
}

async function runKenjoSectionUpdateWithFallbacks(warnings, label, fn, employeeId, bodies) {
  const attempts = Array.isArray(bodies)
    ? bodies
        .map((body) => compactObject(body))
        .filter((body) => Object.keys(body).length)
    : [];

  if (!attempts.length) return;

  let lastError = null;
  for (const body of attempts) {
    try {
      await fn(employeeId, body);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  warnings.push(`${label}: ${String(lastError?.message || lastError)}`);
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
      stringOrNull(work.transportationId, 255) || 'DBX9',
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
      stringOrNull(work.transportationId, 255) || 'DBX9',
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
  const kenjoExternalId = formatKenjoExternalId(work.employeeNumber || payload.externalId);

  if (!firstName || !lastName || !email) {
    throw new Error('First name, last name and email are required before Save and Send');
  }

  const companyId = await resolveKenjoCompanyId();
  const deliveryStationOfficeId = await resolveKenjoDbx9OfficeId();
  const managerKenjoId =
    stringOrNull(work.managerKenjoId, 255) ||
    await resolveManagerKenjoIdByName(work.managerName);
  const createBody = {
    account: compactObject({
      email: stringOrNull(email, 255),
      language: normalizeKenjoLanguage(account.language),
      externalId: kenjoExternalId,
    }),
    personal: compactObject({
      firstName: stringOrNull(firstName, 255),
      lastName: stringOrNull(lastName, 255),
    }),
    work: compactObject({
      companyId,
      officeId: deliveryStationOfficeId,
      weeklyHours: numberOrNull(work.weeklyHours) ?? 40,
      startDate: kenjoDateTimeOrNull(work.startDate),
      reportsToId: managerKenjoId,
    }),
  };

  let createResponse;
  let kenjoEmployeeIdFromConflict = null;
  try {
    createResponse = await createKenjoEmployee(createBody);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.toLowerCase().includes('conflict')) {
      kenjoEmployeeIdFromConflict = await resolveKenjoEmployeeIdByIdentity({
        email,
        employeeNumber: work.employeeNumber || payload.externalId,
        externalId: kenjoExternalId,
        firstName,
        lastName,
      });
      if (kenjoEmployeeIdFromConflict) {
        createResponse = { id: kenjoEmployeeIdFromConflict };
      } else {
        await query(
          `UPDATE personal_questionnaire_submissions
           SET status = 'error', last_error = $2, updated_at = NOW()
           WHERE id = $1`,
          [Number(id), message]
        );
        throw error;
      }
    } else {
    await query(
      `UPDATE personal_questionnaire_submissions
       SET status = 'error', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [Number(id), message]
    );
    throw error;
    }
  }

  const kenjoEmployeeId =
    extractKenjoEmployeeId(createResponse) ||
    kenjoEmployeeIdFromConflict ||
    await resolveKenjoEmployeeIdByIdentity({
      email,
      employeeNumber: work.employeeNumber || payload.externalId,
      externalId: kenjoExternalId,
      firstName,
      lastName,
    }) ||
    await resolveKenjoEmployeeIdByEmail(email);
  if (!kenjoEmployeeId) {
    const message = `Kenjo create employee succeeded but returned no employee id for email ${email}`;
    await query(
      `UPDATE personal_questionnaire_submissions
       SET status = 'error', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [Number(id), message]
    );
    throw new Error(message);
  }

  const warnings = [];

  const normalizedGender = normalizeKenjoGenderForTenant(personal.gender);
  const normalizedNationality = normalizeKenjoNationality(personal.nationality);
  const normalizedCountry = normalizeKenjoCountryCode(address.country);
  const normalizedMaritalStatus = normalizeKenjoMaritalStatus(home.maritalStatus);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'account', updateEmployeeAccounts, kenjoEmployeeId, [
    {
      externalId: kenjoExternalId,
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'personal', updateEmployeePersonals, kenjoEmployeeId, [
    {
      firstName: stringOrNull(firstName, 255),
      lastName: stringOrNull(lastName, 255),
      salutation: stringOrNull(personal.salutation, 64),
      birthdate: kenjoDateTimeOrNull(personal.birthDate || personal.birthdate),
      gender: normalizedGender,
      nationality: normalizedNationality,
    },
    {
      firstName: stringOrNull(firstName, 255),
      lastName: stringOrNull(lastName, 255),
      salutation: stringOrNull(personal.salutation, 64),
      birthdate: kenjoDateTimeOrNull(personal.birthDate || personal.birthdate),
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'work dates', updateEmployeeWork, kenjoEmployeeId, [
    {
      startDate: kenjoDateTimeOrNull(work.startDate),
      contractEnd: kenjoDateTimeOrNull(work.contractEnd),
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'work title', updateEmployeeWork, kenjoEmployeeId, [
    {
      jobTitle: stringOrNull(work.jobTitle, 255),
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'work weekly hours', updateEmployeeWork, kenjoEmployeeId, [
    {
      weeklyHours: numberOrNull(work.weeklyHours),
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'work manager', updateEmployeeWork, kenjoEmployeeId, [
    { reportsToId: managerKenjoId },
    { managerId: managerKenjoId },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'work delivery station', updateEmployeeWork, kenjoEmployeeId, [
    { officeId: deliveryStationOfficeId },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'address', updateEmployeeAddresses, kenjoEmployeeId, [
    {
      street: stringOrNull(address.street || address.streetName, 255),
      houseNumber: stringOrNull(address.houseNumber, 64),
      postalCode: stringOrNull(address.postalCode || address.zipCode, 32),
      city: stringOrNull(address.city, 255),
      country: normalizedCountry,
    },
    {
      street: stringOrNull(address.street || address.streetName, 255),
      houseNumber: stringOrNull(address.houseNumber, 64),
      postalCode: stringOrNull(address.postalCode || address.zipCode, 32),
      city: stringOrNull(address.city, 255),
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'home', updateEmployeeHomes, kenjoEmployeeId, [
    {
      personalMobile: stringOrNull(home.personalMobile || home.mobilePhone, 255),
      maritalStatus: normalizedMaritalStatus,
    },
    {
      personalMobile: stringOrNull(home.personalMobile || home.mobilePhone, 255),
      maritalStatus: stringOrNull(home.maritalStatus, 64),
    },
    {
      personalMobile: stringOrNull(home.personalMobile || home.mobilePhone, 255),
    },
  ]);

  await runKenjoSectionUpdateWithFallbacks(warnings, 'financial', updateEmployeeFinancials, kenjoEmployeeId, [
    {
      bankName: stringOrNull(financial.bankName, 255),
      accountHolderName: stringOrNull(financial.accountHolderName, 255),
      iban: stringOrNull(financial.iban, 128),
      swiftCode: stringOrNull(financial.bic, 64),
      taxIdentificationNumber: stringOrNull(financial.taxId || financial.steuerId, 128),
      nationalInsuranceNumber: stringOrNull(financial.nationalInsuranceNumber || financial.socialSecurityNumber, 128),
    },
  ]);

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
  const [personalCountsRes, personalUnreadRes, damageCountsRes, damageUnreadRes, recentPersonalRes, recentDamageRes] = await Promise.all([
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
      SELECT COUNT(*)::int AS count
      FROM public_damage_reports
      WHERE notification_read_at IS NULL
    `),
    query(`
      SELECT id, status, first_name, last_name, email, created_at
      FROM personal_questionnaire_submissions
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `),
    query(`
      SELECT id, status, reporter_name, driver_name, license_plate, incident_date, created_at, (notification_read_at IS NULL) AS is_new
      FROM public_damage_reports
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `),
  ]);

  const toMap = (rows) => Object.fromEntries((rows || []).map((row) => [String(row.status || ''), Number(row.count || 0)]));
  const personalCounts = toMap(personalCountsRes.rows || []);
  const personalUnread = Number(personalUnreadRes.rows?.[0]?.count || 0);
  const damageCounts = toMap(damageCountsRes.rows || []);
  const damageUnread = Number(damageUnreadRes.rows?.[0]?.count || 0);

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
      unread: damageUnread,
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
  markDamageReportUnread,
  updateDamageReport,
  addDamageReportFiles,
  getDamageReportFile,
  getDamageReportFormOptions,
  saveAndSendPersonalQuestionnaire,
  getPublicIntakeSummary,
  ensurePublicIntakeTables,
};

export default publicIntakeService;

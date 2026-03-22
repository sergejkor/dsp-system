import { getAuthHeader } from './kenjoAuth.js';

const BASE_URL = 'https://api.kenjo.io/api/v1';

async function kenjoGet(path, queryParams = {}) {
  const authHeader = await getAuthHeader();
  const qs = new URLSearchParams(queryParams).toString();
  const url = qs ? `${BASE_URL}${path}?${qs}` : `${BASE_URL}${path}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Kenjo GET ${path} failed ${resp.status}: ${text}`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Kenjo GET ${path} returned invalid JSON`);
  }
}

async function kenjoPut(path, body) {
  const authHeader = await getAuthHeader();

  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Kenjo PUT ${path} failed ${resp.status}: ${text}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function kenjoPost(path, body) {
  const authHeader = await getAuthHeader();

  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Kenjo POST ${path} failed ${resp.status}: ${text}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function createKenjoAttendance(userId, date, startTime, endTime) {
  const start = toTimeHHMMSS(startTime);
  const end = toTimeHHMMSS(endTime);
  if (!userId || !date || !start || !end) {
    throw new Error('userId, date, startTime and endTime are required');
  }
  return kenjoPost('/attendances', {
    userId,
    date: String(date).slice(0, 10),
    startTime: start,
    endTime: end,
  });
}

function toTimeHHMMSS(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`;
  const iso = s.match(/T(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, '0')}:${iso[2].padStart(2, '0')}:00`;
  return null;
}

function normalizeArrayPayload(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.items)) return json.items;
  return [];
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

function findCandidate(items, employeeId) {
  const id = norm(employeeId);
  if (!id) return null;

  return (
    items.find((item) => {
      const candidates = [
        item?._id,
        item?.id,
        item?.employeeId,
        item?.employeeNumber,
        item?.transportationId,
        item?.transporterId,
        item?.email,
        item?.displayName,
        item?.firstName && item?.lastName ? `${item.firstName} ${item.lastName}` : '',
        item?.work?.employeeNumber,
        item?.work?.transportationId,
        item?.account?.email,
        item?.personal?.displayName,
      ]
        .filter(Boolean)
        .map(norm);

      return candidates.includes(id);
    }) || null
  );
}

function buildManagerMap(workItems, personalItems) {
  const personalById = new Map();

  personalItems.forEach((p) => {
    const id = String(p?._id || p?.employeeId || p?.id || '').trim();
    if (!id) return;

    const firstName = pickFirst(p?.firstName, p?.personal?.firstName);
    const lastName = pickFirst(p?.lastName, p?.personal?.lastName);
    const displayName = pickFirst(
      p?.displayName,
      p?.personal?.displayName,
      `${firstName} ${lastName}`.trim(),
    );

    personalById.set(id, {
      firstName,
      lastName,
      displayName,
    });
  });

  const workById = new Map();
  workItems.forEach((w) => {
    const id = String(w?._id || w?.employeeId || w?.id || '').trim();
    if (!id) return;
    workById.set(id, w);
  });

  return {
    getManagerName(reportsToId) {
      const id = String(reportsToId || '').trim();
      if (!id) return '';

      const p = personalById.get(id);
      if (p?.displayName) return p.displayName;

      const w = workById.get(id);
      if (!w) return '';

      return pickFirst(
        w.displayName,
        w.firstName && w.lastName ? `${w.firstName} ${w.lastName}` : '',
      );
    },
  };
}

export async function getKenjoUserAccounts() {
  return kenjoGet('/user-accounts');
}

/**
 * Get time-off requests from Kenjo for a date range (max 92 days).
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 */
export async function getTimeOffRequests(from, to) {
  const fromStr = String(from || '').trim().slice(0, 10);
  const toStr = String(to || '').trim().slice(0, 10);
  if (!fromStr || !toStr) throw new Error('from and to (YYYY-MM-DD) are required');
  const data = await kenjoGet('/time-off/requests', { from: fromStr, to: toStr });
  return normalizeArrayPayload(data);
}

/** User-accounts plus work data (transportationId, employeeNumber) for matching Cortex rows. */
export async function getKenjoUsersForMatch() {
  const [accountsJson, worksJson] = await Promise.all([
    kenjoGet('/user-accounts'),
    kenjoGet('/employees/works'),
  ]);
  const accounts = normalizeArrayPayload(accountsJson);
  const works = normalizeArrayPayload(worksJson);
  const workById = new Map();
  (works || []).forEach((w) => {
    const id = String(w?._id || w?.employeeId || w?.id || '').trim();
    if (id) workById.set(id, w);
  });
  return (accounts || []).map((u) => {
    const id = String(u?._id || u?.id || '').trim();
    const work = workById.get(id) || {};
    return {
      _id: id,
      id: u?.id ?? id,
      displayName: u?.displayName || (u?.firstName && u?.lastName ? `${u.firstName} ${u.lastName}` : ''),
      firstName: u?.firstName ?? work?.firstName,
      lastName: u?.lastName ?? work?.lastName,
      email: u?.email || u?.account?.email || '',
      transportationId: u?.transportationId ?? u?.transportation_id ?? work?.transportationId ?? work?.transportation_id ?? '',
      employeeNumber: u?.employeeNumber ?? u?.employee_number ?? work?.employeeNumber ?? work?.employee_number ?? '',
    };
  });
}

export async function getKenjoCustomFields() {
  const data = await kenjoGet('/custom-fields');
  return normalizeArrayPayload(data);
}

/** User-accounts merged with work data for list view: PN, Name, Email, Role, Active, Start Date, Contract end. */
export async function getKenjoUsersList() {
  const [accountsJson, worksJson] = await Promise.all([
    kenjoGet('/user-accounts'),
    kenjoGet('/employees/works'),
  ]);
  const accounts = normalizeArrayPayload(accountsJson);
  const works = normalizeArrayPayload(worksJson);
  const workById = new Map();
  (works || []).forEach((w) => {
    const id = String(w?._id || w?.employeeId || w?.id || '').trim();
    if (id) workById.set(id, w);
  });
  return (accounts || []).map((u) => {
    const id = String(u?._id || u?.id || '').trim();
    const work = workById.get(id) || {};
    const startDate = work?.startDate ?? work?.work?.startDate ?? u?.startDate ?? '';
    const contractEnd = work?.contractEnd ?? work?.work?.contractEnd ?? u?.contractEnd ?? '';
    return {
      _id: id,
      displayName: u?.displayName || (u?.firstName && u?.lastName ? `${u.firstName} ${u.lastName}` : ''),
      firstName: u?.firstName ?? work?.firstName,
      lastName: u?.lastName ?? work?.lastName,
      email: u?.email || u?.account?.email || '',
      jobTitle: u?.jobTitle ?? work?.jobTitle ?? work?.work?.jobTitle ?? '',
      isActive: u?.isActive !== undefined ? !!u.isActive : true,
      transportationId: u?.transportationId ?? u?.transportation_id ?? work?.transportationId ?? work?.transporterId ?? work?.work?.transportationId ?? '',
      employeeNumber: u?.employeeNumber ?? u?.employee_number ?? work?.employeeNumber ?? work?.employee_number ?? '',
      startDate: toDateOnly(startDate),
      contractEnd: toDateOnly(contractEnd),
    };
  });
}

function toDateOnly(val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getKenjoEmployeeByIdReadable(employeeId) {
  const worksJson = await kenjoGet('/employees/works');
  const personalsJson = await kenjoGet('/employees/personals');
  const accountsJson = await kenjoGet('/employees/accounts');
  const addressesJson = await kenjoGet('/employees/addresses');
  const homesJson = await kenjoGet('/employees/homes');
  const financialsJson = await kenjoGet('/employees/financials');

  const workItems = normalizeArrayPayload(worksJson);
  const personalItems = normalizeArrayPayload(personalsJson);
  const accountItems = normalizeArrayPayload(accountsJson);
  const addressItems = normalizeArrayPayload(addressesJson);
  const homeItems = normalizeArrayPayload(homesJson);
  const financialItems = normalizeArrayPayload(financialsJson);

  let workEmp = findCandidate(workItems, employeeId) || {};
  let personalEmp = findCandidate(personalItems, employeeId) || {};
  let accountEmp = findCandidate(accountItems, employeeId) || {};
  let addressEmp = findCandidate(addressItems, employeeId) || {};
  let homeEmp = findCandidate(homeItems, employeeId) || {};
  let financialEmp = findCandidate(financialItems, employeeId) || {};

  const resolvedId = pickFirst(
    workEmp?._id,
    personalEmp?._id,
    accountEmp?._id,
    employeeId,
  );

  if (!personalEmp?._id && resolvedId) {
    personalEmp =
      personalItems.find(
        (x) => String(x?._id || '').trim() === String(resolvedId).trim(),
      ) || personalEmp;
  }

  if (!accountEmp?._id && resolvedId) {
    accountEmp =
      accountItems.find(
        (x) => String(x?._id || '').trim() === String(resolvedId).trim(),
      ) || accountEmp;
  }

  if (!workEmp?._id && resolvedId) {
    workEmp =
      workItems.find(
        (x) => String(x?._id || '').trim() === String(resolvedId).trim(),
      ) || workEmp;
  }

  const firstName = pickFirst(
    personalEmp?.firstName,
    personalEmp?.personal?.firstName,
    workEmp?.firstName,
  );

  const lastName = pickFirst(
    personalEmp?.lastName,
    personalEmp?.personal?.lastName,
    workEmp?.lastName,
  );

  const displayName = pickFirst(
    personalEmp?.displayName,
    personalEmp?.personal?.displayName,
    `${firstName} ${lastName}`.trim(),
  );

  const managerMap = buildManagerMap(workItems, personalItems);
  const managerName = managerMap.getManagerName(workEmp?.reportsToId);

  const result = {
    _id: String(resolvedId || '').trim(),
    id: String(resolvedId || '').trim(),

    firstName,
    lastName,
    displayName,
    email: accountEmp?.email || '',

    personal: {
      firstName,
      lastName,
      displayName,
      birthdate: pickFirst(personalEmp?.birthdate, personalEmp?.personal?.birthdate),
      gender: pickFirst(personalEmp?.gender, personalEmp?.personal?.gender),
      nationality: pickFirst(personalEmp?.nationality, personalEmp?.personal?.nationality),
      mobile: pickFirst(personalEmp?.mobile, personalEmp?.personal?.mobile),
      email: pickFirst(personalEmp?.email, personalEmp?.personal?.email),
    },

    account: {
      email: accountEmp?.email || '',
      isActive: accountEmp?.isActive === true,
      language: accountEmp?.language || '',
    },

    work: {
      jobTitle: pickFirst(workEmp?.jobTitle, workEmp?.work?.jobTitle),
      workMobile: pickFirst(workEmp?.workMobile, workEmp?.work?.workMobile),
      workPhone: pickFirst(workEmp?.workPhone, workEmp?.work?.workPhone),
      weeklyHours: workEmp?.weeklyHours ?? workEmp?.work?.weeklyHours ?? '',
      startDate: pickFirst(workEmp?.startDate, workEmp?.work?.startDate),
      employeeNumber: pickFirst(workEmp?.employeeNumber, workEmp?.work?.employeeNumber),
      transportationId: pickFirst(
        workEmp?.transportationId,
        workEmp?.transporterId,
        workEmp?.work?.transportationId,
      ),
      contractEnd: pickFirst(workEmp?.contractEnd, workEmp?.work?.contractEnd),
      probationUntil: pickFirst(
        workEmp?.probationUntil,
        workEmp?.probationEnd,
        workEmp?.work?.probationUntil,
        workEmp?.work?.probationEnd,
      ),
      reportsToId: pickFirst(workEmp?.reportsToId, workEmp?.managerId),
      managerName,
    },

    manager: {
      name: managerName,
      displayName: managerName,
    },

    address: {
      streetName: pickFirst(addressEmp?.street, addressEmp?.streetName),
      houseNumber: pickFirst(addressEmp?.houseNumber),
      addressLine1: pickFirst(
        addressEmp?.additionalAddress,
        addressEmp?.addressLine1,
      ),
      postalCode: pickFirst(addressEmp?.postalCode),
      zip: pickFirst(addressEmp?.postalCode),
      city: pickFirst(addressEmp?.city),
      country: pickFirst(addressEmp?.country),
    },

    home: {
      maritalStatus: homeEmp.maritalStatus || '',
      personalPhone: homeEmp.personalPhone || '',
      personalMobile: homeEmp.personalMobile || '',
      children: homeEmp.children || [],
    },

    financial: {
      bankName: financialEmp.bankName || '',
      accountHolderName: financialEmp.accountHolderName || '',
      nameOnCard: financialEmp.accountHolderName || '',
      iban: financialEmp.iban || '',
      swiftCode: financialEmp.swiftCode || '',
      bic: financialEmp.swiftCode || '',
      taxCode: financialEmp.taxCode || '',
      taxIdentificationNumber: financialEmp.taxIdentificationNumber || '',
      steuerId: financialEmp.taxIdentificationNumber || '',
      taxNumber: financialEmp.taxCode || '',
      nationalInsuranceNumber: financialEmp.nationalInsuranceNumber || '',
      socialInsuranceNumber: financialEmp.nationalInsuranceNumber || '',
    },

    createdAt: pickFirst(
      personalEmp?.createdAt,
      accountEmp?.createdAt,
      workEmp?.createdAt,
    ),

    updatedAt: pickFirst(
      personalEmp?.updatedAt,
      accountEmp?.updatedAt,
      workEmp?.updatedAt,
    ),
  };

  // Явное сопоставление известных custom fields Kenjo -> удобная структура.
  // Значения берём напрямую из personalEmp / workEmp / financialEmp.
  const customFields = [];

  function pushCustomField(name, key, type, value) {
    if (value === undefined) return;
    customFields.push({ name, key, type, value });
  }

  // Примеры ключей для этого аккаунта Kenjo (видно в personalEmp как c_*)
  pushCustomField(
    'Führerschein ablaufdatum',
    'c_Fherschein',
    'date',
    personalEmp.c_Fherschein,
  );
  pushCustomField(
    'Ausweis Ablaufdatum',
    'c_AusweisAblaufdatum',
    'date',
    personalEmp.c_AusweisAblaufdatum,
  );
  pushCustomField(
    'Mentor Name',
    'c_MentorName',
    'text',
    personalEmp.c_MentorName,
  );
  pushCustomField(
    'Mentor Last name',
    'c_MentorLastname',
    'text',
    personalEmp.c_MentorLastname,
  );
  // Возможные дополнительные поля, если Kenjo вернёт их в будущем:
  pushCustomField(
    'Aufenthaltstitel Ablaufdatum',
    'c_AufenthaltstitelAblaufdatum',
    'date',
    personalEmp.c_AufenthaltstitelAblaufdatum,
  );
  pushCustomField(
    'Carry over days',
    'c_CarryOverDays',
    'number',
    workEmp.c_CarryOverDays,
  );
  pushCustomField(
    'Steuerklasse',
    'c_Steuerklasse',
    'list',
    personalEmp.c_Steuerklasse,
  );

  if (customFields.length) {
    result.customFields = customFields;
  }
  console.log(
    'KENJO EMPLOYEE RAW DEBUG',
    JSON.stringify(
      {
        resolvedId,
        workEmp,
        personalEmp,
        accountEmp,
        addressEmp,
        homeEmp,
        financialEmp,
      },
      null,
      2,
    ),
  );
  return result;
}

export async function getKenjoAttendances(fromDate, toDate) {
  const from = typeof fromDate === 'string' ? fromDate.slice(0, 10) : '';
  const to = typeof toDate === 'string' ? toDate.slice(0, 10) : '';
  if (!from || !to) return [];
  try {
    const data = await kenjoGet('/attendances', { from, to });
    const list = normalizeArrayPayload(data);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    const msg = String(err?.message || err || '');
    // Kenjo returns 404 with message "Could not find attendance entries." when there are simply no rows.
    // Treat this as "no attendances" instead of an error.
    if (
      msg.includes('/attendances') &&
      msg.includes('404') &&
      msg.toLowerCase().includes('could not find attendance entries')
    ) {
      return [];
    }
    throw err;
  }
}

export async function updateEmployeeWork(employeeId, body) {
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employeeId is required');
  return kenjoPut(`/employees/${id}/works`, body);
}

export async function updateEmployeePersonals(employeeId, body) {
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employeeId is required');
  return kenjoPut(`/employees/${id}/personals`, body);
}

export async function updateEmployeeAddresses(employeeId, body) {
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employeeId is required');
  return kenjoPut(`/employees/${id}/addresses`, body);
}

export async function updateEmployeeHomes(employeeId, body) {
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employeeId is required');
  return kenjoPut(`/employees/${id}/homes`, body);
}

export async function updateEmployeeFinancials(employeeId, body) {
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employeeId is required');
  return kenjoPut(`/employees/${id}/financials`, body);
}

export async function updateKenjoAttendance(attendanceId, { startTime, endTime }) {
  const body = {};
  if (startTime != null) body.startTime = startTime;
  if (endTime != null) body.endTime = endTime;
  return kenjoPut(`/attendances/${attendanceId}`, body);
}

export async function deactivateEmployee(employeeId) {
  const id = String(employeeId || '').trim();
  if (!id) throw new Error('employeeId is required');
  return kenjoPut(`/employees/${id}/deactivate`, {});
}

const kenjoClient = {
  kenjoGet,
  kenjoPut,
  getKenjoUserAccounts,
  getKenjoEmployeeByIdReadable,
  getKenjoAttendances,
  updateKenjoAttendance,
};

export default kenjoClient;

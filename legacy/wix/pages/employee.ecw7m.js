
import wixLocation from 'wix-location';
import { getKenjoEmployeeByIdReadable } from 'backend/kenjoReadable';
import { saveVorschuss } from 'backend/payrollApi';

function el(id) {
  try {
    return $w(id);
  } catch (e) {
    console.warn('Element not found:', id);
    return null;
  }
}

function setFieldSafe(id, value) {
  const node = el(id);
  if (!node) return;

  const safeValue = String(value ?? '-');

  try {
    if (typeof node.text !== 'undefined') {
      node.text = safeValue;
      return;
    }
  } catch (e) {}

  try {
    if (typeof node.value !== 'undefined') {
      node.value = safeValue;
      return;
    }
  } catch (e) {}

  try {
    if (typeof node.label !== 'undefined') {
      node.label = safeValue;
      return;
    }
  } catch (e) {}

  console.warn('Cannot write to element:', id, node.type || node);
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function present(v) {
  return (v !== undefined && v !== null && String(v).trim() !== '') ? v : '-';
}

function formatDate(v) {
  if (!v) return '-';
  const s = String(v);
  return s.includes('T') ? s.split('T')[0] : s;
}

function buildMonthOptions() {
  const now = new Date();
  const options = [];

  for (let i = -2; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${year}-${month}`;

    options.push({
      label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      value
    });
  }

  return options;
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseAmount(value) {
  if (value === undefined || value === null) return 0;

  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');

  if (!normalized) return 0;

  const num = Number(normalized);
  if (isNaN(num)) {
    throw new Error('Ungültiger Betrag');
  }

  return num;
}

function setStatusMessage(node, message) {
  if (!node) return;

  try {
    if (typeof node.text !== 'undefined') {
      node.text = message;
      return;
    }
  } catch (e) {}

  try {
    if (typeof node.value !== 'undefined') {
      node.value = message;
      return;
    }
  } catch (e) {}
}

function initVorschussControls(employeeId) {
  const monthDropdown = el('#monthDropdown');
  const vorschussInput = el('#vorschussInput');
  const saveButton = el('#saveVorschussButton');
  const saveStatusText = el('#saveStatusText');

  if (!monthDropdown || !vorschussInput || !saveButton) {
    console.warn('Vorschuss controls are missing on the page');
    return;
  }

  monthDropdown.options = buildMonthOptions();
  monthDropdown.value = getCurrentMonthValue();
  setStatusMessage(saveStatusText, '');

  saveButton.onClick(async () => {
    try {
      saveButton.disable();
      setStatusMessage(saveStatusText, 'Speichern...');

      const periodId = monthDropdown.value;
      const amount = parseAmount(vorschussInput.value);

      const result = await saveVorschuss(periodId, employeeId, amount, '');

      setStatusMessage(
        saveStatusText,
        `Gespeichert: ${result.amount} € für ${result.period_id}`
      );

      if (typeof vorschussInput.value !== 'undefined') {
        vorschussInput.value = '';
      }
    } catch (err) {
      console.error('Error saving Vorschuss:', err);
      setStatusMessage(saveStatusText, `Fehler: ${err.message || err}`);
    } finally {
      saveButton.enable();
    }
  });
}

$w.onReady(async function () {
  try {
    const employeeId = wixLocation.query.employeeId;
    console.log('URL employeeId:', employeeId);

    if (!employeeId) {
      setFieldSafe('#displayNameText', 'No employeeId in URL');
      return;
    }

    initVorschussControls(employeeId);

    const emp = await getKenjoEmployeeByIdReadable(employeeId);
    console.log('Employee details:', JSON.stringify(emp));
    console.log('ADDRESS DEBUG:', JSON.stringify(emp.address));
    const firstName = pickFirst(emp.personal?.firstName, emp.firstName);
    const lastName = pickFirst(emp.personal?.lastName, emp.lastName);
    const displayName = pickFirst(
      emp.personal?.displayName,
      emp.displayName,
      `${firstName} ${lastName}`.trim()
    );

    const email = pickFirst(emp.account?.email, emp.email, emp.personal?.email);
    const mobile = pickFirst(
      emp.work?.workMobile,
      emp.home?.personalMobile,
      emp.personal?.mobile
    );

    const isActive = (typeof emp.account?.isActive === 'boolean')
      ? emp.account.isActive
      : (typeof emp.isActive === 'boolean')
        ? emp.isActive
        : null;

    const statusText =
      isActive === true ? '🟢 Active' :
      isActive === false ? '🔴 Inactive' :
      '-';

    const language = pickFirst(
      emp.account?.language,
      emp.language,
      emp.personal?.language
    );

    const jobTitle = pickFirst(emp.work?.jobTitle, emp.jobTitle);

    const weeklyHours = pickFirst(emp.work?.weeklyHours, emp.weeklyHours);
    const weeklyHoursText =
      (weeklyHours === 0 || (weeklyHours !== undefined && weeklyHours !== null && String(weeklyHours).trim() !== ''))
        ? String(weeklyHours)
        : '-';

    const startDate = pickFirst(
      emp.work?.startDate,
      emp.startDate,
      emp.employment?.startDate
    );

    const employeeNumber = pickFirst(
      emp.work?.employeeNumber,
      emp.employeeNumber
    );

    const transportationId = pickFirst(
      emp.work?.transportationId,
      emp.transportationId
    );

    const contractEnd = pickFirst(
      emp.work?.contractEnd,
      emp.contractEnd
    );

    const probationUntil = pickFirst(
      emp.work?.probationUntil,
      emp.work?.probationEnd,
      emp.work?.probationPeriodEnd,
      emp.probationUntil
    );

    const manager = pickFirst(
      emp.manager?.displayName,
      emp.manager?.name,
      emp.work?.managerName,
      emp.managerName
    );

    const birthDate = pickFirst(
      emp.personal?.birthdate,
      emp.birthDate,
      emp.personal?.birthDate
    );

    const gender = pickFirst(emp.personal?.gender, emp.gender);
    const nationality = pickFirst(emp.personal?.nationality, emp.nationality);

    const streetName = pickFirst(
      emp.address?.streetName,
      emp.address?.street
    );

    const houseNumber = pickFirst(
      emp.address?.houseNumber
    );

    const street = pickFirst(
      streetName && houseNumber ? `${streetName} ${houseNumber}`.trim() : '',
      streetName,
      houseNumber
    );

    const zip = pickFirst(emp.address?.postalCode, emp.address?.zip);
    const city = pickFirst(emp.address?.city);
    const country = pickFirst(emp.address?.country);

    const createdAt = pickFirst(emp.createdAt, emp.meta?.createdAt);
    const updatedAt = pickFirst(emp.updatedAt, emp.meta?.updatedAt);

    const maritalStatus = pickFirst(
      emp.home?.maritalStatus,
      emp.maritalStatus
    );

    const children = Array.isArray(emp.home?.children) ? emp.home.children : [];
    const childrenCount = children.length;

    const childrenList = childrenCount
      ? children
          .map((ch) => {
            const n = [
              ch.childFirstName,
              ch.childLastName,
              ch.firstName,
              ch.lastName,
              ch.name
            ].filter(Boolean).join(' ').trim();

            const bd = pickFirst(ch.childBirthdate, ch.birthdate, ch.birthDate);
            return bd ? `${n} (${formatDate(bd)})` : n;
          })
          .filter(Boolean)
          .join(', ')
      : '-';

    const fin = emp.financial || {};
    const bankName = pickFirst(fin.bankName, fin.bank);
    const accountHolderName = pickFirst(
      fin.accountHolderName,
      fin.nameOnCard,
      fin.cardHolderName
    );
    const iban = pickFirst(fin.iban, fin.IBAN);
    const swiftCode = pickFirst(fin.swiftCode, fin.bic, fin.swift, fin.BIC);
    const taxCode = pickFirst(
      fin.taxCode,
      fin.taxIdentificationNumber,
      fin.steuerId,
      fin.taxNumber
    );
    const nationalInsuranceNumber = pickFirst(
      fin.nationalInsuranceNumber,
      fin.socialInsuranceNumber
    );

    const fields = [
      ['#displayNameText', present(displayName)],
      ['#firstNameText', present(firstName)],
      ['#lastNameText', present(lastName)],

      ['#emailText', present(email)],
      ['#mobileText', present(mobile)],

      ['#statusText', present(statusText)],
      ['#languageText', present(language)],

      ['#jobTitleText', present(jobTitle)],
      ['#weeklyHoursText', present(weeklyHoursText)],
      ['#startDateText', formatDate(startDate)],

      ['#birthDateText', formatDate(birthDate)],

      ['#streetText', present(street)],
      ['#zipText', present(zip)],
      ['#cityText', present(city)],
      ['#countryText', present(country)],

      ['#createdAtText', formatDate(createdAt)],
      ['#updatedAtText', formatDate(updatedAt)],

      ['#employeeNumberText', present(employeeNumber)],
      ['#transportationIdText', present(transportationId)],
      ['#contractEndText', formatDate(contractEnd)],

      ['#probationUntilText', formatDate(probationUntil)],
      ['#managerText', present(manager)],

      ['#genderText', present(gender)],
      ['#nationalityText', present(nationality)],

      ['#maritalStatusText', present(maritalStatus)],
      ['#childrenCountText', present(childrenCount)],
      ['#childrenListText', present(childrenList)],

      ['#bankNameText', present(bankName)],
      ['#accountHolderNameText', present(accountHolderName)],
      ['#ibanText', present(iban)],
      ['#swiftCodeText', present(swiftCode)],
      ['#taxCodeText', present(taxCode)],
      ['#nationalInsuranceNumberText', present(nationalInsuranceNumber)]
    ];

    fields.forEach(([id, val]) => {
      console.log('Setting field:', id, '=', val);
      setFieldSafe(id, val);
    });
  } catch (err) {
    console.error('Error loading employee:', err);
    setFieldSafe('#displayNameText', 'Error loading employee');
    setFieldSafe('#saveStatusText', `Fehler: ${err.message || err}`);
  }
});

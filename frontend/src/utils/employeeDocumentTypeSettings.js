export const DEFAULT_EMPLOYEE_DOCUMENT_TYPE_SETTINGS = [
  {
    type: 'Dokumente',
    exactNameEnabled: true,
    exactNames: [
      'Anmeldung_{{firstName}}_{{lastName}}',
      'Aufhenthaltstitel_{{firstName}}_{{lastName}}_hinten',
      'Aufhenthaltstitel_{{firstName}}_{{lastName}}_vorne',
      'Ausweis_{{firstName}}_{{lastName}}_hinten',
      'Ausweis_{{firstName}}_{{lastName}}_vorne',
      'Fuehrerschein_{{firstName}}_{{lastName}}_hinten',
      'Fuehrerschein_{{firstName}}_{{lastName}}_vorne',
      'Zusatzblatt_{{firstName}}_{{lastName}}_hinten',
      'Zusatzblatt_{{firstName}}_{{lastName}}_vorne',
      'Bankkonto_{{firstName}}_{{lastName}}',
      'Versicherungskarte_{{firstName}}_{{lastName}}',
      'Steuer_ID_{{firstName}}_{{lastName}}',
      'SV_Nummer_{{firstName}}_{{lastName}}',
    ],
  },
  {
    type: 'Lohnabrechnung',
    exactNameEnabled: false,
    exactNames: [],
  },
  {
    type: 'Vertrag',
    exactNameEnabled: true,
    exactNames: [
      'Arbeitsvertrag_{{firstName}}_{{lastName}}_35_St._Befristet_AlfaMile_GmbH_Stand_{{startDate}}',
      'Verlaengerungsverinbarung_zum_befristeten_Arbeitsvertrag_{{firstName}}_{{lastName}}_unterschrieben',
      'Aenderungsverinbarung_zum_Arbeitsvertrag_{{selectedDate}}_unbefristet_{{firstName}}_{{lastName}}',
      'Arbeitsvertrag_unbefristet_Vollzeit_AlfaMile_UG_{{firstName}}_{{lastName}}',
    ],
  },
  {
    type: 'Abmahnung',
    exactNameEnabled: false,
    exactNames: [],
  },
  {
    type: 'AMZL',
    exactNameEnabled: false,
    exactNames: [],
  },
  {
    type: 'Zertifikat',
    exactNameEnabled: false,
    exactNames: [],
  },
];

function cloneDefaultSettings() {
  return DEFAULT_EMPLOYEE_DOCUMENT_TYPE_SETTINGS.map((item) => ({
    type: item.type,
    exactNameEnabled: item.exactNameEnabled === true,
    exactNames: Array.isArray(item.exactNames) ? [...item.exactNames] : [],
  }));
}

function normalizeDocumentNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\\/:"*?<>|]+/g, '')
    .replace(/_+/g, '_');
}

function formatDocumentDatePart(value, fallback) {
  const normalized = String(value || '').trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return fallback;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function normalizeEmployeeDocumentTypeSettings(value) {
  const source = Array.isArray(value) && value.length ? value : cloneDefaultSettings();
  const normalized = source
    .map((item) => {
      const type = String(item?.type || '').trim();
      const exactNames = Array.isArray(item?.exactNames)
        ? item.exactNames.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
      if (!type) return null;
      return {
        type,
        exactNameEnabled: item?.exactNameEnabled === true || exactNames.length > 0,
        exactNames,
      };
    })
    .filter(Boolean);
  return normalized.length ? normalized : cloneDefaultSettings();
}

export function serializeEmployeeDocumentTypeSettings(value) {
  return JSON.stringify(normalizeEmployeeDocumentTypeSettings(value));
}

export function buildEmployeeDocumentTypeTemplateContext({
  firstName,
  lastName,
  startDate,
  selectedDate,
} = {}) {
  const safeFirstName = normalizeDocumentNamePart(firstName);
  const safeLastName = normalizeDocumentNamePart(lastName);
  const suffix = [safeFirstName, safeLastName].filter(Boolean).join('_') || 'Name_Surname';
  return {
    firstName: safeFirstName || 'Name',
    lastName: safeLastName || 'Surname',
    suffix,
    startDate: formatDocumentDatePart(startDate, 'Start_date'),
    selectedDate: formatDocumentDatePart(selectedDate, 'Select_date'),
  };
}

export function renderEmployeeDocumentTemplate(template, context = {}) {
  return String(template || '')
    .replaceAll('{{firstName}}', context.firstName || 'Name')
    .replaceAll('{{lastName}}', context.lastName || 'Surname')
    .replaceAll('{{suffix}}', context.suffix || 'Name_Surname')
    .replaceAll('{{startDate}}', context.startDate || 'Start_date')
    .replaceAll('{{selectedDate}}', context.selectedDate || 'Select_date');
}

export function buildEmployeeDocumentExactNameOptions(typeConfig, context = {}) {
  if (!typeConfig?.exactNameEnabled || !Array.isArray(typeConfig?.exactNames)) return [];
  return typeConfig.exactNames
    .map((template, index) => {
      const trimmedTemplate = String(template || '').trim();
      if (!trimmedTemplate) return null;
      const value = renderEmployeeDocumentTemplate(trimmedTemplate, context);
      return {
        key: `${typeConfig.type}-${index}`,
        template: trimmedTemplate,
        value,
        label: value,
        requiresSelectedDate: trimmedTemplate.includes('{{selectedDate}}'),
      };
    })
    .filter(Boolean);
}

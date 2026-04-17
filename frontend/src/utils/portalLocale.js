const DEFAULT_LANGUAGE = 'en';

export function normalizePortalLanguage(value) {
  return value === 'de' ? 'de' : DEFAULT_LANGUAGE;
}

export function resolvePortalLanguage(language) {
  if (language) return normalizePortalLanguage(language);
  if (typeof document !== 'undefined') {
    const documentLanguage = document.documentElement.getAttribute('data-language')
      || document.documentElement.lang
      || document.body?.getAttribute('lang');
    if (documentLanguage) {
      return String(documentLanguage).toLowerCase().startsWith('de') ? 'de' : 'en';
    }
  }
  return DEFAULT_LANGUAGE;
}

export function resolvePortalLocale(language) {
  return normalizePortalLanguage(resolvePortalLanguage(language)) === 'de' ? 'de-DE' : 'en-GB';
}

export function resolvePortalDocumentLanguage(language) {
  return normalizePortalLanguage(language) === 'de' ? 'de' : 'en';
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPortalDate(value, language, options = {}) {
  const date = coerceDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(resolvePortalLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatPortalDateTime(value, language, options = {}) {
  const date = coerceDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(resolvePortalLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatPortalTime(value, language, options = {}) {
  const date = coerceDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(resolvePortalLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatPortalNumber(value, language, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString(resolvePortalLocale(language), options);
}

export function formatPortalCurrency(value, language, currency = 'EUR', options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat(resolvePortalLocale(language), {
    style: 'currency',
    currency,
    ...options,
  }).format(number);
}

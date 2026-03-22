/**
 * @param {unknown} v
 * @returns {string | null} YYYY-MM-DD or null
 */
export function toIsoDateOnly(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Human-readable cell for PAVE Gmail tables (date-only preferred).
 * @param {unknown} v
 */
export function formatPaveInspectionDate(v) {
  if (v == null || v === '') return '—';
  const iso = toIsoDateOnly(v);
  if (iso) return iso;
  if (typeof v === 'string') return v.slice(0, 19).replace('T', ' ') || '—';
  return String(v);
}

/**
 * Short hint when displayed date is a fallback (not parsed inspection_date).
 * @param {object} r API row with inspection_date_effective
 */
export function paveInspectionDateHint(r) {
  if (!r || typeof r !== 'object') return null;
  const eff = toIsoDateOnly(r.inspection_date_effective);
  if (!eff) return null;
  if (toIsoDateOnly(r.inspection_date) === eff) return null;
  if (toIsoDateOnly(r.report_date) === eff) return 'report date';
  if (toIsoDateOnly(r.incident_date) === eff) return 'incident date';
  if (r.source_email_received_at && toIsoDateOnly(r.source_email_received_at) === eff) return 'email received';
  return null;
}

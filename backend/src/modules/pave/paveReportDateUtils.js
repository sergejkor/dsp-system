/**
 * Normalize DB/driver values to YYYY-MM-DD for API/UI.
 * @param {unknown} v
 * @returns {string | null}
 */
export function asIsoDateOnly(v) {
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
 * Best date to show as "inspection date" in lists/detail.
 * @param {object} pr pave_reports row
 * @param {unknown} [emailReceivedAt] incoming_emails.received_at
 * @returns {string | null} YYYY-MM-DD
 */
export function effectiveInspectionDate(pr, emailReceivedAt) {
  if (!pr || typeof pr !== 'object') return null;
  return (
    asIsoDateOnly(pr.inspection_date) ||
    asIsoDateOnly(pr.report_date) ||
    asIsoDateOnly(pr.incident_date) ||
    (emailReceivedAt != null ? asIsoDateOnly(emailReceivedAt) : null)
  );
}

/**
 * Attach display field for Gmail report API consumers.
 * @param {object} row DB row (may include source_email_received_at)
 */
export function withInspectionDateEffective(row) {
  if (!row || typeof row !== 'object') return row;
  const effective = effectiveInspectionDate(row, row.source_email_received_at);
  return { ...row, inspection_date_effective: effective };
}

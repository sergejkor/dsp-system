/**
 * Normalize inspection date strings from PAVE HTML/PDF (EN/DE, ordinals, @ UTC suffix).
 * @param {unknown} raw
 * @returns {string | null} YYYY-MM-DD
 */
export function inspectionRawToIsoDate(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim();
  s = s.replace(/\s+@\s*[\d:APM\s]+(?:UTC|GMT|CEST|CET|BST)?/i, '').trim();
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim();
  s = s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');

  const isoHead = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoHead) return `${isoHead[1]}-${isoHead[2]}-${isoHead[3]}`;

  const m1 = s.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

  const m2 = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
  if (m2) return `${m2[3]}-${String(m2[2]).padStart(2, '0')}-${String(m2[1]).padStart(2, '0')}`;

  const dmy = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  const dmyShort = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})$/);
  if (dmyShort) {
    let y = parseInt(dmyShort[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(dmyShort[2]).padStart(2, '0')}-${String(dmyShort[1]).padStart(2, '0')}`;
  }

  const MONTH = new Map(
    Object.entries({
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      sept: 9,
      oct: 10,
      nov: 11,
      dec: 12,
      januar: 1,
      februar: 2,
      märz: 3,
      maerz: 3,
      mai: 5,
      juni: 6,
      juli: 7,
      oktober: 10,
      dezember: 12,
    }),
  );

  const enMonthFirst = s.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})\s*,?\s*(\d{4})/i,
  );
  if (enMonthFirst) {
    const mo = MONTH.get(enMonthFirst[1].toLowerCase());
    if (mo)
      return `${enMonthFirst[3]}-${String(mo).padStart(2, '0')}-${String(enMonthFirst[2]).padStart(2, '0')}`;
  }

  const enDayFirst = s.match(
    /^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s*,?\s*(\d{4})/i,
  );
  if (enDayFirst) {
    const mo = MONTH.get(enDayFirst[2].toLowerCase());
    if (mo)
      return `${enDayFirst[3]}-${String(mo).padStart(2, '0')}-${String(enDayFirst[1]).padStart(2, '0')}`;
  }

  const deWord = s.match(
    /^(\d{1,2})\.\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(\d{4})/i,
  );
  if (deWord) {
    const mo = MONTH.get(deWord[2].toLowerCase());
    if (mo) {
      return `${deWord[3]}-${String(mo).padStart(2, '0')}-${String(deWord[1]).padStart(2, '0')}`;
    }
  }

  const mdy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${String(mdy[1]).padStart(2, '0')}-${String(mdy[2]).padStart(2, '0')}`;
  }

  const retry = s.replace(/^[^\d]*/, '').trim();
  if (retry !== s) return inspectionRawToIsoDate(retry);

  return null;
}

/**
 * KPI formulas for scorecard_employees: CDF score and Total Score.
 * Excel column mapping: C=dcr, D=dsc_dpmo, E=lor_dpmo, F=pod, G=cc, H=ce, I=cdf_dpmo, J=cdf(computed).
 */

function isMissing(s) {
  if (s == null || s === undefined) return true;
  const t = String(s).trim();
  return t === '' || t === '-';
}

/** Parse number from string; "-" or empty -> null. "99.5%" -> 0.995, "100" -> 100. */
function parseNum(s) {
  if (isMissing(s)) return null;
  const t = String(s).trim().replace(/%/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** For D/E/H: "-" or empty -> 0. */
function parseNumZero(s) {
  const n = parseNum(s);
  return n == null ? 0 : n;
}

/** For C (dcr): "99.5%" -> 0.995. Used as decimal in Total. */
function parseDcr(s) {
  if (isMissing(s)) return null;
  const t = String(s).trim();
  if (t.includes('%')) {
    const n = parseFloat(t.replace(/%/g, ''));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? (n > 1 ? n / 100 : n) : null;
}

/** For F/G (pod, cc): "-" -> 1, else parse as decimal (99% -> 0.99). */
function parsePctOne(s) {
  if (isMissing(s)) return 1;
  const t = String(s).trim();
  if (t.includes('%')) {
    const n = parseFloat(t.replace(/%/g, ''));
    return Number.isFinite(n) ? n / 100 : 1;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? (n > 1 ? n / 100 : n) : 1;
}

/**
 * CDF formula from I2 (cdf_dpmo).
 * If value contains "-" or empty -> 0.
 * Then piecewise linear.
 */
export function computeCDF(cdfDpmo) {
  const x = parseNumZero(cdfDpmo);
  if (x <= 1380) return 1 + (-0.000050724637681) * x;
  if (x <= 3680) return 0.93 + (-0.000034782608696) * (x - 1380);
  if (x <= 4860) return 0.85 + (-0.000127118644068) * (x - 3680);
  if (x <= 5460) return 0.7 + (-0.000333333333333) * (x - 4860);
  return Math.max(0, 0.5 + (-0.000025583982322) * (x - 5460));
}

/**
 * Total Score formula.
 * C2=dcr, D2=dsc_dpmo, E2=lor_dpmo, F2=pod, G2=cc, H2=ce, J2=cdf (computed).
 */
export function computeTotalScore(row) {
  const b = parseNumZero(row.delivered); // B2 (delivered) - used for penalty
  const c = parseDcr(row.dcr) ?? 0;       // C2
  const d = parseNumZero(row.dsc_dpmo);  // D2
  const e = parseNumZero(row.lor_dpmo);  // E2
  const f = parsePctOne(row.pod);        // F2
  const g = parsePctOne(row.cc);         // G2
  const h = parseNumZero(row.ce);        // H2 (CE: 0 if "-" gives 100 pts)
  const j = row.cdf != null ? Number(row.cdf) : computeCDF(row.cdf_dpmo); // J2

  // DCR component * 0.2
  let partC = 0;
  if (c >= 0.99) partC = 1000 * c - 900;
  else if (c >= 0.985) partC = 2000 * c - 1890;
  else if (c >= 0.97) partC = (2000 / 3) * c - 576.68;
  partC *= 0.2;

  // DSC DPMO (D2) * 0.275
  let partD = 0;
  if (d === 0) partD = 100;
  else if (d <= 440) partD = d * (-0.0255) + 100;
  else if (d <= 520) partD = d * (-0.0857) + 157.143;
  else if (d <= 660) partD = d * (-0.0222) + 55.52;
  partD *= 0.275;

  // POD (F2) * 0.125
  let partF = 0;
  if (f >= 0.97) partF = f * 275 - 175;
  else if (f >= 0.95) partF = f * 104.9647 - 10.074;
  partF *= 0.125;

  // CC (G2) * 0.15
  let partG = 0;
  if (g >= 0.98) partG = g * 421.056 - 321.056;
  else if (g >= 0.9) partG = g * 104 - 20;
  partG *= 0.15;

  // CE (H2): 0 -> 100, else 0; * 0.125
  const partH = (h === 0 ? 100 : 0) * 0.125;

  // CDF (J2) * 0.125
  let partJ = 0;
  if (j >= 0.85) partJ = 8.32 * j + 91.68;
  else if (j >= 0.78) partJ = 31.29 * j + 71.832;
  partJ *= 0.125;

  // Penalties: formula says C2>10000/-4000; C in Excel is DCR. Using B2 (delivered) for 10000/4000 threshold.
  let pen1 = 0;
  if (b > 10000) pen1 = 20;
  else if (b > 4000) pen1 = 10;

  // E2>5000 -> -15, E2>0 -> -10
  let pen2 = 0;
  if (e > 5000) pen2 = 15;
  else if (e > 0) pen2 = 10;

  const total = partC + partD + partF + partG + partH + partJ - pen1 - pen2;
  return Math.round(total * 100) / 100;
}

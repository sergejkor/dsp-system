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
export function computeTotalScore(row, opts = {}) {
  const cfg = (key, def) => {
    const n = Number(opts?.[key]);
    return Number.isFinite(n) ? n : def;
  };
  const b = parseNumZero(row.delivered); // B2 (delivered) - used for penalty
  const c = parseDcr(row.dcr) ?? 0;       // C2
  const d = parseNumZero(row.dsc_dpmo);  // D2
  const e = parseNumZero(row.lor_dpmo);  // E2
  const f = parsePctOne(row.pod);        // F2
  const g = parsePctOne(row.cc);         // G2
  const h = parseNumZero(row.ce);        // H2 (CE: 0 if "-" gives 100 pts)
  const j = row.cdf != null ? Number(row.cdf) : computeCDF(row.cdf_dpmo); // J2

  // KPI-configurable thresholds for UI labels (Fantastic/Great/Fair).
  const dThrFantastic = cfg('dsc_dpmo_fantastic_max', 440);
  const dThrGreat = cfg('dsc_dpmo_great_max', 520);
  const dThrFair = cfg('dsc_dpmo_fair_max', 660);
  const d1 = Math.max(0, Math.min(dThrFantastic, dThrGreat, dThrFair));
  const d2 = Math.max(d1, Math.min(dThrGreat, dThrFair));
  const d3 = Math.max(d2, dThrFair);

  // DCR component * 0.2
  let partC = 0;
  if (c >= cfg('scorecard_c_thr_1', 0.99)) partC = cfg('scorecard_c_slope_1', 1000) * c + cfg('scorecard_c_intercept_1', -900);
  else if (c >= cfg('scorecard_c_thr_2', 0.985)) partC = cfg('scorecard_c_slope_2', 2000) * c + cfg('scorecard_c_intercept_2', -1890);
  else if (c >= cfg('scorecard_c_thr_3', 0.97)) partC = cfg('scorecard_c_slope_3', 2000 / 3) * c + cfg('scorecard_c_intercept_3', -576.68);
  partC *= cfg('scorecard_weight_c', 0.2);

  // DSC DPMO (D2) * 0.275
  let partD = 0;
  if (d === 0) partD = cfg('scorecard_d_zero_value_score', 100);
  else if (d <= d1) partD = d * cfg('scorecard_d_slope_1', -0.0255) + cfg('scorecard_d_intercept_1', 100);
  else if (d <= d2) partD = d * cfg('scorecard_d_slope_2', -0.0857) + cfg('scorecard_d_intercept_2', 157.143);
  else if (d <= d3) partD = d * cfg('scorecard_d_slope_3', -0.0222) + cfg('scorecard_d_intercept_3', 55.52);
  partD *= cfg('scorecard_weight_d', 0.275);

  // POD (F2) * 0.125
  let partF = 0;
  if (f >= cfg('scorecard_f_thr_1', 0.97)) partF = f * cfg('scorecard_f_slope_1', 275) + cfg('scorecard_f_intercept_1', -175);
  else if (f >= cfg('scorecard_f_thr_2', 0.95)) partF = f * cfg('scorecard_f_slope_2', 104.9647) + cfg('scorecard_f_intercept_2', -10.074);
  partF *= cfg('scorecard_weight_f', 0.125);

  // CC (G2) * 0.15
  let partG = 0;
  if (g >= cfg('scorecard_g_thr_1', 0.98)) partG = g * cfg('scorecard_g_slope_1', 421.056) + cfg('scorecard_g_intercept_1', -321.056);
  else if (g >= cfg('scorecard_g_thr_2', 0.9)) partG = g * cfg('scorecard_g_slope_2', 104) + cfg('scorecard_g_intercept_2', -20);
  partG *= cfg('scorecard_weight_g', 0.15);

  // CE (H2): 0 -> 100, else 0; * 0.125
  const partH = (h === 0 ? cfg('scorecard_h_zero_value_score', 100) : 0) * cfg('scorecard_weight_h', 0.125);

  // CDF (J2) * 0.125
  let partJ = 0;
  if (j >= cfg('scorecard_j_thr_1', 0.85)) partJ = cfg('scorecard_j_slope_1', 8.32) * j + cfg('scorecard_j_intercept_1', 91.68);
  else if (j >= cfg('scorecard_j_thr_2', 0.78)) partJ = cfg('scorecard_j_slope_2', 31.29) * j + cfg('scorecard_j_intercept_2', 71.832);
  partJ *= cfg('scorecard_weight_j', 0.125);

  // Penalties: formula says C2>10000/-4000; C in Excel is DCR. Using B2 (delivered) for 10000/4000 threshold.
  let pen1 = 0;
  if (b > cfg('scorecard_pen1_thr_high', 10000)) pen1 = cfg('scorecard_pen1_amount_high', 20);
  else if (b > cfg('scorecard_pen1_thr_mid', 4000)) pen1 = cfg('scorecard_pen1_amount_mid', 10);

  // E2>5000 -> -15, E2>0 -> -10
  let pen2 = 0;
  if (e > cfg('scorecard_pen2_thr_high', 5000)) pen2 = cfg('scorecard_pen2_amount_high', 15);
  else if (e > cfg('scorecard_pen2_thr_mid', 0)) pen2 = cfg('scorecard_pen2_amount_mid', 10);

  const total = partC + partD + partF + partG + partH + partJ - pen1 - pen2;
  return Math.round(total * 100) / 100;
}

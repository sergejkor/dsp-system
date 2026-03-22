/**
 * PAVE dashboard — extract summary fields from the live report DOM using label → value relationships.
 * Does not rely on whole-page textContent regex for primary fields (INSPEKTIONSDATUM, FIN/VIN, BAUJAHR/MARKE/MODELL).
 */

import fs from 'fs/promises';
import path from 'path';
import { inspectionRawToIsoDate } from '../../../paveInspectionDateParse.js';

function envBool(name, def = false) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

/**
 * DOM sometimes returns a section title (e.g. "INFORMATION") as the vehicle value; ignore those
 * so merge can fall back to email subject ("… of 2026 MERCEDES …") or PDF.
 * @param {unknown} v
 * @returns {boolean}
 */
export function isGarbageVehicleLabel(v) {
  if (v == null || v === '') return true;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (s.length < 3) return true;
  const u = s.toUpperCase();
  // Single-token UI headings / placeholders (not a real year+make+model line)
  if (/^(INFORMATION|INFORMATIONEN|DETAIL|DETAILS|VEHICLE|VEHICLES|FAHRZEUG|FAHRZEUGE)$/i.test(s)) return true;
  if (/^(SUMMARY|OVERVIEW|SECTION|TITLE|REPORT|DATA|ZUSTAND|STATUS|N\/A|NA|\?)$/i.test(s)) return true;
  if (/^(MODEL|MODELL|MAKE|MARKE|TYPE|TYP)$/i.test(s)) return true;
  if (/^FAHRZEUG\s*INFORMATION(EN)?$/i.test(s)) return true;
  // PDF / portal title lines mistaken for vehicle (e.g. "Vehicle Condition Report" → "Condition Report")
  if (/^(vehicle\s+)?condition\s+report$/i.test(s)) return true;
  if (/^vehicle\s+photos?$/i.test(s)) return true;
  // EN portal: colour rows mistaken for "vehicle" when table/sibling layout shifts
  if (/\bEXTERIOR\s+(COLOUR|COLOR)\b/i.test(s) && /\bINTERIOR\s+(COLOUR|COLOR)\b/i.test(s)) return true;
  // "INFORMATION" as substring-only short label
  if (u === 'INFO' || u === 'I') return true;
  return false;
}

/**
 * DOM label→value pairing sometimes puts the composite vehicle line into the FIN/VIN field.
 * @param {unknown} v
 * @returns {boolean}
 */
export function isLikelyWrongVinFromDom(v) {
  if (v == null || v === '') return false;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (/\bYEAR\b.*\bMAKE\b.*\bMODEL\b/i.test(s)) return true;
  if (/\bBAUJAHR\b.*\bMARKE\b.*\bMODELL\b/i.test(s)) return true;
  return false;
}

function snapshotOnFailureEnabled() {
  return envBool('PAVE_PORTAL_DEBUG', false) || envBool('PAVE_HTML_SUMMARY_SNAPSHOT_ON_FAIL', false);
}

function gradeMissSnapshotEnabled() {
  return (
    envBool('PAVE_PORTAL_DEBUG', false) ||
    envBool('PAVE_HTML_GRADE_SNAPSHOT_ON_MISS', false) ||
    envBool('PAVE_HTML_SUMMARY_SNAPSHOT_ON_FAIL', false)
  );
}

/**
 * Find value for the first matching label among `labels` (German/uppercase tolerant).
 * @param {import('playwright').Page} page
 * @param {string[]} labels
 * @returns {Promise<{ value: string | null, matchedLabel: string | null, method: string | null }>}
 */
export async function extractValueByLabel(page, labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return { value: null, matchedLabel: null, method: null };
  }
  const labelsUpper = labels.map((l) => String(l).trim().toUpperCase()).filter(Boolean);
  return page.evaluate((labelsUpper) => {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/^:+\s*|\s*:+$/g, '');
    const normalizeKey = (s) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[\s:]+|[\s:]+$/g, '')
        .toUpperCase();
    /** German labels often use "BAUJAHR, MARKE, MODELL" — normalize commas/spaces for comparison */
    const normLabel = (s) =>
      normalizeKey(String(s || '').replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' '));
    function matchesLabel(key, L) {
      const k = normalizeKey(key);
      const kn = normLabel(key);
      const cu = L.toUpperCase();
      const Ln = normLabel(L);
      if (!k || !cu) return false;
      if (k === cu || kn === Ln) return true;
      if (k === `${cu}:` || k.startsWith(`${cu}:`)) return true;
      if (k.startsWith(`${cu} `)) return true;
      if (kn === `${Ln}:` || kn.startsWith(`${Ln}:`)) return true;
      if (kn.startsWith(`${Ln} `)) return true;
      return false;
    }
    function matchesAny(key) {
      const kn = normLabel(key);
      for (const L of labelsUpper) {
        if (matchesLabel(key, L)) return L;
        const Ln = normLabel(L);
        if (kn === Ln || kn.startsWith(`${Ln}:`) || kn.startsWith(`${Ln} `)) return L;
      }
      return null;
    }
    for (const tr of document.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll('th,td')];
      if (cells.length < 2) continue;
      for (let i = 0; i < cells.length - 1; i++) {
        const keyText = clean(cells[i].innerText);
        const hit = matchesAny(keyText);
        if (hit) {
          const valCell = cells[i + 1];
          const v = clean(valCell ? valCell.innerText : '');
          if (v && normalizeKey(v) !== hit.toUpperCase()) {
            return { value: v, matchedLabel: hit, method: 'table_row' };
          }
        }
      }
    }
    for (const dt of document.querySelectorAll('dt')) {
      const keyText = clean(dt.innerText);
      const hit = matchesAny(keyText);
      if (!hit) continue;
      let el = dt.nextElementSibling;
      while (el && el.tagName !== 'DD') el = el.nextElementSibling;
      if (el) {
        const v = clean(el.innerText);
        if (v) return { value: v, matchedLabel: hit, method: 'dl_dd' };
      }
    }
    const tagSelector = 'div, span, p, label, strong, b, h1, h2, h3, h4, h5, h6, th, td';
    for (const el of document.querySelectorAll(tagSelector)) {
      if (el.children.length > 3) continue;
      const keyText = clean(el.innerText);
      if (!keyText || keyText.length > 64) continue;
      const hit = matchesAny(keyText);
      if (!hit) continue;
      const sib = el.nextElementSibling;
      if (sib) {
        const v = clean(sib.innerText);
        if (v && v.length <= 500 && normalizeKey(v) !== hit.toUpperCase()) {
          return { value: v, matchedLabel: hit, method: 'next_sibling' };
        }
      }
      const parent = el.parentElement;
      if (parent) {
        const kids = [...parent.children];
        const idx = kids.indexOf(el);
        if (idx >= 0 && idx < kids.length - 1) {
          const v = clean(kids[idx + 1].innerText);
          if (v && v.length <= 500 && normalizeKey(v) !== hit.toUpperCase()) {
            return { value: v, matchedLabel: hit, method: 'parent_next_child' };
          }
        }
      }
    }
    /** Same element: "INSPECTION DATE March 4, 2026 …" (flex / card UIs, no sibling value cell) */
    const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelSourceRx = (L) => {
      const words = L.split(/\s+/).filter(Boolean).map(escapeRe);
      if (!words.length) return null;
      return new RegExp(`^${words.join('\\s+')}\\s*[:\u2013\u2014\\-]*\\s*(.+)$`, 'i');
    };
    for (const el of document.querySelectorAll('div,span,p,li,td,th,label')) {
      const full = clean(el.innerText);
      if (!full || full.length > 220) continue;
      for (const L of labelsUpper) {
        const re = labelSourceRx(L);
        if (!re) continue;
        const m = full.match(re);
        if (!m || !m[1]) continue;
        const v = clean(m[1]);
        if (v && normalizeKey(v) !== L) {
          return { value: v, matchedLabel: L, method: 'inline_same_element' };
        }
      }
    }
    return { value: null, matchedLabel: null, method: null };
  }, labelsUpper);
}

/**
 * Real PAVE report: one block labeled "BAUJAHR, MARKE, MODELL" with value e.g. "2019 PEUGEOT BOXER".
 * DOM-based only (no page-wide regex).
 * @param {import('playwright').Page} page
 * @returns {Promise<{ value: string | null, method: string | null }>}
 */
export async function extractPaveVehicleCompositeLine(page) {
  return page.evaluate(() => {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/^:+\s*|\s*:+$/g, '');
    const norm = (s) =>
      clean(s)
        .toUpperCase()
        .replace(/\s*,\s*/g, ' ')
        .replace(/\s+/g, ' ');
    const labelHasVehicleTriple = (text) => {
      const t = norm(text);
      const de = t.includes('BAUJAHR') && t.includes('MARKE') && t.includes('MODELL');
      const en = t.includes('YEAR') && t.includes('MAKE') && t.includes('MODEL');
      return de || en;
    };
    for (const tr of document.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll('th,td')];
      for (let i = 0; i < cells.length - 1; i++) {
        if (!labelHasVehicleTriple(cells[i].innerText)) continue;
        const v = clean(cells[i + 1].innerText);
        if (v && !labelHasVehicleTriple(v)) {
          return { value: v, method: 'tr_composite_baujahr_marke_modell' };
        }
      }
    }
    for (const dt of document.querySelectorAll('dt')) {
      if (!labelHasVehicleTriple(dt.innerText)) continue;
      let el = dt.nextElementSibling;
      while (el && el.tagName !== 'DD') el = el.nextElementSibling;
      if (el) {
        const v = clean(el.innerText);
        if (v) return { value: v, method: 'dl_composite_baujahr_marke_modell' };
      }
    }
    const tagSelector = 'div, span, p, label, strong, b, th, td';
    for (const el of document.querySelectorAll(tagSelector)) {
      if (el.children.length > 4) continue;
      const raw = clean(el.innerText);
      if (raw.length > 96) continue;
      if (!labelHasVehicleTriple(raw)) continue;
      const sib = el.nextElementSibling;
      if (sib) {
        const v = clean(sib.innerText);
        if (v && v.length <= 500 && !labelHasVehicleTriple(v)) {
          return { value: v, method: 'next_sibling_composite_vehicle' };
        }
      }
      const parent = el.parentElement;
      if (parent) {
        const kids = [...parent.children];
        const idx = kids.indexOf(el);
        if (idx >= 0 && idx < kids.length - 1) {
          const v = clean(kids[idx + 1].innerText);
          if (v && v.length <= 500 && !labelHasVehicleTriple(v)) {
            return { value: v, method: 'parent_next_child_composite_vehicle' };
          }
        }
      }
    }
    return { value: null, method: null };
  });
}

function parseNum(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cleanOneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function clampGrade15(v) {
  if (v == null || v === '') return null;
  const x = Math.round(Number(v));
  if (x >= 1 && x <= 5) return x;
  return null;
}

/**
 * PAVE-specific: scan upper report area for overall vehicle grade (1–5) and optional text label (FAIR, GUT, …).
 * Uses bounded DOM traversal (no whole-document text dump).
 * @returns {Promise<{
 *   total_grade: number | null,
 *   total_grade_label: string | null,
 *   top_score_text: string | null,
 *   gradeTrace: { ok: boolean, strategies: object[], numericSource: string | null }
 * }>}
 */
export async function extractGradeFromTopSummary(page) {
  return page.evaluate(() => {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const strategies = [];
    const fail = (name, detail) => {
      strategies.push({ name, ok: false, detail });
    };
    const ok = (name, detail) => {
      strategies.push({ name, ok: true, detail });
    };

    const clamp15 = (n) => {
      if (n == null || Number.isNaN(n)) return null;
      const x = Math.round(Number(n));
      if (x >= 1 && x <= 5) return x;
      return null;
    };

    /** English / German KPI-style labels (not the table header key). */
    const DESCRIPTIVE_RX =
      /\b(POOR|FAIR|GREAT|GOOD|VERY\s*GOOD|EXCELLENT|BAD|AVERAGE|SEHR\s*GUT|GUT|BEFRIEDIGEND|AUSREICHEND|MASS?LICH|MAßLICH|UNGENÜGEND|MANGELHAFT|AUSGEZEICHNET)\b/i;

    const extractDescriptiveFromText = (t) => {
      const m = String(t || '').match(DESCRIPTIVE_RX);
      return m ? m[0].replace(/\s+/g, ' ').trim() : null;
    };

    const parseGradeToken = (raw) => {
      const s = clean(raw);
      if (!s) return { num: null, label: null };
      let m = s.match(/^([1-5])\s*\/\s*5$/);
      if (m) return { num: clamp15(m[1]), label: extractDescriptiveFromText(s) };
      m = s.match(/\b([1-5])\s*\/\s*5\b/);
      if (m) return { num: clamp15(m[1]), label: extractDescriptiveFromText(s) };
      m = s.match(/^\s*([1-5])\s*$/);
      if (m) return { num: clamp15(m[1]), label: null };
      m = s.match(/\bnote\s*[:\-]?\s*([1-5])\b/i);
      if (m) return { num: clamp15(m[1]), label: extractDescriptiveFromText(s) };
      const n = parseFloat(s.replace(',', '.').replace(/[^\d.-]/g, ''));
      const num = clamp15(n);
      return { num, label: num != null ? extractDescriptiveFromText(s) : null };
    };

    const viewportH = typeof window.innerHeight === 'number' ? window.innerHeight : 800;
    const maxTop = Math.min(1400, viewportH * 2.2);

    const inTopBand = (el) => {
      const r = el.getBoundingClientRect();
      return r.top >= -40 && r.top <= maxTop && r.width > 0 && r.height > 0;
    };

    let total_grade = null;
    let total_grade_label = null;
    let top_score_text = null;
    let numericSource = null;

    // --- Strategy: data-* attributes common in widgets ---
    const dataAttrs = ['data-score', 'data-grade', 'data-value', 'data-rating', 'data-note'];
    for (const sel of ['[data-score]', '[data-grade]', '[data-rating]', '[data-note]']) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (!inTopBand(el)) continue;
        for (const a of dataAttrs) {
          const v = el.getAttribute(a);
          if (!v) continue;
          const { num, label } = parseGradeToken(v);
          if (num != null) {
            total_grade = num;
            numericSource = `attr:${a}=${v}`;
            top_score_text = clean(v).slice(0, 120);
            const fromEl = extractDescriptiveFromText(el.innerText);
            total_grade_label = label || fromEl || null;
            ok('data_attribute', { attr: a, value: v, rectTop: el.getBoundingClientRect().top });
            return {
              total_grade,
              total_grade_label,
              top_score_text,
              gradeTrace: { ok: true, strategies, numericSource },
            };
          }
        }
      }
    }
    fail('data_attribute', 'no data-score/grade/rating/note with 1–5 in top band');

    // --- Strategy: [role="meter"] aria-valuenow ---
    for (const el of document.querySelectorAll('[role="meter"], [role="progressbar"]')) {
      if (!inTopBand(el)) continue;
      const raw = el.getAttribute('aria-valuenow') || el.getAttribute('aria-valuetext') || '';
      const { num, label } = parseGradeToken(raw || el.innerText);
      if (num != null) {
        total_grade = num;
        numericSource = 'aria-meter';
        top_score_text = clean(raw || el.innerText).slice(0, 120);
        total_grade_label = label || extractDescriptiveFromText(el.innerText);
        ok('aria_meter', { raw: raw.slice(0, 80) });
        return { total_grade, total_grade_label, top_score_text, gradeTrace: { ok: true, strategies, numericSource } };
      }
    }
    fail('aria_meter', 'no aria-valuenow/text with 1–5 in top band');

    // --- Strategy: small text nodes that are only "4" or "4 / 5" in top band ---
    const tagHints = 'h1,h2,h3,h4,.score,.grade,.note,.bewertung,.rating,[class*="score"],[class*="grade"],[class*="note"],[class*="bewertung"],[class*="Summary"],[class*="summary"]';
    const pool = new Set();
    for (const root of [
      document.querySelector('header'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('[role="banner"]'),
      document.body,
    ]) {
      if (!root) continue;
      root.querySelectorAll(tagHints).forEach((el) => pool.add(el));
      if (pool.size > 400) break;
    }
    for (const el of pool) {
      if (!inTopBand(el)) continue;
      const t = clean(el.innerText);
      if (!t || t.length > 64) continue;
      const { num, label } = parseGradeToken(t);
      if (num != null) {
        total_grade = num;
        numericSource = 'compact_text_widget';
        top_score_text = t.slice(0, 120);
        let desc = label;
        if (!desc && el.parentElement) {
          desc = extractDescriptiveFromText(el.parentElement.innerText || '');
        }
        total_grade_label = desc || null;
        ok('compact_text_widget', { text: t, tag: el.tagName, className: (el.className && String(el.className).slice(0, 120)) || '' });
        return { total_grade, total_grade_label, top_score_text, gradeTrace: { ok: true, strategies, numericSource } };
      }
    }
    fail('compact_text_widget', 'no 1–5-only / n/5 text in hinted elements (top band)');

    // --- Strategy: walk limited set of elements in top band by getBoundingClientRect ---
    let checked = 0;
    const maxChecks = 600;
    const walk = document.body;
    if (walk) {
      const all = walk.querySelectorAll('div,span,p,strong,b,em,td,th,li');
      for (const el of all) {
        if (checked++ > maxChecks) break;
        if (!inTopBand(el)) continue;
        if (el.children.length > 2) continue;
        const t = clean(el.innerText);
        if (!t || t.length > 48) continue;
        const { num, label } = parseGradeToken(t);
        if (num != null) {
          total_grade = num;
          numericSource = 'top_band_scan';
          top_score_text = t.slice(0, 120);
          let desc = label;
          if (!desc && el.parentElement) desc = extractDescriptiveFromText(el.parentElement.innerText || '');
          total_grade_label = desc || null;
          ok('top_band_scan', { text: t, index: checked });
          return { total_grade, total_grade_label, top_score_text, gradeTrace: { ok: true, strategies, numericSource } };
        }
      }
    }
    fail('top_band_scan', `no match in first ${maxChecks} shallow elements`);

    return {
      total_grade: null,
      total_grade_label: null,
      top_score_text: null,
      gradeTrace: { ok: false, strategies, numericSource: null },
    };
  });
}

const GRADE_DOM_LABELS = [
  'GESAMTNOTE',
  'GESAMTNOTE Fahrzeug',
  'GESAMTBEWERTUNG',
  'ZUSTANDSBEWERTUNG',
  'FAHRZEUGNOTE',
  'ENDNOTE',
  'OVERALL GRADE',
  'OVERALL SCORE',
  'VEHICLE GRADE',
  'VEHICLE SCORE',
  'TOTAL SCORE',
  'CONDITION SCORE',
  'TOTAL GRADE',
  'GRADE',
  'GESAMT',
  'NOTE',
  'BEWERTUNG',
  'SCORE',
];

const DAMAGE_SCORE_DOM_LABELS = [
  'TOTAL DAMAGE SCORE',
  'DAMAGE SCORE',
  'TOTAL SCHADEN',
  'GESAMTSCHADEN',
  'GESAMT SCHADEN',
  'SCHADENSPUNKTZAHL',
  'SCHADENS SCORE',
  'SCHADENSSCORE',
];

const FRONT_SCORE_DOM_LABELS = ['FRONT SCORE', 'FRONT SIDE SCORE', 'FRONT', 'VORNE'];
const BACK_SCORE_DOM_LABELS = ['REAR SCORE', 'BACK SCORE', 'REAR', 'BACK', 'HINTEN', 'HECK'];
const LEFT_SCORE_DOM_LABELS = ['LEFT SCORE', 'LEFT SIDE SCORE', 'LEFT', 'LINKS'];
const RIGHT_SCORE_DOM_LABELS = ['RIGHT SCORE', 'RIGHT SIDE SCORE', 'RIGHT', 'RECHTS'];

/**
 * @param {import('playwright').Page} page
 * @param {string[]} labels
 * @returns {Promise<{ n: number | null, meta: object | null }>}
 */
async function extractNumericLabelValue(page, labels) {
  const res = await extractValueByLabel(page, labels);
  if (!res.value) return { n: null, meta: null };
  const raw = cleanOneLine(res.value);
  const n = parseNum(raw);
  if (n == null || Number.isNaN(n)) return { n: null, meta: { ...res, raw } };
  return { n, meta: { matchedLabel: res.matchedLabel, method: res.method, raw } };
}

/**
 * Label → value pairs anywhere (fallback after top summary).
 */
async function extractGradeFromDom(page) {
  const { value, matchedLabel, method } = await extractValueByLabel(page, GRADE_DOM_LABELS);
  if (!value) return { total_grade: null, total_grade_label: null, top_score_text: null, gradeMeta: null };
  const s = cleanOneLine(value);
  let num = null;
  const m1 = s.match(/^([1-5])\s*\/\s*5$/);
  if (m1) num = clampGrade15(m1[1]);
  else {
    const m2 = s.match(/\b([1-5])\s*\/\s*5\b/);
    if (m2) num = clampGrade15(m2[1]);
    else {
      const n = parseNum(s);
      num = clampGrade15(n);
      if (num == null && n != null && n >= 0 && n <= 100) num = n;
    }
  }
  const descriptive = (() => {
    const rx =
      /\b(POOR|FAIR|GREAT|GOOD|VERY\s*GOOD|EXCELLENT|SEHR\s*GUT|GUT|BEFRIEDIGEND|AUSREICHEND|MASS?LICH|MAßLICH)\b/i;
    const m = s.match(rx);
    return m ? m[0].replace(/\s+/g, ' ').trim() : null;
  })();
  const top = s.slice(0, 120);
  return {
    total_grade: num,
    total_grade_label: descriptive || null,
    domMatchedKey: matchedLabel || null,
    top_score_text: top,
    gradeMeta: { matchedLabel, method, rawValue: value },
  };
}

/**
 * Save HTML + log URL/title when DOM extraction could not find core fields.
 * @param {import('playwright').Page} page
 * @param {object} [meta]
 */
/**
 * When the report page appears loaded but overall grade could not be read from the DOM.
 * @param {import('playwright').Page} page
 * @param {object} [meta]
 */
export async function savePaveGradeMissSnapshot(page, meta = {}) {
  const dir = path.resolve(process.cwd(), 'backend-uploads/pave-html-extract-debug');
  await fs.mkdir(dir, { recursive: true });
  const stamp = Date.now();
  const fileBase = path.join(dir, `${stamp}_grade_miss`);
  let htmlPath = null;
  try {
    const html = await page.content();
    htmlPath = `${fileBase}.html`;
    await fs.writeFile(htmlPath, html, 'utf8');
  } catch (e) {
    console.log('[pave-html-summary] could not write grade-miss HTML snapshot', String(e?.message || e));
  }
  const url = page.url();
  const title = await page.title().catch(() => '');
  console.log('[pave-html-summary] grade block not found — debug snapshot', {
    htmlPath,
    url,
    title: title.slice(0, 200),
    reason: 'grade_block_not_found',
    ...meta,
  });
}

export async function savePaveHtmlExtractionFailureSnapshot(page, meta = {}) {
  const dir = path.resolve(process.cwd(), 'backend-uploads/pave-html-extract-debug');
  await fs.mkdir(dir, { recursive: true });
  const stamp = Date.now();
  const fileBase = path.join(dir, `${stamp}_html_summary_fail`);
  let htmlPath = null;
  try {
    const html = await page.content();
    htmlPath = `${fileBase}.html`;
    await fs.writeFile(htmlPath, html, 'utf8');
  } catch (e) {
    console.log('[pave-html-summary] could not write HTML snapshot', String(e?.message || e));
  }
  const url = page.url();
  const title = await page.title().catch(() => '');
  console.log('[pave-html-summary] failure snapshot', {
    htmlPath,
    url,
    title: title.slice(0, 200),
    ...meta,
  });
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<{
 *   inspection_date: string | null,
 *   vin_display: string | null,
 *   vin: string | null,
 *   vehicle_label: string | null,
 *   total_grade: number | null,
 *   total_grade_label: string | null,
 *   top_score_text: string | null,
 *   total_damage_score: number | null,
 *   front_score: number | null,
 *   back_score: number | null,
 *   left_score: number | null,
 *   right_score: number | null,
 *   extractionWarnings: string[],
 *   domTrace: object,
 * }>}
 */
export async function extractPaveReportSummaryFromPage(page) {
  const failedLabels = [];
  const domTrace = {};

  const inspectionLabels = [
    'INSPEKTIONSDATUM',
    'INSPECTIONSDATUM',
    'INSPECTION DATE',
    'DATE OF INSPECTION',
    'INSPECTIONDATE',
    'INSPECTIONSDATE',
    'DATUM DER INSPEKTION',
    'PRÜFUNGSDATUM',
  ];
  const insRes = await extractValueByLabel(page, inspectionLabels);
  domTrace.INSPEKTIONSDATUM = insRes;
  let inspection_date = insRes.value ? inspectionRawToIsoDate(insRes.value) : null;
  if (!inspection_date && insRes.value) {
    inspection_date = inspectionRawToIsoDate(insRes.value.replace(/^[^\dA-Za-z]*/, ''));
  }
  if (inspection_date) {
    console.log('[pave-html-summary] inspection_date extracted (DOM)', {
      raw: insRes.value,
      iso: inspection_date,
      matchedLabel: insRes.matchedLabel,
      method: insRes.method,
    });
  } else {
    failedLabels.push('INSPEKTIONSDATUM');
    console.log('[pave-html-summary] inspection_date not found (DOM labels)', {
      tried: inspectionLabels,
      hint: insRes.value ? `unparsed raw: ${String(insRes.value).slice(0, 80)}` : 'no DOM cell',
    });
  }

  // FIN before VIN (German portal); use DOM value only — masked as displayed, no reconstruction
  const vinRes = await extractValueByLabel(page, ['FIN', 'VIN']);
  domTrace.FIN_VIN = vinRes;
  let vin_display = vinRes.value ? String(vinRes.value).replace(/\s+/g, ' ').trim() : null;
  if (vin_display) {
    console.log('[pave-html-summary] vin_display extracted (DOM)', {
      value: vin_display,
      matchedLabel: vinRes.matchedLabel,
      method: vinRes.method,
    });
  } else {
    failedLabels.push('FIN/VIN');
    console.log('[pave-html-summary] vin_display not found (labels FIN, VIN)');
  }

  const markeR = await extractValueByLabel(page, ['MARKE']);
  const modellR = await extractValueByLabel(page, ['MODELL']);
  const baujahrR = await extractValueByLabel(page, ['BAUJAHR']);
  domTrace.MARKE = markeR;
  domTrace.MODELL = modellR;
  domTrace.BAUJAHR = baujahrR;

  const compositeBlock = await extractPaveVehicleCompositeLine(page);
  domTrace.BAUJAHR_MARKE_MODELL_BLOCK = compositeBlock;
  const compositeLabeled = await extractValueByLabel(page, [
    'BAUJAHR, MARKE, MODELL',
    'BAUJAHR,MARKE,MODELL',
    'BAUJAHR MARKE MODELL',
    'YEAR, MAKE, MODEL',
    'YEAR MAKE MODEL',
    'YEAR,MAKE,MODEL',
  ]);
  domTrace.BAUJAHR_MARKE_MODELL_LABEL = compositeLabeled;

  const fromComposite =
    (compositeBlock.value && String(compositeBlock.value).replace(/\s+/g, ' ').trim()) ||
    (compositeLabeled.value && String(compositeLabeled.value).replace(/\s+/g, ' ').trim()) ||
    null;

  const parts = [baujahrR.value, markeR.value, modellR.value]
    .map((x) => (x ? String(x).replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean);
  const fromParts = parts.length ? parts.join(' ') : null;

  const yearEnR = await extractValueByLabel(page, ['MODEL YEAR', 'YEAR']);
  const makeEnR = await extractValueByLabel(page, ['MAKE', 'MANUFACTURER', 'BRAND']);
  const modelEnR = await extractValueByLabel(page, ['MODEL']);
  domTrace.YEAR_EN = yearEnR;
  domTrace.MAKE_EN = makeEnR;
  domTrace.MODEL_EN = modelEnR;
  const enParts = [yearEnR.value, makeEnR.value, modelEnR.value]
    .map((x) => (x ? String(x).replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean);
  const fromEnglish = enParts.length >= 2 ? enParts.join(' ') : null;

  let vehicle_label = fromComposite || fromParts || fromEnglish;
  let vehicleDomWasGarbage = false;
  if (vehicle_label && isGarbageVehicleLabel(vehicle_label)) {
    vehicle_label = null;
    vehicleDomWasGarbage = true;
    failedLabels.push('BAUJAHR/MARKE/MODELL (garbage value rejected)');
    console.log('[pave-html-summary] vehicle_label DOM value rejected as UI heading/placeholder', {
      rejected: fromComposite || fromParts,
      compositeBlock: compositeBlock.method || null,
      compositeLabel: compositeLabeled.matchedLabel || null,
      marke: markeR.value || null,
      modell: modellR.value || null,
      baujahr: baujahrR.value || null,
    });
  }

  if (vehicle_label) {
    console.log('[pave-html-summary] vehicle_label extracted (DOM)', {
      value: vehicle_label,
      source: fromComposite ? 'baujahr_marke_modell_block' : 'baujahr_marke_modell_parts',
      compositeBlock: compositeBlock.method || null,
      compositeLabel: compositeLabeled.matchedLabel || null,
      marke: markeR.value || null,
      modell: modellR.value || null,
      baujahr: baujahrR.value || null,
    });
  } else if (!vehicleDomWasGarbage) {
    failedLabels.push('BAUJAHR/MARKE/MODELL');
    console.log('[pave-html-summary] vehicle_label not resolved from DOM (BAUJAHR, MARKE, MODELL)', {
      marke: markeR.matchedLabel,
      modell: modellR.matchedLabel,
      baujahr: baujahrR.matchedLabel,
      compositeBlock,
      compositeLabeled,
    });
  }

  const topGrade = await extractGradeFromTopSummary(page);
  domTrace.gradeTopSummary = topGrade.gradeTrace;

  let total_grade = topGrade.total_grade;
  let total_grade_label = topGrade.total_grade_label;
  let top_score_text = topGrade.top_score_text;
  let gradeSource = topGrade.total_grade != null ? 'top_summary_dom' : null;

  let gradeBlock = null;
  if (total_grade == null) {
    gradeBlock = await extractGradeFromDom(page);
    domTrace.gradeLabelFallback = gradeBlock.gradeMeta;
    if (gradeBlock.total_grade != null) {
      total_grade = gradeBlock.total_grade;
      gradeSource = 'label_fallback';
    }
    if (total_grade_label == null && gradeBlock.total_grade_label) {
      total_grade_label = gradeBlock.total_grade_label;
    }
    if (top_score_text == null && gradeBlock.top_score_text) {
      top_score_text = gradeBlock.top_score_text;
    }
  } else {
    domTrace.gradeLabelFallback = null;
  }

  domTrace.grade = {
    source: gradeSource,
    numericSource: topGrade.gradeTrace?.numericSource || null,
    topStrategies: topGrade.gradeTrace?.strategies || [],
    fallbackMeta: gradeBlock?.gradeMeta || null,
  };

  if (total_grade != null) {
    console.log('[pave-html-summary] total_grade extracted', {
      found: true,
      total_grade,
      total_grade_label: total_grade_label || null,
      top_score_text: top_score_text || null,
      source: gradeSource,
      numericSource: topGrade.gradeTrace?.numericSource || gradeBlock?.gradeMeta?.method || null,
      topSummaryStrategies: topGrade.gradeTrace?.strategies,
      domFallback: gradeBlock?.gradeMeta || null,
    });
  } else {
    const failedTop = (topGrade.gradeTrace?.strategies || []).filter((x) => !x.ok).map((x) => x.name);
    console.log('[pave-html-summary] total_grade not found', {
      found: false,
      topSummaryFailedStrategies: failedTop.length ? failedTop : ['(none recorded)'],
      topSummaryTrace: topGrade.gradeTrace?.strategies,
      labelFallbackTried: GRADE_DOM_LABELS,
      labelFallbackResult: gradeBlock?.gradeMeta || 'no_match',
    });
    const pageLooksLikeReport = !!(inspection_date || vin_display || vehicle_label);
    if (pageLooksLikeReport && gradeMissSnapshotEnabled()) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      await savePaveGradeMissSnapshot(page, {
        inspection_date: inspection_date || null,
        hasVin: !!vin_display,
        hasVehicle: !!vehicle_label,
        topGradeTrace: topGrade.gradeTrace,
        labelFallback: gradeBlock?.gradeMeta || null,
        pageUrl: url,
        pageTitle: title.slice(0, 200),
      });
    }
  }

  const damageR = await extractNumericLabelValue(page, DAMAGE_SCORE_DOM_LABELS);
  const frontR = await extractNumericLabelValue(page, FRONT_SCORE_DOM_LABELS);
  const backR = await extractNumericLabelValue(page, BACK_SCORE_DOM_LABELS);
  const leftR = await extractNumericLabelValue(page, LEFT_SCORE_DOM_LABELS);
  const rightR = await extractNumericLabelValue(page, RIGHT_SCORE_DOM_LABELS);
  domTrace.TOTAL_DAMAGE_SCORE = damageR.meta;
  domTrace.FRONT_SCORE = frontR.meta;
  domTrace.BACK_SCORE = backR.meta;
  domTrace.LEFT_SCORE = leftR.meta;
  domTrace.RIGHT_SCORE = rightR.meta;

  const total_damage_score = damageR.n;
  const front_score = frontR.n;
  const back_score = backR.n;
  const left_score = leftR.n;
  const right_score = rightR.n;

  const anySideScore = [front_score, back_score, left_score, right_score].some((x) => x != null);
  if (total_damage_score != null || anySideScore) {
    console.log('[pave-html-summary] damage/side scores (DOM)', {
      total_damage_score,
      front_score,
      back_score,
      left_score,
      right_score,
    });
  }

  const extractionWarnings = [];
  if (!inspection_date) extractionWarnings.push('DOM: INSPEKTIONSDATUM — no value resolved');
  if (!vin_display) extractionWarnings.push('DOM: FIN/VIN — no value resolved');
  if (!vehicle_label) extractionWarnings.push('DOM: BAUJAHR, MARKE, MODELL — no value resolved');
  if (total_grade == null) extractionWarnings.push('DOM: grade labels — no numeric grade (optional)');

  const coreMissing = !inspection_date && !vin_display && !vehicle_label;
  if (coreMissing) {
    const url = page.url();
    const title = await page.title().catch(() => '');
    console.log('[pave-html-summary] core DOM fields still empty (INSPEKTIONSDATUM / FIN|VIN / vehicle)', {
      url,
      title: title.slice(0, 200),
      failedLabels,
    });
    if (snapshotOnFailureEnabled()) {
      await savePaveHtmlExtractionFailureSnapshot(page, {
        reason: 'core_dom_fields_empty',
        failedLabels,
        domTrace,
      });
    }
  }

  return {
    inspection_date: inspection_date || null,
    vin_display: vin_display || null,
    vin: vin_display || null,
    vehicle_label: vehicle_label || null,
    total_grade,
    total_grade_label: total_grade_label || null,
    top_score_text: top_score_text || null,
    total_damage_score,
    front_score,
    back_score,
    left_score,
    right_score,
    extractionWarnings,
    domTrace,
    failedLabels,
  };
}

function firstFiniteNumber(hVal, pVal) {
  const h = hVal != null && hVal !== '' ? Number(hVal) : NaN;
  if (Number.isFinite(h)) return h;
  const p = pVal != null && pVal !== '' ? Number(pVal) : NaN;
  return Number.isFinite(p) ? p : null;
}

/**
 * Merge HTML (portal) summary with PDF-parsed report. HTML wins for date, VIN display, overall grade.
 * @param {object | null} htmlSummary
 * @param {object | null} pdfReport
 * @param {{ vehicle_label?: string | null }} [emailMeta]
 */
export function mergeHtmlAndPdfReportSummary(htmlSummary, pdfReport, emailMeta = {}) {
  const h = htmlSummary && typeof htmlSummary === 'object' ? htmlSummary : {};
  const p = pdfReport && typeof pdfReport === 'object' ? pdfReport : {};

  const rawHtmlVin = (h.vin_display || h.vin || '').trim() || null;
  const vinDisplay =
    rawHtmlVin && !isLikelyWrongVinFromDom(rawHtmlVin) ? rawHtmlVin : null;
  const pdfVin = (p.vin || '').trim() || null;
  const vinForRow = vinDisplay || pdfVin || null;
  const vinDisplayForRow = vinDisplay || (pdfVin && pdfVin.length <= 24 ? pdfVin : null) || null;

  const rawHtmlVehicle = h.vehicle_label && String(h.vehicle_label).trim() ? String(h.vehicle_label).trim() : null;
  const htmlVehicle = rawHtmlVehicle && !isGarbageVehicleLabel(rawHtmlVehicle) ? rawHtmlVehicle : null;

  return {
    // HTML wins when it looks like a real vehicle line (not section headings like "INFORMATION")
    vehicle_label: htmlVehicle || p.vehicle_label || emailMeta.vehicle_label || null,
    vin: vinForRow,
    vin_display: vinDisplayForRow,
    inspection_date: h.inspection_date || p.inspection_date || null,
    total_grade: h.total_grade != null && !Number.isNaN(h.total_grade) ? h.total_grade : p.total_grade ?? null,
    total_grade_label: h.total_grade_label || p.total_grade_label || null,
    total_damage_score: firstFiniteNumber(h.total_damage_score, p.total_damage_score),
    front_score: firstFiniteNumber(h.front_score, p.front_score),
    back_score: firstFiniteNumber(h.back_score, p.back_score),
    left_score: firstFiniteNumber(h.left_score, p.left_score),
    right_score: firstFiniteNumber(h.right_score, p.right_score),
    windshield_status: p.windshield_status || h.windshield_status || null,
  };
}

/**
 * @param {object | null} htmlSummary
 */
export function htmlSummaryLooksUsable(htmlSummary) {
  if (!htmlSummary || typeof htmlSummary !== 'object') return false;
  if (htmlSummary.inspection_date) return true;
  if (htmlSummary.vin_display || htmlSummary.vin) return true;
  const vl = htmlSummary.vehicle_label && String(htmlSummary.vehicle_label).trim();
  if (vl && !isGarbageVehicleLabel(vl)) return true;
  if (htmlSummary.total_grade != null && !Number.isNaN(htmlSummary.total_grade)) return true;
  if (htmlSummary.total_damage_score != null && !Number.isNaN(Number(htmlSummary.total_damage_score))) return true;
  for (const k of ['front_score', 'back_score', 'left_score', 'right_score']) {
    if (htmlSummary[k] != null && !Number.isNaN(Number(htmlSummary[k]))) return true;
  }
  return false;
}

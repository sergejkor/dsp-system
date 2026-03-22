import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import {
  extractPaveReportSummaryFromPage,
  htmlSummaryLooksUsable,
} from './providers/pave/extractPaveReportSummaryFromPage.js';
import { portalCredentials } from './pavePortalCredentials.js';

export { portalCredentials };

function guessFileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || null;
  } catch {
    return null;
  }
}

function bufferLooksLikePdf(buf) {
  if (!buf || !buf.length) return false;
  try {
    const b = Buffer.from(buf);
    if (b.slice(0, 4).toString('ascii') === '%PDF') return true;
    return b.slice(0, 2048).toString('latin1').includes('%PDF');
  } catch {
    return false;
  }
}

function isLikelyNavigationAbortError(err) {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('ERR_ABORTED') ||
    msg.includes('net::ERR') ||
    msg.includes('Download is starting') ||
    msg.includes('Navigation aborted')
  );
}

function envPortalDebug() {
  const v = process.env.PAVE_PORTAL_DEBUG;
  if (v == null || v === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

/**
 * PAVE dashboard login form uses named fields (real site).
 * @param {import('playwright').Page} page
 */
export async function isPaveLoginPage(page) {
  return (await page.locator('input[name="username"]').count()) > 0;
}

/** @param {import('playwright').Page} page */
export async function collectPaveReportMarkers(page) {
  const defs = [
    ['SITZUNGSDETAILS', /SITZUNGSDETAILS/i],
    ['FAHRZEUGINFORMATIONEN', /FAHRZEUGINFORMATIONEN/i],
    ['INSPEKTIONSDATUM', /INSPEKTIONSDATUM/i],
    ['FIN', /\bFIN\b/i],
    ['BAUJAHR_MARKE_MODELL', /BAUJAHR.*MARKE.*MODELL/i],
    ['INSPEKTION', /INSPEKTION/i],
    ['FORMULARE', /FORMULARE/i],
    ['VIN', /\bVIN\b/i],
    ['FAHRZEUG', /FAHRZEUG(?!INFORMATIONEN)/i],
  ];
  /** @type {Record<string, boolean>} */
  const found = {};
  for (const [key, re] of defs) {
    const loc = page.getByText(re).first();
    found[key] = await loc.isVisible().catch(() => false);
  }
  return found;
}

function reportShellLocator(page) {
  return page
    .getByText(/SITZUNGSDETAILS/i)
    .or(page.getByText(/FAHRZEUGINFORMATIONEN/i))
    .or(page.getByText(/INSPEKTIONSDATUM/i))
    .or(page.getByText(/\bFIN\b/i))
    .or(page.getByText(/BAUJAHR.*MARKE.*MODELL/i))
    .or(page.getByText(/INSPEKTION/i))
    .or(page.getByText(/FORMULARE/i))
    .or(page.getByText(/\bVIN\b/i))
    .or(page.getByText(/FAHRZEUGINFORMATION/i))
    .first();
}

/**
 * Wait until the report shell is likely visible (not only the PDF CTA).
 * @returns {Promise<Record<string, boolean>>}
 */
async function waitForReportPageShell(page, timeoutMs) {
  const start = Date.now();
  const shell = reportShellLocator(page);

  while (Date.now() - start < timeoutMs) {
    if (await isPaveLoginPage(page)) {
      const err = new Error(
        'PAVE_LOGIN_FAILURE: still on login page while waiting for report shell; check credentials or site layout'
      );
      err.code = 'PAVE_LOGIN_FAILURE';
      throw err;
    }

    const markers = await collectPaveReportMarkers(page);
    if (Object.values(markers).some(Boolean)) {
      return markers;
    }

    const shellVisible = await shell.isVisible().catch(() => false);
    if (shellVisible) {
      return markers;
    }

    const url = page.url();
    const elapsed = Date.now() - start;
    if (/\/park\//i.test(url) && elapsed > 4000) {
      const bodyLen = await page.evaluate(() => document.body?.innerText?.length ?? 0);
      if (bodyLen > 800) {
        return { ...markers, _fallbackParkDom: true };
      }
    }

    await page.waitForTimeout(350);
  }

  const markers = await collectPaveReportMarkers(page);
  const url = page.url();
  const title = await page.title().catch(() => '');
  if (envPortalDebug()) {
    await savePortalDebugArtifacts(page, 'report-shell-timeout', { reportUrl: url, markers, title });
  }
  const err = new Error(
    `PAVE_REPORT_SHELL_TIMEOUT: report page indicators not visible within ${timeoutMs}ms (url=${url}, title=${title.slice(0, 120)})`
  );
  err.code = 'PAVE_REPORT_SHELL_TIMEOUT';
  err.markersFound = markers;
  throw err;
}

/**
 * Ordered PDF controls: exact DE/EN CTAs first, then looser text + href matches.
 * DE: "ZUSTANDSBERICHT PDF" — EN: "CONDITION REPORT PDF"
 * @returns {import('playwright').Locator[]}
 */
function pdfDownloadLocatorCandidates(page) {
  const exactDe = /^\s*ZUSTANDSBERICHT\s+PDF\s*$/i;
  const exactEn = /^\s*CONDITION\s+REPORT\s+PDF\s*$/i;
  const zustPdf = /zustandsbericht\s*pdf/i;
  const conditionReportPdf = /condition\s+report\s*pdf/i;
  const zust = /zustandsbericht/i;
  const conditionReport = /condition\s+report/i;
  const pdfWord = /\bpdf\b/i;
  const pdfHref = () =>
    page.locator('a[href$=".pdf"], a[href*=".pdf"], a[href*="pdf"]');

  return [
    page.getByRole('button', { name: exactDe }),
    page.getByRole('link', { name: exactDe }),
    page.locator('[role="button"]').filter({ hasText: exactDe }),
    page.locator('button').filter({ hasText: exactDe }),
    page.locator('a').filter({ hasText: exactDe }),
    page.getByRole('button', { name: exactEn }),
    page.getByRole('link', { name: exactEn }),
    page.locator('[role="button"]').filter({ hasText: exactEn }),
    page.locator('button').filter({ hasText: exactEn }),
    page.locator('a').filter({ hasText: exactEn }),
    page.getByRole('button', { name: zustPdf }),
    page.getByRole('link', { name: zustPdf }),
    pdfHref().filter({ hasText: zust }),
    page.getByRole('button', { name: conditionReportPdf }),
    page.getByRole('link', { name: conditionReportPdf }),
    pdfHref().filter({ hasText: conditionReport }),
    page.locator('[role="button"]').filter({ hasText: zustPdf }),
    page.locator('button').filter({ hasText: zustPdf }),
    page.locator('a').filter({ hasText: zustPdf }),
    page.locator('[role="button"]').filter({ hasText: conditionReportPdf }),
    page.locator('button').filter({ hasText: conditionReportPdf }),
    page.locator('a').filter({ hasText: conditionReportPdf }),
    page.locator('button, a, [role="button"]').filter({ hasText: zust }).filter({ hasText: pdfWord }),
    page.locator('button, a, [role="button"]').filter({ hasText: conditionReport }).filter({ hasText: pdfWord }),
    page.getByRole('button', { name: zust }),
    page.getByRole('link', { name: zust }),
    page.locator('button').filter({ hasText: zust }),
    page.locator('a').filter({ hasText: zust }),
  ];
}

/**
 * First visible + enabled control from candidates (deterministic order).
 * @param {import('playwright').Page} page
 * @returns {Promise<import('playwright').Locator | null>}
 */
export async function findVisiblePdfDownloadControl(page) {
  for (const root of pdfDownloadLocatorCandidates(page)) {
    const c = await root.count().catch(() => 0);
    for (let i = 0; i < c; i += 1) {
      const nth = root.nth(i);
      try {
        const vis = await nth.isVisible();
        const en = await nth.isEnabled().catch(() => true);
        if (vis && en) return nth;
      } catch {
        // next
      }
    }
  }
  return null;
}

/** Debug: count matches per strategy */
async function pdfLocatorDiagnostics(page) {
  const out = {};
  const names = [
    'exact_zustandsbericht_pdf_role_button',
    'exact_zustandsbericht_pdf_role_link',
    'exact_zustandsbericht_pdf_role_attr',
    'exact_zustandsbericht_pdf_button',
    'exact_zustandsbericht_pdf_a',
    'exact_condition_report_pdf_role_button',
    'exact_condition_report_pdf_role_link',
    'exact_condition_report_pdf_role_attr',
    'exact_condition_report_pdf_button',
    'exact_condition_report_pdf_a',
    'zust_pdf_role_button',
    'zust_pdf_role_link',
    'zust_pdf_href_filter',
    'condition_report_pdf_role_button',
    'condition_report_pdf_role_link',
    'condition_report_pdf_href_filter',
    'zustandsbericht_pdf_loose_role_button',
    'zustandsbericht_pdf_loose_button',
    'zustandsbericht_pdf_loose_a',
    'condition_report_pdf_loose_role_button',
    'condition_report_pdf_loose_button',
    'condition_report_pdf_loose_a',
    'zust_plus_pdf_word',
    'condition_report_plus_pdf_word',
    'zust_role_button',
    'zust_role_link',
    'zust_button',
    'zust_a',
  ];
  const cands = pdfDownloadLocatorCandidates(page);
  for (let i = 0; i < cands.length; i += 1) {
    const key = names[i] || `cand_${i}`;
    out[key] = await cands[i].count().catch(() => 0);
  }
  return out;
}

/**
 * Wait for PDF CTA (separate from "report shell" — button may appear later).
 * @returns {Promise<import('playwright').Locator | null>}
 */
async function waitForPdfDownloadControl(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPaveLoginPage(page)) {
      const err = new Error(
        'PAVE_LOGIN_FAILURE: still on login page while waiting for PDF control; check credentials or site layout'
      );
      err.code = 'PAVE_LOGIN_FAILURE';
      throw err;
    }
    const loc = await findVisiblePdfDownloadControl(page);
    if (loc) return loc;
    await page.waitForTimeout(400);
  }
  return null;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} reason
 * @param {object} [extra]
 */
async function savePortalDebugArtifacts(page, reason, extra = {}) {
  if (!envPortalDebug()) return;
  const baseDir = path.resolve(process.cwd(), 'backend-uploads/pave-portal-debug');
  await fs.mkdir(baseDir, { recursive: true });
  const safe = String(reason).replace(/[^a-z0-9_-]/gi, '_');
  const stamp = `${Date.now()}_${safe}`;
  const pngPath = path.join(baseDir, `${stamp}.png`);
  const htmlPath = path.join(baseDir, `${stamp}.html`);
  try {
    await page.screenshot({ path: pngPath, fullPage: true });
  } catch (e) {
    console.log('[pave-portal] debug screenshot failed', String(e?.message || e));
  }
  try {
    const html = await page.content();
    await fs.writeFile(htmlPath, html, 'utf8');
  } catch (e) {
    console.log('[pave-portal] debug html dump failed', String(e?.message || e));
  }
  const markers = await collectPaveReportMarkers(page).catch(() => ({}));
  console.log('[pave-portal] debug artifacts saved', {
    reason,
    pngPath,
    htmlPath,
    url: page.url(),
    title: await page.title().catch(() => ''),
    markersFound: markers,
    ...extra,
  });
}

/**
 * Login CTA varies by locale and markup (button vs input, EN vs DE).
 */
async function submitPaveLoginForm(page, timeoutMs) {
  const clickTimeout = Math.max(30000, Number(timeoutMs) || 60000);
  const submitUnion = page
    .locator('form button[type="submit"]')
    .or(page.locator('form input[type="submit"]'))
    .or(page.locator('button[type="submit"]'))
    .or(page.locator('input[type="submit"]'))
    .or(page.locator('button:has-text("ANMELDUNG")'))
    .or(page.locator('button:has-text("ANMELDEN")'))
    .or(
      page.getByRole('button', {
        name: /anmeldung|anmelden|einloggen|sign\s*in|log\s*in|^login$|submit|continue|next/i,
      })
    )
    .first();

  try {
    await submitUnion.click({ timeout: clickTimeout });
    return 'submit-click';
  } catch (err) {
    console.log('[pave-portal] login submit control not clicked in time; using Enter on password field', {
      message: String(err?.message || err).slice(0, 240),
    });
    await page.locator('input[name="password"]').click({ timeout: 5000 });
    await page.keyboard.press('Enter');
    return 'password-enter';
  }
}

async function gotoReportResilient(page, reportUrl, timeoutMs) {
  let gotoError = null;
  try {
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  } catch (err) {
    gotoError = err;
    if (!isLikelyNavigationAbortError(err)) {
      throw err;
    }
    console.log('[pave-portal] goto reported error; checking loaded state', {
      message: String(err?.message || err),
      url: page.url(),
    });
  }

  await page.waitForLoadState('domcontentloaded', { timeout: Math.min(10000, timeoutMs) }).catch(() => {});

  const url = page.url();
  const blank = !url || url === 'about:blank';
  if (blank && gotoError) {
    throw gotoError;
  }

  if (gotoError && !blank) {
    const onLogin = await isPaveLoginPage(page);
    const pdfish = (await findVisiblePdfDownloadControl(page)) != null;
    if (!onLogin && !pdfish) {
      await page.waitForTimeout(800).catch(() => {});
    }
  }

  return gotoError;
}

/**
 * Full flow: open report URL → login if needed → wait for report shell → find PDF control → download.
 * Does not use REPORT_PORTAL_LOGIN_URL; report link is the entry point.
 *
 * @param {import('playwright').Page} page
 * @param {string} reportUrl
 * @param {{ timeoutMs?: number, stats?: { loginMsTotal?: number; loginCount?: number; sessionReuseCount?: number } }} [opts]
 */
export async function downloadPaveReportThroughPortalUi(page, reportUrl, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? process.env.REPORT_PORTAL_DOWNLOAD_TIMEOUT_MS ?? 60000);
  const stats = opts.stats;
  const { username, password } = portalCredentials();

  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  await gotoReportResilient(page, reportUrl, timeoutMs);

  if (await isPaveLoginPage(page)) {
    if (!username || !password) {
      throw new Error('PAVE login required: set REPORT_PORTAL_USERNAME and REPORT_PORTAL_PASSWORD');
    }
    const t0 = Date.now();
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    const how = await submitPaveLoginForm(page, timeoutMs);
    console.log('[pave-portal] login form submitted', { how });
    await page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeoutMs, 20000) }).catch(() => {});

    if (stats) {
      stats.loginMsTotal = (stats.loginMsTotal || 0) + (Date.now() - t0);
      stats.loginCount = (stats.loginCount || 0) + 1;
    }
  } else if (stats) {
    stats.sessionReuseCount = (stats.sessionReuseCount || 0) + 1;
  }

  let markersAfterShell;
  try {
    markersAfterShell = await waitForReportPageShell(page, timeoutMs);
  } catch (e) {
    if (envPortalDebug()) {
      await savePortalDebugArtifacts(page, 'report-shell-error', { reportUrl, err: String(e?.message || e) });
    }
    throw e;
  }

  let htmlReportSummary = null;
  try {
    htmlReportSummary = await extractPaveReportSummaryFromPage(page);
    if (htmlReportSummary?.extractionWarnings?.length) {
      console.log('[pave-portal] HTML summary extraction notes', { warnings: htmlReportSummary.extractionWarnings });
    }
  } catch (extractErr) {
    htmlReportSummary = {
      extractionWarnings: [`HTML summary extraction threw: ${String(extractErr?.message || extractErr)}`],
    };
  }

  const pdfFindTimeout = Math.max(25000, Math.min(timeoutMs, 90000));
  let pdfTarget = await waitForPdfDownloadControl(page, pdfFindTimeout);

  if (!pdfTarget) {
    const url = page.url();
    const title = await page.title().catch(() => '');
    const markers = await collectPaveReportMarkers(page);
    const anyMarker = Object.values(markers).some(Boolean);
    const diag = envPortalDebug() ? await pdfLocatorDiagnostics(page) : null;

    console.log('[pave-portal] PDF control not found after report shell', {
      phase: 'report ready; PDF CTA missing or delayed',
      url,
      title: title.slice(0, 200),
      markersFound: markers,
      shellMarkersAfterWait: markersAfterShell,
      pdfLocatorDiagnostics: diag,
    });

    if (htmlSummaryLooksUsable(htmlReportSummary)) {
      if (envPortalDebug()) {
        await savePortalDebugArtifacts(page, 'pdf-control-missing-html-ok', {
          reportUrl,
          markersFound: markers,
          title,
          pdfLocatorDiagnostics: diag,
          reportMarkersFound: anyMarker,
        });
      }
      return {
        buffer: null,
        mimeType: null,
        fileName: null,
        htmlReportSummary,
        pdfDownloadFailed: true,
        pdfFailureReason:
          'PAVE_PDF_PARTIAL: HTML summary extracted; PDF CTA (ZUSTANDSBERICHT PDF / CONDITION REPORT PDF) not found or not clickable in time',
      };
    }

    await savePortalDebugArtifacts(page, 'pdf-control-missing', {
      reportUrl,
      markersFound: markers,
      title,
      pdfLocatorDiagnostics: diag,
    });

    if (anyMarker) {
      const err = new Error(
        `PAVE_PDF_CONTROL_MISSING: report page loaded (markers=${JSON.stringify(markers)}); PDF control not visible within ${pdfFindTimeout}ms`
      );
      err.code = 'PAVE_PDF_CONTROL_MISSING';
      err.markersFound = markers;
      throw err;
    }

    const err = new Error(
      `PAVE_PDF_CONTROL_MISSING: could not confirm report sections or PDF control (url=${url}); PDF wait timeout`
    );
    err.code = 'PAVE_PDF_CONTROL_MISSING';
    err.markersFound = markers;
    throw err;
  }

  await pdfTarget.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  async function captureDownloadAfterClick(clickFn) {
    const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs }).catch(() => null);
    const responsePromise = page
      .waitForResponse(
        (resp) => {
          const headers = resp.headers() || {};
          const ct = String(headers['content-type'] || '').toLowerCase();
          return ct.includes('application/pdf');
        },
        { timeout: timeoutMs }
      )
      .catch(() => null);
    await clickFn();
    return Promise.all([downloadPromise, responsePromise]);
  }

  let download;
  let response;
  try {
    [download, response] = await captureDownloadAfterClick(() => pdfTarget.click({ timeout: timeoutMs }));
  } catch (clickErr) {
    console.log('[pave-portal] PDF click failed; retry once after short wait', {
      message: String(clickErr?.message || clickErr).slice(0, 240),
      url: page.url(),
      title: (await page.title().catch(() => '')).slice(0, 120),
    });
    await page.waitForTimeout(1200);
    pdfTarget = (await findVisiblePdfDownloadControl(page)) || pdfTarget;
    await pdfTarget.scrollIntoViewIfNeeded();
    try {
      [download, response] = await captureDownloadAfterClick(() => pdfTarget.click({ timeout: timeoutMs }));
    } catch (clickErr2) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      const markers = await collectPaveReportMarkers(page);
      console.log('[pave-portal] PDF click failed after retry', {
        url,
        title: title.slice(0, 200),
        markersFound: markers,
      });
      if (envPortalDebug()) {
        await savePortalDebugArtifacts(page, 'pdf-click-failed', {
          reportUrl,
          markersFound: markers,
          title,
          pdfLocatorDiagnostics: await pdfLocatorDiagnostics(page),
        });
      }
      if (htmlSummaryLooksUsable(htmlReportSummary)) {
        return {
          buffer: null,
          mimeType: null,
          fileName: null,
          htmlReportSummary,
          pdfDownloadFailed: true,
          pdfFailureReason: `PAVE_PDF_PARTIAL: HTML summary OK; PDF click failed: ${String(clickErr2?.message || clickErr2)}`,
        };
      }
      throw clickErr2;
    }
  }

  if (download) {
    const tempPath = await download.path();
    const buf = await fs.readFile(tempPath);
    const suggested = download.suggestedFilename() || guessFileNameFromUrl(reportUrl) || 'report';
    const mimeType =
      (typeof download.suggestedMimeType === 'function' && download.suggestedMimeType()) || 'application/octet-stream';
    if (!mimeType.toLowerCase().includes('pdf') && !bufferLooksLikePdf(buf)) {
      console.log('[pave-portal] warning: download not detected as PDF; parsing will still try', { reportUrl, mimeType });
    }
    return { buffer: buf, mimeType, fileName: suggested, htmlReportSummary };
  }

  if (response) {
    const headers = response.headers() || {};
    const mimeType = headers['content-type'] || 'application/octet-stream';
    const contentDisposition = headers['content-disposition'] || '';
    let fileNameFromCd = null;
    const m =
      contentDisposition.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i) ||
      contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    if (m && m[1]) fileNameFromCd = m[1];
    const suggested = fileNameFromCd || guessFileNameFromUrl(reportUrl) || 'report';
    const bodyBuf = Buffer.from(await response.body());
    if (!bodyBuf.length) {
      if (htmlSummaryLooksUsable(htmlReportSummary)) {
        return {
          buffer: null,
          mimeType: null,
          fileName: null,
          htmlReportSummary,
          pdfDownloadFailed: true,
          pdfFailureReason: 'PAVE_PDF_PARTIAL: empty PDF response body after click',
        };
      }
      throw new Error('Playwright: empty PDF response body');
    }
    if (mimeType.includes('text/html')) {
      if (htmlSummaryLooksUsable(htmlReportSummary)) {
        return {
          buffer: null,
          mimeType: null,
          fileName: null,
          htmlReportSummary,
          pdfDownloadFailed: true,
          pdfFailureReason: 'PAVE_PDF_PARTIAL: expected PDF response but received HTML',
        };
      }
      throw new Error('Playwright: expected PDF but got HTML');
    }
    if (!mimeType.toLowerCase().includes('pdf') && !bufferLooksLikePdf(bodyBuf)) {
      console.log('[pave-portal] warning: response not detected as PDF; parsing will still try', { reportUrl, mimeType });
    }
    return { buffer: bodyBuf, mimeType, fileName: suggested, htmlReportSummary };
  }

  if (htmlSummaryLooksUsable(htmlReportSummary)) {
    if (envPortalDebug()) {
      await savePortalDebugArtifacts(page, 'no-download-after-pdf-click-html-ok', {
        reportUrl,
        title: await page.title().catch(() => ''),
        markersFound: await collectPaveReportMarkers(page).catch(() => ({})),
        pdfLocatorDiagnostics: await pdfLocatorDiagnostics(page),
      });
    }
    return {
      buffer: null,
      mimeType: null,
      fileName: null,
      htmlReportSummary,
      pdfDownloadFailed: true,
      pdfFailureReason:
        'PAVE_PDF_PARTIAL: PDF control clicked but no download event or application/pdf response (HTML summary kept)',
    };
  }

  await savePortalDebugArtifacts(page, 'no-download-after-pdf-click', { reportUrl });
  throw new Error('Playwright: PDF control clicked but no download or PDF response received');
}

/**
 * One Playwright browser + context per sync/backfill run; reuse N pages for concurrent downloads.
 * Login is driven by each report URL (redirect to login when unauthenticated).
 */
export class PavePortalDownloadSession {
  constructor({ concurrency = 3 } = {}) {
    this.concurrency = Math.max(1, Math.min(8, Number(concurrency) || 3));
    this.browser = null;
    this.context = null;
    this.pages = [];
    this._loginCount = 0;
    this._sessionReuseCount = 0;
    this._browserStartedAt = null;
    this.stats = {
      browserStarted: false,
      loginMsTotal: 0,
      downloadCalls: 0,
    };
  }

  async init() {
    if (this.browser) return;
    const timeoutMs = Number(process.env.REPORT_PORTAL_DOWNLOAD_TIMEOUT_MS || 60000);
    this._browserStartedAt = Date.now();
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    for (let i = 0; i < this.concurrency; i++) {
      const page = await this.context.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      this.pages.push(page);
    }
    this.stats.browserStarted = true;
    console.log('[pave-portal] browser started', {
      concurrency: this.concurrency,
      pages: this.pages.length,
    });
  }

  getLoginCount() {
    return this._loginCount;
  }

  getSessionReuseCount() {
    return this._sessionReuseCount;
  }

  /**
   * @param {import('playwright').Page} page
   * @param {string} reportUrl
   */
  async downloadOnPage(page, reportUrl) {
    this.stats.downloadCalls += 1;
    const timeoutMs = Number(process.env.REPORT_PORTAL_DOWNLOAD_TIMEOUT_MS || 60000);

    const agg = {
      loginMsTotal: 0,
      loginCount: 0,
      sessionReuseCount: 0,
    };

    const result = await downloadPaveReportThroughPortalUi(page, reportUrl, {
      timeoutMs,
      stats: agg,
    });

    this.stats.loginMsTotal += agg.loginMsTotal;
    this._loginCount += agg.loginCount;
    this._sessionReuseCount += agg.sessionReuseCount;

    if (agg.loginCount > 0) {
      console.log('[pave-portal] login performed', {
        loginMs: agg.loginMsTotal,
        loginCount: this._loginCount,
      });
    }

    return result;
  }

  pageForWorker(workerId) {
    return this.pages[workerId % this.pages.length];
  }

  async close() {
    try {
      if (this.context) await this.context.close();
    } catch (_) {}
    try {
      if (this.browser) await this.browser.close();
    } catch (_) {}
    this.browser = null;
    this.context = null;
    this.pages = [];
    console.log('[pave-portal] browser closed', {
      loginPerformedCount: this._loginCount,
      sessionReuseCount: this._sessionReuseCount,
      downloadCalls: this.stats.downloadCalls,
    });
  }
}

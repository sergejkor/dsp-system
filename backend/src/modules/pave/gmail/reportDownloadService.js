import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { chromium } from 'playwright';
import { PDFParse } from 'pdf-parse';
import { PavePortalDownloadSession, downloadPaveReportThroughPortalUi } from './pavePortalSession.js';

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

function sanitizeFileName(name) {
  return String(name || 'report')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
}

function guessFileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || null;
  } catch {
    return null;
  }
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function bufferLooksLikePdf(buf) {
  if (!buf || !buf.length) return false;
  try {
    const b = Buffer.from(buf);
    // Fast path: exact header at start.
    const head = b.slice(0, 4).toString('ascii');
    if (head === '%PDF') return true;
    // Be tolerant: some gateways/prefixes can delay the header.
    const sample = b.slice(0, 2048).toString('latin1');
    return sample.includes('%PDF');
  } catch {
    return false;
  }
}

/**
 * True if bytes look like HTML/JSON, not a binary PDF (dashboard URLs often return 200 + SPA shell).
 * @param {Buffer} buf
 */
function bufferLooksLikeTextNotPdf(buf) {
  if (!buf || buf.length < 4) return true;
  const s = buf.slice(0, Math.min(512, buf.length)).toString('utf8').trimStart();
  if (s.startsWith('<') || s.startsWith('{') || s.startsWith('[')) return true;
  if (/^<!doctype\s+html/i.test(s)) return true;
  return false;
}

function envBool(name, def = false) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

/**
 * Open with pdf-parse — same stack as parsePavePdf. Catches "Invalid PDF structure" from HTTP junk.
 * Exported so cached files on disk can be validated before re-use.
 * @param {Buffer} buf
 */
export async function probePdfBufferParseable(buf) {
  if (!buf || buf.length < 24) return false;
  if (bufferLooksLikeTextNotPdf(buf)) return false;
  const head = buf.slice(0, 5).toString('latin1');
  if (!head.startsWith('%PDF')) return false;
  if (envBool('PAVE_SKIP_HTTP_PDF_PROBE', false)) return true;
  const parser = new PDFParse({ data: buf });
  try {
    await parser.getText();
    return true;
  } catch {
    return false;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function saveToDisk({ buffer, fileName, dir }) {
  await fs.mkdir(dir, { recursive: true });
  const safeName = sanitizeFileName(fileName);
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function downloadHttpFirst(url) {
  const timeoutMs = Number(process.env.REPORT_PORTAL_HTTP_TIMEOUT_MS || 30000);
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`HTTP download timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(kill);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error(`HTTP download failed: ${res.status}`);

  // If it looks like an HTML login page, treat as failure to trigger Playwright fallback.
  let isLikelyHtml = contentType.includes('text/html');
  if (contentType.includes('text/html')) {
    try {
      const htmlPreview = await res.clone().text();
      isLikelyHtml = isLikelyHtml || htmlPreview.toLowerCase().includes('login');
    } catch {
      // ignore: if we can't preview, we'll still validate PDF header below
    }
  }
  if (isLikelyHtml) throw new Error(`HTTP download returned HTML (likely login). content-type=${contentType}`);

  const arr = new Uint8Array(await res.arrayBuffer());
  const buf = Buffer.from(arr);

  // Some portals return `application/octet-stream` even for redirects/HTML.
  // Don't block ingestion just because the bytes don't start with `%PDF`.
  // We'll still try to parse downstream; `parsePavePdf` can return partial/warnings.
  const looksPdf = contentType.toLowerCase().includes('pdf') || bufferLooksLikePdf(buf);
  if (!looksPdf) {
    console.log('[pave-sync] warning: downloaded bytes not detected as PDF yet; will try parsing anyway', {
      url,
      contentType,
    });
  }

  return { buffer: buf, mimeType: contentType };
}

async function downloadWithPlaywright({ reportUrl }) {
  const timeoutMs = Number(process.env.REPORT_PORTAL_DOWNLOAD_TIMEOUT_MS || 60000);
  requireEnv('REPORT_PORTAL_USERNAME');
  requireEnv('REPORT_PORTAL_PASSWORD');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    return await downloadPaveReportThroughPortalUi(page, reportUrl, { timeoutMs });
  } finally {
    await browser.close();
  }
}

/**
 * @param {object} opts
 * @param {string} opts.reportUrl
 * @param {string} [opts.storageDir]
 * @param {import('./pavePortalSession.js').PavePortalDownloadSession} [opts.portalSession] Reused run-level session
 * @param {import('playwright').Page} [opts.page] Page from portalSession for concurrent workers
 */
export async function downloadReportFromPortal({ reportUrl, storageDir, portalSession, page }) {
  const dir = storageDir || path.resolve(process.cwd(), 'backend-uploads/pave-gmail');
  const guessedName = guessFileNameFromUrl(reportUrl) || 'report_download';
  const hasPortalLoginConfig =
    !!String(process.env.REPORT_PORTAL_USERNAME || '').trim() &&
    !!String(process.env.REPORT_PORTAL_PASSWORD || '').trim();

  async function finalizePlaywrightDownload(pb) {
    if (pb.pdfDownloadFailed) {
      return {
        buffer: null,
        filePath: null,
        fileName: null,
        mimeType: null,
        fileSha256: null,
        via: portalSession && page ? 'playwright-session' : 'playwright-once',
        htmlReportSummary: pb.htmlReportSummary ?? null,
        pdfDownloadFailed: true,
        pdfFailureReason: pb.pdfFailureReason || null,
      };
    }
    const buffer = pb.buffer;
    if (!buffer || !buffer.length) {
      throw new Error('Playwright download returned empty buffer');
    }
    const fileSha = sha256Hex(buffer);
    const fileName = pb.fileName || `${path.parse(guessedName).name}_${fileSha.slice(0, 10)}.bin`;
    const filePath = await saveToDisk({ buffer, fileName, dir });
    return {
      buffer,
      filePath,
      fileName,
      mimeType: pb.mimeType || 'application/octet-stream',
      fileSha256: fileSha,
      via: portalSession && page ? 'playwright-session' : 'playwright-once',
      htmlReportSummary: pb.htmlReportSummary ?? null,
      pdfDownloadFailed: false,
    };
  }

  function runPlaywrightDownload() {
    return portalSession && page
      ? portalSession.downloadOnPage(page, reportUrl)
      : downloadWithPlaywright({ reportUrl });
  }

  try {
    const http = await downloadHttpFirst(reportUrl);
    const buffer = http.buffer;

    if (hasPortalLoginConfig) {
      const parseable = await probePdfBufferParseable(buffer);
      if (!parseable) {
        console.warn('[pave-sync] HTTP response is not a parseable PDF; retrying via Playwright', {
          url: String(reportUrl).slice(0, 140),
          bytes: buffer?.length ?? 0,
        });
        const pb = await runPlaywrightDownload();
        return finalizePlaywrightDownload(pb);
      }
    }

    const fileSha = sha256Hex(buffer);
    const fileName = `${path.parse(guessedName).name}_${fileSha.slice(0, 10)}${path.parse(guessedName).ext || ''}`;
    const filePath = await saveToDisk({ buffer, fileName, dir });
    return {
      buffer,
      filePath,
      fileName,
      mimeType: http.mimeType || 'application/octet-stream',
      fileSha256: fileSha,
      via: 'http',
      htmlReportSummary: null,
    };
  } catch (e) {
    if (!hasPortalLoginConfig) {
      throw new Error(
        `Portal authentication is required to download this report, but REPORT_PORTAL_USERNAME/REPORT_PORTAL_PASSWORD are not configured. Original download error: ${String(e?.message || e)}`
      );
    }
    const pb = await runPlaywrightDownload();
    return finalizePlaywrightDownload(pb);
  }
}

export { PavePortalDownloadSession };


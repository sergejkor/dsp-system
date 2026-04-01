import { Router } from 'express';
import multer from 'multer';
import damagesService from './damagesService.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import carsService from '../cars/carsService.js';
import { query } from '../../db.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  generateKfzSchadenanzeige,
  mapReportToKfzPayload,
} from './generateKfzSchadenanzeige.js';
import { createOutlookDraftWithPdfAttachment } from './microsoftGraphDraftService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isValidISODate(s) {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

function normalizePlate(s) {
  return String(s || '').toUpperCase().replace(/[\s-]+/g, '').trim();
}

const KFZ_TEMPLATE_FILE = 'KFzSchadenanzeige_Template.pdf';

/** Default: backend/static/kfz/ (not backend/src/static — __dirname is under src/modules/damages). */
function resolveKfzTemplatePath() {
  const fromEnv = process.env.KFZ_TEMPLATE_PATH?.trim();
  if (fromEnv) {
    const abs = path.resolve(fromEnv);
    if (!existsSync(abs)) {
      throw new Error(`KFZ_TEMPLATE_PATH file not found: ${abs}`);
    }
    return abs;
  }
  const candidates = [
    path.resolve(__dirname, '../../../static/kfz', KFZ_TEMPLATE_FILE),
    path.resolve(__dirname, '../../static/kfz', KFZ_TEMPLATE_FILE),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `KFZ PDF template not found. Place ${KFZ_TEMPLATE_FILE} in backend/static/kfz/ ` +
      `(or the old location backend/src/static/kfz/) or set KFZ_TEMPLATE_PATH. Tried:\n${candidates.join('\n')}`
  );
}

/** Coordinate-based fill when the PDF has no matching AcroForm fields */
async function buildInsuranceReportPdfDraw(report, templatePath) {
  const templateBytes = await fs.readFile(templatePath);
  const doc = await PDFDocument.load(templateBytes);

  const pages = doc.getPages();
  const page = pages[0];
  const { height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const draw = (text, x, y, size = 9) => {
    page.drawText(String(text ?? ''), { x, y, size, font });
  };

  const damageDate = report.damageDate || '';
  const time = report.time || '';
  draw(damageDate, 100, height - 155);
  draw(time, 260, height - 155);

  draw(report.general?.cause || '', 140, height - 175);
  draw(report.general?.weather || '', 140, height - 190);
  draw(report.general?.road || '', 140, height - 205);

  draw(report.general?.zip || report.accident?.zip || '', 100, height - 225);
  draw(report.general?.city || report.accident?.city || '', 190, height - 225);
  draw(report.general?.street || report.accident?.street || '', 100, height - 240);
  draw(report.general?.extra || report.accident?.extra || '', 100, height - 255);

  draw(report.licensePlate || '', 410, height - 155);
  draw(report.insurerClaimNumber || '', 410, height - 175);
  draw(report.schunckClaimNumber || '', 410, height - 190);
  draw(report.yourClaimNumber || '', 410, height - 205);

  const d = report.driver || {};
  draw(d.fullName || d.name || '', 100, height - 295);
  draw(d.street || '', 100, height - 310);
  draw(d.zip || '', 100, height - 325);
  draw(d.city || '', 190, height - 325);
  draw(d.birthDate || '', 410, height - 295);
  draw(d.phoneNumber || '', 410, height - 310);

  return doc.save();
}

async function buildInsuranceReportPdf(report, damageId) {
  const templatePath = resolveKfzTemplatePath();
  const payload = mapReportToKfzPayload(report, damageId);
  const acroBytes = await generateKfzSchadenanzeige(templatePath, payload);
  if (acroBytes) return acroBytes;
  return buildInsuranceReportPdfDraw(report, templatePath);
}

async function persistInsuranceReport(damageId, report) {
  const licensePlate = report?.licensePlate || report?.license_plate || report?.vehicleLicensePlate;
  if (!licensePlate || !String(licensePlate).trim()) {
    return { error: { status: 400, body: { error: 'licensePlate is required in report' } } };
  }
  const plateNorm = normalizePlate(licensePlate);
  const carRes = await query(
    `SELECT id, license_plate FROM cars
     WHERE regexp_replace(upper(coalesce(license_plate,'')), '[\\s-]+', '', 'g') = $1
     LIMIT 1`,
    [plateNorm]
  );
  const car = carRes.rows[0];
  if (!car) {
    return { error: { status: 400, body: { error: `Car not found by license plate: ${licensePlate}` } } };
  }

  const json = JSON.stringify(
    { ...report, _meta: { saved_at: new Date().toISOString(), damage_id: damageId } },
    null,
    2
  );
  const baseName = `KFZ_Schadenanzeige_${plateNorm || 'car'}_${
    String(report?.yourClaimNumber || report?.your_claim_number || '').trim() ||
    String(report?.insurerClaimNumber || '').trim() ||
    `damage_${damageId}`
  }`;
  const fileNameJson = `${baseName}.json`;
  await carsService.addCarDocument(
    car.id,
    'damage_insurance_report',
    Buffer.from(json, 'utf8'),
    fileNameJson,
    null
  );
  const pdfBytes = await buildInsuranceReportPdf(report, damageId);
  const fileNamePdf = `${baseName}.pdf`;
  return { fileNamePdf, pdfBytes };
}

router.get('/', async (_req, res) => {
  try {
    const rows = await damagesService.listDamages();
    res.json(rows);
  } catch (e) {
    console.error('GET /api/damages', e);
    res.status(500).json({ error: 'Failed to load damages' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const damage = await damagesService.getDamageById(id);
    if (!damage) return res.status(404).json({ error: 'Not found' });
    const files = await damagesService.listDamageFiles(id);
    res.json({ damage, files });
  } catch (e) {
    console.error('GET /api/damages/:id', e);
    res.status(500).json({ error: 'Failed to load damage' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.unfallnummer || !String(body.unfallnummer).trim()) {
      return res.status(400).json({ error: 'unfallnummer is required' });
    }
    if (!body.fahrer || !String(body.fahrer).trim()) {
      return res.status(400).json({ error: 'fahrer is required' });
    }
    if (!body.schadensnummer || !String(body.schadensnummer).trim()) {
      return res.status(400).json({ error: 'schadensnummer is required' });
    }
    if (body.date && !isValidISODate(body.date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    const row = await damagesService.createDamage(body);
    res.status(201).json(row);
  } catch (e) {
    console.error('POST /api/damages', e);
    if (e.code === '23505') return res.status(400).json({ error: 'Duplicate schadensnummer' });
    res.status(500).json({ error: e.message || 'Failed to create damage' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    if (body.date && !isValidISODate(body.date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    const row = await damagesService.updateDamage(id, body);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error('PATCH /api/damages/:id', e);
    if (e.code === '23505') return res.status(400).json({ error: 'Duplicate schadensnummer' });
    res.status(500).json({ error: e.message || 'Failed to update damage' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = await damagesService.deleteDamage(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/damages/:id', e);
    res.status(500).json({ error: e.message || 'Failed to delete damage' });
  }
});

router.get('/:id/files', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const rows = await damagesService.listDamageFiles(id);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/damages/:id/files', e);
    res.status(500).json({ error: 'Failed to load files' });
  }
});

router.post('/:id/files', upload.array('files', 10), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'files are required' });
    const rows = await damagesService.addDamageFiles(id, files);
    res.status(201).json(rows);
  } catch (e) {
    console.error('POST /api/damages/:id/files', e);
    res.status(500).json({ error: e.message || 'Failed to upload files' });
  }
});

router.get('/:id/files/:fileId/download', async (req, res) => {
  try {
    const damageId = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    if (!Number.isFinite(damageId) || !Number.isFinite(fileId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const file = await damagesService.getDamageFile(damageId, fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const abs = path.resolve(__dirname, '../../../', file.file_path);
    const buf = await fs.readFile(abs);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.file_name || 'damage-file')}"`
    );
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.send(buf);
  } catch (e) {
    console.error('GET /api/damages/:id/files/:fileId/download', e);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const damageId = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    if (!Number.isFinite(damageId) || !Number.isFinite(fileId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const ok = await damagesService.deleteDamageFile(damageId, fileId);
    if (!ok) return res.status(404).json({ error: 'File not found' });
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /api/damages/:id/files/:fileId', e);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Save insurance report under car documents (car_documents) and return filled PDF.
router.post('/:id/insurance-report', async (req, res) => {
  try {
    const damageId = Number(req.params.id);
    if (!Number.isFinite(damageId)) return res.status(400).json({ error: 'Invalid id' });
    const { report } = req.body || {};
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ error: 'report is required' });
    }
    const result = await persistInsuranceReport(damageId, report);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    const { fileNamePdf, pdfBytes } = result;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileNamePdf)}"`,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.status(201).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('POST /api/damages/:id/insurance-report', e);
    res.status(500).json({ error: e.message || 'Failed to save insurance report' });
  }
});

// Same persistence as insurance-report; JSON body with base64 PDF (for SPA download / future Graph).
router.post('/:id/save-and-send', async (req, res) => {
  try {
    const damageId = Number(req.params.id);
    if (!Number.isFinite(damageId)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const { report } = req.body || {};
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ success: false, message: 'report is required' });
    }
    const result = await persistInsuranceReport(damageId, report);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.body?.error || 'Validation failed',
      });
    }
    const { fileNamePdf, pdfBytes } = result;

    const opponentEmail = String(report?.opponent?.email || '').trim();
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
    const to = isEmail(opponentEmail) ? [opponentEmail] : [];

    const licensePlate = String(report?.licensePlate || report?.license_plate || '').trim();
    const subject = `KFZ Schadenanzeige${licensePlate ? ` - ${licensePlate}` : ''}`;
    const bodyText = String(report?.notes || report?.liability?.description || '').trim();

    const composeFallbackOutlookUrl = () => {
      // Always return a usable compose deeplink, even if opponent email is missing.
      const subjectEncoded = encodeURIComponent(subject || '');
      const bodyEncoded = encodeURIComponent(bodyText || '');
      const toParam = isEmail(opponentEmail) ? `&to=${encodeURIComponent(opponentEmail)}` : '';
      return `https://outlook.office.com/mail/deeplink/compose?subject=${subjectEncoded}&body=${bodyEncoded}${toParam}`;
    };

    const composeMailtoUrl = () => {
      if (!isEmail(opponentEmail)) return null;
      const bodyEncoded = encodeURIComponent(bodyText || '');
      const subjectEncoded = encodeURIComponent(subject || '');
      // Для mailto адрес нельзя кодировать целиком (иначе часть браузеров не понимает адрес).
      return `mailto:${opponentEmail}?subject=${subjectEncoded}&body=${bodyEncoded}`;
    };

    let outlook = {
      mode: 'none',
      composeUrl: composeMailtoUrl() || composeFallbackOutlookUrl(),
      warning: null,
    };

    try {
      const graph = await createOutlookDraftWithPdfAttachment({
        pdfBytes,
        fileName: fileNamePdf,
        subject,
        bodyText,
        to,
        cc: [],
      });
      outlook = {
        mode: 'graph',
        composeUrl: graph?.composeUrl ?? null,
        warning: null,
      };
    } catch (graphErr) {
      outlook = {
        mode: 'none',
        // If Graph fails (misconfig/permissions), still provide a basic mailto fallback.
        composeUrl: composeMailtoUrl() || composeFallbackOutlookUrl(),
        warning: String(graphErr?.message || graphErr || 'Graph draft creation failed'),
      };
      console.error('Graph create draft failed:', graphErr);
    }

    res.json({
      success: true,
      fileName: fileNamePdf,
      outlook,
      pdfBase64: Buffer.from(pdfBytes).toString('base64'),
    });
  } catch (e) {
    console.error('POST /api/damages/:id/save-and-send', e);
    res.status(500).json({
      success: false,
      message: e.message || 'Failed to generate and save damage PDF.',
    });
  }
});

export default router;

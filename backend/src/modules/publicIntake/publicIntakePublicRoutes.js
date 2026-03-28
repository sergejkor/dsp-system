import { Router } from 'express';
import multer from 'multer';
import publicIntakeService from './publicIntakeService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
});

function runMultiUpload(req, res, fieldName) {
  return new Promise((resolve, reject) => {
    upload.array(fieldName, 12)(req, res, (error) => {
      if (!error) return resolve();
      return reject(error);
    });
  });
}

function parseJsonPayload(rawValue) {
  if (rawValue && typeof rawValue === 'object') return rawValue;
  const normalized = String(rawValue || '').trim();
  if (!normalized) return {};
  return JSON.parse(normalized);
}

function sendMulterError(res, error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A file is too large. Maximum upload size is 25 MB.' });
    }
    return res.status(400).json({ error: error.message || 'Upload failed' });
  }
  return null;
}

async function fetchAddressSuggestions(search) {
  const q = String(search || '').trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    limit: '8',
    lang: 'en',
  });

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: {
      'User-Agent': 'DSP-System/1.0 address-search',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Address search failed with ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const features = Array.isArray(data?.features) ? data.features : [];

  return features
    .map((feature, index) => {
      const p = feature?.properties || {};
      const streetName = String(p.street || p.name || '').trim();
      const houseNumber = String(p.housenumber || '').trim();
      const postalCode = String(p.postcode || '').trim();
      const city = String(p.city || p.town || p.village || p.county || '').trim();
      const country = String(p.country || '').trim();
      const district = String(p.state || p.district || '').trim();
      const labelParts = [
        [streetName, houseNumber].filter(Boolean).join(' '),
        postalCode,
        city,
        district,
        country,
      ].filter(Boolean);

      if (!labelParts.length) return null;

      return {
        id: String(feature?.properties?.osm_id || feature?.properties?.osmId || index),
        label: labelParts.join(', '),
        streetName,
        houseNumber,
        postalCode,
        city,
        country,
        addressLine1: district,
      };
    })
    .filter(Boolean);
}

router.get('/health', async (_req, res) => {
  try {
    await publicIntakeService.ensurePublicIntakeTables();
    res.json({ ok: true, module: 'public-intake' });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/address-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) {
      return res.json([]);
    }
    const rows = await fetchAddressSuggestions(q);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/public/address-search error', error);
    res.status(500).json({ error: 'Failed to search addresses' });
  }
});

router.post('/personal-fragebogen', async (req, res) => {
  try {
    await runMultiUpload(req, res, 'files');
    const payload = parseJsonPayload(req.body?.payload);
    const row = await publicIntakeService.submitPersonalQuestionnaire(payload, req.files || []);
    res.status(201).json({ ok: true, submission: row });
  } catch (error) {
    if (sendMulterError(res, error)) return;
    console.error('POST /api/public/personal-fragebogen error', error);
    res.status(400).json({ error: String(error?.message || error || 'Failed to submit personal questionnaire') });
  }
});

router.post('/schadenmeldung', async (req, res) => {
  try {
    await runMultiUpload(req, res, 'files');
    const payload = parseJsonPayload(req.body?.payload);
    const row = await publicIntakeService.submitDamageReport(payload, req.files || []);
    res.status(201).json({ ok: true, report: row });
  } catch (error) {
    if (sendMulterError(res, error)) return;
    console.error('POST /api/public/schadenmeldung error', error);
    res.status(400).json({ error: String(error?.message || error || 'Failed to submit damage report') });
  }
});

export default router;

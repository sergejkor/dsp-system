import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/damages');

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export const DAMAGE_FIELDS = [
  'case_closed',
  'date',
  'unfallnummer',
  'fahrer',
  'schadensnummer',
  'polizeiliches_aktenzeichen',
  'vorgang_angelegt',
  'fahrerformular_vollstaendig',
  'meldung_an_partner_abgegeben',
  'deckungszusage_erhalten',
  'kostenuebernahme_eigene_versicherung',
  'kostenuebernahme_fremde_versicherung',
  'kosten_alfamile',
  'regress_fahrer',
  'offen_geschlossen',
  'heute',
  'alter_tage_lt_90',
  'kurzbeschreibung',
  'kommentare',
];

const LIST_SELECT_WITH_CASE = `
     SELECT
       id,
       case_closed,
       date,
       unfallnummer,
       fahrer,
       schadensnummer,
       vorgang_angelegt,
       fahrerformular_vollstaendig,
       meldung_an_partner_abgegeben
     FROM damages
     ORDER BY date DESC NULLS LAST, id DESC`;

const LIST_SELECT_LEGACY = `
     SELECT
       id,
       date,
       unfallnummer,
       fahrer,
       schadensnummer,
       vorgang_angelegt,
       fahrerformular_vollstaendig,
       meldung_an_partner_abgegeben
     FROM damages
     ORDER BY date DESC NULLS LAST, id DESC`;

async function listDamages() {
  try {
    const res = await query(LIST_SELECT_WITH_CASE);
    return res.rows;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/case_closed/i.test(msg) && (/does not exist|undefined column|unknown column/i.test(msg))) {
      console.warn('[damages] case_closed column missing; run DB migration. Using legacy list query.');
      const res = await query(LIST_SELECT_LEGACY);
      return (res.rows || []).map((r) => ({ ...r, case_closed: false }));
    }
    throw e;
  }
}

async function getDamageById(id) {
  const res = await query('SELECT * FROM damages WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createDamage(data) {
  const d = { ...(data || {}) };
  const values = [];
  const cols = [];
  const placeholders = [];
  let i = 1;
  for (const k of DAMAGE_FIELDS) {
    if (d[k] !== undefined) {
      cols.push(k);
      placeholders.push(`$${i}`);
      if (k === 'kosten_alfamile') {
        values.push(d[k] === '' || d[k] == null ? null : Number(d[k]));
      } else if (k === 'case_closed') {
        values.push(d[k] === true || d[k] === 'true' || d[k] === 1 || d[k] === '1');
      } else {
        values.push(d[k] === '' ? null : (d[k] ?? null));
      }
      i += 1;
    }
  }
  const res = await query(
    `INSERT INTO damages (${cols.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING *`,
    values
  );
  return res.rows[0];
}

async function updateDamage(id, data) {
  const d = { ...(data || {}) };
  const sets = [];
  const values = [];
  let i = 1;
  for (const k of DAMAGE_FIELDS) {
    if (d[k] !== undefined) {
      sets.push(`${k} = $${i}`);
      if (k === 'kosten_alfamile') {
        values.push(d[k] === '' || d[k] == null ? null : Number(d[k]));
      } else if (k === 'case_closed') {
        values.push(d[k] === true || d[k] === 'true' || d[k] === 1 || d[k] === '1');
      } else {
        values.push(d[k] === '' ? null : (d[k] ?? null));
      }
      i += 1;
    }
  }
  if (!sets.length) return getDamageById(id);
  values.push(id);
  const res = await query(
    `UPDATE damages SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

async function listDamageFiles(damageId) {
  const res = await query(
    `SELECT id, damage_id, file_name, file_path, mime_type, file_size, created_at
     FROM damage_files
     WHERE damage_id = $1
     ORDER BY created_at DESC, id DESC`,
    [damageId]
  );
  return res.rows;
}

async function addDamageFiles(damageId, files) {
  await ensureUploadDir();
  const out = [];
  for (const f of files || []) {
    const safe = sanitizeFileName(f.originalname);
    const stored = `${damageId}_${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`;
    const absPath = path.join(UPLOAD_DIR, stored);
    await fs.writeFile(absPath, f.buffer);
    const relPath = `uploads/damages/${stored}`;
    const res = await query(
      `INSERT INTO damage_files (damage_id, file_name, file_path, mime_type, file_size)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, damage_id, file_name, file_path, mime_type, file_size, created_at`,
      [damageId, f.originalname, relPath, f.mimetype, f.size]
    );
    out.push(res.rows[0]);
  }
  return out;
}

async function getDamageFile(damageId, fileId) {
  const res = await query(
    `SELECT * FROM damage_files WHERE damage_id = $1 AND id = $2`,
    [damageId, fileId]
  );
  return res.rows[0] || null;
}

async function deleteDamageFile(damageId, fileId) {
  const file = await getDamageFile(damageId, fileId);
  if (!file) return false;
  // delete db first
  await query(`DELETE FROM damage_files WHERE id = $1 AND damage_id = $2`, [fileId, damageId]);
  // best-effort delete from disk
  if (file.file_path) {
    const abs = path.resolve(__dirname, '../../../', file.file_path);
    fs.unlink(abs).catch(() => {});
  }
  return true;
}

async function deleteDamage(id) {
  const damageId = Number(id);
  if (!Number.isFinite(damageId)) return false;
  const existing = await getDamageById(damageId);
  if (!existing) return false;

  const files = await listDamageFiles(damageId);
  for (const file of files) {
    if (file?.file_path) {
      const abs = path.resolve(__dirname, '../../../', file.file_path);
      fs.unlink(abs).catch(() => {});
    }
  }

  await query(`DELETE FROM damage_files WHERE damage_id = $1`, [damageId]);
  const res = await query(`DELETE FROM damages WHERE id = $1`, [damageId]);
  return (res.rowCount || 0) > 0;
}

export default {
  listDamages,
  getDamageById,
  createDamage,
  updateDamage,
  deleteDamage,
  listDamageFiles,
  addDamageFiles,
  getDamageFile,
  deleteDamageFile,
};

import { query } from '../../db.js';
import JSZip from 'jszip';

let documentTemplatesTableReady = false;

async function ensureUploadIsDocx(fileName, mimeType, fileBuffer) {
  const normalizedName = String(fileName || '').trim().toLowerCase();
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (!normalizedName.endsWith('.docx') && normalizedMime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error('Only DOCX templates are supported. Please upload a Word .docx file.');
  }
  try {
    const zip = await JSZip.loadAsync(fileBuffer);
    const hasWordDocument = Object.keys(zip.files || {}).some((name) => /^word\/document\.xml$/i.test(name));
    if (!hasWordDocument) {
      throw new Error('missing-word-document');
    }
  } catch (_error) {
    throw new Error('The uploaded template is not a valid DOCX file. Please upload a real Word .docx file.');
  }
}

async function ensureDocumentTemplatesTable() {
  if (documentTemplatesTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      document_key TEXT,
      description TEXT,
      requires_manual_dates BOOLEAN NOT NULL DEFAULT false,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_content BYTEA NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS document_key TEXT`);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS description TEXT`);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS requires_manual_dates BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS mime_type TEXT`);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS created_by INTEGER`);
  await query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS updated_by INTEGER`);
  documentTemplatesTableReady = true;
}

async function listTemplates() {
  await ensureDocumentTemplatesTable();
  const res = await query(`
    SELECT
      id,
      name,
      document_key,
      description,
      requires_manual_dates,
      file_name,
      mime_type,
      is_active,
      OCTET_LENGTH(file_content)::bigint AS file_size,
      created_at,
      updated_at
    FROM document_templates
    ORDER BY updated_at DESC NULLS LAST, id DESC
  `);
  return res.rows || [];
}

async function createTemplate({ name, documentKey, description, requiresManualDates = false, fileName, mimeType, fileBuffer, userId = null }) {
  await ensureDocumentTemplatesTable();
  const templateName = String(name || '').trim();
  if (!templateName) throw new Error('Template name is required');
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) throw new Error('Template file is required');
  await ensureUploadIsDocx(fileName, mimeType, fileBuffer);

  const res = await query(
    `INSERT INTO document_templates
      (name, document_key, description, requires_manual_dates, file_name, mime_type, file_content, created_by, updated_by, created_at, updated_at)
     VALUES ($1, NULLIF(TRIM($2), ''), NULLIF(TRIM($3), ''), $4, $5, $6, $7, $8, $8, NOW(), NOW())
     RETURNING
       id,
       name,
       document_key,
       description,
       requires_manual_dates,
       file_name,
       mime_type,
       is_active,
       OCTET_LENGTH(file_content)::bigint AS file_size,
       created_at,
       updated_at`,
    [
      templateName,
      String(documentKey || ''),
      String(description || ''),
      requiresManualDates === true,
      String(fileName || 'template.docx'),
      mimeType || null,
      fileBuffer,
      userId,
    ]
  );
  return res.rows[0] || null;
}

async function updateTemplate(id, { name, documentKey, description, requiresManualDates, userId = null }) {
  await ensureDocumentTemplatesTable();
  const templateId = Number.parseInt(id, 10);
  if (!Number.isFinite(templateId) || templateId <= 0) return null;
  const res = await query(
    `UPDATE document_templates
     SET
       name = COALESCE(NULLIF(TRIM($2), ''), name),
       document_key = CASE WHEN $3 IS NULL THEN document_key ELSE NULLIF(TRIM($3), '') END,
       description = CASE WHEN $4 IS NULL THEN description ELSE NULLIF(TRIM($4), '') END,
       requires_manual_dates = COALESCE($5, requires_manual_dates),
       updated_by = $6,
       updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       name,
       document_key,
       description,
       requires_manual_dates,
       file_name,
       mime_type,
       is_active,
       OCTET_LENGTH(file_content)::bigint AS file_size,
       created_at,
       updated_at`,
    [
      templateId,
      name === undefined ? null : String(name || ''),
      documentKey === undefined ? null : String(documentKey || ''),
      description === undefined ? null : String(description || ''),
      typeof requiresManualDates === 'boolean' ? requiresManualDates : null,
      userId,
    ]
  );
  return res.rows[0] || null;
}

async function deleteTemplate(id) {
  await ensureDocumentTemplatesTable();
  const res = await query(
    `DELETE FROM document_templates
     WHERE id = $1
     RETURNING id, name, file_name`,
    [id]
  );
  return res.rows[0] || null;
}

async function getTemplateDownload(id) {
  await ensureDocumentTemplatesTable();
  const res = await query(
    `SELECT id, name, file_name, mime_type, file_content
     FROM document_templates
     WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export default {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateDownload,
};

import JSZip from 'jszip';
import documentTemplateSettingsService from './documentTemplateSettingsService.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_XML_FILE_PATTERN = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i;

function sanitizeOutputFileName(fileName, fallbackBase = 'generated-document') {
  const raw = String(fileName || '').trim();
  const safeBase = (raw || fallbackBase)
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withExt = safeBase.toLowerCase().endsWith('.docx') ? safeBase : `${safeBase || fallbackBase}.docx`;
  return withExt;
}

function isDocxTemplate(template) {
  const fileName = String(template?.file_name || '').toLowerCase();
  const mimeType = String(template?.mime_type || '').toLowerCase();
  return fileName.endsWith('.docx') || mimeType === DOCX_MIME;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeReplacementEntries(replacements) {
  if (!replacements || typeof replacements !== 'object') return [];
  return Object.entries(replacements).map(([key, value]) => {
    const rawKey = String(key || '').trim();
    if (!rawKey) return null;
    const token = rawKey.includes('{{') ? rawKey : `{{${rawKey}}}`;
    return [token, xmlEscape(value)];
  }).filter(Boolean);
}

async function replaceTokensInDocx(buffer, replacements) {
  const zip = await JSZip.loadAsync(buffer);
  const replacementEntries = normalizeReplacementEntries(replacements);

  if (!replacementEntries.length) {
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  const fileNames = Object.keys(zip.files).filter((name) => DOCX_XML_FILE_PATTERN.test(name));
  for (const fileName of fileNames) {
    const file = zip.file(fileName);
    if (!file) continue;
    let xml = await file.async('string');
    for (const [token, value] of replacementEntries) {
      if (!token) continue;
      xml = xml.split(token).join(value);
    }
    zip.file(fileName, xml);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function generateDocumentFromTemplate({ templateId, replacements, fileName }) {
  const id = Number.parseInt(templateId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Template id is required');
  }

  const template = await documentTemplateSettingsService.getTemplateDownload(id);
  if (!template) {
    throw new Error('Template not found');
  }
  if (!isDocxTemplate(template)) {
    throw new Error('Only DOCX templates are supported for document generation');
  }

  const sourceBuffer = Buffer.isBuffer(template.file_content)
    ? template.file_content
    : Buffer.from(template.file_content || []);
  if (!sourceBuffer.length) {
    throw new Error('Template file is empty');
  }

  const generatedBuffer = await replaceTokensInDocx(sourceBuffer, replacements);
  return {
    buffer: generatedBuffer,
    mimeType: DOCX_MIME,
    fileName: sanitizeOutputFileName(
      fileName,
      template.document_key || template.name || template.file_name || 'generated-document'
    ),
  };
}

export default {
  generateDocumentFromTemplate,
};

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

async function ensureValidDocxBuffer(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files || {});
    const hasWordDocument = fileNames.some((name) => DOCX_XML_FILE_PATTERN.test(name));
    if (!hasWordDocument) {
      throw new Error('missing-word-document');
    }
    return zip;
  } catch (_error) {
    throw new Error('The uploaded template is not a valid DOCX file. Please upload a real Word .docx file, not .doc, PDF or a damaged file.');
  }
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

function collectWordTextNodes(xml) {
  const nodes = [];
  const regex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;
  while ((match = regex.exec(xml))) {
    const fullMatch = match[0];
    const text = match[1] || '';
    const relativeStart = fullMatch.indexOf(text);
    if (relativeStart < 0) continue;
    const contentStart = match.index + relativeStart;
    const contentEnd = contentStart + text.length;
    nodes.push({
      text,
      contentStart,
      contentEnd,
    });
  }
  return nodes;
}

function replaceTokenAcrossWordTextNodes(xml, token, replacement) {
  if (!xml || !token) return { xml, replaced: false };

  const nodes = collectWordTextNodes(xml);
  if (!nodes.length) return { xml, replaced: false };

  const combined = nodes.map((node) => node.text).join('');
  const tokenIndex = combined.indexOf(token);
  if (tokenIndex < 0) return { xml, replaced: false };

  const tokenEnd = tokenIndex + token.length;
  let charCursor = 0;
  let startNodeIndex = -1;
  let endNodeIndex = -1;
  let startOffset = 0;
  let endOffset = 0;

  for (let i = 0; i < nodes.length; i += 1) {
    const nextCursor = charCursor + nodes[i].text.length;
    if (startNodeIndex < 0 && tokenIndex >= charCursor && tokenIndex < nextCursor) {
      startNodeIndex = i;
      startOffset = tokenIndex - charCursor;
    }
    if (tokenEnd > charCursor && tokenEnd <= nextCursor) {
      endNodeIndex = i;
      endOffset = tokenEnd - charCursor;
      break;
    }
    charCursor = nextCursor;
  }

  if (startNodeIndex < 0 || endNodeIndex < 0) {
    return { xml, replaced: false };
  }

  const newTexts = nodes.map((node) => node.text);
  if (startNodeIndex === endNodeIndex) {
    newTexts[startNodeIndex] = `${nodes[startNodeIndex].text.slice(0, startOffset)}${replacement}${nodes[startNodeIndex].text.slice(endOffset)}`;
  } else {
    newTexts[startNodeIndex] = `${nodes[startNodeIndex].text.slice(0, startOffset)}${replacement}`;
    for (let i = startNodeIndex + 1; i < endNodeIndex; i += 1) {
      newTexts[i] = '';
    }
    newTexts[endNodeIndex] = nodes[endNodeIndex].text.slice(endOffset);
  }

  let rebuilt = '';
  let cursor = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    rebuilt += xml.slice(cursor, nodes[i].contentStart);
    rebuilt += newTexts[i];
    cursor = nodes[i].contentEnd;
  }
  rebuilt += xml.slice(cursor);
  return { xml: rebuilt, replaced: true };
}

async function replaceTokensInDocx(buffer, replacements) {
  const zip = await ensureValidDocxBuffer(buffer);
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
      if (xml.includes(token)) {
        xml = xml.split(token).join(value);
        continue;
      }
      let replaced = true;
      while (replaced) {
        const next = replaceTokenAcrossWordTextNodes(xml, token, value);
        xml = next.xml;
        replaced = next.replaced;
      }
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

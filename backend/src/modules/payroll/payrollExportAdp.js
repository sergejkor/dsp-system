import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_FILENAMES = [
  'Variable Daten Alfamile.xlsx',
  'alfamile-export.xlsx',
];

const COL = {
  ABRECHNUNGSZEITRAUM: 1,
  PERSONALNUMMER: 2,
  ARBEITNEHMER: 3,
  FAHRGELD: 6,
  VERPFLEGUNG: 7,
  ABZUG_SONSTIGE: 8,
  VORSCHUSS: 9,
  DA_BONUS: 11,
};
const DATA_START_ROW = 9;

function getTemplatePath() {
  const cwd = process.cwd();
  const fromCwd = (name) => path.join(cwd, 'templates', name);
  const fromModule = (name) => path.join(__dirname, '../../templates', name);
  for (const name of TEMPLATE_FILENAMES) {
    const p = fromCwd(name);
    if (fs.existsSync(p)) return p;
    const p2 = fromModule(name);
    if (fs.existsSync(p2)) return p2;
  }
  throw new Error('Export template not found. Place "Variable Daten Alfamile.xlsx" in backend/templates/');
}

function colLetter(c) {
  if (c < 0) return '';
  return colLetter(Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26));
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round2(val) {
  const n = Number(val);
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function buildCellString(ref, type, value, numberStyleIndex, textStyleIndex) {
  if (type === 's') {
    const sAttr = textStyleIndex != null ? ` s="${textStyleIndex}"` : '';
    return `<c r="${ref}" t="inlineStr"${sAttr}><is><t>${escapeXml(value)}</t></is></c>`;
  }
  const sAttr = numberStyleIndex != null ? ` s="${numberStyleIndex}"` : '';
  return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
}

function buildDataRows(periodValue, rows, numberStyleIndex, textStyleIndex) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = DATA_START_ROW + i;
    const cells = [];

    cells.push(buildCellString(colLetter(COL.ABRECHNUNGSZEITRAUM) + excelRow, 's', periodValue, null, textStyleIndex));
    cells.push(buildCellString(colLetter(COL.PERSONALNUMMER) + excelRow, 's', row.pn ?? '', null, textStyleIndex));
    cells.push(buildCellString(colLetter(COL.ARBEITNEHMER) + excelRow, 's', row.name ?? '', null, textStyleIndex));

    const fahrtGeld = round2(row.fahrt_geld);
    if (fahrtGeld !== 0) {
      cells.push(buildCellString(colLetter(COL.FAHRGELD) + excelRow, 'n', fahrtGeld, numberStyleIndex));
    }

    const verpflMehr = round2(row.verpfl_mehr);
    if (verpflMehr !== 0) {
      if (verpflMehr > 0) {
        cells.push(buildCellString(colLetter(COL.VERPFLEGUNG) + excelRow, 'n', verpflMehr, numberStyleIndex));
      } else {
        cells.push(buildCellString(colLetter(COL.ABZUG_SONSTIGE) + excelRow, 'n', Math.abs(verpflMehr), numberStyleIndex));
      }
    }

    const vorschuss = round2(row.vorschuss);
    if (vorschuss !== 0) {
      cells.push(buildCellString(colLetter(COL.VORSCHUSS) + excelRow, 'n', vorschuss, numberStyleIndex));
    }

    const bonus = round2(row.bonus);
    if (bonus !== 0) {
      cells.push(buildCellString(colLetter(COL.DA_BONUS) + excelRow, 'n', bonus, numberStyleIndex));
    }

    out.push(`<row r="${excelRow}">${cells.join('')}</row>`);
  }
  return out.join('');
}

/**
 * Ensure styles.xml has: (1) black font, (2) cell style for numbers 0.00, (3) cell style for text with black font.
 * Returns { stylesXml, numberStyleIndex, textStyleIndex }.
 */
function getOrCreateNumberAndTextStyles(stylesXml) {
  const numFmtId = '2';
  const cellXfsMatch = stylesXml.match(/<cellXfs\s+count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) return { stylesXml, numberStyleIndex: 0, textStyleIndex: 0 };

  const count = parseInt(cellXfsMatch[1], 10);
  const inner = cellXfsMatch[2];
  const xfList = inner.match(/<xf[^/]+(?:\/>|<\/xf>)/g) || [];

  // Find index of a black font (FF000000)
  const fontsMatch = stylesXml.match(/<fonts\s+count="(\d+)"[^>]*>([\s\S]*?)<\/fonts>/);
  let blackFontId = -1;
  if (fontsMatch) {
    const fontContent = fontsMatch[2];
    const fontTags = fontContent.match(/<font[^>]*>[\s\S]*?<\/font>/g) || [];
    for (let i = 0; i < fontTags.length; i++) {
      if (fontTags[i].includes('FF000000') || fontTags[i].includes('rgb="FF000000"')) {
        blackFontId = i;
        break;
      }
    }
  }
  const fontCount = fontsMatch ? parseInt(fontsMatch[1], 10) : 0;

  let numberStyleIndex = -1;
  let textStyleIndex = -1;
  for (let i = 0; i < xfList.length; i++) {
    const xf = xfList[i];
    const hasFont = (id) => new RegExp(`fontId="${id}"`).test(xf) || new RegExp(`fontId='${id}'`).test(xf);
    if (!hasFont(blackFontId)) continue;
    if ((xf.includes('numFmtId="2"') || xf.includes("numFmtId='2'")) && (xf.includes('applyNumberFormat="1"') || xf.includes("applyNumberFormat='1'"))) {
      numberStyleIndex = i;
    } else {
      if (textStyleIndex < 0) textStyleIndex = i;
    }
  }

  if (numberStyleIndex >= 0 && textStyleIndex >= 0) {
    return { stylesXml, numberStyleIndex, textStyleIndex };
  }

  let newStylesXml = stylesXml;
  let fontIdToUse = blackFontId >= 0 ? blackFontId : 0;

  if (numberStyleIndex < 0) {
    if (blackFontId < 0) {
      const newFont = '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>';
      newStylesXml = newStylesXml.replace('</fonts>', `${newFont}</fonts>`);
      newStylesXml = newStylesXml.replace(/<fonts\s+count="\d+"/, `<fonts count="${fontCount + 1}"`);
      fontIdToUse = fontCount;
    } else {
      fontIdToUse = blackFontId;
    }
    const newXfNum = `<xf numFmtId="${numFmtId}" fontId="${fontIdToUse}" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`;
    const newXfText = `<xf fontId="${fontIdToUse}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`;
    newStylesXml = newStylesXml.replace('</cellXfs>', `${newXfNum}${textStyleIndex < 0 ? newXfText : ''}</cellXfs>`);
    newStylesXml = newStylesXml.replace(/<cellXfs\s+count="\d+"/, `<cellXfs count="${count + (textStyleIndex < 0 ? 2 : 1)}"`);
    numberStyleIndex = count;
    textStyleIndex = textStyleIndex < 0 ? count + 1 : textStyleIndex;
    return { stylesXml: newStylesXml, numberStyleIndex, textStyleIndex };
  }

  if (textStyleIndex < 0) {
    let textFontId = blackFontId >= 0 ? blackFontId : fontCount;
    if (blackFontId < 0) {
      const newFont = '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>';
      newStylesXml = newStylesXml.replace('</fonts>', `${newFont}</fonts>`);
      newStylesXml = newStylesXml.replace(/<fonts\s+count="\d+"/, `<fonts count="${fontCount + 1}"`);
      textFontId = fontCount;
    }
    const newXfText = `<xf fontId="${textFontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`;
    newStylesXml = newStylesXml.replace('</cellXfs>', `${newXfText}</cellXfs>`);
    newStylesXml = newStylesXml.replace(/<cellXfs\s+count="\d+"/, `<cellXfs count="${count + 1}"`);
    textStyleIndex = count;
  }
  return { stylesXml: newStylesXml, numberStyleIndex, textStyleIndex };
}

/**
 * Minimal edit: only patch sheet1.xml data rows. Rest of file (formulas, styles, layout) is unchanged.
 */
function patchSheetXml(sheetXml, periodValue, rows, numberStyleIndex, textStyleIndex) {
  const dataRowsXml = buildDataRows(periodValue, rows, numberStyleIndex, textStyleIndex);

  const removeRowsFrom9 = sheetXml.replace(
    /<row r="([9-9]|[1-9]\d|\d{3,})"[^>]*>[\s\S]*?<\/row>/g,
    ''
  );

  const insertPos = removeRowsFrom9.indexOf('</sheetData>');
  if (insertPos === -1) {
    throw new Error('Template sheet has no sheetData');
  }

  return removeRowsFrom9.slice(0, insertPos) + dataRowsXml + removeRowsFrom9.slice(insertPos);
}

async function getFirstSheetPath(zip) {
  const wb = zip.file('xl/workbook.xml');
  const rels = zip.file('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) return 'xl/worksheets/sheet1.xml';
  const wbXml = await wb.async('string');
  const relsXml = await rels.async('string');
  const sheetMatch = wbXml.match(/<sheet\s[^>]*\sr:id="(rId\d+)"/);
  const rId = sheetMatch ? sheetMatch[1] : 'rId1';
  let relMatch = relsXml.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`));
  if (!relMatch) relMatch = relsXml.match(new RegExp(`Target="(worksheets/[^"]+)"[^>]*Id="${rId}"`));
  const target = relMatch ? relMatch[1] : 'worksheets/sheet1.xml';
  const sheetPath = target.startsWith('xl/') ? target : `xl/${target.replace(/^\//, '')}`;
  return sheetPath;
}

/**
 * Export payroll to ADP via minimal ZIP edit. Only sheet data (rows 9+) is changed; layout and formulas stay intact.
 */
export async function exportPayrollToAdp(month, rows) {
  const templatePath = getTemplatePath();
  const buf = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(buf);

  const sheetPath = await getFirstSheetPath(zip);
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) {
    throw new Error('Template has no worksheet');
  }

  const sheetXml = await sheetFile.async('string');
  const periodValue = (month || '').replace(/-/g, '').slice(0, 6) || '';

  const sortedRows = [...rows].sort((a, b) => {
    const pa = String(a.pn ?? '').trim();
    const pb = String(b.pn ?? '').trim();
    return pa.localeCompare(pb, undefined, { numeric: true });
  });

  const stylesFile = zip.file('xl/styles.xml');
  let numberStyleIndex = 0;
  let textStyleIndex = 0;
  if (stylesFile) {
    const stylesXml = await stylesFile.async('string');
    const { stylesXml: newStylesXml, numberStyleIndex: numIdx, textStyleIndex: txtIdx } = getOrCreateNumberAndTextStyles(stylesXml);
    numberStyleIndex = numIdx;
    textStyleIndex = txtIdx ?? numIdx;
    zip.file('xl/styles.xml', newStylesXml);
  }

  const newSheetXml = patchSheetXml(sheetXml, periodValue, sortedRows, numberStyleIndex, textStyleIndex);
  zip.file(sheetPath, newSheetXml);

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return out;
}

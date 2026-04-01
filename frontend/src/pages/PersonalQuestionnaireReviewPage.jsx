import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PersonalQuestionnaireForm, { createEmptyPersonalQuestionnaire } from '../components/PersonalQuestionnaireForm.jsx';
import { getPersonalQuestionnaireCopy } from '../components/personalQuestionnaireI18n.js';
import {
  deletePersonalQuestionnaire,
  downloadPersonalQuestionnaireFile,
  getPersonalQuestionnaire,
  listPersonalQuestionnaires,
  markPersonalQuestionnaireUnread,
  saveAndSendPersonalQuestionnaire,
  updatePersonalQuestionnaire,
  uploadPersonalQuestionnaireFiles,
} from '../services/intakeApi.js';
import { getO2List } from '../services/o2TelefonicaApi.js';
import { listEmployees } from '../services/employeesApi.js';
import { getSettingsByGroup } from '../services/settingsApi.js';

function displayName(row) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || row?.email || `Submission ${row?.id}`;
}

function normalizeNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\\/:"*?<>|]+/g, '')
    .replace(/_+/g, '_');
}

function buildDocumentTemplateOptions(form) {
  const firstName = normalizeNamePart(form?.firstName || form?.personal?.firstName);
  const lastName = normalizeNamePart(form?.lastName || form?.personal?.lastName);
  const suffix = [firstName, lastName].filter(Boolean).join('_') || 'Name_Surname';
  return [
    `Anmeldung_${suffix}`,
    `Aufhenthaltstitel_${suffix}_hinten`,
    `Aufhenthaltstitel_${suffix}_vorne`,
    `Ausweis_${suffix}_hinten`,
    `Ausweis_${suffix}_vorne`,
    `Führerschein_${suffix}_hinten`,
    `Führerschein_${suffix}_vorne`,
    `Zusatzblatt_${suffix}_hinten`,
    `Zusatzblatt_${suffix}_vorne`,
    `Bankkonto_${suffix}`,
    `Versicherungskarte_${suffix}`,
    `Steuer_ID_${suffix}`,
    `SV_Nummer_${suffix}`,
  ].map((value) => ({ value, label: value }));
}

function normalizePayload(payload) {
  const blank = createEmptyPersonalQuestionnaire();
  return {
    ...blank,
    ...(payload || {}),
    account: { ...blank.account, ...(payload?.account || {}) },
    personal: { ...blank.personal, ...(payload?.personal || {}) },
    work: { ...blank.work, ...(payload?.work || {}) },
    address: { ...blank.address, ...(payload?.address || {}) },
    home: { ...blank.home, ...(payload?.home || {}) },
    financial: { ...blank.financial, ...(payload?.financial || {}) },
    dspLocal: { ...blank.dspLocal, ...(payload?.dspLocal || {}) },
    uniform: { ...blank.uniform, ...(payload?.uniform || {}) },
  };
}

function parseWarningList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const normalized = String(value || '').trim();
  if (!normalized) return [];
  return normalized
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_HEADER_BYTES = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]);
const CANVAS_DOC_WIDTH = 1240;
const CANVAS_PAGE_HEIGHT = Math.round((PDF_PAGE_HEIGHT / PDF_PAGE_WIDTH) * CANVAS_DOC_WIDTH);
const CANVAS_PADDING = 42;

function normalizePdfConfig(settings = {}) {
  const readString = (key, fallback) => {
    const value = settings?.[key]?.value;
    const normalized = String(value ?? fallback ?? '').trim();
    return normalized || fallback;
  };
  const readNumber = (key, fallback) => {
    const value = Number(settings?.[key]?.value ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    companyName: readString('pdf_company_name', 'AlfaMile GmbH'),
    title: readString('pdf_title', 'Personalfragebogen'),
    fontFamily: readString('pdf_font_family', 'Segoe UI'),
    headerTitleSize: readNumber('pdf_header_title_size', 40),
    bodyFontSize: readNumber('pdf_body_font_size', 15),
    headerColorStart: readString('pdf_header_color_start', '#173d7a'),
    headerColorEnd: readString('pdf_header_color_end', '#2f7ec9'),
    accentColor: readString('pdf_accent_color', '#2f7ec9'),
  };
}

function pdfFont(weight, size, family) {
  return `${weight} ${size}px "${String(family || 'Segoe UI').replace(/"/g, '')}"`;
}

function formatPdfDate(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const [year, month, day] = normalized.split('-');
  return `${day}.${month}.${year}`;
}

function formatPdfValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return String(value);
  const normalized = String(value).trim();
  if (!normalized) return '—';
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? formatPdfDate(normalized) : normalized;
}

function createPdfSourceSections(form, detail, copy) {
  return [
    {
      id: 'submission',
      title: 'Submission',
      rows: [
        { id: 'submissionId', label: 'Submission ID', value: detail?.id },
        { id: 'status', label: 'Status', value: detail?.status },
        { id: 'employeeRef', label: 'Employee ref', value: detail?.employee_ref },
      ],
    },
    {
      id: 'employerFields',
      title: 'Employer fields',
      rows: [
        { id: 'jobTitle', label: 'Job title', value: form.work?.jobTitle },
        { id: 'workEmail', label: 'Work e-mail', value: form.account?.email },
        { id: 'startDate', label: 'Start date', value: form.work?.startDate },
        { id: 'employeeNumber', label: 'Personal Nr.', value: form.work?.employeeNumber },
        { id: 'workMobile', label: 'Work Mobile', value: form.work?.workMobile },
        { id: 'weeklyHours', label: 'Weekly hours', value: form.work?.weeklyHours },
        { id: 'probationUntil', label: 'Probation until', value: form.work?.probationUntil },
        { id: 'contractEnd', label: 'Contract end', value: form.work?.contractEnd },
        { id: 'managerName', label: 'Manager', value: form.work?.managerName },
      ],
    },
    {
      id: 'identity',
      title: copy.identity,
      rows: [
        { id: 'firstName', label: copy.firstName, value: form.firstName || form.personal?.firstName },
        { id: 'middleName', label: copy.middleName, value: form.personal?.middleName },
        { id: 'lastName', label: copy.lastName, value: form.lastName || form.personal?.lastName },
        { id: 'language', label: copy.language, value: form.account?.language },
        { id: 'taxClass', label: copy.taxClass, value: form.taxClass },
      ],
    },
    {
      id: 'personalData',
      title: copy.personalData,
      rows: [
        { id: 'birthdate', label: copy.birthDay, value: form.personal?.birthdate },
        { id: 'birthPlace', label: copy.birthPlace, value: form.personal?.birthPlace },
        { id: 'birthName', label: copy.birthName, value: form.personal?.birthName },
        { id: 'gender', label: copy.gender, value: form.personal?.gender },
        { id: 'nationality', label: copy.nationality, value: form.personal?.nationality },
        { id: 'maritalStatus', label: copy.maritalStatus, value: form.home?.maritalStatus },
      ],
    },
    {
      id: 'address',
      title: copy.address,
      rows: [
        { id: 'streetName', label: copy.streetName, value: form.address?.streetName },
        { id: 'houseNumber', label: copy.houseNumber, value: form.address?.houseNumber },
        { id: 'addressLine2', label: copy.addressLine2, value: form.address?.addressLine1 },
        { id: 'postalCode', label: copy.postalCode, value: form.address?.postalCode },
        { id: 'city', label: copy.city, value: form.address?.city },
        { id: 'country', label: copy.country, value: form.address?.country },
      ],
    },
    {
      id: 'privateContactFamily',
      title: copy.privateContactFamily,
      rows: [
        { id: 'privateEmail', label: copy.privateEmail, value: form.home?.privateEmail },
        { id: 'personalMobile', label: copy.personalMobile, value: form.home?.personalMobile },
        { id: 'childrenCount', label: copy.children, value: form.home?.childrenCount },
        { id: 'childrenNames', label: copy.childNamesBirthDate, value: form.home?.childrenNames },
      ],
    },
    {
      id: 'financial',
      title: copy.financial,
      rows: [
        { id: 'bankName', label: copy.bankName, value: form.financial?.bankName },
        { id: 'accountHolderName', label: copy.accountHolder, value: form.financial?.accountHolderName },
        { id: 'iban', label: copy.iban, value: form.financial?.iban },
        { id: 'bic', label: copy.bic, value: form.financial?.bic },
        { id: 'taxId', label: copy.taxId, value: form.financial?.taxId },
        { id: 'nationalInsuranceNumber', label: copy.svNumber, value: form.financial?.nationalInsuranceNumber },
        { id: 'insuranceCompany', label: copy.insuranceCompany, value: form.financial?.insuranceCompany },
        { id: 'churchTax', label: copy.churchTax, value: form.financial?.churchTax },
        { id: 'churchTaxType', label: copy.churchTaxType, value: form.financial?.churchTaxType },
      ],
    },
    {
      id: 'driverLicense',
      title: copy.driverLicense,
      rows: [
        { id: 'licenseIssueDate', label: copy.drivingLicenseIssueDate, value: form.dspLocal?.fuehrerschein_aufstellungsdatum },
        { id: 'licenseExpiryDate', label: copy.drivingLicenseExpiryDate, value: form.dspLocal?.fuehrerschein_ablaufsdatum },
        { id: 'licenseAuthority', label: copy.drivingLicenseAuthority, value: form.dspLocal?.fuehrerschein_aufstellungsbehoerde },
      ],
    },
    {
      id: 'uniform',
      title: copy.uniform,
      rows: [
        { id: 'jacke', label: copy.jacke, value: form.uniform?.jacke },
        { id: 'hose', label: copy.hose, value: form.uniform?.hose },
        { id: 'shirt', label: copy.shirt, value: form.uniform?.shirt },
        { id: 'schuhe', label: copy.schuhe, value: form.uniform?.schuhe },
      ],
    },
  ];
}

function buildPdfTemplateValues(form, detail) {
  const fullName = [form.firstName || form.personal?.firstName, form.lastName || form.personal?.lastName].filter(Boolean).join(' ').trim();
  const address = [form.address?.streetName, form.address?.houseNumber, form.address?.postalCode, form.address?.city, form.address?.country].filter(Boolean).join(', ');
  return {
    submissionId: formatPdfValue(detail?.id),
    firstName: formatPdfValue(form.firstName || form.personal?.firstName),
    lastName: formatPdfValue(form.lastName || form.personal?.lastName),
    fullName: fullName || '—',
    email: formatPdfValue(form.account?.email),
    phone: formatPdfValue(form.home?.personalMobile || form.work?.workMobile),
    startDate: formatPdfValue(form.work?.startDate),
    contractEnd: formatPdfValue(form.work?.contractEnd),
    employeeNumber: formatPdfValue(form.work?.employeeNumber),
    managerName: formatPdfValue(form.work?.managerName),
    jobTitle: formatPdfValue(form.work?.jobTitle),
    address: address || '—',
    city: formatPdfValue(form.address?.city),
    country: formatPdfValue(form.address?.country),
    createdAt: formatPdfValue(detail?.created_at),
    reviewUrl: formatPdfValue(window?.location?.href),
    today: formatPdfDate(new Date().toISOString().slice(0, 10)),
  };
}

function applyPdfTemplate(value, tokens) {
  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => tokens?.[key] ?? '—');
}

function createPdfSourceSummaryCards(form) {
  return [
    { id: 'language', label: 'Language', value: form.account?.language },
    { id: 'taxClass', label: 'Tax class', value: form.taxClass },
    { id: 'managerName', label: 'Manager', value: form.work?.managerName },
    { id: 'startDate', label: 'Start date', value: form.work?.startDate },
    { id: 'employeeNumber', label: 'Personal Nr.', value: form.work?.employeeNumber },
    { id: 'workMobile', label: 'Work mobile', value: form.work?.workMobile },
  ];
}

function buildPdfSummaryCards(form, detail, pdfSettings) {
  const sourceCards = createPdfSourceSummaryCards(form);
  const sourceCardsById = new Map(sourceCards.map((card) => [card.id, card]));
  const templateValues = buildPdfTemplateValues(form, detail);
  const layoutCards = Array.isArray(pdfSettings?.pdf_layout_schema?.value?.summaryCards)
    ? pdfSettings.pdf_layout_schema.value.summaryCards
    : sourceCards.map((card) => ({ id: card.id, sourceCardId: card.id, label: card.label, visible: true, isCustom: false, manualValue: '' }));

  return layoutCards
    .filter((card) => card?.visible !== false)
    .map((card) => {
      if (card?.isCustom) {
        return {
          label: card?.label || 'Custom card',
          value: applyPdfTemplate(card?.manualValue, templateValues),
        };
      }
      const sourceCard = sourceCardsById.get(card?.sourceCardId);
      if (!sourceCard) return null;
      return {
        label: card?.label || sourceCard.label,
        value: sourceCard.value,
      };
    })
    .filter(Boolean);
}

function buildPdfSections(form, detail, copy, pdfSettings) {
  const sourceSections = createPdfSourceSections(form, detail, copy);
  const sourceSectionsById = new Map(sourceSections.map((section) => [section.id, section]));
  const templateValues = buildPdfTemplateValues(form, detail);
  const layoutSections = Array.isArray(pdfSettings?.pdf_layout_schema?.value?.sections)
    ? pdfSettings.pdf_layout_schema.value.sections
    : sourceSections.map((section) => ({
        id: section.id,
        sourceSectionId: section.id,
        title: section.title,
        visible: true,
        rows: section.rows.map((row) => ({ id: row.id, sourceRowId: row.id, label: row.label, visible: true, isCustom: false, manualValue: '' })),
      }));

  return layoutSections
    .filter((section) => section?.visible !== false)
    .map((section) => {
      const sourceSection = sourceSectionsById.get(section.sourceSectionId);
      const sourceRowsById = new Map((sourceSection?.rows || []).map((row) => [row.id, row]));
      const rows = Array.isArray(section?.rows)
        ? section.rows
            .filter((row) => row?.visible !== false)
            .map((row) => {
              if (row?.isCustom) {
                return {
                  label: row.label || 'Manual text',
                  value: applyPdfTemplate(row.manualValue, templateValues),
                };
              }
              const sourceRow = sourceRowsById.get(row?.sourceRowId);
              if (!sourceRow) return null;
              return {
                label: row?.label || sourceRow.label,
                value: sourceRow.value,
              };
            })
            .filter(Boolean)
        : [];
      return {
        title: section?.title || sourceSection?.title || 'Section',
        rows,
      };
    })
    .filter((section) => section.rows.length > 0);
}

function chunkPdfSectionRows(rows, size = 4) {
  const out = [];
  for (let index = 0; index < rows.length; index += size) {
    out.push(rows.slice(index, index + size));
  }
  return out;
}

function createCanvasContext(width = 10, height = 10) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

function wrapCanvasText(ctx, text, maxWidth) {
  const normalized = formatPdfValue(text);
  const rawLines = String(normalized).split(/\r?\n/);
  const lines = [];

  rawLines.forEach((rawLine) => {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('—');
      return;
    }
    let current = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const next = `${current} ${words[index]}`;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = words[index];
      }
    }
    lines.push(current);
  });

  return lines.length ? lines : ['—'];
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle = null, lineWidth = 1) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function estimateSectionGroupHeight(ctx, group, width) {
  const innerWidth = width - 28;
  let total = 22;
  group.forEach((row) => {
    const lines = wrapCanvasText(ctx, row.value, innerWidth);
    total += 16 + lines.length * 16 + 10;
  });
  return total;
}

function finalizeCanvasPage(canvas) {
  return {
    width: canvas.width,
    height: canvas.height,
    jpegBytes: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)),
  };
}

function createPdfCanvasPage(pageNumber, pdfConfig) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_DOC_WIDTH;
  canvas.height = CANVAS_PAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef4fb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d7e5f5';
  ctx.fillRect(0, 0, canvas.width, 18);
  ctx.fillStyle = '#b8cbe3';
  ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
  ctx.fillStyle = '#64748b';
  ctx.font = pdfFont(500, 15, pdfConfig.fontFamily);
  ctx.fillText(`Page ${pageNumber}`, canvas.width - 140, canvas.height - 36);
  return { canvas, ctx };
}

function renderPersonalQuestionnairePdfPages({ selectedRow, detail, form, pdfSections, pdfSummaryCards, pdfConfig }) {
  const measureCtx = createCanvasContext();
  const summaryItems = Array.isArray(pdfSummaryCards) ? pdfSummaryCards : [];
  const contentWidth = CANVAS_DOC_WIDTH - CANVAS_PADDING * 2;
  const summaryGap = 14;
  const summaryCardWidth = Math.floor((contentWidth - summaryGap * 2) / 3);
  const colGap = 14;
  const columnWidth = Math.floor((contentWidth - colGap) / 2);
  const topY = 34;
  const bottomSafeY = CANVAS_PAGE_HEIGHT - 66;

  let pageNumber = 1;
  let { canvas, ctx } = createPdfCanvasPage(pageNumber, pdfConfig);
  const pages = [];

  function newPage() {
    pages.push(finalizeCanvasPage(canvas));
    pageNumber += 1;
    ({ canvas, ctx } = createPdfCanvasPage(pageNumber, pdfConfig));
  }

  function ensureSpace(requiredHeight, resetY = topY) {
    if (currentY + requiredHeight > bottomSafeY) {
      newPage();
      currentY = resetY;
      return true;
    }
    return false;
  }

  function drawHeader() {
    const headerHeight = 178;
    const headerX = CANVAS_PADDING;
    const headerY = currentY;
    const headerWidth = contentWidth;
    const gradient = ctx.createLinearGradient(headerX, headerY, headerX + headerWidth, headerY + headerHeight);
    gradient.addColorStop(0, pdfConfig.headerColorStart);
    gradient.addColorStop(0.58, pdfConfig.headerColorEnd);
    gradient.addColorStop(1, pdfConfig.headerColorEnd);
    drawRoundedRect(ctx, headerX, headerY, headerWidth, headerHeight, 30, gradient);

    ctx.fillStyle = '#ffffff';
    ctx.font = pdfFont(600, 16, pdfConfig.fontFamily);
    ctx.fillText(pdfConfig.companyName, headerX + 30, headerY + 36);
    ctx.font = pdfFont(700, pdfConfig.headerTitleSize, pdfConfig.fontFamily);
    ctx.fillText(pdfConfig.title, headerX + 30, headerY + 86);
    ctx.font = pdfFont(600, 24, pdfConfig.fontFamily);
    const nameLines = wrapCanvasText(ctx, displayName(selectedRow), 560);
    nameLines.slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, headerX + 30, headerY + 122 + index * 28);
    });

    const statusCardWidth = 270;
    const statusCardHeight = 110;
    const statusCardX = headerX + headerWidth - statusCardWidth - 28;
    const statusCardY = headerY + 28;
    drawRoundedRect(ctx, statusCardX, statusCardY, statusCardWidth, statusCardHeight, 22, 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.24)', 2);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = pdfFont(600, 13, pdfConfig.fontFamily);
    ctx.fillText('STATUS', statusCardX + 18, statusCardY + 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = pdfFont(700, 24, pdfConfig.fontFamily);
    const statusLines = wrapCanvasText(ctx, detail?.status || selectedRow.status, statusCardWidth - 36);
    statusLines.slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, statusCardX + 18, statusCardY + 54 + index * 24);
    });
    ctx.font = pdfFont(400, 14, pdfConfig.fontFamily);
    ctx.fillText(`Submission ID: ${formatPdfValue(detail?.id)}`, statusCardX + 18, statusCardY + 88);
    ctx.fillText(`Employee ref: ${formatPdfValue(detail?.employee_ref)}`, statusCardX + 18, statusCardY + 106);

    currentY += headerHeight + 18;
  }

  function drawSummary() {
    if (!summaryItems.length) return;
    summaryItems.forEach((item, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = CANVAS_PADDING + col * (summaryCardWidth + summaryGap);
      const y = currentY + row * (92 + summaryGap);
      drawRoundedRect(ctx, x, y, summaryCardWidth, 92, 18, '#ffffff', '#dbe4f0', 2);
      ctx.fillStyle = '#64748b';
      ctx.font = pdfFont(600, 12, pdfConfig.fontFamily);
      ctx.fillText(item.label.toUpperCase(), x + 18, y + 24);
      ctx.fillStyle = '#0f172a';
      ctx.font = pdfFont(700, 19, pdfConfig.fontFamily);
      const lines = wrapCanvasText(ctx, item.value, summaryCardWidth - 36);
      lines.slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, x + 18, y + 56 + lineIndex * 20);
      });
    });
    currentY += Math.ceil(summaryItems.length / 3) * (92 + summaryGap);
  }

  let currentY = topY;
  drawHeader();
  drawSummary();

  pdfSections.forEach((section) => {
    const groups = chunkPdfSectionRows(section.rows, 4);
    const pairDescriptors = [];

    for (let index = 0; index < groups.length; index += 2) {
      measureCtx.font = pdfFont(600, pdfConfig.bodyFontSize, pdfConfig.fontFamily);
      const leftHeight = estimateSectionGroupHeight(measureCtx, groups[index], columnWidth);
      const rightHeight = groups[index + 1] ? estimateSectionGroupHeight(measureCtx, groups[index + 1], columnWidth) : 0;
      pairDescriptors.push({
        left: groups[index],
        right: groups[index + 1] || null,
        height: Math.max(leftHeight, rightHeight),
      });
    }

    let sectionStarted = false;

    pairDescriptors.forEach((pair, pairIndex) => {
      const titleHeight = sectionStarted ? 0 : 60;
      const neededHeight = titleHeight + pair.height + (pairIndex < pairDescriptors.length - 1 ? 14 : 8);
      const forcedNewPage = ensureSpace(neededHeight, topY);

      if (!sectionStarted || forcedNewPage) {
        drawRoundedRect(ctx, CANVAS_PADDING, currentY, contentWidth, 60, 22, '#ffffff', '#dbe4f0', 2);
        ctx.fillStyle = pdfConfig.accentColor;
        ctx.beginPath();
        ctx.arc(CANVAS_PADDING + 22, currentY + 22, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pdfConfig.headerColorStart;
        ctx.font = pdfFont(700, 24, pdfConfig.fontFamily);
        ctx.fillText(section.title, CANVAS_PADDING + 40, currentY + 30);
        currentY += 60 + 10;
        sectionStarted = true;
      }

      [pair.left, pair.right].forEach((group, groupIndex) => {
        if (!group) return;
        const x = CANVAS_PADDING + groupIndex * (columnWidth + colGap);
        drawRoundedRect(ctx, x, currentY, columnWidth, pair.height, 18, '#ffffff', '#dfe8f4', 2);
        let innerY = currentY + 16;
        group.forEach((row) => {
          ctx.fillStyle = '#64748b';
          ctx.font = pdfFont(600, 12, pdfConfig.fontFamily);
          ctx.fillText(String(row.label).toUpperCase(), x + 14, innerY);
          innerY += 16;
          ctx.fillStyle = '#111827';
          ctx.font = pdfFont(600, pdfConfig.bodyFontSize, pdfConfig.fontFamily);
          const lines = wrapCanvasText(ctx, row.value, columnWidth - 28);
          lines.forEach((line) => {
            ctx.fillText(line, x + 14, innerY);
            innerY += 16;
          });
          innerY += 10;
        });
      });

      currentY += pair.height + 14;
    });
  });

  pages.push(finalizeCanvasPage(canvas));
  return pages;
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function asciiBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function concatBytes(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function canvasToPdfPages(canvas) {
  const pageHeightPx = Math.max(1, Math.floor((PDF_PAGE_HEIGHT / PDF_PAGE_WIDTH) * canvas.width));
  const pages = [];

  for (let offsetY = 0; offsetY < canvas.height; offsetY += pageHeightPx) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, pageCanvas.width, pageCanvas.height);
    pages.push({
      width: pageCanvas.width,
      height: pageCanvas.height,
      jpegBytes: dataUrlToBytes(pageCanvas.toDataURL('image/jpeg', 0.92)),
    });
  }

  return pages;
}

function buildPdfBytesFromPages(pages) {
  const totalObjects = 2 + pages.length * 3;
  const objects = new Array(totalObjects + 1);
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  const imageObjectNumbers = [];

  let nextObjectNumber = 3;
  for (let index = 0; index < pages.length; index += 1) {
    pageObjectNumbers.push(nextObjectNumber);
    contentObjectNumbers.push(nextObjectNumber + 1);
    imageObjectNumbers.push(nextObjectNumber + 2);
    nextObjectNumber += 3;
  }

  objects[1] = asciiBytes('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects[2] = asciiBytes(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = contentObjectNumbers[index];
    const imageObjectNumber = imageObjectNumbers[index];
    const imageName = `Im${index + 1}`;
    const displayHeight = Math.min(PDF_PAGE_HEIGHT, (PDF_PAGE_WIDTH * page.height) / page.width);
    const translateY = PDF_PAGE_HEIGHT - displayHeight;
    const contentStream = `q\n${PDF_PAGE_WIDTH.toFixed(2)} 0 0 ${displayHeight.toFixed(2)} 0 ${translateY.toFixed(2)} cm\n/${imageName} Do\nQ\n`;
    const contentBytes = asciiBytes(contentStream);
    const imageHeader = asciiBytes(
      `${imageObjectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
    );
    const imageFooter = asciiBytes('\nendstream\nendobj\n');

    objects[pageObjectNumber] = asciiBytes(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH.toFixed(2)} ${PDF_PAGE_HEIGHT.toFixed(2)}] /Resources << /XObject << /${imageName} ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`
    );
    objects[contentObjectNumber] = concatBytes([
      asciiBytes(`${contentObjectNumber} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      asciiBytes('endstream\nendobj\n'),
    ]);
    objects[imageObjectNumber] = concatBytes([imageHeader, page.jpegBytes, imageFooter]);
  });

  const parts = [PDF_HEADER_BYTES];
  const offsets = new Array(totalObjects + 1).fill(0);
  let offset = PDF_HEADER_BYTES.length;

  for (let objectNumber = 1; objectNumber <= totalObjects; objectNumber += 1) {
    offsets[objectNumber] = offset;
    parts.push(objects[objectNumber]);
    offset += objects[objectNumber].length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= totalObjects; objectNumber += 1) {
    xref += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(asciiBytes(xref));

  return concatBytes(parts);
}

export default function PersonalQuestionnaireReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(() => searchParams.get('id'));
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(createEmptyPersonalQuestionnaire());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [o2PhoneOptions, setO2PhoneOptions] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);
  const [selectedDocumentTemplate, setSelectedDocumentTemplate] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingUnread, setMarkingUnread] = useState(false);
  const pdfCopy = useMemo(() => getPersonalQuestionnaireCopy('de'), []);
  const [pdfSettings, setPdfSettings] = useState({});

  async function loadList(nextStatus = statusFilter) {
    setLoading(true);
    try {
      const list = await listPersonalQuestionnaires(nextStatus);
      setRows(Array.isArray(list) ? list : []);
      const requestedId = searchParams.get('id');
      if (requestedId && list.some((row) => Number(row.id) === Number(requestedId))) {
        setSelectedId(requestedId);
      } else if (!selectedId && list?.length) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    try {
      const data = await getPersonalQuestionnaire(id);
      setDetail(data);
      setForm(normalizePayload(data?.payload));
      setWarnings(parseWarningList(data?.last_error));
    } catch (err) {
      setError(err?.message || 'Failed to load submission details');
    }
  }

  useEffect(() => {
    loadList('all');
  }, []);

  useEffect(() => {
    let cancelled = false;

    getO2List()
      .then((list) => {
        if (cancelled) return;
        const options = Array.isArray(list)
          ? list
              .map((row) => {
                const phone = String(row?.phone_number || '').trim();
                const name = String(row?.name || '').trim();
                if (!phone) return null;
                return {
                  value: phone,
                  label: name ? `${phone} — ${name}` : phone,
                };
              })
              .filter(Boolean)
          : [];
        setO2PhoneOptions(options);
      })
      .catch(() => {
        if (!cancelled) setO2PhoneOptions([]);
      });

    listEmployees({ onlyActive: true })
      .then((list) => {
        if (cancelled) return;
        const options = Array.isArray(list)
          ? list
              .map((row) => {
                const label = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || row?.display_name || row?.employee_id;
                const managerKenjoId = String(row?.kenjo_user_id || '').trim();
                if (!label || !managerKenjoId) return null;
                return { value: managerKenjoId, label };
              })
              .filter(Boolean)
          : [];
        setManagerOptions(options);
      })
      .catch(() => {
        if (!cancelled) setManagerOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSettingsByGroup('personalfragebogen')
      .then((group) => {
        if (!cancelled) setPdfSettings(group || {});
      })
      .catch(() => {
        if (!cancelled) setPdfSettings({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const requestedId = searchParams.get('id');
    if (requestedId && requestedId !== String(selectedId || '')) {
      setSelectedId(requestedId);
    }
  }, [searchParams, selectedId]);

  const selectedRow = useMemo(
    () => rows.find((row) => Number(row.id) === Number(selectedId)) || detail,
    [rows, selectedId, detail]
  );
  const documentTemplateOptions = useMemo(() => buildDocumentTemplateOptions(form), [form]);
  const pdfSections = useMemo(() => buildPdfSections(form, detail, pdfCopy, pdfSettings), [form, detail, pdfCopy, pdfSettings]);
  const pdfSummaryCards = useMemo(() => buildPdfSummaryCards(form, detail, pdfSettings), [form, detail, pdfSettings]);
  const pdfConfig = useMemo(() => normalizePdfConfig(pdfSettings), [pdfSettings]);

  function setWorkField(key, nextValue) {
    setForm((prev) => ({ ...prev, work: { ...(prev.work || {}), [key]: nextValue } }));
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const updated = await updatePersonalQuestionnaire(selectedId, form, 'reviewing');
      setDetail((prev) => ({ ...(prev || {}), ...updated, payload: normalizePayload(updated?.payload || form) }));
      setRows((prev) => prev.map((row) => (row.id === selectedId ? { ...row, ...updated } : row)));
      setMessage('Changes saved.');
    } catch (err) {
      setError(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndSend() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      await updatePersonalQuestionnaire(selectedId, form, 'reviewing');
      const result = await saveAndSendPersonalQuestionnaire(selectedId);
      await loadList(statusFilter);
      await loadDetail(selectedId);
      setWarnings(parseWarningList(result?.warnings));
      setMessage(
        result?.employee_ref
          ? `Saved and sent. Employee created: ${result.employee_ref}${result.warnings?.length ? ` (${result.warnings.length} warning(s))` : ''}.`
          : 'Saved and sent.'
      );
    } catch (err) {
      setError(err?.message || 'Failed to save and send');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    const confirmed = window.confirm('Delete this Personalfragebogen and all files uploaded to this form? This action cannot be undone.');
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const deletedId = Number(selectedId);
      await deletePersonalQuestionnaire(deletedId);
      const nextRows = await listPersonalQuestionnaires(statusFilter);
      setRows(Array.isArray(nextRows) ? nextRows : []);

      const currentIndex = rows.findIndex((row) => Number(row.id) === deletedId);
      const fallbackRow =
        nextRows[currentIndex] ||
        nextRows[Math.max(0, currentIndex - 1)] ||
        nextRows[0] ||
        null;

      if (fallbackRow) {
        setSelectedId(fallbackRow.id);
        setSearchParams({ id: String(fallbackRow.id) });
      } else {
        setSelectedId(null);
        setDetail(null);
        setForm(createEmptyPersonalQuestionnaire());
        setSearchParams({});
      }
      setMessage('Form deleted.');
    } catch (err) {
      setError(err?.message || 'Failed to delete form');
    } finally {
      setDeleting(false);
    }
  }

  async function handleUnread() {
    if (!selectedId) return;
    setMarkingUnread(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const unreadId = Number(selectedId);
      await markPersonalQuestionnaireUnread(unreadId);
      const nextRows = await listPersonalQuestionnaires(statusFilter);
      setRows(Array.isArray(nextRows) ? nextRows : []);
      setSelectedId(null);
      setDetail(null);
      setForm(createEmptyPersonalQuestionnaire());
      setSearchParams({});
      setMessage('Form marked as unread.');
    } catch (err) {
      setError(err?.message || 'Failed to mark form as unread');
    } finally {
      setMarkingUnread(false);
    }
  }

  async function handleDownloadPdf() {
    if (!selectedId) return;
    setExportingPdf(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const pages = renderPersonalQuestionnairePdfPages({ selectedRow, detail, form, pdfSections, pdfSummaryCards, pdfConfig });
      if (!pages.length) {
        throw new Error('No PDF pages could be generated.');
      }
      const pdfBytes = buildPdfBytesFromPages(pages);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileBase = normalizeNamePart(displayName(selectedRow) || `submission_${selectedId}`) || `submission_${selectedId}`;
      link.href = url;
      link.download = `${fileBase}_Personalfragebogen.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('PDF downloaded.');
    } catch (err) {
      setError(err?.message || 'Failed to create PDF');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !selectedId) return;
    if (!selectedDocumentTemplate) {
      setError('Please select the exact document type before uploading.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    setWarnings([]);
    try {
      const originalName = String(files[0]?.name || '');
      const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
      const finalName = `${selectedDocumentTemplate}${extension}`;
      await uploadPersonalQuestionnaireFiles(selectedId, files.slice(0, 1), finalName);
      await loadDetail(selectedId);
      setMessage(`Uploaded ${finalName}.`);
      setSelectedDocumentTemplate('');
    } catch (err) {
      setError(err?.message || 'Failed to upload files');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  return (
    <section className="intake-page">
      <header className="analytics-header">
        <div>
          <h1>Personalfragebogen Review</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Review public onboarding submissions, edit the data, add documents and send the employee to Kenjo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label className="public-form-field" style={{ minWidth: 180 }}>
            <span>Status</span>
            <select
              className="public-form-control"
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(next);
                loadList(next);
              }}
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="reviewing">Reviewing</option>
              <option value="error">Error</option>
              <option value="sent">Sent</option>
              <option value="sent_with_warnings">Sent with warnings</option>
            </select>
          </label>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}
      {message && <div className="cars-message cars-message--success">{message}</div>}
      {warnings.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', border: '1px solid #fbbf24', background: '#fffbeb' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#92400e' }}>Warnings</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#78350f' }}>
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="intake-layout">
        <aside className="intake-sidebar">
          {loading ? (
            <p className="muted">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="muted">No submissions yet.</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`intake-list-item ${Number(selectedId) === Number(row.id) ? 'is-active' : ''} ${row.is_new ? 'is-new' : ''}`}
                onClick={() => {
                  setSelectedId(row.id);
                  setSearchParams({ id: String(row.id) });
                }}
              >
                <div className="intake-list-item-title-row">
                  {row.is_new && <span className="notification-new-dot" aria-hidden="true" />}
                  <strong>{displayName(row)}</strong>
                </div>
                <span>{row.status}</span>
                <span>{row.email || 'No email'}</span>
              </button>
            ))
          )}
        </aside>

        <div className="intake-detail">
          {!selectedRow ? (
            <div className="card"><p className="muted">Select a submission.</p></div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="intake-detail-header">
                  <div>
                    <h2 style={{ marginBottom: '0.35rem' }}>{displayName(selectedRow)}</h2>
                    <p className="muted small" style={{ margin: 0 }}>
                      Status: <strong>{detail?.status || selectedRow.status}</strong>
                      {detail?.employee_ref && <> {' · '}Employee: <strong>{detail.employee_ref}</strong></>}
                    </p>
                  </div>
                  <div className="public-page-actions" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" disabled={saving || deleting || markingUnread} onClick={handleSave}>
                      {saving ? 'Saving...' : 'Save draft'}
                    </button>
                    <button type="button" className="btn-secondary" disabled={saving || deleting || markingUnread || exportingPdf} onClick={handleDownloadPdf}>
                      {exportingPdf ? 'Preparing PDF...' : 'Download PDF'}
                    </button>
                    <button type="button" className="btn-primary" disabled={saving || deleting || markingUnread} onClick={handleSaveAndSend}>
                      {saving ? 'Working...' : 'Save and Send'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={saving || deleting || markingUnread}
                      onClick={handleUnread}
                    >
                      {markingUnread ? 'Working...' : 'Unread'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={saving || deleting || markingUnread}
                      onClick={handleDelete}
                      style={{ background: '#dc2626' }}
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.9rem' }}>Employer fields</h3>
                <div className="public-form-grid">
                  <label className="public-form-field">
                    <span>Job title</span>
                    <input
                      className="public-form-control"
                      value={form.work?.jobTitle || ''}
                      onChange={(e) => setWorkField('jobTitle', e.target.value)}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Work e-mail</span>
                    <input
                      className="public-form-control"
                      type="email"
                      value={form.account?.email || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, account: { ...(prev.account || {}), email: e.target.value } }))}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Start date</span>
                    <input
                      className="public-form-control"
                      type="date"
                      value={form.work?.startDate || ''}
                      onChange={(e) => setWorkField('startDate', e.target.value)}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Personal Nr.</span>
                    <input
                      className="public-form-control"
                      value={form.work?.employeeNumber || ''}
                      inputMode="numeric"
                      pattern="\d{5}"
                      maxLength={5}
                      title="Personal Nr. must contain exactly 5 digits."
                      onChange={(e) => setWorkField('employeeNumber', String(e.target.value || '').replace(/\D/g, '').slice(0, 5))}
                      onBlur={(e) => {
                        const digits = String(e.target.value || '').replace(/\D/g, '').slice(0, 5);
                        setWorkField('employeeNumber', digits ? digits.padStart(5, '0') : '');
                      }}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Work Mobile</span>
                    <select
                      className="public-form-control"
                      value={form.work?.workMobile || ''}
                      onChange={(e) => setWorkField('workMobile', e.target.value)}
                    >
                      <option value="">Select...</option>
                      {o2PhoneOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="public-form-field">
                    <span>Weekly hours</span>
                    <input
                      className="public-form-control"
                      type="number"
                      step="0.5"
                      value={form.work?.weeklyHours ?? ''}
                      onChange={(e) => setWorkField('weeklyHours', e.target.value)}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Probation until</span>
                    <input
                      className="public-form-control"
                      type="date"
                      value={form.work?.probationUntil || ''}
                      onChange={(e) => setWorkField('probationUntil', e.target.value)}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Contract end</span>
                    <input
                      className="public-form-control"
                      type="date"
                      value={form.work?.contractEnd || ''}
                      onChange={(e) => setWorkField('contractEnd', e.target.value)}
                    />
                  </label>
                  <label className="public-form-field">
                    <span>Manager</span>
                    <select
                      className="public-form-control"
                      value={form.work?.managerKenjoId || ''}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const selectedOption = managerOptions.find((option) => option.value === nextId);
                        setForm((prev) => ({
                          ...prev,
                          work: {
                            ...(prev.work || {}),
                            managerKenjoId: nextId,
                            managerName: selectedOption?.label || '',
                          },
                        }));
                      }}
                    >
                      <option value="">Select...</option>
                      {managerOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <PersonalQuestionnaireForm value={form} onChange={setForm} disabled={saving} locale="de" />
              </div>

              <div className="card">
                <div className="intake-detail-header">
                  <div>
                    <h3 style={{ marginBottom: '0.35rem' }}>Documents</h3>
                    <p className="muted small" style={{ margin: 0 }}>
                      Choose the exact document name first. The uploaded file will be saved with that exact template plus the original file extension.
                    </p>
                  </div>
                </div>

                <div className="public-form-grid" style={{ marginTop: '1rem' }}>
                  <label className="public-form-field" style={{ gridColumn: '1 / -1' }}>
                    <span>Document type / exact file name</span>
                    <select
                      className="public-form-control"
                      value={selectedDocumentTemplate}
                      onChange={(e) => setSelectedDocumentTemplate(e.target.value)}
                      disabled={uploading}
                    >
                      <option value="">Select exact document name...</option>
                      {documentTemplateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="public-page-actions" style={{ justifyContent: 'flex-start', marginTop: '1rem' }}>
                  <label className="btn-secondary" style={{ cursor: uploading ? 'wait' : 'pointer', opacity: selectedDocumentTemplate ? 1 : 0.7 }}>
                    {uploading ? 'Uploading...' : 'Upload document'}
                    <input type="file" hidden disabled={uploading || !selectedDocumentTemplate} onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="intake-files">
                  {(detail?.files || []).length === 0 ? (
                    <p className="muted">No files uploaded yet.</p>
                  ) : (
                    detail.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="intake-file-row"
                        onClick={() => downloadPersonalQuestionnaireFile(selectedId, file.id, file.file_name)}
                      >
                        <span>{file.file_name}</span>
                        <span>{file.source_kind}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

    </section>
  );
}

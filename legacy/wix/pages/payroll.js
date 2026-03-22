
import wixWindow from "@wix/site-window";
import { getMonths, calculateSummaryByDateRange } from 'backend/payrollApi';

let currentMonthValue = null;
let currentDateFrom = null;
let currentDateTo = null;
let currentPeriodId = null;
let currentRows = [];

$w.onReady(async function () {
  try {
    $w('#loadButton').onClick(loadButton_click);
    $w('#monthDropdown').onChange(monthDropdown_change);
    $w('#periodCalendar').onChange(periodCalendar_change);

    $w('#payrollRepeater').onItemReady(($item, itemData) => {
      renderRepeaterItem($item, itemData);

      $item('#abzugText').onClick(async () => {
        await openManualLightbox(itemData, 'abzug', 'view');
      });

      $item('#abzugEditIcon').onClick(async () => {
        await openManualLightbox(itemData, 'abzug', 'edit');
      });

      $item('#bonusManualText').onClick(async () => {
        await openManualLightbox(itemData, 'bonus', 'view');
      });
      
      $item('#bonusManualEditIcon').onClick(async () => {
        await openManualLightbox(itemData, 'bonus', 'edit');
      });
    });

    $w('#statusText').text = 'Loading months...';

    const monthsResponse = await getMonths();
    const months = Array.isArray(monthsResponse)
      ? monthsResponse
      : monthsResponse.data || [];

    $w('#monthDropdown').options = months.map(m => ({
      label: m.label,
      value: m.value
    }));

    $w('#statusText').text = 'Months loaded. Select month and click two dates in calendar.';
  } catch (err) {
    console.error('onReady error:', err);
    $w('#statusText').text = `Error loading page: ${err.message}`;
  }
});

function monthDropdown_change() {
  const monthValue = $w('#monthDropdown').value;
  if (!monthValue) return;

  currentMonthValue = monthValue;
  currentDateFrom = null;
  currentDateTo = null;
  currentPeriodId = null;
  currentRows = [];

  $w('#periodCalendar').value = null;
  $w('#payrollRepeater').data = [];
  $w('#statusText').text = `Month changed to ${monthValue}. Please select bonus period.`;
}

function periodCalendar_change(event) {
  const selectedDate = event.target.value;
  if (!selectedDate) return;

  if (!currentDateFrom || (currentDateFrom && currentDateTo)) {
    currentDateFrom = selectedDate;
    currentDateTo = null;
    $w('#statusText').text = `Start date selected: ${formatDate(currentDateFrom)}. Select end date.`;
    return;
  }

  currentDateTo = selectedDate;

  if (currentDateTo < currentDateFrom) {
    const tmp = currentDateFrom;
    currentDateFrom = currentDateTo;
    currentDateTo = tmp;
  }

  $w('#statusText').text = `Period selected: ${formatDate(currentDateFrom)} → ${formatDate(currentDateTo)}`;
}

export async function loadButton_click() {
  try {
    const monthValue = $w('#monthDropdown').value;

    if (!monthValue) {
      $w('#statusText').text = 'Select month';
      return;
    }

    if (!currentDateFrom || !currentDateTo) {
      $w('#statusText').text = 'Select bonus period in calendar';
      return;
    }

    currentMonthValue = monthValue;

    const dateFromIso = toIsoDate(currentDateFrom);
    const dateToIso = toIsoDate(currentDateTo);

    currentPeriodId = buildClientRangePeriodId(monthValue, dateFromIso, dateToIso);

    $w('#statusText').text = 'Calculating payroll...';

    const rowsResponse = await calculateSummaryByDateRange(monthValue, dateFromIso, dateToIso);

    if (rowsResponse && rowsResponse.success === false) {
      throw new Error(rowsResponse.error || 'Apps Script returned an error');
    }

    const rows = Array.isArray(rowsResponse)
      ? rowsResponse
      : rowsResponse.data || [];
      console.log("=== PAYROLL DEBUG ===");
      console.log("rows:", rows);

      rows.forEach(r => {
        console.log("EMPLOYEE:", {
          employee_id: r.employee_id,
          name: r.vorname + " " + r.name,
          vorschuss: r.vorschuss,
          period_id: r.period_id
        });
      });
    rows.sort((a, b) => parsePn(a.pn) - parsePn(b.pn));

    currentRows = rows;
    bindRepeater(rows);

    $w('#statusText').text = `Loaded ${rows.length} employees`;
  } catch (err) {
    console.error('loadButton_click error:', err);
    $w('#statusText').text = `Error loading payroll: ${err.message}`;
  }
}

function bindRepeater(rows) {
  const repeaterData = rows.map((row, index) => ({
    _id: `row_${index}_${String(row.employee_id || 'emp')}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    ...row
  }));

  currentRows = repeaterData;
  $w('#payrollRepeater').data = repeaterData;
}

function renderRepeaterItem($item, itemData) {
  $item('#nameText').text = `${itemData.vorname || ''} ${itemData.name || ''}`.trim();
  $item('#pnText').text = String(itemData.pn ?? '');
  $item('#startDateText').text = formatDisplayDate(itemData.start_date);
  $item('#contractEndText').text = formatContractEnd(itemData.contract_end);

  styleContractEnd($item, itemData.contract_end);
  $item('#weeksText').text = String(itemData.weeks_count ?? 0);
  $item('#workedDaysMonthText').text = String(itemData.worked_days_month ?? 0);
  $item('#workedDaysPeriodText').text = String(itemData.total_worked_days ?? 0);
  $item('#totalBonusText').text = formatMoney(itemData.total_bonus_eur);

  $item('#abzugText').text = formatMoney(itemData.abzug ?? 0);
  $item('#bonusManualText').text = formatMoney(itemData.payout_bonus ?? 0);

  $item('#vorschussText').text = formatMoney(itemData.vorschuss ?? 0);

  $item('#bonusAfterAbzugText').text = formatMoney(itemData.bonus_after_abzug);
  $item('#verpflegungText').text = formatMoney(itemData.verpflegungsmehraufwand);
  $item('#fahrtenbonusgeldText').text = formatMoney(itemData.fahrtenbonusgeld);

  styleRow($item, itemData);
}

async function openManualLightbox(itemData, type, mode) {
  try {
    if (!currentPeriodId) {
      $w('#statusText').text = 'Select month and period first';
      return;
    }

    const result = await wixWindow.openLightbox('ManualItemsLightbox', {
      mode,
      type,
      periodId: currentPeriodId,
      employeeId: itemData.employee_id,
      employeeName: `${itemData.vorname || ''} ${itemData.name || ''}`.trim()
    });

    if (!result || !result.saved) {
      return;
    }

    const dateFromIso = toIsoDate(currentDateFrom);
    const dateToIso = toIsoDate(currentDateTo);

    const rowsResponse = await calculateSummaryByDateRange(
      currentMonthValue,
      dateFromIso,
      dateToIso
    );

    if (rowsResponse && rowsResponse.success === false) {
      throw new Error(rowsResponse.error || 'Apps Script returned an error');
    }

    const rows = Array.isArray(rowsResponse)
      ? rowsResponse
      : rowsResponse.data || [];

    rows.sort((a, b) => parsePn(a.pn) - parsePn(b.pn));

    currentRows = rows;
    bindRepeater(rows);

    $w('#statusText').text = `${type} updated`;
  } catch (err) {
    console.error('openManualLightbox error:', err);
    $w('#statusText').text = `Error opening ${type}: ${err.message}`;
  }
}

function recalculateRow(row) {
  const totalBonus = Number(row.total_bonus_eur || 0);
  const totalWorkedDays = Number(row.total_worked_days || 0);
  const abzug = Number(row.abzug || 0);
  const payoutBonus = Number(row.payout_bonus || 0);

  const bonusAfterAbzug = totalBonus - abzug;
  const verpflegungLimit = totalWorkedDays * 14;
  const verpflegungsmehraufwand = Math.min(bonusAfterAbzug, verpflegungLimit);
  const fahrtenbonusgeld = Math.max(0, bonusAfterAbzug - verpflegungLimit);

  return {
    ...row,
    abzug,
    payout_bonus: payoutBonus,
    bonus_after_abzug: bonusAfterAbzug,
    verpflegung_limit_eur: verpflegungLimit,
    verpflegungsmehraufwand,
    fahrtenbonusgeld
  };
}

function styleRow($item, itemData) {
  const bonusAfter = Number(itemData.bonus_after_abzug || 0);
  const fahrten = Number(itemData.fahrtenbonusgeld || 0);

  $item('#bonusAfterAbzugText').style.color = bonusAfter < 0 ? '#C62828' : '#000000';
  $item('#fahrtenbonusgeldText').style.color = fahrten > 0 ? '#2E7D32' : '#000000';
}

function parsePn(value) {
  if (value === null || value === undefined || value === '') return 999999;

  const num = Number(String(value).replace(',', '.').trim());
  return Number.isNaN(num) ? 999999 : num;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(date) {
  return date.toLocaleDateString('de-DE');
}

function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

function buildClientRangePeriodId(monthValue, dateFromIso, dateToIso) {
  return `range__${monthValue}__${dateFromIso}__${dateToIso}`;
}
function formatDisplayDate(value) {
  if (!value) return '';

  const d = new Date(value);
  if (!isNaN(d)) {
    return d.toLocaleDateString('de-DE');
  }

  return String(value);
}
function formatContractEnd(value) {
  if (!value) {
    return 'Unbefristet';
  }

  const d = parseDateSafe(value);
  if (!d) {
    return String(value);
  }

  return d.toLocaleDateString('de-DE');
}

function styleContractEnd($item, value) {
  const defaultColor = '#000000';
  const warningColor = '#F9A825';
  const dangerColor = '#C62828';

  if (!value) {
    $item('#contractEndText').style.color = defaultColor;
    return;
  }

  const contractEnd = parseDateSafe(value);
  if (!contractEnd) {
    $item('#contractEndText').style.color = defaultColor;
    return;
  }

  const today = stripTimeLocal(new Date());
  const diffMs = contractEnd.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    $item('#contractEndText').style.color = dangerColor;
    return;
  }

  if (diffDays <= 30) {
    $item('#contractEndText').style.color = warningColor;
    return;
  }

  $item('#contractEndText').style.color = defaultColor;
}
function parseDateSafe(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return stripTimeLocal(value);
  }

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return stripTimeLocal(parsed);
  }

  return null;
}

function stripTimeLocal(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

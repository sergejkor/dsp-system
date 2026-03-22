import wixWindow from 'wix-window';
import { getManualItems, saveManualItems } from 'backend/payrollApi';

let contextData = null;
let currentItems = [];

$w.onReady(async function () {
  try {
    contextData = wixWindow.lightbox.getContext();
    const mode = contextData?.mode || 'view';
    const type = contextData?.type || 'abzug';
    const periodId = contextData?.periodId;
    const employeeId = contextData?.employeeId;
    const employeeName = contextData?.employeeName || '';

    if (!periodId || !employeeId || !type) {
      throw new Error('Missing lightbox context');
    }

    $w('#titleText').text = `${type === 'abzug' ? 'Abzug' : 'Bonus'} — ${employeeName}`;

    const response = await getManualItems(periodId, employeeId, type);
    if (response && response.success === false) {
      throw new Error(response.error || 'Failed to load items');
    }

    currentItems = response.items || buildEmptyItems();
    fillForm(currentItems);

    const editable = mode === 'edit';
    setEditable(editable);

    $w('#saveButton').onClick(saveButton_click);
    $w('#cancelButton').onClick(() => wixWindow.lightbox.close({ saved: false }));

    if (!editable) {
      $w('#saveButton').hide();
    }
  } catch (err) {
    console.error('Lightbox onReady error:', err);
    $w('#lightboxStatusText').text = `Error: ${err.message}`;
  }
});

async function saveButton_click() {
  try {
    const items = collectItems();
    $w('#lightboxStatusText').text = 'Saving...';
    const response = await saveManualItems(contextData.periodId, contextData.employeeId, contextData.type, items);
    if (response && response.success === false) {
      throw new Error(response.error || 'Save failed');
    }
    wixWindow.lightbox.close({ saved: true, type: contextData.type, total: Number(response.total || 0) });
  } catch (err) {
    console.error('saveButton_click error:', err);
    $w('#lightboxStatusText').text = `Error saving: ${err.message}`;
  }
}

function fillForm(items) {
  const safe = Array.isArray(items) && items.length ? items : buildEmptyItems();
  $w('#line1AmountInput').value = String(safe[0]?.amount ?? 0);
  $w('#line1CommentInput').value = String(safe[0]?.comment ?? '');
  $w('#line2AmountInput').value = String(safe[1]?.amount ?? 0);
  $w('#line2CommentInput').value = String(safe[1]?.comment ?? '');
  $w('#line3AmountInput').value = String(safe[2]?.amount ?? 0);
  $w('#line3CommentInput').value = String(safe[2]?.comment ?? '');
  $w('#line4AmountInput').value = String(safe[3]?.amount ?? 0);
  $w('#line4CommentInput').value = String(safe[3]?.comment ?? '');
  $w('#line5AmountInput').value = String(safe[4]?.amount ?? 0);
  $w('#line5CommentInput').value = String(safe[4]?.comment ?? '');
}

function collectItems() {
  return [1,2,3,4,5].map((line) => ({
    line_no: line,
    amount: normalizeNumber($w(`#line${line}AmountInput`).value),
    comment: String($w(`#line${line}CommentInput`).value || '').trim()
  }));
}

function setEditable(editable) {
  [1,2,3,4,5].forEach((line) => {
    toggleInput(`#line${line}AmountInput`, editable);
    toggleInput(`#line${line}CommentInput`, editable);
  });
}

function toggleInput(selector, editable) {
  if (editable) $w(selector).enable();
  else $w(selector).disable();
}

function buildEmptyItems() {
  return [1,2,3,4,5].map((line) => ({ line_no: line, amount: 0, comment: '' }));
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(',', '.').trim();
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

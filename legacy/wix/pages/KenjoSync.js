
import wixWindow from 'wix-window';
import { kenjoCompareWithUploadsByName } from 'backend/kenjo';

$w.onReady(() => {
  setStatus('');
  hidePb('#pbCompare');
  $w('#btnCompare').onClick(onCompareClick);
});

async function onCompareClick() {
  const fromDate = $w('#dateFrom').value;
  const toDate = $w('#dateTo').value;

  if (!fromDate || !toDate) {
    setStatus('⚠️ Please select both From and To dates.');
    return;
  }

  const from = toKey(fromDate);
  const to = toKey(toDate);
  const stop = startProgress('#pbCompare', 'Comparing...');

  try {
    const result = await kenjoCompareWithUploadsByName(from, to);
    const stats = result?.stats || {};
    const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];

    setStatus(
      `✅ Done. Cortex: ${stats.totalExcelRows || 0} | Kenjo: ${stats.totalKenjoRows || 0} | ` +
      `Matched: ${stats.totalMatched || 0} | Conflicts: ${stats.conflicts || conflicts.length || 0} | ` +
      `Cortex no match: ${stats.unmatchedExcel || 0} | Kenjo no match: ${stats.unmatchedKenjo || 0}`
    );

    await wixWindow.openLightbox('ConflictTab', {
      from,
      to,
      stats,
      conflicts,
    });
  } catch (e) {
    console.error(e);
    setStatus('❌ Compare error: ' + String(e?.message || e));
  } finally {
    stop();
  }
}

function startProgress(pbId, statusText) {
  setStatus(statusText);
  if ($w(pbId)) {
    $w(pbId).value = 0;
    $w(pbId).show();
  }
  let v = 0;
  const timer = setInterval(() => {
    v += 3;
    if (v > 95) v = 95;
    if ($w(pbId)) $w(pbId).value = v;
  }, 150);
  return () => {
    clearInterval(timer);
    if ($w(pbId)) {
      $w(pbId).value = 100;
      setTimeout(() => hidePb(pbId), 250);
    }
  };
}

function hidePb(pbId) {
  if ($w(pbId)) {
    $w(pbId).hide();
    $w(pbId).value = 0;
  }
}

function setStatus(t) {
  if ($w('#txtStatus')) $w('#txtStatus').text = t || '';
}

function toKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

import wixWindow from 'wix-window';
import { kenjoIgnoreConflict, kenjoFixConflictInKenjo } from 'backend/kenjo';

$w.onReady(() => {
  const ctx = wixWindow.lightbox.getContext() || {};
  const conflicts = Array.isArray(ctx.conflicts) ? ctx.conflicts : [];
  const stats = ctx.stats || {};

  if ($w('#btnClose')) {
    $w('#btnClose').onClick(() => wixWindow.lightbox.close());
  }

  if ($w('#txtHeader')) {
    $w('#txtHeader').text =
      `Excel: ${stats.totalExcelRows || 0} | Kenjo: ${stats.totalKenjoRows || 0} | ` +
      `Matched: ${stats.totalMatched || 0} | Conflicts: ${conflicts.length}`;
  }

  initConflictsTable(conflicts);
});

function initConflictsTable(conflicts) {
  if (!$w('#tblConflicts')) return;
  $w('#tblConflicts').columns = [
    { id: 'date', dataPath: 'date', label: 'Date', width: 100 },
    { id: 'name', dataPath: 'name', label: 'Name', width: 210 },
    { id: 'excelStart', dataPath: 'excelStart', label: 'Cortex Start', width: 70 },
    { id: 'excelEnd', dataPath: 'excelEnd', label: 'Cortex End', width: 70 },
    { id: 'kenjoStart', dataPath: 'kenjoStart', label: 'Kenjo Start', width: 70 },
    { id: 'kenjoEnd', dataPath: 'kenjoEnd', label: 'Kenjo End', width: 70 },
    { id: 'reason', dataPath: 'reason', label: 'Reason', width: 250, type: 'richText' },
    { id: 'ignoreBtn', dataPath: 'ignoreBtn', label: 'Ignore', width: 75, type: 'richText' },
    { id: 'fixBtn', dataPath: 'fixBtn', label: 'Fix Kenjo', width: 80, type: 'richText' },
    { id: 'status', dataPath: 'status', label: 'Status', width: 180, type: 'richText' },
  ];

  $w('#tblConflicts').rows = (conflicts || []).map((c, i) => ({
    _id: String(i),
    ...c,
    reason: buildReason(c),
    status: '',
    ignoreBtn: cellButtonHtml('Ignore', '#6b7280'),
    fixBtn: cellButtonHtml('Fix', '#2563eb'),
  }));
}

function buildReason(c) {
  const parts = [];
  const ds = Number(c.diffStartMin || 0);
  const de = Number(c.diffEndMin || 0);
  if (ds !== 0) {
    parts.push(ds > 0
      ? `<span style="color:#15803d">🟢 Start: Kenjo is later by ${ds} min</span>`
      : `<span style="color:#b91c1c">🔴 Start: Kenjo is earlier by ${Math.abs(ds)} min</span>`);
  }
  if (de !== 0) {
    parts.push(de < 0
      ? `<span style="color:#15803d">🟢 End: Kenjo is earlier by ${Math.abs(de)} min</span>`
      : `<span style="color:#b91c1c">🔴 End: Kenjo is later by ${de} min</span>`);
  }
  return parts.length ? parts.join('<br>') : `<span style="color:#6b7280">No difference</span>`;
}

function cellButtonHtml(text, bg) {
  return `<span style="display:inline-block;padding:6px 10px;border-radius:8px;color:white;background:${bg};font-weight:700;font-size:12px;line-height:1;">${text}</span>`;
}

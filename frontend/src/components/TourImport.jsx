import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useAppSettings } from '../context/AppSettingsContext';
import { getAuthHeaders } from '../services/authStore';
import './tourImport.css';

const API = `${import.meta.env.VITE_BACKEND_URL || 'https://api.alfamile.com'}/api/car-planning/tours`;
async function request(path, body) {
  const form = body instanceof FormData;
  const res = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { ...getAuthHeaders(), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const copy = {
  en: ['Excel tours', 'Date (Europe/Berlin)', 'Station', 'Import Excel', 'Review', 'Roster Drivers', 'Adjust', 'Update Plan', 'Apply only selected tours; leave remaining tours open', 'Tour', 'Driver / Transporter-ID', 'Source category / required type', 'Entry time', 'Vehicle', 'Lock', 'Status / reason', 'Select driver explicitly', 'Choose vehicle', 'Exclude vehicles for this date', 'Confirm changes to existing driver, type or lock', 'Recalculate after changes', 'Demand / available / assigned / shortage / errors', 'No station', 'Import applied. Remaining tours:', 'Added', 'Changed', 'Unchanged', 'Existing → proposed', 'Select', 'Close'],
  de: ['Excel-Touren', 'Datum (Europe/Berlin)', 'Station', 'Excel importieren', 'Prüfen', 'Roster Drivers', 'Korrigieren', 'Update Plan', 'Nur ausgewählte Touren übernehmen; übrige bleiben offen', 'Tour', 'Fahrer / Transporter-ID', 'Excel-Kategorie / benötigter Typ', 'Einfahrtszeit', 'Fahrzeug', 'Fixieren', 'Status / Begründung', 'Fahrer ausdrücklich auswählen', 'Fahrzeug auswählen', 'Fahrzeuge für dieses Datum ausschließen', 'Änderung von Fahrer, Typ oder Fixierung bestätigen', 'Nach Änderungen neu berechnen', 'Bedarf / verfügbar / zugeteilt / Fehlbestand / Fehler', 'Ohne Station', 'Import übernommen. Offene Touren:', 'Neu', 'Geändert', 'Unverändert', 'Bisher → Vorschlag', 'Auswahl', 'Schließen'],
  ru: ['Туры из Excel', 'Дата (Europe/Berlin)', 'Станция', 'Импорт Excel', 'Проверка', 'Roster Drivers', 'Корректировка', 'Update Plan', 'Применить только выбранные туры; остальные оставить открытыми', 'Тур', 'Водитель / Transporter-ID', 'Категория Excel / требуемый тип', 'Время въезда', 'Автомобиль', 'Закрепить', 'Статус / основание', 'Выберите водителя явно', 'Выберите автомобиль', 'Исключить автомобили на эту дату', 'Подтвердить изменение водителя, типа или закрепления', 'После изменений выполните перерасчёт', 'Потребность / доступно / назначено / дефицит / ошибки', 'Без станции', 'Импорт применён. Осталось туров:', 'Добавлен', 'Изменён', 'Без изменений', 'Было → предложено', 'Выбор', 'Закрыть'],
};
const reasons = {
  en: { USUAL_CAR: 'Usual vehicle', FAMILIAR_ALTERNATIVE: 'Familiar alternative', NO_HISTORY: 'Suitable vehicle; no assignment history', MANUAL_LOCK: 'Manual lock', TYPE_SHORTAGE: 'Insufficient vehicles of required type', CONSTRAINT_CONFLICT: 'Availability, reservation or lock conflict', IMPORT_ERROR: 'Resolve import errors', REVIEW: 'Review before allocation', SELECT_PRIMARY_DRIVER: 'Choose primary driver; all participants retained', RESOLVE_DRIVER: 'Unknown or ambiguous Transporter-ID', PARTICIPANT_COUNT: 'Participant ID/name counts differ', UNKNOWN_TYPE: 'Unknown or conflicting category', DUPLICATE_ROUTE: 'Conflicting duplicate tour', DRIVER_MULTIPLE_TOURS: 'Driver appears on multiple tours', DRIVER_ALREADY_PLANNED: 'Driver already assigned today', INVALID_LOCK: 'Invalid or duplicate vehicle lock', CONFIRM_EXISTING_CHANGE: 'Confirm changed driver, type or lock', INVALID_TIME: 'Invalid departure time', MISSING_ROUTE: 'Missing route code', FORMULA_OR_CELL_ERROR: 'Formula or invalid cell' },
  de: { USUAL_CAR: 'Gewohntes Fahrzeug', FAMILIAR_ALTERNATIVE: 'Bekannte Alternative', NO_HISTORY: 'Passendes Fahrzeug; keine Zuteilungshistorie', MANUAL_LOCK: 'Manuell fixiert', TYPE_SHORTAGE: 'Zu wenige Fahrzeuge des benötigten Typs', CONSTRAINT_CONFLICT: 'Konflikt mit Verfügbarkeit, Reservierung oder Fixierung', IMPORT_ERROR: 'Importfehler klären', REVIEW: 'Vor der Verteilung prüfen', SELECT_PRIMARY_DRIVER: 'Hauptfahrer auswählen; alle Teilnehmer bleiben erhalten', RESOLVE_DRIVER: 'Transporter-ID unbekannt oder mehrdeutig', PARTICIPANT_COUNT: 'Anzahl Namen und IDs stimmt nicht überein', UNKNOWN_TYPE: 'Kategorie unbekannt oder widersprüchlich', DUPLICATE_ROUTE: 'Widersprüchliche doppelte Tour', DRIVER_MULTIPLE_TOURS: 'Fahrer auf mehreren Touren', DRIVER_ALREADY_PLANNED: 'Fahrer heute bereits eingeplant', INVALID_LOCK: 'Ungültige oder doppelte Fixierung', CONFIRM_EXISTING_CHANGE: 'Geänderten Fahrer, Typ oder Fixierung bestätigen', INVALID_TIME: 'Ungültige Abfahrtszeit', MISSING_ROUTE: 'Routencode fehlt', FORMULA_OR_CELL_ERROR: 'Formel oder fehlerhafte Zelle' },
  ru: { USUAL_CAR: 'Привычная машина', FAMILIAR_ALTERNATIVE: 'Знакомая альтернативная машина', NO_HISTORY: 'Подходящая машина; нет истории назначений', MANUAL_LOCK: 'Ручное закрепление', TYPE_SHORTAGE: 'Недостаточно машин нужного типа', CONSTRAINT_CONFLICT: 'Конфликт доступности, ограничений или закреплений', IMPORT_ERROR: 'Требуется разрешение ошибки импорта', REVIEW: 'Проверьте перед распределением', SELECT_PRIMARY_DRIVER: 'Выберите основного водителя; все участники сохранены', RESOLVE_DRIVER: 'Неизвестный или неоднозначный Transporter-ID', PARTICIPANT_COUNT: 'Количество имён и ID различается', UNKNOWN_TYPE: 'Неизвестная или противоречивая категория', DUPLICATE_ROUTE: 'Противоречивый дубль тура', DRIVER_MULTIPLE_TOURS: 'Водитель указан на нескольких турах', DRIVER_ALREADY_PLANNED: 'Водитель уже назначен на этот день', INVALID_LOCK: 'Недопустимое или повторное закрепление', CONFIRM_EXISTING_CHANGE: 'Подтвердите изменение водителя, типа или закрепления', INVALID_TIME: 'Некорректное время выезда', MISSING_ROUTE: 'Нет номера тура', FORMULA_OR_CELL_ERROR: 'Формула или ошибка ячейки' },
};
const reviewCopy = {
 en: { time: 'Departure', SYSTEM_TYPE_UNAVAILABLE: 'No free System/QR vehicle of required type', HISTORY_TYPE_UNAVAILABLE: 'No free vehicle of usual type' },
 de: { time: 'Abfahrt', SYSTEM_TYPE_UNAVAILABLE: 'Kein freies System-/QR-Fahrzeug des benötigten Typs', HISTORY_TYPE_UNAVAILABLE: 'Kein freies Fahrzeug des gewohnten Typs' },
 ru: { time: 'Выезд', SYSTEM_TYPE_UNAVAILABLE: 'Нет свободной System/QR-машины нужного типа', HISTORY_TYPE_UNAVAILABLE: 'Нет свободной машины привычного типа' },
};
const dispatcherCopy = {
  en: { driver: 'Driver', assigned: 'Assigned', issues: 'Issues', details: 'Details', review: 'Needs review', noVehicle: 'Vehicle not assigned', qr: 'Copy System vehicle QR', copied: 'QR copied', copyQr: 'Copy QR', copyVin: 'Copy VIN', vinCopied: 'VIN copied', copyFailed: 'Image clipboard is unavailable. Use the QR below or retry Copy QR.', vinMissing: 'System vehicle VIN is missing.', textFailed: 'Could not copy VIN.', remaining: 'Unselected or unresolved tours will remain open:', change: 'Change vehicle', systemQr: 'System QR' },
  de: { driver: 'Fahrer', assigned: 'Zugeordnet', issues: 'Offen', details: 'Details', review: 'Prüfung nötig', noVehicle: 'Kein Fahrzeug zugeordnet', qr: 'Systemfahrzeug-QR kopieren', copied: 'QR kopiert', copyQr: 'QR kopieren', copyVin: 'VIN kopieren', vinCopied: 'VIN kopiert', copyFailed: 'Bild-Zwischenablage nicht verfügbar. QR unten verwenden oder erneut kopieren.', vinMissing: 'VIN des Systemfahrzeugs fehlt.', textFailed: 'VIN konnte nicht kopiert werden.', remaining: 'Nicht ausgewählte oder ungeklärte Touren bleiben offen:', change: 'Fahrzeug ändern', systemQr: 'System-QR' },
  ru: { driver: 'Водитель', assigned: 'Назначено', issues: 'Проблемы', details: 'Детали', review: 'Нужна проверка', noVehicle: 'Машина не назначена', qr: 'Скопировать QR системной машины', copied: 'QR скопирован', copyQr: 'Копировать QR', copyVin: 'Копировать VIN', vinCopied: 'VIN скопирован', copyFailed: 'Копирование изображения недоступно. Используйте QR ниже или повторите копирование.', vinMissing: 'У системной машины не указан VIN.', textFailed: 'Не удалось скопировать VIN.', remaining: 'Невыбранные туры и туры с ошибками останутся открытыми:', change: 'Изменить машину', systemQr: 'Системный QR' },
};

function SystemQrAction({ car, disabled, ui, closeLabel, onToast }) {
  const source = useRef(null), dialog = useRef(null);
  const [fallback, setFallback] = useState(false), [failure, setFailure] = useState(''), [copying, setCopying] = useState(false);
  const vin = String(car?.vin || '').trim(); // Same VIN payload as Cars' existing QR workflow.
  const label = car?.vehicle_id || car?.license_plate || '—';
  useEffect(() => {
    if (fallback && !dialog.current.open) dialog.current.showModal();
    if (!fallback && dialog.current.open) dialog.current.close();
  }, [fallback]);
  async function copyQr() {
    setCopying(true);
    try {
      const canvas = source.current?.querySelector('canvas');
      if (!vin || !canvas) throw new Error(ui.vinMissing);
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error(ui.copyFailed);
      // Pass the PNG promise immediately so browsers retain the click's user activation.
      const png = new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(ui.copyFailed)), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      setFallback(false); setFailure(''); onToast(`${ui.copied} · ${label}`);
    } catch { setFailure(vin ? ui.copyFailed : ui.vinMissing); setFallback(true); }
    finally { setCopying(false); }
  }
  async function copyVin() {
    try { await navigator.clipboard.writeText(vin); onToast(ui.vinCopied); }
    catch { setFailure(ui.textFailed); }
  }
  return <>
    <span ref={source} className="tour-qr-source" aria-hidden="true">{vin && <QRCodeCanvas value={vin} size={320} includeMargin bgColor="#ffffff" fgColor="#000000" />}</span>
    <button type="button" className="tour-qr-button" disabled={disabled || copying} aria-label={ui.qr} title={`${ui.systemQr}: ${label}`} onClick={copyQr}>▦</button>
    <dialog ref={dialog} className="tour-qr-dialog" aria-label={ui.systemQr} onCancel={() => setFallback(false)} onClose={() => setFallback(false)} onClick={e => { if (e.target === dialog.current) setFallback(false); }}>
      <div className="tour-import-dialog-header"><strong>{ui.systemQr} · {label}</strong><button type="button" aria-label={closeLabel} onClick={() => setFallback(false)}>×</button></div>
      {vin && <QRCodeCanvas value={vin} size={240} includeMargin bgColor="#ffffff" fgColor="#000000" />}
      <code>{vin || ui.vinMissing}</code>
      {failure && <p role="alert">{failure}</p>}
      <div className="tour-import-controls"><button type="button" className="btn-secondary" disabled={!vin || copying} onClick={copyQr}>{ui.copyQr}</button><button type="button" className="btn-secondary" disabled={!vin} onClick={copyVin}>{ui.copyVin}</button></div>
    </dialog>
  </>;
}

const departureMinus30 = value => {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return '—';
  const [h, m] = value.split(':').map(Number), total = h * 60 + m - 30;
  const minutes = (total + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}${total < 0 ? ' (−1)' : ''}`;
};
const formatGermanDate = value => {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};
export default function TourImport({ defaultDate, onApplied, beforeImport }) {
  const { language } = useAppSettings(), t = copy[language] || copy.en, reason = reasons[language] || reasons.en, ui = dispatcherCopy[language] || dispatcherCopy.en;
  const [open, setOpen] = useState(false), [date, setDate] = useState(defaultDate);
  const [draft, setDraft] = useState(null), [edits, setEdits] = useState({}), [excluded, setExcluded] = useState([]), [selected, setSelected] = useState([]);
  const [dirty, setDirty] = useState(false), [partial, setPartial] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirmOpen, setConfirmOpen] = useState(false);
  const [rescueOpen, setRescueOpen] = useState(false), [rescueTime, setRescueTime] = useState(''), [rescueEmployee, setRescueEmployee] = useState(''), [copied, setCopied] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null), [toast, setToast] = useState('');
  const [updatedPlan, setUpdatedPlan] = useState(null), [updatedPlanOpen, setUpdatedPlanOpen] = useState(false), [planCopied, setPlanCopied] = useState(false);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); } }, [toast]);
  const accept = d => { setDraft(d); setExcluded(d.excluded); setDirty(false); setSelected(d.rows.filter(r => r.carId && r.systemCarId && !r.errors.length).map(r => r.rowNumber)); setEdits(Object.fromEntries(d.rows.map(r => [r.rowNumber, { driverId: r.driverId, carId: r.carId, locked: r.locked, systemCarId: r.systemCarId, systemLocked: r.systemLocked, approveChange: r.approveChange }]))); };
  async function run(fn) { setBusy(true); setError(''); setMessage(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function edit(row, patch) { setEdits(v => ({ ...v, [row.rowNumber]: { ...v[row.rowNumber], ...patch } })); setDirty(true); }
  const plate = id => {
    const car = draft?.cars.find(c => c.id === Number(id));
    return car ? [...new Set([car.vehicle_id, car.license_plate].filter(Boolean))].join(' · ') || `#${car.id}` : '—';
  };
  const vehicleLabel = id => {
    const car = draft?.cars.find(c => c.id === id);
    return car?.license_plate || '—';
  };
  const validRows = draft?.rows.filter(r => r.carId && r.systemCarId && !r.errors.length) || [];
  function physicalCandidates(row) {
    return draft.cars.filter(car => row.candidates.includes(car.id) && !excluded.includes(car.id) &&
      !(row.systemLocked && car.service_type === row.type && car.id !== row.systemCarId));
  }
  async function changePhysical(row, value) {
    setEditingVehicle(null);
    if (!value || Number(value) === row.carId) return;
    await run(async () => accept(await request(`/${draft.id}/preview`, {
      physicalChange: { rowNumber: row.rowNumber, carId: Number(value), version: draft.version },
    })));
  }
  const vehicleCopy = language === 'de'
    ? { proposed: 'Vorgeschlagen', usual: 'Am häufigsten gefahren', days: 'Tage', window: 'in den letzten', noHistory: 'Keine Zuteilungshistorie', unavailable: 'Aktuell nicht für diesen Fahrer/Tour verfügbar' }
    : language === 'ru'
      ? { proposed: 'Предложена машина', usual: 'Чаще всего ездил', days: 'дн.', window: 'за последние', noHistory: 'Нет истории назначений', unavailable: 'Сейчас недоступна для этого водителя/тура' }
      : { proposed: 'Proposed vehicle', usual: 'Most often driven', days: 'days', window: 'in the last', noHistory: 'No assignment history', unavailable: 'Currently unavailable for this driver/tour' };
  const employeeName = id => draft?.employees.find(employee => employee.id === id)?.display_name || id || '—';
  const plannedEmployeeIds = new Set((draft?.rows || []).map(row => edits[row.rowNumber]?.driverId || row.driverId).filter(Boolean));
  for (const row of draft?.rows || []) for (const participant of row.participants || []) {
    for (const employee of draft.employees) if (participant.matches?.includes(employee.id) ||
      (employee.transporter_id && String(employee.transporter_id).trim() === participant.transporterId)) plannedEmployeeIds.add(employee.id);
  }
  const rescueCandidates = (draft?.employees || []).filter(employee => !plannedEmployeeIds.has(employee.id));
  const timeOptions = [...new Map((draft?.rows || []).filter(row => row.entryTime).map(row => [`${row.entryDayOffset || 0}|${row.entryTime}`, { time: row.entryTime, dayOffset: row.entryDayOffset || 0 }])).values()]
    .sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time));
  const rosterGroups = new Map();
  for (const row of (draft?.rows || []).filter(row => selected.includes(row.rowNumber) && row.entryTime)) {
    const key = `${row.entryDayOffset || 0}|${row.entryTime}`;
    if (!rosterGroups.has(key)) rosterGroups.set(key, { time: row.entryTime, dayOffset: row.entryDayOffset || 0, names: [] });
    rosterGroups.get(key).names.push(employeeName(edits[row.rowNumber]?.driverId || row.driverId));
  }
  const sortedRosterGroups = [...rosterGroups.values()].sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time));
  const rosterText = ['UPDATE', ...sortedRosterGroups.flatMap((group, index) => [
    ...(index ? [''] : []),
    `Heute (${formatGermanDate(draft?.date)}) Einfahrt um ${group.time}`,
    ...group.names.sort((a, b) => a.localeCompare(b, 'de')),
  ])].join('\n');
  async function copyRosterText() {
    try {
      await navigator.clipboard.writeText(rosterText);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = rosterText; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
      document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }
  const updatedPlanText = updatedPlan ? ['UPDATE', ...Object.values(updatedPlan.rows.reduce((groups, row) => {
    if (!row.entryTime || !row.driver) return groups;
    const key = `${row.entryDayOffset || 0}|${row.entryTime}`;
    (groups[key] ||= { time: row.entryTime, dayOffset: row.entryDayOffset || 0, names: [] }).names.push(row.driver);
    return groups;
  }, {})).sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time)).flatMap((group, index) => [
    ...(index ? [''] : []), `Heute (${formatGermanDate(updatedPlan.date)}) Einfahrt um ${group.time}`,
    ...group.names.sort((a, b) => a.localeCompare(b, 'de')),
  ])].join('\n') : '';
  async function showUpdatedPlan() {
    await run(async () => { setUpdatedPlan(await request(`/updated-plan?date=${encodeURIComponent(date)}`)); setUpdatedPlanOpen(true); setPlanCopied(false); });
  }
  async function copyUpdatedPlan() {
    await navigator.clipboard.writeText(updatedPlanText);
    setPlanCopied(true); setTimeout(() => setPlanCopied(false), 1600);
  }
  return <div className="tour-import" data-portal-localized>
    <button type="button" className="btn-secondary" onClick={() => setOpen(v => !v)}>{open ? t[29] : t[0]}</button>
    {open && <div className="tour-import-panel">
      <fieldset disabled={busy} className="tour-import-controls">
        <label>{t[1]}<input type="date" value={date} onChange={e => { setDate(e.target.value); setDraft(null); }} /></label>
        <label>{t[3]}<input type="file" accept=".xlsx" disabled={!date} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; run(async () => { await beforeImport?.(); const form = new FormData(); form.append('file', file); form.append('date', date); const uploaded = await request('/upload', form); const d = await request(`/${uploaded.id}/preview`, { edits: {}, excluded: uploaded.excluded }); setExcluded([]); setPartial(false); accept(d); }); }} /></label>
        <button type="button" className="btn-secondary" disabled={busy || !date} onClick={showUpdatedPlan}>{language === 'ru' ? 'Show Updated Plan' : 'Show Updated Plan'}</button>
      </fieldset>
      {error && <p role="alert" className="car-planning-error">{error}</p>}{message && <p role="status">{message}</p>}
      {draft && <>
        <p className="tour-dispatch-source">{draft.source} · {draft.date}</p>
        <p className="tour-dispatch-summary">{draft.rows.length} {t[9]} · {validRows.length} {ui.assigned} · {draft.rows.length - validRows.length} {ui.issues}{draft.evSummary && <> · EV {draft.evSummary.assigned}/{draft.evSummary.available}</>}</p>
        <div className="tour-import-table tour-dispatch-table"><table aria-label={t[0]}><thead><tr><th>{t[9]}</th><th>{ui.driver}</th><th title="Geplante Abfahrtszeit − 30 min">{(reviewCopy[language] || reviewCopy.en).time}</th><th>{t[13]}</th></tr></thead><tbody>
          {draft.rows.map(row => {
            const review = reviewCopy[language] || reviewCopy.en;
            const issue = !!row.errors.length || !row.carId || !row.systemCarId;
            const substitution = !!row.carId && !!row.systemCarId && row.carId !== row.systemCarId;
            const system = draft.cars.find(c => c.id === row.systemCarId);
            const explanation = row.errors.map(code => reason[code] || code).join(' · ') || (issue ? reason[row.reason] || row.reason : '');
            return <tr key={row.rowNumber} data-route={row.route}>
              <td>{row.isRescue ? 'Rescue' : row.route}</td>
              <td>{row.driverId ? employeeName(row.driverId) : row.participants.map(p => p.name).filter(Boolean).join(' / ') || '—'}</td>
              <td title={row.departureTime ? `Geplante Abfahrtszeit: ${row.departureTime} − 30 min` : undefined}>{departureMinus30(row.departureTime)}</td>
              <td><div className={`tour-vehicle-area${issue ? ' is-issue' : substitution ? ' is-substitution' : ''}`} title={issue ? explanation : undefined}>
                {editingVehicle === row.rowNumber
                  ? <select autoFocus aria-label={`${t[13]} ${row.route}`} value={row.carId || ''} disabled={busy} onBlur={() => setEditingVehicle(null)} onKeyDown={e => { if (e.key === 'Escape') setEditingVehicle(null); }} onChange={e => changePhysical(row, e.target.value)}><option value="">{t[17]}</option>{physicalCandidates(row).map(car => <option key={car.id} value={car.id}>{vehicleLabel(car.id)}</option>)}</select>
                  : <button type="button" className="tour-vehicle-button" disabled={busy || dirty} aria-label={`${ui.change} ${row.route}`} aria-expanded={false} onClick={() => setEditingVehicle(row.rowNumber)}>{vehicleLabel(row.carId)} <span aria-hidden="true">▾</span></button>}
                {substitution && <SystemQrAction key={`${row.systemCarId}|${system?.vin || ''}`} car={system} disabled={busy || dirty || issue} ui={ui} closeLabel={t[29]} onToast={setToast} />}
                {issue && <span className="tour-issue-label">{ui.review}{row.type && <> · {row.type}</>}<small>{review[row.reviewReason] || reason[row.reviewReason] || explanation}</small></span>}
              </div></td>
            </tr>;
          })}
        </tbody></table></div>
        <details className="tour-import-diagnostics"><summary>{ui.details}</summary>
        <p>{t[21]}</p><ul>{draft.summary.map(s => <li key={s.type}>{s.type}: {s.demand} / {s.available} / {s.assigned} / {s.shortage} / {s.conflicts}{s.constraintConflicts > 0 && <span> · {reason.CONSTRAINT_CONFLICT}: {s.constraintConflicts}</span>}</li>)}</ul>
        {draft.evSummary && <div role="status"><strong>EV Utilization: {draft.evSummary.assigned}/{draft.evSummary.available} ({draft.evSummary.utilization == null ? '—' : `${Math.round(draft.evSummary.utilization * 100)}%`})</strong><br />
          <small>Available EV: {draft.evSummary.available} · EV physically assigned: {draft.evSummary.assigned} · EV remaining: {draft.evSummary.remaining} · Medium/Standard physically assigned: {draft.evSummary.conventionalAssigned} · Routes without physical vehicle: {draft.evSummary.unfilledRoutes} · QR/System conflicts: {draft.evSummary.systemConflicts}</small>
          {!!draft.evSummary.remainingVehicles.length && <details><summary>EV remaining</summary>{draft.evSummary.remainingVehicles.map(v => <small key={v.carId}>{plate(v.carId)}: {v.reason}</small>)}</details>}
        </div>}
        <details><summary>{t[18]}</summary><div className="tour-import-controls">{draft.cars.map(c => <label key={c.id}><input type="checkbox" checked={excluded.includes(c.id)} disabled={busy} onChange={e => { setExcluded(v => e.target.checked ? [...v, c.id] : v.filter(id => id !== c.id)); setDirty(true); }} />{plate(c.id)} · {c.service_type}</label>)}</div></details>
        <div className="tour-import-table tour-diagnostics-table"><table><thead><tr>{[28, 9, 10, 11, 12, 13, 14, 15, 27].map(i => <th key={i}>{i === 13 ? 'Physical Vehicle' : i === 14 ? 'System / QR Vehicle' : t[i]}</th>)}</tr></thead><tbody>
          {draft.rows.map(row => { const current = edits[row.rowNumber] || {}; return <tr key={row.rowNumber}>
            <td><input aria-label={`${t[28]} ${row.route}`} type="checkbox" disabled={busy || !partial || !!row.errors.length || !row.carId} checked={selected.includes(row.rowNumber)} onChange={e => setSelected(v => e.target.checked ? [...v, row.rowNumber] : v.filter(n => n !== row.rowNumber))} /></td>
            <td>{row.route}<small>#{row.rowNumber}{row.duplicateRows.length ? ` (+ ${row.duplicateRows.join(', ')})` : ''}</small></td>
            <td>{row.participants.map((p, i) => <small key={i}>{p.name} · {p.transporterId}</small>)}<select aria-label={`${t[10]} ${row.route}`} disabled={busy || (!!row.driverId && !row.errors.includes('SELECT_PRIMARY_DRIVER') && !row.errors.includes('RESOLVE_DRIVER'))} value={current.driverId || ''} onChange={e => edit(row, { driverId: e.target.value })}><option value="">{t[16]}</option>{draft.employees.map(e => <option key={e.id} value={e.id}>{e.display_name} · {e.transporter_id || e.id}</option>)}</select></td>
            <td>{String(row.raw['Zustelldienst-Typ'])}<small>→ {row.type || '—'}</small></td><td title={row.departureTime ? `Geplante Abfahrtszeit: ${row.departureTime}` : undefined}>{row.entryTime || '—'}{row.entryDayOffset === -1 && <small>−1 day</small>}</td>
            <td>
              <small>Physical Vehicle · {draft.cars.find(c => c.id === current.carId)?.service_type || '—'}</small>
              {!dirty && row.carId && <small><strong>{vehicleCopy.proposed}: {plate(row.carId)}</strong></small>}
              {!dirty && row.carId && row.historyDays && <small>{row.assignedCarDays} {vehicleCopy.days} · {vehicleCopy.window} {row.historyDays} {vehicleCopy.days}</small>}
              <select aria-label={`${t[13]} ${row.route}`} disabled={busy} value={current.carId || ''} onChange={e => edit(row, { carId: Number(e.target.value) || null, locked: !!e.target.value })}><option value="">{t[17]}</option>{draft.cars.filter(c => row.candidates.includes(c.id) || c.id === current.carId).map(c => <option disabled={!row.candidates.includes(c.id)} key={c.id} value={c.id}>{plate(c.id)}</option>)}</select>
              {!dirty && row.historyDays && <small>{row.usualCarId
                ? `${vehicleCopy.usual}: ${plate(row.usualCarId)} — ${row.usualCarDays} ${vehicleCopy.days} (${vehicleCopy.window} ${row.historyDays} ${vehicleCopy.days})`
                : vehicleCopy.noHistory}</small>}
              {!dirty && row.usualCarId && !row.candidates.includes(row.usualCarId) && <small>{vehicleCopy.unavailable}</small>}
              <label><input aria-label={`${t[14]} ${row.route}`} type="checkbox" disabled={busy} checked={!!current.locked} onChange={e => edit(row, { locked: e.target.checked })} />{t[14]} · Physical</label>
            </td>
            <td>
              <select aria-label={`System / QR Vehicle ${row.route}`} disabled={busy} value={current.systemCarId || ''} onChange={e => edit(row, { systemCarId: Number(e.target.value) || null, systemLocked: !!e.target.value })}><option value="">{t[17]}</option>{draft.cars.filter(c => row.systemCandidates.includes(c.id) || c.id === current.systemCarId).map(c => <option disabled={!row.systemCandidates.includes(c.id)} key={c.id} value={c.id}>{plate(c.id)} · {c.service_type}</option>)}</select>
              <label><input aria-label={`System lock ${row.route}`} type="checkbox" disabled={busy} checked={!!current.systemLocked} onChange={e => edit(row, { systemLocked: e.target.checked })} />{t[14]} · System/QR</label>
              {!dirty && row.assignmentMode && <small><strong>{row.assignmentMode === 'EV_SUBSTITUTION' ? `${row.type} → ${row.physicalVehicleType} · EV substitution` : 'DIRECT'}</strong></small>}
            </td>
            <td>{reason[row.reason] || row.reason}{row.warnings?.includes('NAME_MISMATCH') && <small>{language === 'de' ? 'Name weicht vom Mitarbeiterverzeichnis ab.' : language === 'ru' ? 'Имя отличается от справочника сотрудников.' : 'Name differs from employee directory.'}</small>}{row.errors.map((code, i) => <small key={i}>{reason[code] || code}</small>)}{row.existing && <label><input type="checkbox" disabled={busy} checked={!!current.approveChange} onChange={e => edit(row, { approveChange: e.target.checked })} />{t[19]}</label>}</td>
            <td>{t[{ ADDED: 24, CHANGED: 25, UNCHANGED: 26 }[row.change]]}<small>{plate(row.existing?.car_id)} → {plate(row.carId)}</small><small>System/QR: {plate(row.existing?.system_vehicle_id ?? row.existing?.car_id)} → {plate(row.systemCarId)}</small>{row.existing && <small>{draft.employees.find(e => e.id === row.existing.employee_id)?.display_name || row.existing.driver_identifier} / {row.existing.required_type} → {draft.employees.find(e => e.id === row.driverId)?.display_name} / {row.type}</small>}</td>
          </tr>; })}
        </tbody></table></div>
        {dirty && <p role="status">{t[20]}</p>}
        <div className="tour-import-controls"><button className="btn-secondary" disabled={busy} onClick={() => run(async () => accept(await request(`/${draft.id}/preview`, { edits, excluded })))}>{t[5]}</button>
          <label><input type="checkbox" checked={partial} disabled={busy} onChange={e => setPartial(e.target.checked)} />{t[8]}</label>
        </div>
        </details>
        {dirty && <p role="status">{t[20]}</p>}
        <div className="tour-dispatch-actions">              <button type="button" className="btn-primary" disabled={busy || dirty || !timeOptions.length || !rescueCandidates.length} onClick={() => { setRescueTime(`${timeOptions[0]?.dayOffset || 0}|${timeOptions[0]?.time || ''}`); setRescueEmployee(''); setRescueOpen(true); }}>Add Rescue</button><button className="btn-primary" disabled={busy || dirty || !draft.distributed || !selected.length} onClick={() => setConfirmOpen(true)}>{t[7]} ({selected.length})</button></div>
      </>}
      {confirmOpen && draft && <div className="tour-import-dialog-backdrop" onClick={() => setConfirmOpen(false)}>
        <div className="tour-import-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-import-update-title" onClick={e => e.stopPropagation()}>
          <div className="tour-import-dialog-header">
            <h3 id="tour-import-update-title">Update Plan</h3>
            <div className="tour-import-dialog-header-actions">
              <button type="button" className="btn-secondary" onClick={copyRosterText}>{copied ? 'Copied' : 'Copy'}</button>

            </div>
          </div>
          {selected.length < draft.rows.length && <p className="tour-save-warning">{ui.remaining} {draft.rows.filter(r => !selected.includes(r.rowNumber)).map(r => r.route).join(', ')}</p>}
          <pre className="tour-import-roster-text">{rosterText}</pre>
          <div className="tour-import-dialog-actions">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>{language === 'de' ? 'Abbrechen' : language === 'ru' ? 'Отмена' : 'Cancel'}</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => run(async () => { const result = await request(`/${draft.id}/apply`, { selected, version: draft.version, partial: partial || selected.length < draft.rows.length }); setConfirmOpen(false); setDraft(null); setMessage(`${t[23]} ${result.remaining}${result.inspectionSyncPending ? (language === 'de' ? ' Fahrzeugkontroll-Erinnerungen müssen erneut synchronisiert werden.' : ' Vehicle inspection reminders need to be synchronized again.') : ''}`); onApplied(); })}>Update Plan</button>
          </div>
        </div>
      </div>}
      {updatedPlanOpen && updatedPlan && <div className="tour-import-dialog-backdrop" onClick={() => setUpdatedPlanOpen(false)}>
        <div className="tour-import-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-import-saved-plan-title" onClick={e => e.stopPropagation()}>
          <div className="tour-import-dialog-header"><h3 id="tour-import-saved-plan-title">Show Updated Plan</h3><button type="button" aria-label={t[29]} onClick={() => setUpdatedPlanOpen(false)}>×</button></div>
          {updatedPlanText ? <pre className="tour-import-roster-text">{updatedPlanText}</pre> : <p>{language === 'ru' ? 'Для выбранной даты ещё нет сохранённого плана.' : 'There is no saved plan for the selected date yet.'}</p>}
          <div className="tour-import-dialog-actions"><button type="button" className="btn-secondary" disabled={!updatedPlanText} onClick={copyUpdatedPlan}>{planCopied ? 'Copied' : 'Copy'}</button><button type="button" className="btn-secondary" onClick={() => setUpdatedPlanOpen(false)}>{t[29]}</button></div>
        </div>
      </div>}
      {rescueOpen && draft && <div className="tour-import-dialog-backdrop tour-import-rescue-backdrop" onClick={() => setRescueOpen(false)}>
        <div className="tour-import-dialog tour-import-rescue-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-import-rescue-title" onClick={e => e.stopPropagation()}>
          <h3 id="tour-import-rescue-title">Add Rescue</h3>{error && <p role="alert">{error}</p>}
          <label>{language === 'de' ? 'Einfahrtszeit' : language === 'ru' ? 'Время въезда' : 'Entry time'}
            <select value={rescueTime} onChange={e => setRescueTime(e.target.value)}>{timeOptions.map(option => <option key={`${option.dayOffset}|${option.time}`} value={`${option.dayOffset}|${option.time}`}>{option.time}</option>)}</select>
          </label>
          <label>{language === 'de' ? 'Mitarbeiter' : language === 'ru' ? 'Сотрудник' : 'Employee'}
            <select value={rescueEmployee} disabled={busy} onChange={e => {
              const employeeId = e.target.value; setRescueEmployee(employeeId);
              if (!employeeId) return;
              const [dayOffset,time] = rescueTime.split('|');
              run(async () => { accept(await request(`/${draft.id}/rescue`, {employeeId,entryTime:time,entryDayOffset:Number(dayOffset),version:draft.version})); setRescueOpen(false); });
            }}><option value="">—</option>{rescueCandidates.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select>
          </label>
          <div className="tour-import-dialog-actions">
            <button type="button" className="btn-secondary" onClick={() => setRescueOpen(false)}>{language === 'de' ? 'Abbrechen' : language === 'ru' ? 'Отмена' : 'Cancel'}</button>

          </div>
        </div>
      </div>}
    </div>}
    {toast && <div className="tour-copy-toast" role="status">{toast}</div>}
  </div>;
}

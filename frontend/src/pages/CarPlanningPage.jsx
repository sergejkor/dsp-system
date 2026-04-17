import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { getCars, getDrivers, getPlanningData, savePlanningData, getReport, addCar } from '../services/carPlanningApi';
import { syncKenjoEmployees } from '../services/kenjoApi';

/** Day window around today included in planning columns (saved to DB). */
const CAR_PLANNING_PAST_DAYS = 60;
const CAR_PLANNING_FUTURE_DAYS = 6;

const FULL_WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function weekdayKeyFromYmd(dateStr) {
  if (!dateStr || dateStr.length < 10) return 'mon';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return FULL_WEEKDAY_KEYS[dt.getDay()] || 'mon';
}

function toYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShort(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function isDateWithinRange(dateStr, fromStr, toStr) {
  if (!dateStr || !fromStr) return false;
  const end = toStr || fromStr;
  return dateStr >= fromStr && dateStr <= end;
}

function formatWorkshopPeriod(fromStr, toStr) {
  if (!fromStr) return '';
  if (!toStr || toStr === fromStr) return formatShort(fromStr);
  return `${formatShort(fromStr)} - ${formatShort(toStr)}`;
}

function isStatusAutoDeactivated(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return ['maintenance', 'grounded', 'out of service', 'defleeted', 'decommissioned'].includes(normalized);
}

/** Searchable driver cell: input + dropdown filtered by query; supports free text. */
function DriverCell({
  value,
  drivers,
  usedInColumn,
  onSelect,
  onAbfahrtskontrolle,
  abfahrtskontrolleMode,
  abfahrtskontrolleDone,
  disabled,
  pasteValue = '',
  onCopyValue,
  usePasteButton = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const ref = useRef(null);
  const locked = !!abfahrtskontrolleMode;

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    const current = (value || '').trim().toLowerCase();
    const source = drivers;
    const base = !q
      ? source
      : source.filter(
          (d) =>
            (d.display_name && d.display_name.toLowerCase().includes(q)) ||
            (d.transporter_id && d.transporter_id.toLowerCase().includes(q)) ||
            (d.employee_number && String(d.employee_number).toLowerCase().includes(q))
        );
    const result = [];
    const seen = new Set();
    for (const d of base) {
      const name = (d.display_name || d.transporter_id || d.id || '').toString().trim().toLowerCase();
      if (!name) {
        result.push(d);
        continue;
      }
      if (seen.has(name)) continue;
      if (usedInColumn.has(name) && name !== current) continue;
      seen.add(name);
      result.push(d);
      if (result.length >= 20) break;
    }
    return result;
  }, [drivers, query, usedInColumn, value]);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    if (locked) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, locked]);

  return (
    <div className="car-planning-cell-wrap" ref={ref}>
      {abfahrtskontrolleDone ? (
        <span className="car-planning-cell-abfahrt-badge" title="Abfahrtskontrolle set" aria-hidden="true">
          ✓
        </span>
      ) : null}
      <input
        type="text"
        className={`car-planning-cell-input ${abfahrtskontrolleDone ? 'car-planning-cell-green' : ''}`}
        value={query}
        readOnly={locked || disabled}
        onChange={(e) => {
          if (locked || disabled) return;
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (locked || disabled) return;
          setOpen(true);
        }}
        onBlur={() => {
          if (locked || disabled) return;
          setTimeout(() => {
            setOpen(false);
            onSelect(query.trim());
          }, 150);
        }}
        disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (locked) return;
          // Delete / Backspace on empty field clears value
          if ((e.key === 'Delete' || e.key === 'Backspace') && !query) {
            e.preventDefault();
            onSelect('');
            setQuery('');
            return;
          }
          // Simple paste support from clipboard (Ctrl+V / Cmd+V)
          if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
            // Let the browser paste into the input, then sync to state shortly after
            setTimeout(() => {
              const next = e.target.value.trim();
              setQuery(next);
              onSelect(next);
            }, 0);
          }
        }}
        onClick={() => {
          if (abfahrtskontrolleMode && !disabled) {
            onAbfahrtskontrolle?.();
          }
        }}
        placeholder="—"
      />
      {!disabled && !locked && (
        <div className="car-planning-cell-icons">
          <button
            type="button"
            className="car-planning-cell-icon-btn"
            title="Clear"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuery('');
              onSelect('');
            }}
          >
            ×
          </button>
          <button
            type="button"
            className="car-planning-cell-icon-btn"
            title={usePasteButton ? 'Paste' : 'Copy'}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (usePasteButton) {
                const text = (pasteValue || '').trim();
                if (!text) return;
                const next = text.toLowerCase();
                const current = (value || '').trim().toLowerCase();
                if (usedInColumn.has(next) && next !== current) return;
                setQuery(text);
                onSelect(text);
                return;
              }
              const text = (query || '').trim();
              if (!text) return;
              onCopyValue?.(text);
              try {
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
              } catch {}
            }}
          >
            {usePasteButton ? '📋' : '⧉'}
          </button>
        </div>
      )}
      {open && !locked && (
        <ul className="car-planning-cell-dropdown">
          {query.trim() && !drivers.some((d) => (d.display_name || '').toLowerCase() === query.trim().toLowerCase()) && (
            <li
              className="car-planning-cell-option"
              onMouseDown={(e) => { e.preventDefault(); onSelect(query.trim()); setOpen(false); }}
            >
              {query.trim()} (free text)
            </li>
          )}
          {filtered.map((d) => (
            <li
              key={d.id}
              className="car-planning-cell-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(d.display_name || d.transporter_id || d.id);
                setOpen(false);
              }}
            >
              {d.display_name || d.transporter_id || d.id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Normalized plate helpers
const BLUE_PLATES = new Set([
  'MAZ1663E', 'KAZ2583E', 'MAZ1631E', 'KAZ2627E',
  'MAZ2359E', 'MAZ1646E', 'MAZ1659E', 'MAZ1649E',
]);
const GREEN_PLATES = new Set([
  'MAZ7664E', 'MAZ8260E', 'MAZ8233E', 'MAZ8138E',
  'MAZ7673E', 'MAZ8130E', 'MAZ7670E', 'MAZ8193E', 'MAZ8162E',
]);
const GRAY_PLATES = new Set([
  'MAZ6456', 'MAZ3120', 'MAZ6467', 'MAZ6458',
  'WIPK1993', 'MRR1007', 'MDR1317', 'WIAM5649',
]);
const YELLOW_PLATES = new Set([
  'HHF3365', 'HHF3640', 'HHF3690', 'HHF3860',
]);

const SERVICE_TYPES = [
  'Rivian',
  'Standard Parcel',
  'Medium Van',
  'Electric Vehicle 2.0',
  'Electric Vehicle 1.0',
];

function getCarPlateDisplay(car) {
  const plateRaw = car.license_plate || car.vehicle_id || '';
  const plateKey = plateRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let plateClass = '';
  const serviceType = String(car?.service_type || '').trim().toLowerCase();
  if (serviceType === 'rivian') {
    plateClass = 'car-planning-plate-blue';
  } else if (serviceType === 'standard parcel') {
    plateClass = 'car-planning-plate-white';
  } else if (serviceType === 'medium van') {
    plateClass = 'car-planning-plate-gray';
  } else if (serviceType === 'electric vehicle 2.0') {
    plateClass = 'car-planning-plate-green';
  } else if (serviceType === 'electric vehicle 1.0') {
    plateClass = 'car-planning-plate-yellow';
  } else if (BLUE_PLATES.has(plateKey)) {
    plateClass = 'car-planning-plate-blue';
  } else if (GREEN_PLATES.has(plateKey)) {
    plateClass = 'car-planning-plate-green';
  } else if (YELLOW_PLATES.has(plateKey)) {
    plateClass = 'car-planning-plate-yellow';
  } else if (GRAY_PLATES.has(plateKey)) {
    plateClass = 'car-planning-plate-gray';
  }
  return { plateRaw, plateClass };
}

/** Match header/body row heights between fixed-col and scrollable day tables. */
function syncCarPlanningTables(fixedEl, daysEl) {
  if (!fixedEl || !daysEl) return;
  const fixedHead = fixedEl.querySelector('thead tr');
  const daysHead = daysEl.querySelector('thead tr');
  if (fixedHead && daysHead) {
    fixedHead.style.height = '';
    daysHead.style.height = '';
    const hh = Math.max(fixedHead.getBoundingClientRect().height, daysHead.getBoundingClientRect().height);
    fixedHead.style.height = `${hh}px`;
    daysHead.style.height = `${hh}px`;
  }
  const fixedRows = fixedEl.querySelectorAll('tbody tr');
  const daysRows = daysEl.querySelectorAll('tbody tr');
  const n = Math.min(fixedRows.length, daysRows.length);
  for (let i = 0; i < n; i += 1) {
    fixedRows[i].style.height = '';
    daysRows[i].style.height = '';
    const h = Math.max(fixedRows[i].getBoundingClientRect().height, daysRows[i].getBoundingClientRect().height);
    fixedRows[i].style.height = `${h}px`;
    daysRows[i].style.height = `${h}px`;
  }
}

export default function CarPlanningPage() {
  const { t } = useAppSettings();
  const [cars, setCars] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [copiedDriverName, setCopiedDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncingKenjo, setSyncingKenjo] = useState(false);
  const [copiedDayDate, setCopiedDayDate] = useState('');
  const copiedSlotsByCarIdRef = useRef(null);
  const [abfahrtskontrolleMode, setAbfahrtskontrolleMode] = useState(false);
  const [carStates, setCarStates] = useState({});
  const [slots, setSlots] = useState({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportRows, setReportRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sortByDate, setSortByDate] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [addCarOpen, setAddCarOpen] = useState(false);
  const [addCarSaving, setAddCarSaving] = useState(false);
  const [addCarForm, setAddCarForm] = useState({
    plate: '',
    vin: '',
    sourceType: 'LMR',
    serviceType: 'Standard Parcel',
    from: '',
    to: '',
  });
  const reportRef = useRef(null);
  const carPlanningFixedTableRef = useRef(null);
  const carPlanningDaysTableRef = useRef(null);
  const carPlanningDaysScrollWrapRef = useRef(null);
  const carPlanningDidInitialScrollRef = useRef(false);
  const [screenshotStatus, setScreenshotStatus] = useState('');

  const runSyncCarPlanningHeights = useCallback(() => {
    syncCarPlanningTables(carPlanningFixedTableRef.current, carPlanningDaysTableRef.current);
  }, []);

  const { newDayDate, scrollDates, allPlanningDates } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nd = toYYYYMMDD(today);
    const start = new Date(today);
    start.setDate(start.getDate() - CAR_PLANNING_PAST_DAYS);
    const end = new Date(today);
    end.setDate(end.getDate() + CAR_PLANNING_FUTURE_DAYS);
    const scroll = [];
    for (let cur = new Date(start.getTime()); cur.getTime() <= end.getTime(); cur.setDate(cur.getDate() + 1)) {
      const ymd = toYYYYMMDD(new Date(cur.getTime()));
      if (ymd !== nd) scroll.push(ymd);
    }
    const all = [...new Set([nd, ...scroll])].sort();
    return { newDayDate: nd, scrollDates: scroll, allPlanningDates: all };
  }, []);

  const getWorkshopBlockForDate = useCallback((car, dateStr) => {
    const from = (car?.planned_workshop_from || '').toString().slice(0, 10);
    const to = (car?.planned_workshop_to || '').toString().slice(0, 10);
    if (!from || !isDateWithinRange(dateStr, from, to)) return null;
    return {
      workshopName: (car?.planned_workshop_name || '').toString().trim(),
      periodLabel: formatWorkshopPeriod(from, to),
    };
  }, []);

  const isCarUnavailableForPlanning = useCallback(
    (car, dateStr) => isStatusAutoDeactivated(car?.status) || !!getWorkshopBlockForDate(car, dateStr),
    [getWorkshopBlockForDate]
  );

  // Auto-set Abfahrtskontrolle based on last driver vs today
  const handleAutoAbfahrtskontrolle = () => {
    setSlots((prev) => {
      const next = { ...prev };
      const beforeToday = scrollDates.filter((d) => d < newDayDate).sort();
      cars.forEach((car) => {
        if (isCarUnavailableForPlanning(car, newDayDate) || !!carStates[car.id]) {
          return;
        }
        const todayKey = `${car.id}_${newDayDate}`;
        const todayName = (prev[todayKey]?.driver_identifier || '').toString().trim();
        if (!todayName) {
          // No driver today – clear flag
          if (next[todayKey]) {
            next[todayKey] = { ...next[todayKey], abfahrtskontrolle: false };
          }
          return;
        }

        // Most recent previous calendar day (before today) with a driver in the grid.
        let lastName = '';
        for (let i = beforeToday.length - 1; i >= 0; i -= 1) {
          const d = beforeToday[i];
          const key = `${car.id}_${d}`;
          const val = (prev[key]?.driver_identifier || '').toString().trim();
          if (val) {
            lastName = val;
            break;
          }
        }

        // Если раньше никто не ездил — по требованию тоже отмечаем Abfahrtskontrolle.
        if (!lastName) {
          next[todayKey] = {
            driver_identifier: prev[todayKey]?.driver_identifier || todayName,
            abfahrtskontrolle: true,
          };
          return;
        }

        const same = lastName.toLowerCase() === todayName.toLowerCase();
        // Отмечаем только если последний водитель существует и отличается от сегодняшнего.
        const flag = !same;
        next[todayKey] = {
          driver_identifier: prev[todayKey]?.driver_identifier || todayName,
          abfahrtskontrolle: flag,
        };
      });
      return next;
    });
  };

  const handleReportScreenshot = async () => {
    if (!reportRows.length) {
      setScreenshotStatus('Nothing to capture');
      setTimeout(() => setScreenshotStatus(''), 2000);
      return;
    }
    try {
      const title = `${t('carPlanning.reportTitle')} - ${formatShort(newDayDate)}`;
      const columns = [
        t('carPlanning.vehicle'),
        t('carPlanning.driver'),
        t('carPlanning.abfahrtskontrolleCol'),
      ];
      const rows = reportRows.map((row) => [
        row.license_plate || row.vehicle_id || '-',
        row.driver_identifier || '-',
        row.abfahrtskontrolle ? 'Yes' : '',
      ]);

      const canvas = document.createElement('canvas');
      const width = 1180;
      const paddingX = 44;
      const headerHeight = 64;
      const tableHeaderHeight = 44;
      const rowHeight = 38;
      const footerHeight = 28;
      const height = headerHeight + tableHeaderHeight + rows.length * rowHeight + footerHeight + 24;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context is not available');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 28px Segoe UI, Arial, sans-serif';
      ctx.fillText(title, paddingX, 42);

      const colWidths = [260, 560, 220];
      const colXs = [
        paddingX,
        paddingX + colWidths[0],
        paddingX + colWidths[0] + colWidths[1],
      ];
      const tableWidth = colWidths.reduce((sum, value) => sum + value, 0);
      const tableTop = 74;

      ctx.fillStyle = '#eaf1fb';
      ctx.fillRect(paddingX, tableTop, tableWidth, tableHeaderHeight);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(paddingX, tableTop, tableWidth, tableHeaderHeight + rows.length * rowHeight);

      ctx.font = '600 16px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#0f172a';
      columns.forEach((column, index) => {
        ctx.fillText(column, colXs[index] + 14, tableTop + 28);
      });

      rows.forEach((row, rowIndex) => {
        const y = tableTop + tableHeaderHeight + rowIndex * rowHeight;
        ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(paddingX, y, tableWidth, rowHeight);

        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(paddingX, y);
        ctx.lineTo(paddingX + tableWidth, y);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = '500 15px Segoe UI, Arial, sans-serif';
        row.forEach((cell, cellIndex) => {
          ctx.fillText(String(cell ?? ''), colXs[cellIndex] + 14, y + 24);
        });
      });

      [colXs[1], colXs[2]].forEach((x) => {
        ctx.strokeStyle = '#dbe4f0';
        ctx.beginPath();
        ctx.moveTo(x, tableTop);
        ctx.lineTo(x, tableTop + tableHeaderHeight + rows.length * rowHeight);
        ctx.stroke();
      });

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new Error('Failed to generate screenshot blob');
      }

      const canCopyImage =
        typeof window !== 'undefined' &&
        typeof window.ClipboardItem !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function';

      if (canCopyImage) {
        try {
          await navigator.clipboard.write([
            new window.ClipboardItem({
              'image/png': blob,
            }),
          ]);
          setScreenshotStatus('Copied to clipboard');
          setTimeout(() => setScreenshotStatus(''), 2000);
          return;
        } catch {
          // fall back to file download below
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `car-planning-report-${newDayDate || 'today'}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setScreenshotStatus('PNG downloaded');
      setTimeout(() => setScreenshotStatus(''), 2000);
    } catch {
      setScreenshotStatus('Screenshot failed');
      setTimeout(() => setScreenshotStatus(''), 2000);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setError('');
    setLoading(true);
    Promise.all([getCars(), getDrivers(), getPlanningData(allPlanningDates)])
      .then(([carsList, driversList, data]) => {
        if (cancelled) return;
        setCars(carsList || []);
        setDrivers(driversList || []);
        setCarStates(data.carStates || {});
        const slotMap = {};
        (data.slots || []).forEach((s) => {
          const key = `${s.car_id}_${s.plan_date}`;
          slotMap[key] = { driver_identifier: s.driver_identifier, abfahrtskontrolle: s.abfahrtskontrolle };
        });
        setSlots(slotMap);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [allPlanningDates.join(',')]);

  const usedDriversByDateExcludingCar = useMemo(() => {
    const out = {};
    cars.forEach((car) => {
      allPlanningDates.forEach((date) => {
        const set = new Set();
        cars.forEach((c) => {
          if (c.id === car.id) return;
          const key = `${c.id}_${date}`;
          const v = slots[key]?.driver_identifier;
          if (v && String(v).trim()) set.add(String(v).trim().toLowerCase());
        });
        out[`${car.id}_${date}`] = set;
      });
    });
    return out;
  }, [allPlanningDates, cars, slots]);

  const totalCountNewDay = useMemo(() => {
    const date = newDayDate;
    let n = 0;
    cars.forEach((car) => {
      if (isCarUnavailableForPlanning(car, date)) return;
      const key = `${car.id}_${date}`;
      if (slots[key]?.driver_identifier && String(slots[key].driver_identifier).trim()) n++;
    });
    return n;
  }, [cars, slots, newDayDate, isCarUnavailableForPlanning]);

  const sortedCars = useMemo(() => {
    const out = [...cars].sort((a, b) => {
      const aDeact = carStates[a.id] ? 1 : 0;
      const bDeact = carStates[b.id] ? 1 : 0;
      if (aDeact !== bDeact) return aDeact - bDeact; // active first, deactivated bottom
      if (!sortByDate) return 0;
      const va = (slots[`${a.id}_${sortByDate}`]?.driver_identifier || '').trim().toLowerCase();
      const vb = (slots[`${b.id}_${sortByDate}`]?.driver_identifier || '').trim().toLowerCase();
      const c = va.localeCompare(vb, undefined, { sensitivity: 'base' });
      return sortAsc ? c : -c;
    });
    return out;
  }, [cars, slots, sortByDate, sortAsc, carStates]);

  useLayoutEffect(() => {
    runSyncCarPlanningHeights();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(runSyncCarPlanningHeights);
    });
    const fixed = carPlanningFixedTableRef.current;
    const days = carPlanningDaysTableRef.current;
    if (fixed) ro.observe(fixed);
    if (days) ro.observe(days);
    return () => ro.disconnect();
  }, [sortedCars, scrollDates, slots, drivers, runSyncCarPlanningHeights]);

  useLayoutEffect(() => {
    const el = carPlanningDaysScrollWrapRef.current;
    if (!el) return;
    if (loading) return;
    if (carPlanningDidInitialScrollRef.current) return;

    // Wait for table layout/width settle, then jump to newest day (right edge).
    const setToRight = () => {
      if (!carPlanningDaysScrollWrapRef.current) return;
      carPlanningDaysScrollWrapRef.current.scrollLeft = carPlanningDaysScrollWrapRef.current.scrollWidth;
    };
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      setToRight();
      raf2 = requestAnimationFrame(() => {
        setToRight();
        carPlanningDidInitialScrollRef.current = true;
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [loading, scrollDates, sortedCars.length]);

  const setSlot = (carId, date, driverIdentifier, abfahrtskontrolle) => {
    const key = `${carId}_${date}`;
    setSlots((prev) => ({
      ...prev,
      [key]: { driver_identifier: driverIdentifier, abfahrtskontrolle: abfahrtskontrolle ?? prev[key]?.abfahrtskontrolle },
    }));
  };

  const setCarState = (carId, deactivated) => {
    setCarStates((prev) => ({ ...prev, [carId]: !!deactivated }));
  };

  const toggleAbfahrtskontrolle = (carId, date) => {
    const key = `${carId}_${date}`;
    setSlots((prev) => ({
      ...prev,
      [key]: {
        driver_identifier: prev[key]?.driver_identifier,
        abfahrtskontrolle: !prev[key]?.abfahrtskontrolle,
      },
    }));
  };

  const buildPayload = () => {
    const slotList = [];
    cars.forEach((car) => {
      const date = newDayDate;
      if (isCarUnavailableForPlanning(car, date)) return;
      const key = `${car.id}_${date}`;
      const s = slots[key];
      slotList.push({
        car_id: car.id,
        plan_date: date,
        driver_identifier: (s?.driver_identifier || '').toString().trim(),
        abfahrtskontrolle: !!s?.abfahrtskontrolle,
      });
    });
    return { carStates, slots: slotList };
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    const { carStates: cs, slots: slotList } = buildPayload();
    try {
      await savePlanningData(cs, slotList);
      try {
        const report = await getReport(newDayDate);
        setReportRows(report);
        setReportOpen(true);
      } catch (e) {
        // Saving succeeded, but report failed – show warning only.
        setError(e?.message || 'Saved, but failed to load report.');
      }
      setFrozen(true);
    } catch (e) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setReportOpen(false);
    setFrozen(false);
  };

  if (loading) {
    return (
      <section className="car-planning-page card">
        <h2>{t('carPlanning.title')}</h2>
        <p className="muted">{t('carPlanning.loading')}</p>
      </section>
    );
  }

  return (
    <section className="car-planning-page card">
      <h2>{t('carPlanning.title')}</h2>

      <div className="car-planning-toolbar">
        <label className="car-planning-check-label">
          <input
            type="checkbox"
            checked={abfahrtskontrolleMode}
            onChange={(e) => setAbfahrtskontrolleMode(e.target.checked)}
          />
          <span>{t('carPlanning.abfahrtskontrolle')}</span>
        </label>
        <span className="car-planning-total">
          {t('carPlanning.totalCount')}: {totalCountNewDay}
        </span>
        <button
          type="button"
          className="btn-secondary car-planning-btn-sm car-planning-toolbar-btn"
          onClick={handleAutoAbfahrtskontrolle}
        >
          Set Abfahrtskontrolle
        </button>
        <button
          type="button"
          className="btn-secondary car-planning-btn-sm car-planning-toolbar-btn"
          disabled={syncingKenjo || loading}
          onClick={async () => {
            setError('');
            setSyncingKenjo(true);
            try {
              await syncKenjoEmployees();
              const freshDrivers = await getDrivers();
              setDrivers(freshDrivers || []);
            } catch (e) {
              setError(e?.message || 'Kenjo sync failed');
            } finally {
              setSyncingKenjo(false);
            }
          }}
          title="Sync driver names from Kenjo"
        >
          {syncingKenjo ? 'Syncing Kenjo…' : 'Sync Kenjo names'}
        </button>
        <button
          type="button"
          className="btn-secondary car-planning-btn-sm car-planning-toolbar-btn"
          onClick={() => setAddCarOpen(true)}
        >
          Add Car
        </button>
        <button
          type="button"
          className="btn-primary car-planning-btn-sm car-planning-toolbar-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-secondary car-planning-btn-sm car-planning-toolbar-btn"
          onClick={handleEdit}
        >
          Edit
        </button>
      </div>

      {error && <p className="car-planning-error">{error}</p>}

      <div className="car-planning-split" role="region" aria-label={t('carPlanning.title')}>
        <div className="car-planning-fixed-wrap">
          <table ref={carPlanningFixedTableRef} className="car-planning-table car-planning-table-fixed">
            <thead>
              <tr>
                <th className="car-planning-th-fixed">{t('carPlanning.deactivate')}</th>
                <th className="car-planning-th-car">{t('carPlanning.vehicle')}</th>
                <th className="car-planning-th-day car-planning-th-newday">
                  <span>{t('carPlanning.newDay')} ({formatShort(newDayDate)})</span>
                  <button
                    type="button"
                    className="btn-secondary car-planning-sort-btn"
                    disabled={!copiedSlotsByCarIdRef.current || !copiedDayDate || frozen}
                    title={copiedDayDate ? `Paste from ${formatShort(copiedDayDate)}` : 'Copy a day first'}
                    onClick={() => {
                      const copied = copiedSlotsByCarIdRef.current;
                      if (!copied) return;
                      setSlots((prev) => {
                        const next = { ...prev };
                        for (const car of sortedCars) {
                          if (carStates[car.id]) continue; // inactive rows stay untouched
                          const from = (copied[car.id] || '').toString().trim();
                          if (!from) continue;
                          const key = `${car.id}_${newDayDate}`;
                          next[key] = {
                            driver_identifier: from,
                            abfahrtskontrolle: prev[key]?.abfahrtskontrolle,
                          };
                        }
                        return next;
                      });
                    }}
                  >
                    <span className="car-planning-sort-icon" aria-hidden>Paste</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary car-planning-sort-btn"
                    title={t('carPlanning.sortAZ')}
                    onClick={() => {
                      setSortByDate((prev) => {
                        if (prev === newDayDate) {
                          setSortAsc((a) => !a);
                          return prev;
                        }
                        setSortAsc(true);
                        return newDayDate;
                      });
                    }}
                  >
                    <span className="car-planning-sort-icon" aria-hidden>A–Z</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedCars.map((car) => {
                const { plateRaw, plateClass } = getCarPlateDisplay(car);
                const newDayWorkshopBlock = getWorkshopBlockForDate(car, newDayDate);
                const statusBlocked = isStatusAutoDeactivated(car.status);
                const rowInactive = !!carStates[car.id] || statusBlocked || !!newDayWorkshopBlock;
                const rowInactiveTitle = statusBlocked
                  ? `Unavailable because of car status: ${car.status || 'inactive'}`
                  : newDayWorkshopBlock
                    ? `Workshop: ${newDayWorkshopBlock.periodLabel}`
                    : '';
                return (
                  <tr key={car.id} className={rowInactive ? 'car-planning-row-inactive' : ''} title={rowInactiveTitle}>
                    <td className="car-planning-td-fixed">
                      <div className="car-planning-fixed-pill">
                        <label className="car-planning-check-label">
                          <input
                            type="checkbox"
                            checked={!!carStates[car.id]}
                            onChange={(e) => setCarState(car.id, e.target.checked)}
                            disabled={statusBlocked || !!newDayWorkshopBlock}
                            title={rowInactiveTitle}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="car-planning-td-car">
                      <div className={`car-planning-vehicle-pill ${plateClass}`.trim()}>
                        {plateRaw || car.id}
                      </div>
                    </td>
                    <td
                      className="car-planning-td-cell car-planning-td-newday"
                      style={statusBlocked ? { backgroundColor: '#f3f4f6' } : newDayWorkshopBlock ? { backgroundColor: '#fef2f2' } : undefined}
                    >
                      {statusBlocked ? (
                        <div
                          title={car.status || 'Unavailable'}
                          style={{
                            minHeight: '2.6rem',
                            padding: '0.35rem 0.5rem',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            background: '#f9fafb',
                            color: '#374151',
                            fontSize: '0.82rem',
                            lineHeight: 1.25,
                          }}
                        >
                          <strong>{car.status || 'Unavailable'}</strong>
                          <div>Car is deactivated in planning</div>
                        </div>
                      ) : newDayWorkshopBlock ? (
                        <div
                          title={newDayWorkshopBlock.workshopName || 'Workshop appointment'}
                          style={{
                            minHeight: '2.6rem',
                            padding: '0.35rem 0.5rem',
                            borderRadius: 8,
                            border: '1px solid #fecaca',
                            background: '#fff1f2',
                            color: '#991b1b',
                            fontSize: '0.82rem',
                            lineHeight: 1.25,
                          }}
                        >
                          <strong>Workshop</strong>
                          <div>{newDayWorkshopBlock.workshopName || 'Planned appointment'}</div>
                          <div>{newDayWorkshopBlock.periodLabel}</div>
                        </div>
                      ) : (
                        <DriverCell
                          value={slots[`${car.id}_${newDayDate}`]?.driver_identifier}
                          drivers={drivers}
                          usedInColumn={usedDriversByDateExcludingCar[`${car.id}_${newDayDate}`] || new Set()}
                          pasteValue={copiedDriverName}
                          onCopyValue={setCopiedDriverName}
                          usePasteButton
                          onSelect={(name) => setSlot(car.id, newDayDate, name, slots[`${car.id}_${newDayDate}`]?.abfahrtskontrolle)}
                          onAbfahrtskontrolle={() => toggleAbfahrtskontrolle(car.id, newDayDate)}
                          abfahrtskontrolleMode={abfahrtskontrolleMode}
                          abfahrtskontrolleDone={!!slots[`${car.id}_${newDayDate}`]?.abfahrtskontrolle}
                          disabled={!!carStates[car.id] || (frozen && !abfahrtskontrolleMode)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div ref={carPlanningDaysScrollWrapRef} className="car-planning-days-scroll-wrap">
          <table ref={carPlanningDaysTableRef} className="car-planning-table car-planning-table-days">
            <thead>
              <tr>
                {scrollDates.map((d) => (
                  <th key={d} className="car-planning-th-day car-planning-th-scroll-day">
                    <span>{t(`carPlanning.weekdays.${weekdayKeyFromYmd(d)}`)} ({formatShort(d)})</span>
                    <button
                      type="button"
                      className="btn-secondary car-planning-sort-btn"
                      title={`Copy names from ${formatShort(d)}`}
                      onClick={() => {
                        const map = {};
                        for (const car of cars) {
                          map[car.id] = (slots[`${car.id}_${d}`]?.driver_identifier || '').toString().trim();
                        }
                        copiedSlotsByCarIdRef.current = map;
                        setCopiedDayDate(d);
                      }}
                    >
                      <span className="car-planning-sort-icon" aria-hidden>⧉</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary car-planning-sort-btn"
                      title={t('carPlanning.sortAZ')}
                      onClick={() => {
                        setSortByDate((prev) => {
                          if (prev === d) {
                            setSortAsc((a) => !a);
                            return prev;
                          }
                          setSortAsc(true);
                          return d;
                        });
                      }}
                    >
                      <span className="car-planning-sort-icon" aria-hidden>A–Z</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCars.map((car) => {
                const newDayWorkshopBlock = getWorkshopBlockForDate(car, newDayDate);
                const statusBlocked = isStatusAutoDeactivated(car.status);
                const rowInactive = !!carStates[car.id] || statusBlocked || !!newDayWorkshopBlock;
                return (
                  <tr key={car.id} className={rowInactive ? 'car-planning-row-inactive' : ''}>
                    {scrollDates.map((date) => {
                      const workshopBlock = getWorkshopBlockForDate(car, date);
                      const statusBlock = isStatusAutoDeactivated(car.status);
                      return (
                        <td
                          key={date}
                          className="car-planning-td-cell car-planning-td-scroll-day"
                          style={statusBlock ? { backgroundColor: '#f3f4f6' } : workshopBlock ? { backgroundColor: '#fef2f2' } : undefined}
                        >
                          {statusBlock ? (
                            <div
                              title={car.status || 'Unavailable'}
                              style={{
                                minHeight: '2.6rem',
                                padding: '0.35rem 0.4rem',
                                borderRadius: 8,
                                border: '1px solid #d1d5db',
                                background: '#f9fafb',
                                color: '#374151',
                                fontSize: '0.78rem',
                                lineHeight: 1.2,
                              }}
                            >
                              <strong>{car.status || 'Unavailable'}</strong>
                            </div>
                          ) : workshopBlock ? (
                            <div
                              title={workshopBlock.workshopName || 'Workshop appointment'}
                              style={{
                                minHeight: '2.6rem',
                                padding: '0.35rem 0.4rem',
                                borderRadius: 8,
                                border: '1px solid #fecaca',
                                background: '#fff1f2',
                                color: '#991b1b',
                                fontSize: '0.78rem',
                                lineHeight: 1.2,
                              }}
                            >
                              <strong>Workshop</strong>
                              {workshopBlock.workshopName ? <div>{workshopBlock.workshopName}</div> : null}
                            </div>
                          ) : (
                            <DriverCell
                              value={slots[`${car.id}_${date}`]?.driver_identifier}
                              drivers={drivers}
                              usedInColumn={usedDriversByDateExcludingCar[`${car.id}_${date}`] || new Set()}
                              pasteValue={copiedDriverName}
                              onCopyValue={setCopiedDriverName}
                              onSelect={(name) => setSlot(car.id, date, name, slots[`${car.id}_${date}`]?.abfahrtskontrolle)}
                              onAbfahrtskontrolle={() => toggleAbfahrtskontrolle(car.id, date)}
                              abfahrtskontrolleMode={abfahrtskontrolleMode}
                              abfahrtskontrolleDone={!!slots[`${car.id}_${date}`]?.abfahrtskontrolle}
                              disabled={!!carStates[car.id] || ((frozen && date <= newDayDate) && !abfahrtskontrolleMode)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {reportOpen && (
        <div className="car-planning-report-backdrop" onClick={() => setReportOpen(false)}>
          <div className="car-planning-report-modal card" onClick={(e) => e.stopPropagation()} ref={reportRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>{t('carPlanning.reportTitle')} — {formatShort(newDayDate)}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {screenshotStatus && (
                  <span className="car-planning-screenshot-status">{screenshotStatus}</span>
                )}
                <button
                  type="button"
                  className="btn-secondary car-planning-btn-sm car-planning-icon-btn"
                  onClick={handleReportScreenshot}
                  title="Copy report screenshot to clipboard"
                >
                  📷
                </button>
              </div>
            </div>
            <table className="car-planning-report-table">
              <thead>
                <tr>
                  <th>{t('carPlanning.vehicle')}</th>
                  <th>{t('carPlanning.driver')}</th>
                  <th>{t('carPlanning.abfahrtskontrolleCol')}</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.license_plate || row.vehicle_id}</td>
                    <td>{row.driver_identifier || '—'}</td>
                    <td>{row.abfahrtskontrolle ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">{t('carPlanning.reportHint')}</p>
            <button type="button" className="btn-secondary" onClick={() => setReportOpen(false)}>
              {t('carPlanning.close')}
            </button>
          </div>
        </div>
      )}

      {addCarOpen && (
        <div className="car-planning-report-backdrop" onClick={() => !addCarSaving && setAddCarOpen(false)}>
          <div className="car-planning-report-modal card" onClick={(e) => e.stopPropagation()}>
            <h3>Add Car</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label>
                Number plate
                <input
                  type="text"
                  value={addCarForm.plate}
                  onChange={(e) => setAddCarForm((f) => ({ ...f, plate: e.target.value }))}
                  style={{ width: '100%', padding: '0.35rem' }}
                />
              </label>
              <label>
                VIN
                <input
                  type="text"
                  value={addCarForm.vin}
                  onChange={(e) => setAddCarForm((f) => ({ ...f, vin: e.target.value }))}
                  style={{ width: '100%', padding: '0.35rem' }}
                />
              </label>
              <label>
                Source
                <select
                  value={addCarForm.sourceType}
                  onChange={(e) => setAddCarForm((f) => ({ ...f, sourceType: e.target.value }))}
                  style={{ width: '100%', padding: '0.35rem' }}
                >
                  <option value="LMR">LMR</option>
                  <option value="Rental">Rental</option>
                  <option value="Self source">Self source</option>
                </select>
              </label>
              <label>
                Service Type
                <select
                  value={addCarForm.serviceType}
                  onChange={(e) => setAddCarForm((f) => ({ ...f, serviceType: e.target.value }))}
                  style={{ width: '100%', padding: '0.35rem' }}
                >
                  {SERVICE_TYPES.map((serviceType) => (
                    <option key={serviceType} value={serviceType}>
                      {serviceType}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <label style={{ flex: 1 }}>
                  Active from
                  <input
                    type="date"
                    value={addCarForm.from}
                    onChange={(e) => setAddCarForm((f) => ({ ...f, from: e.target.value }))}
                    style={{ width: '100%', padding: '0.35rem' }}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  Active to
                  <input
                    type="date"
                    value={addCarForm.to}
                    onChange={(e) => setAddCarForm((f) => ({ ...f, to: e.target.value }))}
                    style={{ width: '100%', padding: '0.35rem' }}
                  />
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-secondary car-planning-btn-sm"
                onClick={() => !addCarSaving && setAddCarOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary car-planning-btn-sm"
                disabled={addCarSaving || !addCarForm.plate}
                onClick={async () => {
                  try {
                    setAddCarSaving(true);
                    const car = await addCar(
                      addCarForm.plate,
                      addCarForm.vin,
                      addCarForm.sourceType,
                      addCarForm.serviceType,
                      addCarForm.from || null,
                      addCarForm.to || null
                    );
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    let deactivated = false;
                    if (addCarForm.from) {
                      const from = new Date(addCarForm.from);
                      from.setHours(0, 0, 0, 0);
                      if (today < from) deactivated = true;
                    }
                    if (addCarForm.to) {
                      const to = new Date(addCarForm.to);
                      to.setHours(0, 0, 0, 0);
                      if (today > to) deactivated = true;
                    }
                    setCars((prev) => [...prev, car]);
                    setCarStates((prev) => ({ ...prev, [car.id]: deactivated }));
                    setAddCarOpen(false);
                    setAddCarForm({
                      plate: '',
                      vin: '',
                      sourceType: 'LMR',
                      serviceType: 'Standard Parcel',
                      from: '',
                      to: '',
                    });
                  } catch (e) {
                    setError(e?.message || 'Failed to add car');
                  } finally {
                    setAddCarSaving(false);
                  }
                }}
              >
                {addCarSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

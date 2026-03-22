import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { useAppSettings } from '../context/AppSettingsContext';
import { getCars, getDrivers, getPlanningData, savePlanningData, getReport, addCar } from '../services/carPlanningApi';

/** Days after today included in the scrollable day columns (saved to DB). */
const CAR_PLANNING_FUTURE_DAYS = 14;

const FULL_WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function weekdayKeyFromYmd(dateStr) {
  if (!dateStr || dateStr.length < 10) return 'mon';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return FULL_WEEKDAY_KEYS[dt.getDay()] || 'mon';
}

function getMonday(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - (day === 0 ? 7 : day) + 1;
  date.setDate(diff);
  return date;
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

/** Searchable driver cell: input + dropdown filtered by query; supports free text. */
function DriverCell({ value, drivers, usedInColumn, onSelect, onAbfahrtskontrolle, abfahrtskontrolleMode, abfahrtskontrolleDone, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const ref = useRef(null);

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
    for (const d of base) {
      const name = (d.display_name || d.transporter_id || d.id || '').toString().trim().toLowerCase();
      if (!name) {
        result.push(d);
        continue;
      }
      if (usedInColumn.has(name) && name !== current) continue;
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
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="car-planning-cell-wrap" ref={ref}>
      <input
        type="text"
        className={`car-planning-cell-input ${abfahrtskontrolleDone ? 'car-planning-cell-green' : ''}`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            onSelect(query.trim());
          }, 150);
        }}
        disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
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
      {!disabled && (
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
            title="Copy"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const text = (query || '').trim();
              if (!text) return;
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(text);
                }
              } catch {
                // ignore clipboard errors
              }
            }}
          >
            ⧉
          </button>
        </div>
      )}
      {open && (
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

function getCarPlateDisplay(car) {
  const plateRaw = car.license_plate || car.vehicle_id || '';
  const plateKey = plateRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let plateStyle = null;
  if (BLUE_PLATES.has(plateKey)) {
    plateStyle = { backgroundColor: '#e0f2fe' };
  } else if (GREEN_PLATES.has(plateKey)) {
    plateStyle = { backgroundColor: '#dcfce7' };
  } else if (YELLOW_PLATES.has(plateKey)) {
    plateStyle = { backgroundColor: '#fef9c3' };
  } else if (GRAY_PLATES.has(plateKey)) {
    plateStyle = { backgroundColor: '#e5e7eb' };
  }
  return { plateRaw, plateStyle };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
    from: '',
    to: '',
  });
  const reportRef = useRef(null);
  const carPlanningFixedTableRef = useRef(null);
  const carPlanningDaysTableRef = useRef(null);
  const [screenshotStatus, setScreenshotStatus] = useState('');

  const runSyncCarPlanningHeights = useCallback(() => {
    syncCarPlanningTables(carPlanningFixedTableRef.current, carPlanningDaysTableRef.current);
  }, []);

  const { newDayDate, scrollDates, allPlanningDates } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = getMonday(today);
    const nd = toYYYYMMDD(today);
    const end = new Date(today);
    end.setDate(end.getDate() + CAR_PLANNING_FUTURE_DAYS);
    const scroll = [];
    for (let cur = new Date(monday.getTime()); cur.getTime() <= end.getTime(); cur.setDate(cur.getDate() + 1)) {
      const ymd = toYYYYMMDD(new Date(cur.getTime()));
      if (ymd !== nd) scroll.push(ymd);
    }
    const all = [...new Set([nd, ...scroll])].sort();
    return { newDayDate: nd, scrollDates: scroll, allPlanningDates: all };
  }, []);

  // Auto-set Abfahrtskontrolle based on last driver vs today
  const handleAutoAbfahrtskontrolle = () => {
    setSlots((prev) => {
      const next = { ...prev };
      const beforeToday = scrollDates.filter((d) => d < newDayDate).sort();
      cars.forEach((car) => {
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

  const handleReportScreenshot = () => {
    if (!reportRows.length || !navigator.clipboard) return;
    const node = reportRef.current;
    if (!node) return;
    html2canvas(node, { backgroundColor: '#ffffff', scale: 2 })
      .then((canvas) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': blob,
              }),
            ]);
            setScreenshotStatus('Copied to clipboard');
            setTimeout(() => setScreenshotStatus(''), 2000);
          } catch {
            // ignore clipboard errors
          }
        }, 'image/png');
      })
      .catch(() => {});
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
      const key = `${car.id}_${date}`;
      if (slots[key]?.driver_identifier && String(slots[key].driver_identifier).trim()) n++;
    });
    return n;
  }, [cars, slots, newDayDate]);

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
      allPlanningDates.forEach((date) => {
        const key = `${car.id}_${date}`;
        const s = slots[key];
        slotList.push({
          car_id: car.id,
          plan_date: date,
          driver_identifier: (s?.driver_identifier || '').toString().trim(),
          abfahrtskontrolle: !!s?.abfahrtskontrolle,
        });
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
                    className="car-planning-sort-btn"
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
                const { plateRaw, plateStyle } = getCarPlateDisplay(car);
                return (
                  <tr key={car.id} className={carStates[car.id] ? 'car-planning-row-inactive' : ''}>
                    <td className="car-planning-td-fixed">
                      <label className="car-planning-check-label">
                        <input
                          type="checkbox"
                          checked={!!carStates[car.id]}
                          onChange={(e) => setCarState(car.id, e.target.checked)}
                        />
                      </label>
                    </td>
                    <td className="car-planning-td-car" style={plateStyle}>{plateRaw || car.id}</td>
                    <td className="car-planning-td-cell car-planning-td-newday">
                      <DriverCell
                        value={slots[`${car.id}_${newDayDate}`]?.driver_identifier}
                        drivers={drivers}
                        usedInColumn={usedDriversByDateExcludingCar[`${car.id}_${newDayDate}`] || new Set()}
                        onSelect={(name) => setSlot(car.id, newDayDate, name, slots[`${car.id}_${newDayDate}`]?.abfahrtskontrolle)}
                        onAbfahrtskontrolle={() => toggleAbfahrtskontrolle(car.id, newDayDate)}
                        abfahrtskontrolleMode={abfahrtskontrolleMode}
                        abfahrtskontrolleDone={!!slots[`${car.id}_${newDayDate}`]?.abfahrtskontrolle}
                        disabled={!!carStates[car.id] || frozen}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="car-planning-days-scroll-wrap">
          <table ref={carPlanningDaysTableRef} className="car-planning-table car-planning-table-days">
            <thead>
              <tr>
                {scrollDates.map((d) => (
                  <th key={d} className="car-planning-th-day car-planning-th-scroll-day">
                    <span>{t(`carPlanning.weekdays.${weekdayKeyFromYmd(d)}`)} ({formatShort(d)})</span>
                    <button
                      type="button"
                      className="car-planning-sort-btn"
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
              {sortedCars.map((car) => (
                <tr key={car.id} className={carStates[car.id] ? 'car-planning-row-inactive' : ''}>
                  {scrollDates.map((date) => (
                    <td key={date} className="car-planning-td-cell car-planning-td-scroll-day">
                      <DriverCell
                        value={slots[`${car.id}_${date}`]?.driver_identifier}
                        drivers={drivers}
                        usedInColumn={usedDriversByDateExcludingCar[`${car.id}_${date}`] || new Set()}
                        onSelect={(name) => setSlot(car.id, date, name, slots[`${car.id}_${date}`]?.abfahrtskontrolle)}
                        onAbfahrtskontrolle={() => toggleAbfahrtskontrolle(car.id, date)}
                        abfahrtskontrolleMode={abfahrtskontrolleMode}
                        abfahrtskontrolleDone={!!slots[`${car.id}_${date}`]?.abfahrtskontrolle}
                        disabled={!!carStates[car.id] || (frozen && date <= newDayDate)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
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
                  className="car-planning-btn-sm"
                  onClick={handleReportScreenshot}
                  title="Copy report screenshot to clipboard"
                  style={{ borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer' }}
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
                    const car = await addCar(addCarForm.plate, addCarForm.vin, addCarForm.sourceType, addCarForm.from || null, addCarForm.to || null);
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
                    setAddCarForm({ plate: '', vin: '', sourceType: 'LMR', from: '', to: '' });
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

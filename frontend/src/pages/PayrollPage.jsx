import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  calculatePayroll,
  exportPayrollToAdp,
  exportPayrollToExcel,
  exportPayrollToPdf,
  getPayrollHistory,
  getPayrollHistorySnapshot,
  savePayrollAbzug,
  savePayrollBonus,
  savePayrollManualEntry,
  previewPayslipImport,
  importPayslipBatch,
} from '../services/payrollApi';
import { getKenjoUsers } from '../services/kenjoApi';
import { saveAdvances } from '../services/advancesApi';
import { useAppSettings } from '../context/AppSettingsContext';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDateDDMMYYYY(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (!s || s.length < 10) return '—';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

function formatCurrency(num) {
  const n = Number(num);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** Prefer name matches at the top of the payslip import employee dropdown. */
function payslipEmployeeSelectOptions(employeeOptions, matchIds, legacyRowOptions) {
  const all =
    employeeOptions && employeeOptions.length
      ? employeeOptions
      : legacyRowOptions || [];
  const pref = new Set(matchIds || []);
  if (!pref.size) return all;
  const head = [];
  const tail = [];
  for (const o of all) {
    (pref.has(o.id) ? head : tail).push(o);
  }
  return [...head, ...tail];
}

function filterPayslipEmployeeOptions(options, query, selectedEmployeeRef) {
  const all = Array.isArray(options) ? options : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all;

  const filtered = all.filter((opt) => String(opt?.name || '').toLowerCase().includes(q));
  if (!selectedEmployeeRef) return filtered;

  const selected = all.find((opt) => String(opt?.id || '') === String(selectedEmployeeRef || ''));
  if (!selected) return filtered;
  if (filtered.some((opt) => String(opt?.id || '') === String(selected.id || ''))) return filtered;
  return [selected, ...filtered];
}

function formatPayslipDocumentLabel(item) {
  if (item?.pageIndex && item?.pageCount) {
    return `${item.pageIndex}/${item.pageCount}`;
  }
  return '1/1';
}

function buildTimeOffTooltip(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return '';
  return list
    .map((entry) => `${formatDateDDMMYYYY(entry?.from)} -> ${formatDateDDMMYYYY(entry?.to)}`)
    .join('\n');
}

function formatKpiValue(num) {
  const n = Number(num);
  if (Number.isNaN(n)) return 'â€”';
  return n.toFixed(2);
}

function buildPayrollSummaryCards(rows, selectedMonth) {
  const list = Array.isArray(rows) ? rows : [];
  const month = String(selectedMonth || '').slice(0, 7);
  const sums = list.reduce(
    (acc, row) => {
      const abzugFromLines = (row.abzug_lines || []).reduce((sum, line) => sum + (Number(line?.amount) || 0), 0);
      acc.totalBonus += Number(row.total_bonus) || 0;
      acc.totalAbzug += typeof row.abzug === 'number' ? row.abzug : abzugFromLines;
      acc.verpflMehr += Math.max(0, Number(row.verpfl_mehr) || 0);
      acc.fahrtGeld += Number(row.fahrt_geld) || 0;
      acc.bonus += Number(row.bonus) || 0;
      acc.kranktage += Number(row.krank_days) || 0;
      acc.urlaubstage += Number(row.urlaub_days) || 0;
      if (String(row.austritsdatum || row.austrittsdatum || '').slice(0, 7) === month) {
        acc.maAustrit += 1;
      }
      return acc;
    },
    {
      totalBonus: 0,
      totalAbzug: 0,
      verpflMehr: 0,
      fahrtGeld: 0,
      bonus: 0,
      kranktage: 0,
      urlaubstage: 0,
      maAustrit: 0,
    },
  );
  return [
    { key: 'total-bonus', label: 'Total Bonus', value: formatCurrency(sums.totalBonus), accent: '#0f766e' },
    { key: 'total-abzug', label: 'Total Abzug', value: formatCurrency(sums.totalAbzug), accent: '#b91c1c' },
    { key: 'verpfl-mehr', label: 'Verpfl. mehr', value: formatCurrency(sums.verpflMehr), accent: '#1d4ed8' },
    { key: 'fahrt-geld', label: 'Fahrtengeld', value: formatCurrency(sums.fahrtGeld), accent: '#7c3aed' },
    { key: 'bonus', label: 'Bonus', value: formatCurrency(sums.bonus), accent: '#d97706' },
    { key: 'kranktage', label: 'Kranktage', value: String(sums.kranktage), accent: '#475569' },
    { key: 'urlaubstage', label: 'Urlaubstage', value: String(sums.urlaubstage), accent: '#059669' },
    { key: 'ma-austrit', label: 'MA Austrit', value: String(sums.maAustrit), accent: '#be185d' },
  ];
}

function formatPayrollHistoryLabel(item) {
  const periodId = String(item?.period_id || '').slice(0, 7);
  const match = periodId.match(/^(\d{4})-(\d{2})$/);
  if (!match) return periodId || 'Saved payroll';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const { t } = useAppSettings();
  const now = new Date();
  const [month, setMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [abzugModal, setAbzugModal] = useState(null);
  const [abzugSaving, setAbzugSaving] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [addRecordEmployees, setAddRecordEmployees] = useState([]);
  const [addRecordLoading, setAddRecordLoading] = useState(false);
  const [addRecordForm, setAddRecordForm] = useState({
    employeeId: '',
    employeeName: '',
    pn: '',
    working_days: 0,
    total_bonus: 0,
    abzug: 0,
    verpfl_mehr: 0,
    fahrt_geld: 0,
    bonus: 0,
    vorschuss: 0,
  });
  const [addRecordSaving, setAddRecordSaving] = useState(false);
  const [manualEditTarget, setManualEditTarget] = useState(null);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [bonusModal, setBonusModal] = useState(null);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [exportAdpLoading, setExportAdpLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [exportReportsLoading, setExportReportsLoading] = useState(false);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [payrollHistoryLoading, setPayrollHistoryLoading] = useState(false);
  const [selectedPayrollHistory, setSelectedPayrollHistory] = useState('');
  const [payrollHistoryModal, setPayrollHistoryModal] = useState(null);
  const [payrollHistoryModalLoading, setPayrollHistoryModalLoading] = useState(false);
  const [payrollSavedNoticeOpen, setPayrollSavedNoticeOpen] = useState(false);
  const [frozenPayrollPeriodId, setFrozenPayrollPeriodId] = useState('');
  const [showAllTerminations, setShowAllTerminations] = useState(false);
  const [showActiveOpen, setShowActiveOpen] = useState(false);
  const [activeDriversList, setActiveDriversList] = useState([]);
  const [activeDriversLoading, setActiveDriversLoading] = useState(false);
  const [activeAddToListSaving, setActiveAddToListSaving] = useState(false);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    employeeId: '',
    month: '',
    lines: [
      { amount: '', code_comment: '' },
      { amount: '', code_comment: '' },
      { amount: '', code_comment: '' },
    ],
  });
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [showPayslipImport, setShowPayslipImport] = useState(false);
  const [payslipPreview, setPayslipPreview] = useState(null);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipImporting, setPayslipImporting] = useState(false);
  const [payslipNotice, setPayslipNotice] = useState('');
  const [showBonusBreakdown, setShowBonusBreakdown] = useState(false);
  const [bonusBreakdownRow, setBonusBreakdownRow] = useState(null);

  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    if (y && m) {
      setCalendarYear(y);
      setCalendarMonth(m);
    }
  }, [month]);

  useEffect(() => {
    if (!addRecordOpen) return;
    setAddRecordLoading(true);
    getKenjoUsers()
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setAddRecordEmployees(arr.filter((u) => u.isActive !== false));
      })
      .catch(() => setAddRecordEmployees([]))
      .finally(() => setAddRecordLoading(false));
  }, [addRecordOpen]);

  useEffect(() => {
    if (!showAdvanceDialog) return;
    getKenjoUsers()
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setAddRecordEmployees(arr.filter((u) => u.isActive !== false));
      })
      .catch(() => setAddRecordEmployees([]));
  }, [showAdvanceDialog]);

  useEffect(() => {
    setPayrollHistoryLoading(true);
    getPayrollHistory()
      .then((items) => setPayrollHistory(Array.isArray(items) ? items : []))
      .catch(() => setPayrollHistory([]))
      .finally(() => setPayrollHistoryLoading(false));
  }, []);

  const handleCalendarDayClick = (dayKey) => {
    if (!dayKey) return;
    if (fromDate && toDate) {
      setFromDate(dayKey);
      setToDate('');
      return;
    }
    if (!fromDate) {
      setFromDate(dayKey);
      setToDate('');
      return;
    }
    const from = fromDate;
    const to = dayKey;
    if (to < from) {
      setFromDate(to);
      setToDate(from);
    } else {
      setToDate(to);
    }
  };

  const monthOptions = useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push({ value: `${y}-${m}`, label: `${MONTH_NAMES[d.getMonth()]} ${y}` });
    }
    return list;
  }, []);

  // Employees who have no record in the selected month (for Add record dropdown)
  const addRecordEmployeesAvailable = useMemo(() => {
    const existingIds = new Set(
      (result?.rows || []).map((r) => String(r.kenjo_employee_id || '').trim()).filter(Boolean)
    );
    return (addRecordEmployees || []).filter((e) => !existingIds.has(String(e._id || e.id || '').trim()));
  }, [addRecordEmployees, result?.rows]);

  const handleLoad = async () => {
    if (!fromDate || !toDate) {
      setError('Select period date from and to.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const periodId = String(month || '').slice(0, 7);
      const hasFrozenSnapshot = payrollHistory.some((item) => String(item?.period_id || '') === periodId);
      if (hasFrozenSnapshot) {
        const snapshot = await getPayrollHistorySnapshot(periodId);
        const payload = snapshot?.payload || null;
        if (payload) {
          setResult(payload);
          setFromDate(String(payload.from || snapshot?.period_from || fromDate).slice(0, 10));
          setToDate(String(payload.to || snapshot?.period_to || toDate).slice(0, 10));
          setFrozenPayrollPeriodId(periodId);
        } else {
          const data = await calculatePayroll(month, fromDate, toDate);
          setResult(data);
          setFrozenPayrollPeriodId('');
        }
      } else {
        const data = await calculatePayroll(month, fromDate, toDate);
        setResult(data);
        setFrozenPayrollPeriodId('');
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleExportAdp = async () => {
    if (!result?.month || !result?.rows?.length) {
      setError('Load payroll first, then export.');
      return;
    }
    setExportAdpLoading(true);
    setError('');
    try {
      await exportPayrollToAdp(result.month, result.rows, result);
      const history = await getPayrollHistory().catch(() => []);
      setPayrollHistory(Array.isArray(history) ? history : []);
      setFrozenPayrollPeriodId(String(result.month || '').slice(0, 7));
      setPayrollSavedNoticeOpen(true);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setExportAdpLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!result?.month || !result?.rows?.length) {
      setError('Load payroll first, then export.');
      return;
    }
    setExportExcelLoading(true);
    setError('');
    try {
      await exportPayrollToExcel(result.month, result.rows);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setExportExcelLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!result?.month || !result?.rows?.length) {
      setError('Load payroll first, then export.');
      return;
    }
    setExportPdfLoading(true);
    setError('');
    try {
      await exportPayrollToPdf(result.month, result.rows);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setExportPdfLoading(false);
    }
  };

  const handleExportReports = async () => {
    if (!result?.month || !result?.rows?.length) {
      setError('Load payroll first, then export.');
      return;
    }
    setExportReportsLoading(true);
    setExportExcelLoading(true);
    setExportPdfLoading(true);
    setError('');
    try {
      await exportPayrollToExcel(result.month, result.rows);
      await exportPayrollToPdf(result.month, result.rows);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setExportReportsLoading(false);
      setExportExcelLoading(false);
      setExportPdfLoading(false);
    }
  };

  const isFrozenPayroll = Boolean(
    frozenPayrollPeriodId &&
    String(result?.month || month || '').slice(0, 7) === String(frozenPayrollPeriodId || '').slice(0, 7)
  );

  const handleOpenPayrollHistory = async (periodId) => {
    const id = String(periodId || '').trim();
    setSelectedPayrollHistory(id);
    if (!id) {
      setPayrollHistoryModal(null);
      return;
    }
    setPayrollHistoryModalLoading(true);
    setError('');
    try {
      const snapshot = await getPayrollHistorySnapshot(id);
      setPayrollHistoryModal(snapshot);
    } catch (e) {
      setError(String(e?.message || e));
      setPayrollHistoryModal(null);
    } finally {
      setPayrollHistoryModalLoading(false);
    }
  };

  const handleEditPayrollHistory = () => {
    const payload = payrollHistoryModal?.payload;
    if (!payload) return;
    setMonth(String(payload.month || payrollHistoryModal?.period_id || month).slice(0, 7));
    setFromDate(String(payload.from || payrollHistoryModal?.period_from || '').slice(0, 10));
    setToDate(String(payload.to || payrollHistoryModal?.period_to || '').slice(0, 10));
    setResult(payload);
    setPayrollHistoryModal(null);
    setSelectedPayrollHistory('');
    setFrozenPayrollPeriodId('');
  };

  const openShowActive = () => {
    if (isFrozenPayroll) return;
    setShowActiveOpen(true);
    setActiveDriversLoading(true);
    setActiveDriversList([]);
    setError('');
    const inPayrollIds = new Set((result?.rows || []).map((r) => String(r.kenjo_employee_id || '').trim()).filter(Boolean));
    getKenjoUsers()
      .then((list) => {
        const users = Array.isArray(list) ? list : [];
        const activeNotInPayroll = users.filter((u) => {
          const id = String(u._id || u.id || '').trim();
          if (!id) return false;
          if (u.isActive === false) return false;
          return !inPayrollIds.has(id);
        });
        setActiveDriversList(
          activeNotInPayroll.map((u) => ({
            user: u,
            selected: false,
            working_days: 0,
            total_bonus: 0,
            abzug: 0,
            verpfl_mehr: 0,
            fahrt_geld: 0,
            bonus: 0,
            vorschuss: 0,
          }))
        );
      })
      .catch((e) => {
        setError(String(e?.message || e));
        setActiveDriversList([]);
      })
      .finally(() => setActiveDriversLoading(false));
  };

  const closeShowActive = () => setShowActiveOpen(false);

  const updateActiveDriver = (index, field, value) => {
    setActiveDriversList((prev) => {
      const next = [...prev];
      if (!next[index]) return next;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const advanceMonthOptions = useMemo(() => {
    const list = [];
    const d = new Date();
    for (let i = 0; i < 4; i++) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const y = x.getFullYear();
      const m = String(x.getMonth() + 1).padStart(2, '0');
      list.push({ value: `${y}-${m}`, label: `${MONTH_NAMES[x.getMonth()]} ${y}` });
    }
    return list;
  }, []);

  const openAdvanceDialog = () => {
    if (isFrozenPayroll) return;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    setAdvanceForm({
      employeeId: '',
      month: `${y}-${m}`,
      lines: [
        { amount: '', code_comment: '' },
        { amount: '', code_comment: '' },
        { amount: '', code_comment: '' },
      ],
    });
    setAdvanceError('');
    setShowAdvanceDialog(true);
  };

  const closeAdvanceDialog = () => setShowAdvanceDialog(false);

  const setAdvanceLine = (index, field, value) => {
    setAdvanceForm((prev) => {
      const next = { ...prev, lines: prev.lines.slice() };
      next.lines[index] = { ...(next.lines[index] || {}), [field]: value };
      return next;
    });
  };

  const submitAdvance = async () => {
    if (!advanceForm.employeeId || !advanceForm.month) {
      setAdvanceError('Select an employee and month.');
      return;
    }
    setAdvanceSaving(true);
    setAdvanceError('');
    try {
      await saveAdvances(advanceForm.employeeId, advanceForm.month, advanceForm.lines);
      closeAdvanceDialog();
    } catch (e) {
      setAdvanceError(String(e?.message || e));
    } finally {
      setAdvanceSaving(false);
    }
  };

  const openPayslipImport = () => {
    if (isFrozenPayroll) return;
    setShowPayslipImport(true);
    setPayslipPreview(null);
    setPayslipNotice('');
    setError('');
  };

  const closePayslipImport = () => {
    if (payslipImporting) return;
    setShowPayslipImport(false);
  };

  const updatePayslipItem = (fileId, patch) => {
    setPayslipPreview((prev) => {
      if (!prev?.items) return prev;
      return {
        ...prev,
        items: prev.items.map((it) => (it.fileId === fileId ? { ...it, ...patch } : it)),
      };
    });
  };

  const canImportPayslips = useMemo(() => {
    const items = payslipPreview?.items || [];
    if (!items.length) return false;
    return items.every((it) => it.action === 'delete' || !!it.employeeRef);
  }, [payslipPreview]);

  const addActiveDriversToList = async () => {
    const selected = activeDriversList.filter((a) => a.selected);
    if (!selected.length) {
      setError('Select at least one driver.');
      return;
    }
    if (!result?.month) {
      setError('Load payroll first (select month and click Load).');
      return;
    }
    setActiveAddToListSaving(true);
    setError('');
    try {
      const newRows = [];
      for (const item of selected) {
        const u = item.user;
        const id = String(u._id || u.id || '').trim();
        const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '';
        const pn = u.employeeNumber || u.employee_number || '';
        const workingDays = Number(item.working_days) || 0;
        const totalBonus = Number(item.total_bonus) || 0;
        const abzug = Number(item.abzug) || 0;
        const verpflMehr = Number(item.verpfl_mehr) || 0;
        const fahrtGeld = Number(item.fahrt_geld) || 0;
        const bonus = Number(item.bonus) || 0;
        const vorschuss = Number(item.vorschuss) || 0;
        await savePayrollManualEntry(result.month, id, {
          working_days: workingDays,
          total_bonus: totalBonus,
          abzug,
          verpfl_mehr: verpflMehr,
          fahrt_geld: fahrtGeld,
          bonus,
          vorschuss,
        });
        const afterAbzug = Math.round((totalBonus - abzug) * 100) / 100;
        newRows.push({
          kenjo_employee_id: id,
          name,
          pn,
          working_days: workingDays,
          total_bonus: totalBonus,
          abzug,
          abzug_lines: [{ amount: abzug, comment: '' }, { amount: 0, comment: '' }, { amount: 0, comment: '' }],
          after_abzug: afterAbzug,
          verpfl_mehr: verpflMehr,
          fahrt_geld: fahrtGeld,
          bonus,
          is_manual: true,
          manual_entry: {
            working_days: workingDays,
            total_bonus: totalBonus,
            abzug,
            verpfl_mehr: verpflMehr,
            fahrt_geld: fahrtGeld,
            bonus,
            vorschuss,
          },
          eintrittsdatum: null,
          austrittsdatum: null,
          vorschuss,
          carryover_days: 0,
          rest_urlaub: 0,
          krank_days: 0,
          urlaub_days: 0,
        });
      }
      setResult((prev) => {
        const base = prev || { month, from: fromDate, to: toDate, period_days: 0, rows: [] };
        const rows = [...(base.rows || []), ...newRows];
        return { ...base, rows };
      });
      closeShowActive();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setActiveAddToListSaving(false);
    }
  };

  const openAddRecord = () => {
    if (isFrozenPayroll) return;
    setAddRecordForm({
      employeeId: '',
      employeeName: '',
      pn: '',
      working_days: 0,
      total_bonus: 0,
      abzug: 0,
      verpfl_mehr: 0,
      fahrt_geld: 0,
      bonus: 0,
      vorschuss: 0,
    });
    setManualEditTarget(null);
    setAddRecordOpen(true);
  };

  const openEditManualRecord = (row) => {
    if (isFrozenPayroll) return;
    const manual = row?.manual_entry || {};
    setAddRecordForm({
      employeeId: row?.kenjo_employee_id || '',
      employeeName: row?.name || '',
      pn: row?.pn || '',
      working_days: Number(manual.working_days ?? row?.working_days) || 0,
      total_bonus: Number(manual.total_bonus ?? row?.total_bonus) || 0,
      abzug: Number(manual.abzug ?? row?.abzug) || 0,
      verpfl_mehr: Number(manual.verpfl_mehr ?? row?.verpfl_mehr) || 0,
      fahrt_geld: Number(manual.fahrt_geld ?? row?.fahrt_geld) || 0,
      bonus: Number(manual.bonus ?? row?.bonus) || 0,
      vorschuss: Number(manual.vorschuss ?? row?.vorschuss) || 0,
    });
    setManualEditTarget({
      employeeId: row?.kenjo_employee_id || '',
      name: row?.name || '',
    });
    setAddRecordOpen(true);
  };

  const closeAddRecord = () => {
    setAddRecordOpen(false);
    setManualEditTarget(null);
  };

  const updateAddRecordForm = (field, value) => {
    setAddRecordForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'employeeId') {
        const emp = addRecordEmployees.find((e) => (e._id || e.id) === value);
        if (emp) {
          next.employeeName = emp.displayName || [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '';
          next.pn = emp.employeeNumber || emp.employee_number || '';
        }
      }
      if (field === 'working_days' || field === 'total_bonus' || field === 'abzug') {
        const workingDays = Number(field === 'working_days' ? value : next.working_days) || 0;
        const totalBonus = Number(field === 'total_bonus' ? value : next.total_bonus) || 0;
        const abzug = Number(field === 'abzug' ? value : next.abzug) || 0;
        const afterAbzug = Math.round((totalBonus - abzug) * 100) / 100;
        const maxVerpfl = workingDays * 14;
        next.verpfl_mehr = Math.round((afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl) * 100) / 100;
        next.fahrt_geld = Math.round((afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0) * 100) / 100;
      }
      return next;
    });
  };

  const saveAddRecord = async () => {
    const f = addRecordForm;
    if (!f.employeeId || !f.employeeName) {
      setError('Select an employee.');
      return;
    }
    const workingDays = Number(f.working_days) || 0;
    const totalBonus = Number(f.total_bonus) || 0;
    const abzug = Number(f.abzug) || 0;
    const verpflMehr = Number(f.verpfl_mehr) || 0;
    const fahrtGeld = Number(f.fahrt_geld) || 0;
    const bonus = Number(f.bonus) || 0;
    const vorschuss = Number(f.vorschuss) || 0;
    setAddRecordSaving(true);
    setError('');
    try {
      await savePayrollManualEntry(month, f.employeeId, {
        working_days: workingDays,
        total_bonus: totalBonus,
        abzug,
        verpfl_mehr: verpflMehr,
        fahrt_geld: fahrtGeld,
        bonus,
        vorschuss,
      });
      if (fromDate && toDate) {
        const data = await calculatePayroll(month, fromDate, toDate);
        setResult(data);
      } else {
        const afterAbzug = Math.round((totalBonus - abzug) * 100) / 100;
        const maxVerpfl = workingDays * 14;
        const derivedVerpflMehr = Math.round((afterAbzug <= maxVerpfl ? afterAbzug : maxVerpfl) * 100) / 100;
        const derivedFahrtGeld = Math.round((afterAbzug > maxVerpfl ? afterAbzug - maxVerpfl : 0) * 100) / 100;
        const newRow = {
          kenjo_employee_id: f.employeeId,
          name: f.employeeName,
          pn: f.pn,
          working_days: workingDays,
          total_bonus: totalBonus,
          abzug,
          abzug_lines: [{ amount: abzug, comment: '' }, { amount: 0, comment: '' }, { amount: 0, comment: '' }],
          after_abzug: afterAbzug,
          verpfl_mehr: verpflMehr || derivedVerpflMehr,
          fahrt_geld: fahrtGeld || derivedFahrtGeld,
          bonus,
          is_manual: true,
          manual_entry: {
            working_days: workingDays,
            total_bonus: totalBonus,
            abzug,
            verpfl_mehr: verpflMehr || derivedVerpflMehr,
            fahrt_geld: fahrtGeld || derivedFahrtGeld,
            bonus,
            vorschuss,
          },
          eintrittsdatum: null,
          austrittsdatum: null,
          vorschuss,
          carryover_days: 0,
          rest_urlaub: 0,
          krank_days: 0,
          urlaub_days: 0,
        };
        setResult((prev) => {
          const base = prev || { month, from: fromDate, to: toDate, period_days: 0, rows: [] };
          const rows = [...(base.rows || []), newRow].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          return { ...base, rows };
        });
      }
      closeAddRecord();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setAddRecordSaving(false);
    }
  };

  const defaultAbzugLines = () => [
    { amount: 0, comment: '' },
    { amount: 0, comment: '' },
    { amount: 0, comment: '' },
  ];

  const openAbzug = (row) => {
    if (isFrozenPayroll) return;
    const lines = (row.abzug_lines && row.abzug_lines.length >= 3)
      ? row.abzug_lines.map((l) => ({ amount: Number(l.amount) || 0, comment: String(l.comment ?? '').trim() }))
      : defaultAbzugLines();
    setAbzugModal({
      kenjo_employee_id: row.kenjo_employee_id,
      name: row.name,
      periodId: result?.month,
      working_days: Number(row.working_days) || 0,
      lines: [
        { amount: lines[0]?.amount ?? 0, comment: lines[0]?.comment ?? '' },
        { amount: lines[1]?.amount ?? 0, comment: lines[1]?.comment ?? '' },
        { amount: lines[2]?.amount ?? 0, comment: lines[2]?.comment ?? '' },
      ],
    });
  };

  const applyCarUsage = (rate) => {
    setAbzugModal((prev) => {
      if (!prev || !prev.lines) return prev;
      const next = prev.lines.map((l) => ({ ...l, amount: Number(l.amount) || 0, comment: String(l.comment ?? '').trim() }));
      const amount = Math.round((Number(prev.working_days) || 0) * rate * 100) / 100;
      const idx = next.findIndex((l) => (Number(l.amount) || 0) === 0);
      const targetIndex = idx >= 0 ? idx : 0;
      next[targetIndex] = { amount, comment: 'Auto' };
      return { ...prev, lines: next };
    });
  };

  const closeAbzug = () => setAbzugModal(null);

  const updateAbzugLine = (index, field, value) => {
    setAbzugModal((prev) => {
      if (!prev || !prev.lines) return prev;
      const next = [...prev.lines];
      next[index] = { ...next[index], [field]: field === 'amount' ? (Number(value) || 0) : value };
      return { ...prev, lines: next };
    });
  };

  const saveAbzug = async () => {
    if (!abzugModal || !result?.month || !abzugModal.lines) return;
    const lines = abzugModal.lines.map((l) => ({ amount: Number(l.amount) || 0, comment: String(l.comment ?? '').trim() }));
    if (lines.some((l) => Number.isNaN(l.amount) || l.amount < 0)) return;
    setAbzugSaving(true);
    try {
      await savePayrollAbzug(result.month, abzugModal.kenjo_employee_id, lines);
      const totalAbzug = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      setResult((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          r.kenjo_employee_id === abzugModal.kenjo_employee_id
            ? {
                ...r,
                abzug: Math.round(totalAbzug * 100) / 100,
                abzug_lines: lines.map((l) => ({ amount: Math.round((Number(l.amount) || 0) * 100) / 100, comment: l.comment })),
                after_abzug: Math.round((r.total_bonus - totalAbzug) * 100) / 100,
                verpfl_mehr: (() => {
                  const after = r.total_bonus - totalAbzug;
                  const maxV = r.working_days * 14;
                  return Math.round((after <= maxV ? after : maxV) * 100) / 100;
                })(),
                fahrt_geld: (() => {
                  const after = r.total_bonus - totalAbzug;
                  const maxV = r.working_days * 14;
                  return Math.round((after > maxV ? after - maxV : 0) * 100) / 100;
                })(),
              }
            : r
        ),
      }));
      closeAbzug();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setAbzugSaving(false);
    }
  };

  const openBonus = (row) => {
    if (isFrozenPayroll) return;
    setBonusModal({
      kenjo_employee_id: row.kenjo_employee_id,
      name: row.name,
      amount: Number(row.bonus) || 0,
      comment: '',
    });
  };

  const closeBonus = () => setBonusModal(null);

  const updateBonusForm = (field, value) => {
    setBonusModal((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveBonus = async () => {
    if (!bonusModal || !result?.month) return;
    const amount = Number(bonusModal.amount);
    if (Number.isNaN(amount) || amount < 0) return;
    setBonusSaving(true);
    try {
      setError('');
      await savePayrollBonus(result.month, bonusModal.kenjo_employee_id, amount, bonusModal.comment ?? '');
      setResult((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          r.kenjo_employee_id === bonusModal.kenjo_employee_id
            ? { ...r, bonus: Math.round(amount * 100) / 100 }
            : r
        ),
      }));
      closeBonus();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBonusSaving(false);
    }
  };

  const columns = [
    { key: 'name', label: t('payroll.columns.name') },
    { key: 'pn', label: t('payroll.columns.pn') },
    { key: 'working_days', label: t('payroll.columns.working_days') },
    { key: 'krank_days', label: t('payroll.columns.krank_days') },
    { key: 'urlaub_days', label: t('payroll.columns.urlaub_days') },
    { key: 'carryover_days', label: 'Carryover days' },
    { key: 'rest_urlaub', label: 'Rest Urlaub' },
    { key: 'total_bonus', label: t('payroll.columns.total_bonus') },
    { key: 'abzug', label: t('payroll.columns.abzug') },
    { key: 'verpfl_mehr', label: t('payroll.columns.verpfl_mehr') },
    { key: 'fahrt_geld', label: t('payroll.columns.fahrt_geld') },
    { key: 'bonus', label: t('payroll.columns.bonus') },
    { key: 'eintrittsdatum', label: t('payroll.columns.eintrittsdatum') },
    { key: 'austrittsdatum', label: t('payroll.columns.austrittsdatum') },
    { key: 'vorschuss', label: t('payroll.columns.vorschuss') },
  ];

  const getSortValue = (row, key) => {
    if (key === 'abzug') {
      const sum = (row.abzug_lines || []).reduce((s, l) => s + (Number(l?.amount) || 0), 0);
      return typeof row.abzug === 'number' ? row.abzug : sum;
    }
    const v = row[key];
    if (key === 'eintrittsdatum' || key === 'austrittsdatum') return v ? new Date(v + 'T12:00:00').getTime() : 0;
    if (typeof v === 'number') return v;
    return String(v ?? '').toLowerCase();
  };

  const sortedRows = useMemo(() => {
    if (!result?.rows || !sortBy) return result?.rows ?? [];
    const rows = [...result.rows];
    const mult = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);
      if (typeof va === 'number' && typeof vb === 'number') return mult * (va - vb);
      if (typeof va === 'number') return mult * (vb < va ? 1 : vb > va ? -1 : 0);
      return mult * String(va).localeCompare(String(vb));
    });
    return rows;
  }, [result?.rows, sortBy, sortDir]);

  const handleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const addRecordAfterAbzug = Math.round(((Number(addRecordForm.total_bonus) || 0) - (Number(addRecordForm.abzug) || 0)) * 100) / 100;
  const addRecordMaxVerpfl = (Number(addRecordForm.working_days) || 0) * 14;
  const addRecordVerpflMehr = Math.round((addRecordAfterAbzug <= addRecordMaxVerpfl ? addRecordAfterAbzug : addRecordMaxVerpfl) * 100) / 100;
  const addRecordFahrtGeld = Math.round((addRecordAfterAbzug > addRecordMaxVerpfl ? addRecordAfterAbzug - addRecordMaxVerpfl : 0) * 100) / 100;
  const payrollSummaryCards = useMemo(() => {
    return buildPayrollSummaryCards(result?.rows, result?.month || month);
  }, [result?.month, result?.rows, month]);

  const visibleTerminationWindow = useMemo(() => {
    const monthValue = String(result?.month || month || '').trim();
    const match = monthValue.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const start = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const end = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }, [result?.month, month]);

  const shouldShowTerminationDate = (value) => {
    const iso = String(value || '').slice(0, 10);
    if (!iso) return false;
    if (showAllTerminations) return true;
    if (!visibleTerminationWindow) return false;
    return iso >= visibleTerminationWindow.start && iso <= visibleTerminationWindow.end;
  };

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>{t('payroll.title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={showAllTerminations}
                onChange={(e) => setShowAllTerminations(e.target.checked)}
              />
              Show all Terminations
            </label>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Default shows only termination dates from the selected calculation month.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportReports}
              disabled={exportReportsLoading || !result?.rows?.length}
            >
              {exportReportsLoading ? 'Exporting...' : 'Export Reports'}
            </button>
            <select
              value={selectedPayrollHistory}
              onChange={(e) => handleOpenPayrollHistory(e.target.value)}
              disabled={payrollHistoryLoading}
              style={{ minWidth: 220, padding: '0.45rem 0.6rem' }}
            >
              <option value="">{payrollHistoryLoading ? 'Loading payroll history...' : 'Payroll history'}</option>
              {payrollHistory.map((item) => (
                <option key={item.period_id} value={item.period_id}>
                  {formatPayrollHistoryLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>{t('payroll.calculationMonth')}</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '0.5rem', minWidth: 180, display: 'block', marginBottom: '0.5rem' }}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
            <button type="button" className="btn-primary" onClick={handleLoad} disabled={loading} style={{ width: 'auto', minWidth: 100 }}>
              {loading ? t('payroll.loading') : t('payroll.load')}
            </button>
            <button type="button" className="btn-secondary" onClick={openAddRecord} disabled={isFrozenPayroll} style={{ width: 'auto', minWidth: 100 }}>
              {t('payroll.addRecord')}
            </button>
            <button type="button" className="btn-secondary" onClick={handleExportAdp} disabled={isFrozenPayroll || exportAdpLoading || !result?.rows?.length} style={{ width: 'auto', minWidth: 100 }}>
              {exportAdpLoading ? t('payroll.exporting') : t('payroll.exportToAdp')}
            </button>
            <button type="button" className="btn-secondary" onClick={openShowActive} disabled={isFrozenPayroll} style={{ width: 'auto', minWidth: 100 }}>
              {t('payroll.showActive')}
            </button>
            <button type="button" className="btn-secondary" onClick={openAdvanceDialog} disabled={isFrozenPayroll} style={{ width: 'auto', minWidth: 100 }}>
              {t('payroll.addAdvance')}
            </button>
            <button type="button" className="btn-secondary" onClick={openPayslipImport} disabled={isFrozenPayroll} style={{ width: 'auto', minWidth: 100 }}>
              Import payslips
            </button>
          </div>
        </div>
        <div className="payroll-period-calendar-wrap">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>{t('payroll.periodKpi')}</label>
          <div className="payroll-period-side">
            <div className="payroll-range-calendar">
            <div className="payroll-range-calendar-header">
              <button
                type="button"
                className="payroll-range-calendar-nav"
                onClick={() => {
                  if (calendarMonth === 1) {
                    setCalendarMonth(12);
                    setCalendarYear((y) => y - 1);
                  } else {
                    setCalendarMonth((m) => m - 1);
                  }
                }}
                disabled={loading}
                aria-label="Previous month"
              >
                ‹
              </button>
              <span className="payroll-range-calendar-title">
                {MONTH_NAMES[calendarMonth - 1]} {calendarYear}
              </span>
              <button
                type="button"
                className="payroll-range-calendar-nav"
                onClick={() => {
                  if (calendarMonth === 12) {
                    setCalendarMonth(1);
                    setCalendarYear((y) => y + 1);
                  } else {
                    setCalendarMonth((m) => m + 1);
                  }
                }}
                disabled={loading}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="payroll-range-calendar-weekdays">
              {WEEKDAYS_SHORT.map((wd) => (
                <span key={wd} className="payroll-range-calendar-wday">{wd}</span>
              ))}
            </div>
            <div className="payroll-range-calendar-grid">
              {(() => {
                const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
                const lastDate = new Date(calendarYear, calendarMonth, 0).getDate();
                const startWeekday = (firstDay.getDay() + 6) % 7;
                const cells = [];
                for (let i = 0; i < startWeekday; i++) {
                  cells.push(<span key={`e-${i}`} className="payroll-range-calendar-day payroll-range-calendar-day--empty" />);
                }
                for (let d = 1; d <= lastDate; d++) {
                  const dayKey = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const inRange = fromDate && toDate && dayKey >= fromDate && dayKey <= toDate;
                  const isStart = dayKey === fromDate;
                  const isEnd = dayKey === toDate;
                  cells.push(
                    <button
                      key={dayKey}
                      type="button"
                      className={`payroll-range-calendar-day ${inRange ? 'payroll-range-calendar-day--range' : ''} ${isStart ? 'payroll-range-calendar-day--start' : ''} ${isEnd ? 'payroll-range-calendar-day--end' : ''}`}
                      onClick={() => handleCalendarDayClick(dayKey)}
                      disabled={loading}
                    >
                      {d}
                    </button>
                  );
                }
                return cells;
              })()}
            </div>
            <p className="payroll-range-calendar-hint">
              {fromDate && toDate
                ? `${fromDate} — ${toDate}`
                : fromDate
                  ? t('payroll.rangeHintFrom').replace('{from}', fromDate)
                  : t('payroll.rangeHintStart')}
            </p>
            </div>
            {result?.rows?.length > 0 && (
              <div className="payroll-summary-grid">
                {payrollSummaryCards.map((card) => (
                  <div
                    key={card.key}
                    role={card.key === 'total-bonus' ? 'button' : undefined}
                    tabIndex={card.key === 'total-bonus' ? 0 : undefined}
                    className={`payroll-summary-card ${card.key === 'total-bonus' ? 'payroll-summary-card--interactive' : ''}`}
                    style={{ borderTopColor: card.accent }}
                    onClick={card.key === 'total-bonus' ? () => setShowBonusBreakdown(true) : undefined}
                    onKeyDown={
                      card.key === 'total-bonus'
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setShowBonusBreakdown(true);
                            }
                          }
                        : undefined
                    }
                  >
                    {manualEditTarget ? (
                      <option value={addRecordForm.employeeId}>
                        {manualEditTarget.name || addRecordForm.employeeName || addRecordForm.employeeId}
                      </option>
                    ) : null}
                    <div className="payroll-summary-label">{card.label}</div>
                    <div className="payroll-summary-value">{card.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .payroll-period-calendar-wrap { margin-bottom: 0.5rem; }
        .payroll-period-side {
          display: flex;
          flex-wrap: wrap;
          gap: 0.85rem;
          align-items: flex-start;
        }
        .payroll-range-calendar {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem;
          background: var(--bg-card);
          display: inline-block;
          color: var(--text);
        }
        .payroll-range-calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .payroll-range-calendar-nav {
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          color: var(--text);
        }
        .payroll-range-calendar-nav:hover:not(:disabled) { color: #3b82f6; }
        .payroll-range-calendar-nav:disabled { opacity: 0.5; cursor: not-allowed; }
        .payroll-range-calendar-title { font-weight: 600; font-size: 0.95rem; }
        .payroll-range-calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1.75rem);
          gap: 2px;
          margin-bottom: 2px;
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .payroll-range-calendar-wday { text-align: center; }
        .payroll-range-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1.75rem);
          gap: 2px;
        }
        .payroll-range-calendar-day {
          width: 1.75rem;
          height: 1.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          border: none;
          border-radius: 4px;
          background: var(--bg-card);
          cursor: pointer;
          color: var(--text);
        }
        .payroll-range-calendar-day:hover:not(:disabled) { background: rgba(59, 130, 246, 0.25); }
        .payroll-range-calendar-day:disabled { cursor: not-allowed; opacity: 0.7; }
        .payroll-range-calendar-day--empty { background: transparent; cursor: default; }
        .payroll-range-calendar-day--range { background: rgba(59, 130, 246, 0.45); }
        .payroll-range-calendar-day--start,
        .payroll-range-calendar-day--end { background: #3b82f6; color: #fff; }
        .payroll-range-calendar-day--start:hover:not(:disabled),
        .payroll-range-calendar-day--end:hover:not(:disabled) { background: #1d4ed8; }
        .payroll-range-calendar-hint { margin: 0.5rem 0 0 0; font-size: 0.8rem; color: var(--text-muted); }
        .payroll-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.55rem;
          width: 320px;
          min-width: 320px;
        }
        .payroll-summary-card {
          border: 1px solid var(--border);
          border-top: 4px solid #3b82f6;
          border-radius: 10px;
          background: var(--bg-card);
          padding: 0.65rem 0.8rem;
          box-shadow: 0 1px 4px var(--shadow);
          text-align: left;
        }
        .payroll-summary-card:disabled {
          cursor: default;
        }
        .payroll-summary-card--interactive {
          cursor: pointer;
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }
        .payroll-summary-card--interactive:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
          border-color: rgba(59, 130, 246, 0.35);
        }
        .payroll-summary-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }
        .payroll-summary-value {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
        }
      `}</style>

      {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}
        {isFrozenPayroll && (
          <p style={{ marginBottom: '1rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', padding: '0.65rem 0.8rem', borderRadius: 8 }}>
            Frozen payroll snapshot loaded. Use Payroll history / Edit to reopen this month in editable mode.
          </p>
        )}

      {showBonusBreakdown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, width: 'min(920px, calc(100% - 2rem))', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem' }}>Total Bonus breakdown</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Selected period: {result?.from || 'â€”'} â€” {result?.to || 'â€”'}
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setShowBonusBreakdown(false)}>
                Close
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.5rem' }}>Week</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.5rem' }}>Week period</th>
                  <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Employees</th>
                  <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Working days</th>
                  <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Avg KPI</th>
                  <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Weekly bonus</th>
                </tr>
              </thead>
              <tbody>
                {(result?.weekly_breakdown || []).map((weekRow) => (
                  <tr key={`${weekRow.year}-${weekRow.week}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.55rem 0.5rem' }}>
                      {weekRow.year}-W{String(weekRow.week).padStart(2, '0')}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem' }}>
                      {formatDateDDMMYYYY(weekRow.period_from)} â€” {formatDateDDMMYYYY(weekRow.period_to)}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>{weekRow.employee_count ?? 0}</td>
                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>
                      {Number.isInteger(Number(weekRow.total_working_days))
                        ? Number(weekRow.total_working_days || 0)
                        : Number(weekRow.total_working_days || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>{formatKpiValue(weekRow.average_kpi)}</td>
                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>{formatCurrency(weekRow.total_bonus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bonusBreakdownRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, width: 'min(920px, calc(100% - 2rem))', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem' }}>Employee Total Bonus breakdown</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {bonusBreakdownRow.name || '-'} | KPI period: {result?.from || '-'} - {result?.to || '-'} | Payroll month: {result?.month || '-'}
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setBonusBreakdownRow(null)}>
                Close
              </button>
            </div>

            {((bonusBreakdownRow.weekly_breakdown || []).length || (bonusBreakdownRow.rescue_entries || []).length) ? (
              <>
                {(bonusBreakdownRow.weekly_breakdown || []).length ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.5rem' }}>Week</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.5rem' }}>Week period</th>
                        <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Working days</th>
                        <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>KPI</th>
                        <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Weekly bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bonusBreakdownRow.weekly_breakdown || []).map((weekRow) => (
                        <tr key={`${bonusBreakdownRow.kenjo_employee_id}-${weekRow.year}-${weekRow.week}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.55rem 0.5rem' }}>
                            {weekRow.year}-W{String(weekRow.week).padStart(2, '0')}
                          </td>
                          <td style={{ padding: '0.55rem 0.5rem' }}>
                            {formatDateDDMMYYYY(weekRow.period_from)} - {formatDateDDMMYYYY(weekRow.period_to)}
                          </td>
                          <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>
                            {Number.isInteger(Number(weekRow.working_days))
                              ? Number(weekRow.working_days || 0)
                              : Number(weekRow.working_days || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>{formatKpiValue(weekRow.kpi)}</td>
                          <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>{formatCurrency(weekRow.weekly_bonus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {(bonusBreakdownRow.rescue_entries || []).length ? (
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem' }}>Rescue</h4>
                    <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                      Rescue entries are shown for the full selected payroll month.
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '0.55rem 0.5rem' }}>Type</th>
                          <th style={{ textAlign: 'left', padding: '0.55rem 0.5rem' }}>Date</th>
                          <th style={{ textAlign: 'right', padding: '0.55rem 0.5rem' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bonusBreakdownRow.rescue_entries || []).map((entry, index) => (
                          <tr key={`${bonusBreakdownRow.kenjo_employee_id}-rescue-${index}-${entry.date || ''}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.55rem 0.5rem' }}>Rescue</td>
                            <td style={{ padding: '0.55rem 0.5rem' }}>{formatDateDDMMYYYY(entry.date)}</td>
                            <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>{formatCurrency(entry.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="settings-msg settings-msg--err">
                No weekly breakdown data is available for this employee in the loaded payroll response.
              </div>
            )}
          </div>
        </div>
      )}

      {result && result.rows && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed', minWidth: 960 }}>
            <colgroup>
              <col style={{ width: '8rem' }} />
              <col style={{ width: '4.5rem' }} />
              <col style={{ width: '4.5rem' }} />
              <col style={{ width: '3.5rem', minWidth: '3.5rem' }} />
              <col style={{ width: '3.5rem', minWidth: '3.5rem' }} />
              <col style={{ width: '6.5rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '6rem' }} />
              <col style={{ width: '4.5rem' }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      textAlign: ['pn', 'working_days', 'krank_days', 'urlaub_days', 'carryover_days', 'rest_urlaub'].includes(col.key) ? 'right' : 'left',
                      padding: '0.4rem 0.5rem',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      userSelect: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      ...((col.key === 'krank_days' || col.key === 'urlaub_days') ? { minWidth: '3.5rem', width: '3.5rem' } : {}),
                    }}
                    onClick={() => handleSort(col.key)}
                    title={`Sort by ${col.label}`}
                  >
                    {col.label}
                    <span style={{ marginLeft: '0.2rem', opacity: sortBy === col.key ? 1 : 0.5, fontSize: '0.85em' }}>
                      {sortBy !== col.key ? '↕' : sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => (
                <tr key={`${row.kenjo_employee_id}-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {columns.map((col) => {
                    if (col.key === 'abzug') {
                      const abzugSum = (row.abzug_lines || []).reduce((s, l) => s + (Number(l?.amount) || 0), 0);
                      const abzugVal = typeof row.abzug === 'number' ? row.abzug : abzugSum;
                      return (
                        <td key={col.key} style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          {formatCurrency(abzugVal)}
                          <button
                            type="button"
                            onClick={() => openAbzug(row)}
                            title="Edit Abzug"
                            style={{ marginLeft: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                          >
                            ✎
                          </button>
                        </td>
                      );
                    }
                    if (col.key === 'bonus') {
                      return (
                        <td key={col.key} style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          {formatCurrency(row.bonus)}
                          <button
                            type="button"
                            onClick={() => openBonus(row)}
                            title="Edit Bonus"
                            style={{ marginLeft: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                          >
                            ✎
                          </button>
                        </td>
                      );
                    }
                    if (col.key === 'total_bonus') {
                      return (
                        <td key={col.key} style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setBonusBreakdownRow(row)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              color: '#1976d2',
                              textDecoration: 'underline',
                              font: 'inherit',
                            }}
                            title="Open weekly bonus breakdown"
                          >
                            {formatCurrency(row.total_bonus)}
                          </button>
                        </td>
                      );
                    }
                    if (col.key === 'name' && row.kenjo_employee_id && row.is_manual) {
                      return (
                        <td key={col.key} style={{ padding: '0.4rem 0.5rem', maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                            <button
                              type="button"
                              onClick={() => navigate('/employee', { state: { kenjoEmployeeId: row.kenjo_employee_id } })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#1976d2', textDecoration: 'underline', font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={row.name ?? 'Open employee profile'}
                            >
                              {row.name ?? '-'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditManualRecord(row)}
                              title="Edit manual row"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: 0, lineHeight: 1, color: '#1976d2', textDecoration: 'underline' }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditManualRecord(row)}
                              title="Edit manual row"
                              style={{ display: 'none' }}
                            >
                              âœŽ
                            </button>
                          </div>
                        </td>
                      );
                    }
                    if (col.key === 'name' && row.kenjo_employee_id) {
                      return (
                        <td key={col.key} style={{ padding: '0.4rem 0.5rem', maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <button
                            type="button"
                            onClick={() => navigate('/employee', { state: { kenjoEmployeeId: row.kenjo_employee_id } })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#1976d2', textDecoration: 'underline', font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={row.name ?? 'Open employee profile'}
                          >
                            {row.name ?? '—'}
                          </button>
                        </td>
                      );
                    }
                    const val = (col.key === 'krank_days' || col.key === 'urlaub_days')
                      ? (row[col.key] ?? 0)
                      : row[col.key];
                    const isCurrency = ['total_bonus', 'verpfl_mehr', 'fahrt_geld', 'bonus', 'vorschuss'].includes(col.key);
                    const isNumericCol = ['pn', 'working_days', 'krank_days', 'urlaub_days', 'carryover_days', 'rest_urlaub', 'total_bonus', 'abzug', 'verpfl_mehr', 'fahrt_geld', 'bonus', 'vorschuss'].includes(col.key);
                    const display =
                      col.key === 'eintrittsdatum' || col.key === 'austrittsdatum'
                        ? formatDateDDMMYYYY(val)
                        : isCurrency
                          ? formatCurrency(val)
                          : (col.key === 'krank_days' || col.key === 'urlaub_days')
                            ? Number(val)
                            : (col.key === 'carryover_days' || col.key === 'rest_urlaub')
                              ? Number.isFinite(Number(val)) ? Number(val).toFixed(2) : '0.00'
                            : typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(2)) : val ?? '—';
                    let cellStyle = { padding: '0.4rem 0.5rem', textAlign: isNumericCol ? 'right' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                    let content = display;
                    let title;
                    if (col.key === 'krank_days' && Number(val) > 0) {
                      title = buildTimeOffTooltip(row.krank_entries);
                      if (title) cellStyle = { ...cellStyle, cursor: 'help' };
                    }
                    if (col.key === 'urlaub_days' && Number(val) > 0) {
                      title = buildTimeOffTooltip(row.urlaub_entries);
                      if (title) cellStyle = { ...cellStyle, cursor: 'help' };
                    }
                    if (col.key === 'austrittsdatum' && val) {
                      if (!shouldShowTerminationDate(val)) {
                        content = '—';
                      } else {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const d = new Date(val + 'T12:00:00');
                      d.setHours(0, 0, 0, 0);
                      if (d < today) {
                        cellStyle = { ...cellStyle, color: '#b91c1c' };
                      } else if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
                        content = <span style={{ backgroundColor: '#fef08a', color: '#854d0e', padding: '0.1em 0.2em' }}>{display}</span>;
                      }
                      }
                    }
                    return (
                      <td key={col.key} style={cellStyle} title={title}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abzugModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, minWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.5rem' }}>Edit Abzug</h3>
            <p style={{ margin: '0 0 1rem', color: '#6b7280' }}>{abzugModal.name}</p>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Car usage</p>
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={() => applyCarUsage(10)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.9rem' }}>
                10
              </button>
              <button type="button" className="btn-secondary" onClick={() => applyCarUsage(14)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.9rem' }}>
                14
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>Abzug (€)</th>
                  <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {(abzugModal.lines || []).map((line, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.35rem 0.5rem' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.amount === 0 ? '' : line.amount}
                        onChange={(e) => updateAbzugLine(i, 'amount', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '0.35rem 0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Comment"
                        value={line.comment}
                        onChange={(e) => updateAbzugLine(i, 'comment', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '0 0 1rem', fontWeight: 600, fontSize: '0.95rem' }}>
              Total Abzug: € {(abzugModal.lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0).toFixed(2)}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeAbzug} disabled={abzugSaving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveAbzug} disabled={abzugSaving}>
                {abzugSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bonusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, minWidth: 360, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.5rem' }}>Edit Bonus</h3>
            <p style={{ margin: '0 0 1rem', color: '#6b7280' }}>{bonusModal.name}</p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Amount (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={bonusModal.amount === 0 ? '' : bonusModal.amount}
                onChange={(e) => updateBonusForm('amount', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Comment</label>
              <input
                type="text"
                value={bonusModal.comment ?? ''}
                onChange={(e) => updateBonusForm('comment', e.target.value)}
                placeholder="Comment"
                style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={closeBonus} disabled={bonusSaving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveBonus} disabled={bonusSaving}>
                {bonusSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addRecordOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, minWidth: 380, maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>{manualEditTarget ? 'Edit manual record' : 'Add record'}</h3>
            {addRecordLoading ? (
              <p style={{ color: '#666' }}>Loading employees…</p>
            ) : (
              <>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Employee</label>
                  <select
                    value={addRecordForm.employeeId}
                    onChange={(e) => updateAddRecordForm('employeeId', e.target.value)}
                    disabled={!!manualEditTarget}
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="">— Select —</option>
                    {addRecordEmployeesAvailable.length === 0 && (addRecordEmployees || []).length > 0 ? (
                      <option value="" disabled>All employees already have a record for this month</option>
                    ) : null}
                    {addRecordEmployeesAvailable.map((e) => (
                      <option key={e._id || e.id} value={e._id || e.id}>
                        {e.displayName || [e.firstName, e.lastName].filter(Boolean).join(' ') || e._id}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Working days</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={addRecordForm.working_days}
                      onChange={(e) => updateAddRecordForm('working_days', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Total bonus</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addRecordForm.total_bonus}
                      onChange={(e) => updateAddRecordForm('total_bonus', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem' }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Abzug</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addRecordForm.abzug}
                    onChange={(e) => updateAddRecordForm('abzug', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>
                <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#f8fafc', borderRadius: 6, fontSize: '0.9rem' }}>
                  <div style={{ marginBottom: '0.25rem' }}><strong>After Abzug:</strong> {addRecordAfterAbzug}</div>
                  <div style={{ marginBottom: '0.25rem' }}><strong>Verpfl. mehr.:</strong> {addRecordVerpflMehr}</div>
                  <div><strong>Fahrt. Geld:</strong> {addRecordFahrtGeld}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Verpfl. mehr.</label>
                    <input
                      type="number"
                      step="0.01"
                      value={addRecordForm.verpfl_mehr}
                      onChange={(e) => updateAddRecordForm('verpfl_mehr', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Fahrt. Geld</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addRecordForm.fahrt_geld}
                      onChange={(e) => updateAddRecordForm('fahrt_geld', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Bonus</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addRecordForm.bonus}
                      onChange={(e) => updateAddRecordForm('bonus', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Vorschuss</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addRecordForm.vorschuss}
                      onChange={(e) => updateAddRecordForm('vorschuss', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={closeAddRecord} disabled={addRecordSaving}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={saveAddRecord}
                    disabled={!addRecordForm.employeeId || addRecordSaving}
                  >
                    {addRecordSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showActiveOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Active drivers not in payroll</h3>
            <p style={{ margin: '0 0 1rem', color: '#6b7280', fontSize: '0.9rem' }}>
              Select drivers and fill values. Click &quot;Add to list&quot; to add them to the payroll table.
            </p>
            {activeDriversLoading ? (
              <p style={{ color: '#666' }}>Loading active drivers…</p>
            ) : activeDriversList.length === 0 ? (
              <p style={{ color: '#666' }}>No active drivers outside the payroll list.</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                  <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem', width: 44 }} />
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>P.N.</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Working days</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Total bonus</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Abzug</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Verpfl. mehr.</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Fahrt. Geld</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Bonus</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem' }}>Vorschuss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDriversList.map((item, idx) => {
                        const u = item.user;
                        const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
                        const pn = u.employeeNumber || u.employee_number || '';
                        return (
                          <tr key={u._id || u.id || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="checkbox"
                                checked={!!item.selected}
                                onChange={(e) => updateActiveDriver(idx, 'selected', e.target.checked)}
                                aria-label={`Select ${name}`}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>{name}</td>
                            <td style={{ padding: '0.35rem' }}>{pn}</td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.working_days === 0 ? '' : item.working_days}
                                onChange={(e) => updateActiveDriver(idx, 'working_days', e.target.value)}
                                style={{ width: 64, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.total_bonus === 0 ? '' : item.total_bonus}
                                onChange={(e) => updateActiveDriver(idx, 'total_bonus', e.target.value)}
                                style={{ width: 80, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.abzug === 0 ? '' : item.abzug}
                                onChange={(e) => updateActiveDriver(idx, 'abzug', e.target.value)}
                                style={{ width: 72, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={item.verpfl_mehr === 0 ? '' : item.verpfl_mehr}
                                onChange={(e) => updateActiveDriver(idx, 'verpfl_mehr', e.target.value)}
                                style={{ width: 72, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.fahrt_geld === 0 ? '' : item.fahrt_geld}
                                onChange={(e) => updateActiveDriver(idx, 'fahrt_geld', e.target.value)}
                                style={{ width: 72, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.bonus === 0 ? '' : item.bonus}
                                onChange={(e) => updateActiveDriver(idx, 'bonus', e.target.value)}
                                style={{ width: 72, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.vorschuss === 0 ? '' : item.vorschuss}
                                onChange={(e) => updateActiveDriver(idx, 'vorschuss', e.target.value)}
                                style={{ width: 72, padding: '0.35rem', boxSizing: 'border-box' }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={closeShowActive}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={addActiveDriversToList}
                    disabled={activeAddToListSaving || !activeDriversList.some((a) => a.selected)}
                  >
                    {activeAddToListSaving ? 'Adding…' : 'Add to list'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAdvanceDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 520, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Add Advance</h3>
            {advanceError && <p className="error-text" style={{ margin: '0 0 0.5rem' }}>{advanceError}</p>}
            <p style={{ marginBottom: '0.25rem' }}><strong>Employee</strong></p>
            <select
              value={advanceForm.employeeId}
              onChange={(e) => setAdvanceForm((prev) => ({ ...prev, employeeId: e.target.value }))}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            >
              <option value="">— Select —</option>
              {(addRecordEmployees || []).map((e) => (
                <option key={e._id || e.id} value={e._id || e.id}>
                  {e.displayName || [e.firstName, e.lastName].filter(Boolean).join(' ') || e._id}
                </option>
              ))}
            </select>
            <p style={{ marginBottom: '0.25rem' }}><strong>Month</strong></p>
            <select
              value={advanceForm.month}
              onChange={(e) => setAdvanceForm((prev) => ({ ...prev, month: e.target.value }))}
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            >
              {advanceMonthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p style={{ marginBottom: '0.5rem' }}><strong>Advances for this month</strong></p>
            <div style={{ marginBottom: '0.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.75rem' }}>
              <span style={{ fontWeight: 600 }}>Amount</span>
              <span style={{ fontWeight: 600 }}>Comment</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={advanceForm.lines[i]?.amount ?? ''}
                  onChange={(e) => setAdvanceLine(i, 'amount', e.target.value)}
                  style={{ padding: '0.5rem' }}
                />
                <input
                  type="text"
                  placeholder="Comment"
                  value={advanceForm.lines[i]?.code_comment ?? ''}
                  onChange={(e) => setAdvanceLine(i, 'code_comment', e.target.value)}
                  style={{ padding: '0.5rem' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={closeAdvanceDialog} disabled={advanceSaving}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitAdvance} disabled={advanceSaving}>
                {advanceSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payrollHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1rem', borderRadius: 12, width: 'calc(100vw - 24px)', maxWidth: 1680, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Payroll History</h3>
                <p style={{ margin: '0.35rem 0 0', color: '#6b7280' }}>
                  {formatPayrollHistoryLabel(payrollHistoryModal)} | {String(payrollHistoryModal?.payload?.from || payrollHistoryModal?.period_from || '').slice(0, 10)} {'->'} {String(payrollHistoryModal?.payload?.to || payrollHistoryModal?.period_to || '').slice(0, 10)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={handleEditPayrollHistory}>
                  Edit
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setPayrollHistoryModal(null); setSelectedPayrollHistory(''); }}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'nowrap', minWidth: 'max-content' }}>
                {buildPayrollSummaryCards(payrollHistoryModal?.payload?.rows, payrollHistoryModal?.payload?.month || payrollHistoryModal?.period_id).map((card) => (
                  <div key={card.key} className="payroll-summary-card" style={{ borderTopColor: card.accent, minWidth: 138 }}>
                    <div className="payroll-summary-label">{card.label}</div>
                    <div className="payroll-summary-value">{card.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    {columns.map((col) => (
                      <th key={col.key} style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(payrollHistoryModal?.payload?.rows || []).map((row, index) => (
                    <tr key={`${row.kenjo_employee_id || row.name || 'row'}-${index}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{row.name || '—'}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{row.pn || '—'}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{row.working_days ?? '—'}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{row.krank_days ?? 0}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{row.urlaub_days ?? 0}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{Number(row.carryover_days ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{Number(row.rest_urlaub ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatCurrency(row.total_bonus)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatCurrency(row.abzug)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatCurrency(row.verpfl_mehr)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatCurrency(row.fahrt_geld)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatCurrency(row.bonus)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(row.eintrittsdatum)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(row.austrittsdatum)}</td>
                      <td style={{ padding: '0.45rem 0.35rem', whiteSpace: 'nowrap' }}>{formatCurrency(row.vorschuss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {payrollSavedNoticeOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.25rem', borderRadius: 12, width: '92vw', maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.5rem' }}>Payroll saved</h3>
            <p style={{ margin: 0, color: '#374151' }}>
              The payroll was exported to ADP and saved in the database.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setPayrollSavedNoticeOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayslipImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '1.25rem', borderRadius: 12, width: '92vw', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Import salary payslips (PDF)</h3>
            <p style={{ margin: '0 0 0.75rem', color: '#6b7280' }}>
              Upload one or more PDF payslips. If a file has several pages (batch PDF), each page is listed separately and
              saved as its own document. Names are auto-detected per page and matched to the employee database.
            </p>
            {payslipNotice && <p style={{ margin: '0 0 0.5rem', color: '#065f46' }}>{payslipNotice}</p>}
            <div
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: 10,
                padding: '1rem',
                marginBottom: '0.75rem',
                background: '#f9fafb',
              }}
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  setPayslipLoading(true);
                  setError('');
                  setPayslipNotice('');
                  try {
                const preview = await previewPayslipImport(files);
                const sortedItems = (preview.items || []).slice().sort((a, b) => {
                  const aConflict = a?.matchedEmployeeRef ? 0 : 1;
                  const bConflict = b?.matchedEmployeeRef ? 0 : 1;
                  if (aConflict !== bConflict) return bConflict - aConflict;
                  const aPage = Number(a?.pageIndex || 0);
                  const bPage = Number(b?.pageIndex || 0);
                  return aPage - bPage;
                });
                setPayslipPreview({
                  batchId: preview.batchId,
                  employeeOptions: preview.employeeOptions || [],
                  items: sortedItems.map((it) => ({
                    ...it,
                    employeeRef: it.matchedEmployeeRef || '',
                    employeeSearch: '',
                    action: 'import',
                  })),
                });
                  } catch (err) {
                    setError(String(err?.message || err));
                  } finally {
                    setPayslipLoading(false);
                  }
                }}
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                Drag file(s) here or choose from computer.
              </p>
            </div>

            {payslipLoading && <p style={{ margin: '0 0 0.75rem' }}>Analyzing PDFs…</p>}

            {payslipPreview?.items?.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
                <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>File</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>PDF block</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Detected name</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Employee</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslipPreview.items.map((it) => (
                      <tr key={it.fileId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{formatPayslipDocumentLabel(it)}</td>
                        <td style={{ padding: '0.5rem', whiteSpace: 'pre-line', fontSize: '0.82rem', color: '#111827', minWidth: 220 }}>
                          {it.previewText || '—'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{it.detectedName || '—'}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'grid', gap: '0.35rem' }}>
                            {!it.employeeRef && it.action !== 'delete' && (
                              <input
                                type="text"
                                value={it.employeeSearch || ''}
                                onChange={(e) => updatePayslipItem(it.fileId, { employeeSearch: e.target.value })}
                                placeholder="Type employee name..."
                                style={{ minWidth: 220, padding: '0.35rem 0.5rem' }}
                              />
                            )}
                            <select
                              value={it.employeeRef || ''}
                              onChange={(e) => updatePayslipItem(it.fileId, { employeeRef: e.target.value })}
                              disabled={it.action === 'delete'}
                              style={{ minWidth: 220 }}
                            >
                              <option value="">— Select employee —</option>
                              {filterPayslipEmployeeOptions(
                                payslipEmployeeSelectOptions(payslipPreview?.employeeOptions, it.matchIds, it.options),
                                it.employeeSearch,
                                it.employeeRef
                              ).map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span
                            aria-label={it.action === 'delete' ? 'deleted' : it.employeeRef ? 'matched' : 'conflict'}
                            title={it.action === 'delete' ? 'Will be deleted' : it.employeeRef ? 'Matched' : 'Conflict'}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 24,
                              height: 24,
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: it.action === 'delete' ? '#6b7280' : it.employeeRef ? '#16a34a' : '#dc2626',
                            }}
                          >
                            {it.action === 'delete' ? '−' : it.employeeRef ? '✓' : '✗'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          {it.action === 'delete' ? (
                            <button type="button" className="btn-secondary" onClick={() => updatePayslipItem(it.fileId, { action: 'import' })}>
                              Undo delete
                            </button>
                          ) : (
                            <button type="button" className="btn-secondary" onClick={() => updatePayslipItem(it.fileId, { action: 'delete' })}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={closePayslipImport} disabled={payslipImporting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!canImportPayslips || payslipImporting}
                onClick={async () => {
                  if (!payslipPreview?.batchId) return;
                  setPayslipImporting(true);
                  setError('');
                  setPayslipNotice('');
                  try {
                    const out = await importPayslipBatch(
                      payslipPreview.batchId,
                      payslipPreview.items.map((it) => ({
                        fileId: it.fileId,
                        employeeRef: it.employeeRef || null,
                        action: it.action || 'import',
                      }))
                    );
                    if ((out?.conflicts || []).length > 0) {
                      setError(`Imported ${out.imported || 0}, conflicts: ${(out.conflicts || []).length}`);
                    } else {
                      setShowPayslipImport(false);
                      setPayslipPreview(null);
                      setPayslipNotice('');
                    }
                  } catch (err) {
                    setError(String(err?.message || err));
                  } finally {
                    setPayslipImporting(false);
                  }
                }}
              >
                {payslipImporting ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

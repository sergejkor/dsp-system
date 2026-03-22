/**
 * Export sheet data as JSON for transfer to PostgreSQL.
 * Deploy as Web App: Publish > Deploy as web app > Execute as me, Who has access: Anyone.
 * Copy the web app URL into backend .env as GOOGLE_APPS_SCRIPT_URL.
 *
 * Expects sheets: EMPLOYEE_MASTER (or employees), KPI_DATA, MONTH_WORK_DAYS_DATA,
 * PAYROLL_BONUS_BY_WEEK, PAYROLL_ABZUG_ITEMS, PAYROLL_BONUS_ITEMS, VORSCHUSS, WEEKS.
 * Uses readTable(sheetName) from utils.gs (returns array of objects with header keys).
 */
function doGet(e) {
  const exportType = (e && e.parameter && e.parameter.export) || 'all';
  const result = {};

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    function readSheet(name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return [];
      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return [];
      const headers = values[0].map(function (h) {
        return String(h || '').trim();
      });
      return values.slice(1).map(function (row) {
        const obj = {};
        headers.forEach(function (h, i) {
          obj[h] = row[i];
        });
        return obj;
      });
    }

    if (exportType === 'all' || exportType === 'employees') {
      result.employees = readSheet('EMPLOYEE_MASTER').length
        ? readSheet('EMPLOYEE_MASTER')
        : readSheet('employees');
    }
    if (exportType === 'all' || exportType === 'kpi_data') {
      result.kpi_data = readSheet('KPI_DATA');
    }
    if (exportType === 'all' || exportType === 'month_work_days_data') {
      result.month_work_days_data = readSheet('MONTH_WORK_DAYS_DATA');
    }
    if (exportType === 'all' || exportType === 'payroll_bonus_by_week') {
      result.payroll_bonus_by_week = readSheet('PAYROLL_BONUS_BY_WEEK');
    }
    if (exportType === 'all' || exportType === 'payroll_abzug_items') {
      result.payroll_abzug_items = readSheet('PAYROLL_ABZUG_ITEMS');
    }
    if (exportType === 'all' || exportType === 'payroll_bonus_items') {
      result.payroll_bonus_items = readSheet('PAYROLL_BONUS_ITEMS');
    }
    if (exportType === 'all' || exportType === 'vorschuss') {
      result.vorschuss = readSheet('VORSCHUSS');
    }
    if (exportType === 'all' || exportType === 'weeks') {
      result.weeks = readSheet('WEEKS');
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: String(err.message || err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

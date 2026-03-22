# Архитектура системы

## Доменные модули

- Employees
- Payroll
- Kenjo Sync
- Calendar Uploads
- Excel Parser
- TimeChecks
- Apps Script Sync/Calc/API

## Потоки данных

### Payroll

Wix Payroll Page -> wix/backend/payrollApi.jsw -> Apps Script/api.gs -> Google Sheets

### Employees

Wix Employees Page -> wix/backend/kenjoEmployees.jsw -> Kenjo API
Wix Employee Page -> wix/backend/kenjoReadable.jsw -> Kenjo API

### Excel / Calendar

Calendar Page -> DailyUploads -> data.js hooks -> excelParser.jsw -> DailyUploadRows -> timechecks.js -> TimeChecks

### Kenjo Compare

TimeChecks + Kenjo Attendances -> kenjo.js -> conflicts -> ConflictTab lightbox

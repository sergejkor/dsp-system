# Transfer data from Google Sheets to PostgreSQL

Data is moved into the `dsp_system` PostgreSQL database using the script `backend/scripts/transfer-from-sheets.js`. Two options:

---

## Option 1: Export via Apps Script (recommended)

1. **In your Google Sheet project**, ensure `doGet` (in `api.gs` or similar) handles `action=exportForDb` and returns JSON from a function like `exportAllSheetsForDb()` — i.e. `{ success: true, data: { EMPLOYEE_MASTER: [...], KPI_DATA: [...], ... } }`.

2. **Deploy as Web App**
   - In Apps Script: **Deploy** → **New deployment** → **Web app**
   - Description: e.g. `Export for DB`
   - **Execute as**: Me
   - **Who has access**: Anyone (or “Only myself” and use a token; for “Anyone” the URL is public but only returns your sheet data)
   - Deploy and copy the **Web app URL**.

3. **Configure backend**
   - In `backend/.env` add:
     ```env
     DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/dsp_system
     GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
     ```
   - Replace the URL with your Web app URL (must end with `/exec`).

4. **Run the transfer**
   ```bash
   cd backend
   npm install
   npm run transfer:sheets
   ```
   The script will request the Apps Script URL, receive JSON, and insert/update the PostgreSQL tables.

---

## Option 2: Export to JSON and run locally

1. **Export data from Sheets to JSON**
   - Either run once in Apps Script a function that writes the result of `doGet({ parameter: { export: 'all' } })` to a file, or
   - Build a JSON file by hand with the same structure (see below).

2. **Create folder and file**
   - Create folder: `backend/data/sheets-export/`
   - Create file: `backend/data/sheets-export/data.json` with content like:
     ```json
     {
       "employees": [ { "employee_id": "...", "pn": "...", "first_name": "...", ... } ],
       "kpi_data": [ { "employee_id": "...", "year": 2025, "week": 1, "kpi": 85, ... } ],
       "month_work_days_data": [ ... ],
       "payroll_bonus_by_week": [ ... ],
       "payroll_abzug_items": [ ... ],
       "payroll_bonus_items": [ ... ],
       "vorschuss": [ ... ],
       "weeks": [ ... ]
     }
     ```

3. **Configure backend**
   - In `backend/.env` set only:
     ```env
     DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/dsp_system
     ```
   - Do **not** set `GOOGLE_APPS_SCRIPT_URL`.

4. **Run the transfer**
   ```bash
   cd backend
   npm run transfer:sheets
   ```
   The script will read `backend/data/sheets-export/data.json` and insert/update the database.

---

## Sheet/table mapping

| Sheet name (Google)   | JSON key / Table (PostgreSQL) |
|-----------------------|--------------------------------|
| EMPLOYEE_MASTER / employees | `employees` → `employees` |
| KPI_DATA              | `kpi_data` → `kpi_data` |
| MONTH_WORK_DAYS_DATA  | `month_work_days_data` → `month_work_days_data` |
| PAYROLL_BONUS_BY_WEEK | `payroll_bonus_by_week` → `payroll_bonus_by_week` |
| PAYROLL_ABZUG_ITEMS   | `payroll_abzug_items` → `payroll_abzug_items` |
| PAYROLL_BONUS_ITEMS   | `payroll_bonus_items` → `payroll_bonus_items` |
| VORSCHUSS             | `vorschuss` → `vorschuss` |
| WEEKS                 | `weeks` → `weeks` |

Column names in Sheets can be in any case; the script maps common variants (e.g. `employee_id`, `employeeId`, `start_date`, `startDate`, `vorname` → `first_name`, `name` → `last_name`).

---

## Requirements

- Node.js and `npm install` in `backend`
- PostgreSQL database `dsp_system` with tables created (run your full `CREATE TABLE` script in pgAdmin first)
- `backend/.env` with at least `DATABASE_URL`; for Option 1 also `GOOGLE_APPS_SCRIPT_URL`

import cron from 'node-cron';
import { query } from '../../db.js';

let schemaPromise;

export function ensureDailyExcelSchema() {
  if (!schemaPromise) schemaPromise = query(`CREATE TABLE IF NOT EXISTS car_planning_daily_excels (
    plan_date DATE PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_content BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`).then(() => query('CREATE INDEX IF NOT EXISTS car_planning_daily_excels_expiry ON car_planning_daily_excels(expires_at)'))
    .catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

export async function deleteExpiredDailyExcels() {
  await ensureDailyExcelSchema();
  await query('DELETE FROM car_planning_daily_excels WHERE expires_at <= now()');
}

export async function storeDailyExcel(date, fileName, fileContent) {
  await deleteExpiredDailyExcels();
  await query(`INSERT INTO car_planning_daily_excels(plan_date, file_name, file_content, expires_at)
    VALUES ($1, $2, $3, ((date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') + interval '1 day') AT TIME ZONE 'Europe/Berlin'))
    ON CONFLICT (plan_date) DO UPDATE SET file_name=EXCLUDED.file_name, file_content=EXCLUDED.file_content,
      uploaded_at=now(), expires_at=EXCLUDED.expires_at`, [date, fileName.slice(0, 255), fileContent]);
}

export async function getDailyExcelStatus(date) {
  await deleteExpiredDailyExcels();
  const { rows } = await query(`SELECT file_name, uploaded_at, expires_at, octet_length(file_content)::int AS bytes
    FROM car_planning_daily_excels WHERE plan_date=$1`, [date]);
  return rows[0] || null;
}

export function startDailyExcelCleanup() {
  const run = () => deleteExpiredDailyExcels().catch(error => console.error('[car-planning daily Excel cleanup]', error.message));
  run();
  return cron.schedule('0 0 * * *', run, { timezone: 'Europe/Berlin' });
}

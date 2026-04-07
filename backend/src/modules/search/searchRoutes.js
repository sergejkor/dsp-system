import { Router } from 'express';
import { query } from '../../db.js';

const router = Router();

function limitText(value, max = 180) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeTerm(raw) {
  return `%${String(raw || '').trim().replace(/[%_]/g, '\\$&')}%`;
}

router.get('/global', async (req, res) => {
  try {
    const raw = String(req.query.q || '').trim();
    if (raw.length < 2) {
      return res.json({ items: [] });
    }

    const term = normalizeTerm(raw);
    const exactPart = String(raw || '').trim();

    const [employeesRes, usersRes, carsRes, damageRes, questionnaireRes, finesRes] = await Promise.all([
      query(
        `SELECT employee_id, first_name, last_name, display_name, email, pn
         FROM employees
         WHERE
           LOWER(COALESCE(display_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(first_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(last_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(email, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(pn, '')) LIKE LOWER($1)
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT 10`,
        [term]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT id, first_name, last_name, email, role_name
         FROM settings_users
         WHERE
           LOWER(COALESCE(first_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(last_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(email, '')) LIKE LOWER($1)
         ORDER BY id DESC
         LIMIT 10`,
        [term]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT id, vehicle_id, license_plate, vin, model, year, fuel_type, vehicle_type, status,
                station, fleet_provider, assigned_driver_id, mileage,
                last_maintenance_date, next_maintenance_date, next_maintenance_mileage,
                registration_expiry, insurance_expiry, lease_expiry, planned_defleeting_date
         FROM cars
         WHERE
           CAST(id AS TEXT) LIKE $2
           OR LOWER(COALESCE(vehicle_id, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(license_plate, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(vin, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(model, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(year AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(fuel_type, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(vehicle_type, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(status, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(station, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(fleet_provider, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(assigned_driver_id, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(mileage AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(last_maintenance_date AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(next_maintenance_date AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(next_maintenance_mileage AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(registration_expiry AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(insurance_expiry AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(lease_expiry AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(planned_defleeting_date AS TEXT), '')) LIKE LOWER($1)
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT 15`,
        [term, `%${exactPart}%`]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT id, driver_name, reporter_name, license_plate, incident_date
         FROM public_damage_reports
         WHERE
           LOWER(COALESCE(driver_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(reporter_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(license_plate, '')) LIKE LOWER($1)
           OR CAST(id AS TEXT) LIKE $2
         ORDER BY id DESC
         LIMIT 8`,
        [term, `%${exactPart}%`]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT id, first_name, last_name, email, status
         FROM personal_questionnaire_submissions
         WHERE
           LOWER(COALESCE(first_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(last_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(email, '')) LIKE LOWER($1)
           OR CAST(id AS TEXT) LIKE $2
         ORDER BY id DESC
         LIMIT 8`,
        [term, `%${exactPart}%`]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT
           f.id,
           f.case_number,
           f.kenjo_employee_id,
           f.paid_by,
           f.amount,
           f.created_date,
           f.receipt_date,
           f.processing_date,
           COALESCE(NULLIF(ke.display_name, ''), NULLIF(CONCAT_WS(' ', ke.first_name, ke.last_name), '')) AS employee_name,
           COALESCE(STRING_AGG(fd.file_name, ' | ' ORDER BY fd.created_at DESC), '') AS files
         FROM fines f
         LEFT JOIN kenjo_employees ke ON ke.kenjo_user_id = f.kenjo_employee_id
         LEFT JOIN fine_documents fd ON fd.fine_id = f.id
         WHERE
           CAST(f.id AS TEXT) LIKE $2
           OR LOWER(COALESCE(f.case_number, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(f.kenjo_employee_id, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(f.paid_by, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(f.amount AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(f.created_date AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(f.receipt_date AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(CAST(f.processing_date AS TEXT), '')) LIKE LOWER($1)
           OR LOWER(COALESCE(ke.display_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(ke.first_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(ke.last_name, '')) LIKE LOWER($1)
           OR LOWER(COALESCE(fd.file_name, '')) LIKE LOWER($1)
         GROUP BY
           f.id, f.case_number, f.kenjo_employee_id, f.paid_by, f.amount, f.created_date, f.receipt_date, f.processing_date,
           ke.display_name, ke.first_name, ke.last_name
         ORDER BY f.id DESC
         LIMIT 12`,
        [term, `%${exactPart}%`]
      ).catch(() => ({ rows: [] })),
    ]);

    const items = [];

    for (const row of employeesRes.rows || []) {
      const name = row.display_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Employee';
      items.push({
        type: 'employee',
        label: name,
        description: limitText([row.email, row.pn].filter(Boolean).join(' | ')),
        path: row.employee_id ? `/employee?kenjo_employee_id=${encodeURIComponent(row.employee_id)}` : '/employee',
      });
    }

    for (const row of usersRes.rows || []) {
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || `User #${row.id}`;
      items.push({
        type: 'user',
        label: name,
        description: limitText([row.email, row.role_name].filter(Boolean).join(' | ')),
        path: '/settings/users',
      });
    }

    for (const row of carsRes.rows || []) {
      const label = row.license_plate || row.vin || row.vehicle_id || `Car #${row.id}`;
      items.push({
        type: 'car',
        label,
        description: limitText(
          [
            row.vehicle_id,
            row.model,
            row.vehicle_type,
            row.fuel_type,
            row.vin,
            row.status,
          ].filter(Boolean).join(' | ')
        ),
        path: '/cars',
      });
    }

    for (const row of finesRes.rows || []) {
      const label = row.case_number || `Fine #${row.id}`;
      items.push({
        type: 'fine',
        label,
        description: limitText(
          [
            `#${row.id}`,
            row.employee_name || row.kenjo_employee_id,
            row.amount != null ? `${row.amount} EUR` : '',
            row.files ? `files: ${row.files}` : '',
          ].filter(Boolean).join(' | ')
        ),
        path: '/fines',
      });
    }

    for (const row of damageRes.rows || []) {
      items.push({
        type: 'damage_report',
        label: row.driver_name || row.reporter_name || `Damage report #${row.id}`,
        description: limitText([`#${row.id}`, row.license_plate, row.incident_date].filter(Boolean).join(' | ')),
        path: `/schadenmeldung-review?id=${encodeURIComponent(row.id)}`,
      });
    }

    for (const row of questionnaireRes.rows || []) {
      const label = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || `Personalfragebogen #${row.id}`;
      items.push({
        type: 'personal_questionnaire',
        label,
        description: limitText([`#${row.id}`, row.email, row.status].filter(Boolean).join(' | ')),
        path: `/personal-fragebogen-review?id=${encodeURIComponent(row.id)}`,
      });
    }

    res.json({ items: items.slice(0, 45) });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

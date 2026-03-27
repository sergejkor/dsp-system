import { query } from '../../db.js';
import { getKenjoUsersList } from './kenjoClient.js';

function toDateOnly(v) {
  if (v == null || v === '') return undefined;
  const s = String(v).trim();
  const iso = s.includes('T') ? s.split('T')[0] : s;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

export async function syncKenjoEmployeesToDb() {
  const users = await getKenjoUsersList();
  let updated = 0;

  for (const u of users || []) {
    const kenjo_user_id = String(u._id || u.id || '').trim();
    if (!kenjo_user_id) continue;

    const displayName = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '';
    const startDateRaw = toDateOnly(u.startDate) ?? (u.startDate && String(u.startDate).trim().slice(0, 10));
    const contractEndRaw = toDateOnly(u.contractEnd) ?? (u.contractEnd && String(u.contractEnd).trim().slice(0, 10));
    const startDate = (startDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(startDateRaw))) ? startDateRaw : null;
    const contractEnd = (contractEndRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(contractEndRaw))) ? contractEndRaw : null;

    await query(
      `INSERT INTO kenjo_employees (
        kenjo_user_id, employee_number, transporter_id, first_name, last_name, display_name, job_title, start_date, contract_end, is_active, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (kenjo_user_id) DO UPDATE SET
        employee_number = EXCLUDED.employee_number,
        transporter_id = COALESCE(NULLIF(TRIM(EXCLUDED.transporter_id), ''), kenjo_employees.transporter_id),
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        job_title = EXCLUDED.job_title,
        start_date = EXCLUDED.start_date,
        contract_end = EXCLUDED.contract_end,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        kenjo_user_id,
        String(u.employeeNumber ?? u.employee_number ?? '').trim() || null,
        String(u.transportationId ?? u.transporterId ?? '').trim() || null,
        String(u.firstName ?? '').trim() || null,
        String(u.lastName ?? '').trim() || null,
        displayName || null,
        String(u.jobTitle ?? '').trim() || null,
        startDate,
        contractEnd,
        u.isActive !== false,
      ],
    );
    updated += 1;
  }

  return { ok: true, synced: updated };
}


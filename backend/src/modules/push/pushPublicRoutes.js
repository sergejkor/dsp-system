import { Router } from 'express';
import { query } from '../../db.js';
import employeeService from '../employees/employeeService.js';
import pushService from './pushService.js';

const router = Router();

function trimOrNull(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function uniqueNonEmpty(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(trimOrNull).filter(Boolean))];
}

function mapEmployeeIdentity(employee) {
  if (!employee) return null;
  return {
    kenjoUserId: trimOrNull(employee.kenjo_user_id),
    employeeRef:
      trimOrNull(employee.employee_id)
      || trimOrNull(employee.transporter_id)
      || trimOrNull(employee.id),
    displayName:
      trimOrNull(employee.display_name)
      || trimOrNull([employee.first_name, employee.last_name].filter(Boolean).join(' ')),
  };
}

async function resolveEmployeeIdentity(payload = {}) {
  const candidates = uniqueNonEmpty([
    payload?.employeeRef,
    payload?.employeeId,
    payload?.kenjoUserId,
  ]);
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    const employee = await employeeService.getEmployeeById(candidate).catch(() => null);
    const identity = mapEmployeeIdentity(employee);
    if (identity?.kenjoUserId || identity?.employeeRef) {
      return identity;
    }
  }

  const kenjoRes = await query(
    `SELECT
       kenjo_user_id::text AS kenjo_user_id,
       employee_number::text AS employee_number,
       transporter_id::text AS transporter_id,
       first_name,
       last_name,
       display_name
     FROM kenjo_employees
     WHERE kenjo_user_id::text = ANY($1::text[])
        OR employee_number::text = ANY($1::text[])
        OR transporter_id::text = ANY($1::text[])
     ORDER BY is_active DESC, id ASC
     LIMIT 1`,
    [candidates],
  ).catch(() => ({ rows: [] }));

  const kenjoEmployee = kenjoRes.rows?.[0] || null;
  if (kenjoEmployee) {
    return {
      kenjoUserId: trimOrNull(kenjoEmployee.kenjo_user_id),
      employeeRef:
        trimOrNull(kenjoEmployee.employee_number)
        || trimOrNull(kenjoEmployee.transporter_id)
        || trimOrNull(kenjoEmployee.kenjo_user_id),
      displayName:
        trimOrNull(kenjoEmployee.display_name)
        || trimOrNull([kenjoEmployee.first_name, kenjoEmployee.last_name].filter(Boolean).join(' ')),
    };
  }

  return {
    kenjoUserId: trimOrNull(payload?.kenjoUserId),
    employeeRef:
      trimOrNull(payload?.employeeRef)
      || trimOrNull(payload?.employeeId)
      || trimOrNull(payload?.kenjoUserId),
    displayName: trimOrNull(payload?.displayName),
  };
}

router.get('/config', async (_req, res) => {
  try {
    await pushService.ensureTables();
    return res.json(pushService.getPublicConfig());
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error || 'Failed to load push config') });
  }
});

router.post('/register-device', async (req, res) => {
  try {
    const employeeIdentity = await resolveEmployeeIdentity(req.body);
    if (!employeeIdentity?.kenjoUserId && !employeeIdentity?.employeeRef) {
      return res.status(400).json({ error: 'Employee was not found' });
    }

    const device = await pushService.registerDevice({
      kenjoUserId: employeeIdentity.kenjoUserId,
      employeeRef: employeeIdentity.employeeRef,
      displayName: employeeIdentity.displayName,
      subscription: req.body?.subscription,
      userAgent: req.body?.userAgent,
      platform: req.body?.platform,
      locale: req.body?.locale,
      appKind: req.body?.appKind,
      permissionState: req.body?.permissionState,
    });

    return res.status(201).json({
      ok: true,
      device,
      employee: employeeIdentity,
    });
  } catch (error) {
    console.error('POST /api/public/push/register-device error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to register push device') });
  }
});

router.post('/unregister-device', async (req, res) => {
  try {
    const removed = await pushService.unregisterDevice({
      endpoint: req.body?.endpoint,
    });
    return res.json({ ok: true, ...removed });
  } catch (error) {
    console.error('POST /api/public/push/unregister-device error', error);
    return res.status(400).json({ error: String(error?.message || error || 'Failed to unregister push device') });
  }
});

export default router;

import { Router } from 'express';
import employeeService from '../employees/employeeService.js';
import pushService from './pushService.js';

const router = Router();

async function resolveEmployeeIdentity(rawRef) {
  const ref = String(rawRef || '').trim();
  if (!ref) return null;
  const employee = await employeeService.getEmployeeById(ref).catch(() => null);
  if (!employee) return null;
  return {
    kenjoUserId: String(employee.kenjo_user_id || '').trim() || null,
    employeeRef:
      String(employee.employee_id || employee.transporter_id || employee.id || '').trim() || null,
    displayName:
      String(employee.display_name || [employee.first_name, employee.last_name].filter(Boolean).join(' ') || '').trim() || null,
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
    const employeeIdentity = await resolveEmployeeIdentity(
      req.body?.employeeRef || req.body?.kenjoUserId || req.body?.employeeId,
    );
    if (!employeeIdentity) {
      return res.status(400).json({ error: 'Employee was not found' });
    }

    const device = await pushService.registerDevice({
      kenjoUserId: employeeIdentity.kenjoUserId,
      employeeRef: employeeIdentity.employeeRef,
      displayName: employeeIdentity.displayName,
      subscription: req.body?.subscription,
      userAgent: req.body?.userAgent,
      platform: req.body?.platform,
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

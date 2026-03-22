import { Router } from 'express';
import * as contractService from './contractService.js';
import { updateEmployeeWork } from '../kenjo/kenjoClient.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const employeeId = req.query.employeeId ?? req.query.kenjo_employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'Query employeeId is required' });
    }
    const contracts = await contractService.getContractsByEmployee(employeeId);
    res.json(contracts);
  } catch (error) {
    console.error('GET /contracts error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post('/', async (req, res) => {
  try {
    const { kenjo_employee_id, kenjoEmployeeId, start_date, startDate, end_date, endDate } = req.body || {};
    const id = String(kenjo_employee_id || kenjoEmployeeId || '').trim();
    const start = start_date || startDate;
    const end = end_date ?? endDate;
    if (!id) {
      return res.status(400).json({ error: 'kenjo_employee_id is required' });
    }
    const contract = await contractService.createContract(id, start, end);
    try {
      await updateEmployeeWork(id, { contractEnd: end || null });
    } catch (kenjoErr) {
      console.error('Kenjo update contract end failed:', kenjoErr);
    }
    res.status(201).json(contract);
  } catch (error) {
    console.error('POST /contracts error', error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

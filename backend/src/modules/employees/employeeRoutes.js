import { Router } from 'express';
import employeeService from './employeeService.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, module: 'employees' }));

router.get('/', async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search) : '';
    const onlyActive = req.query.onlyActive === 'true';
    const employees = await employeeService.listEmployees({ search, onlyActive });
    res.json(employees);
  } catch (error) {
    console.error('GET /api/employees error', error);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const employee = await employeeService.getEmployeeById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    console.error('GET /api/employees/:id error', error);
    res.status(500).json({ error: 'Failed to load employee' });
  }
});

export default router;


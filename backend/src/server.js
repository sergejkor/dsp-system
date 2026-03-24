import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/authRoutes.js';
import authMiddleware from './modules/auth/authMiddleware.js';
import employeesRoutes from './modules/employees/employeeRoutes.js';
import payrollRoutes from './modules/payroll/payrollRoutes.js';
import kenjoRoutes from './modules/kenjo/kenjoRoutes.js';
import calendarRoutes from './modules/calendar/calendarRoutes.js';
import contractRoutes from './modules/contracts/contractRoutes.js';
import advanceRoutes from './modules/advances/advanceRoutes.js';
import o2Routes from './modules/o2Telefonica/o2Routes.js';
import scorecardRoutes from './modules/scorecard/scorecardRoutes.js';
import carsRoutes from './modules/cars/carsRoutes.js';
import paveRoutes from './modules/pave/paveRoutes.js';
import settingsRoutes from './modules/settings/settingsRoutes.js';
import analyticsRoutes from './modules/analytics/analyticsRoutes.js';
import giftCardsRoutes from './modules/giftCards/giftCardsRoutes.js';
import insuranceRoutes from './modules/insurance/insuranceRoutes.js';
import carPlanningRoutes from './modules/carPlanning/carPlanningRoutes.js';
import finesRoutes from './modules/fines/finesRoutes.js';
import damagesRoutes from './modules/damages/damagesRoutes.js';
import dashboardRoutes from './modules/dashboard/dashboardRoutes.js';
import financeRoutes from './modules/finance/financeRoutes.js';
import { getFinanceHealthInfo } from './modules/finance/financeService.js';
import { startPaveSyncScheduler } from './modules/pave/paveSyncScheduler.js';

const app = express();
const port = Number(process.env.PORT || 3001);

const defaultAllowedOrigins = [
  'https://dsp-system.alfamile.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const finalAllowedOrigins = allowedOrigins.length ? allowedOrigins : defaultAllowedOrigins;

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser tools (no Origin header) and explicit allowed origins.
    if (!origin || finalAllowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  let finance;
  try {
    finance = getFinanceHealthInfo();
  } catch (e) {
    finance = { error: e?.message || 'finance_health_failed' };
  }
  res.json({
    ok: true,
    service: 'dsp-system-backend',
    finance,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', authMiddleware.loadAuth);
app.use('/api', (req, res, next) => {
  if (req.originalUrl === '/api/health') return next();
  if (req.originalUrl === '/api/auth/login' && req.method === 'POST') return next();
  return authMiddleware.requireAuth(req, res, next);
});

app.use('/api/employees', employeesRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/kenjo', kenjoRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/advances', advanceRoutes);
app.use('/api/o2-telefonica', o2Routes);
app.use('/api/scorecard', scorecardRoutes);
app.use('/api/cars', carsRoutes);
app.use('/api/pave', paveRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/gift-cards', giftCardsRoutes);
app.use('/api/car-planning', carPlanningRoutes);
app.use('/api/fines', finesRoutes);
app.use('/api/damages', damagesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/finance', financeRoutes);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
  startPaveSyncScheduler();
});

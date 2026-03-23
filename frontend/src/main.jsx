import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppSettingsProvider, useAppSettings } from './context/AppSettingsContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import SidebarUser from './components/SidebarUser';
import EmployeeProfilePage from './pages/EmployeeProfilePage';
import PayrollPage from './pages/PayrollPage';
import CalendarPage from './pages/CalendarPage';
import TimeOffCalendarPage from './pages/TimeOffCalendarPage';
import DashboardPage from './pages/DashboardPage';
import KenjoSyncPage from './pages/KenjoSyncPage';
import SyncWithKenjoPage from './pages/SyncWithKenjoPage';
import O2TelefonicaPage from './pages/O2TelefonicaPage';
import ScorecardUploadsPage from './pages/ScorecardUploadsPage';
import CarsPage from './pages/CarsPage';
import PavePage from './pages/PavePage';
import PaveNewPage from './pages/PaveNewPage';
import PaveDetailPage from './pages/PaveDetailPage';
import PaveSettingsPage from './pages/PaveSettingsPage';
import PaveReturnPage from './pages/PaveReturnPage';
import PaveGmailReportDetailPage from './pages/PaveGmailReportDetailPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage';
import GiftCardsPage from './pages/GiftCardsPage';
import CarPlanningPage from './pages/CarPlanningPage';
import FinesPage from './pages/FinesPage';
import DamagesPage from './pages/DamagesPage';
import InsurancePage from './pages/InsurancePage';
import InsuranceVehiclePage from './pages/InsuranceVehiclePage';
import SettingsLayout from './pages/settings/SettingsLayout';
import SettingsGeneralPage from './pages/settings/SettingsGeneralPage';
import SettingsUsersPage from './pages/settings/SettingsUsersPage';
import SettingsRolesPage from './pages/settings/SettingsRolesPage';
import SettingsKpiPage from './pages/settings/SettingsKpiPage';
import SettingsPayrollPage from './pages/settings/SettingsPayrollPage';
import SettingsDriversPage from './pages/settings/SettingsDriversPage';
import SettingsCarsPage from './pages/settings/SettingsCarsPage';
import SettingsRoutesPage from './pages/settings/SettingsRoutesPage';
import SettingsLookupsPage from './pages/settings/SettingsLookupsPage';
import SettingsIntegrationsPage from './pages/settings/SettingsIntegrationsPage';
import SettingsFeaturesPage from './pages/settings/SettingsFeaturesPage';
import SettingsNotificationsPage from './pages/settings/SettingsNotificationsPage';
import SettingsSecurityPage from './pages/settings/SettingsSecurityPage';
import SettingsAuditPage from './pages/settings/SettingsAuditPage';
import SettingsAdvancedPage from './pages/settings/SettingsAdvancedPage';

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function AppLayout() {
  const { t } = useAppSettings();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>{t('appTitle')}</h1>
        <SidebarUser />
        <nav className="sidebar-nav">
          <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>
          <NavLink to="/kenjo-sync">{t('nav.employeeList')}</NavLink>
          <NavLink to="/payroll">{t('nav.payroll')}</NavLink>
          <NavLink to="/calendar">{t('nav.cortexUploads')}</NavLink>
          <NavLink to="/scorecard-uploads">{t('nav.scorecardUploads')}</NavLink>
          <NavLink to="/kenjo-calendar">{t('nav.calendar')}</NavLink>
          <NavLink to="/sync-kenjo">{t('nav.syncKenjo')}</NavLink>
          <NavLink to="/o2-telefonica">{t('nav.o2Telefonica')}</NavLink>
          <NavLink to="/cars">{t('nav.cars')}</NavLink>
          <NavLink to="/pave">{t('nav.pave')}</NavLink>
          <NavLink to="/analytics">{t('nav.analytics')}</NavLink>
          <NavLink to="/gift-cards">{t('nav.giftCards')}</NavLink>
          <NavLink to="/car-planning">{t('nav.carPlanning')}</NavLink>
          <NavLink to="/fines">{t('nav.fines')}</NavLink>
          <NavLink to="/damages">{t('nav.damages')}</NavLink>
          <NavLink to="/insurance">{t('nav.insurance')}</NavLink>
          <div className="sidebar-nav-bottom">
            <NavLink to="/settings">{t('nav.settings')}</NavLink>
          </div>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/kenjo-sync" element={<KenjoSyncPage />} />
            <Route path="/employee" element={<EmployeeProfilePage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/scorecard-uploads" element={<ScorecardUploadsPage />} />
            <Route path="/kenjo-calendar" element={<TimeOffCalendarPage />} />
            <Route path="/kenjo-sync" element={<KenjoSyncPage />} />
            <Route path="/sync-kenjo" element={<SyncWithKenjoPage />} />
            <Route path="/o2-telefonica" element={<O2TelefonicaPage />} />
            <Route path="/cars" element={<CarsPage />} />
            <Route path="/pave" element={<PavePage />} />
            <Route path="/pave/new" element={<PaveNewPage />} />
            <Route path="/pave/settings" element={<PaveSettingsPage />} />
            <Route path="/pave/return/:sessionKey" element={<PaveReturnPage />} />
            <Route path="/pave/:id" element={<PaveDetailPage />} />
            <Route path="/pave/gmail/:id" element={<PaveGmailReportDetailPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/gift-cards" element={<GiftCardsPage />} />
            <Route path="/car-planning" element={<CarPlanningPage />} />
            <Route path="/fines" element={<FinesPage />} />
            <Route path="/damages" element={<DamagesPage />} />
            <Route path="/insurance" element={<InsurancePage />} />
            <Route path="/insurance/vehicle/:plate" element={<InsuranceVehiclePage />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/general" replace />} />
              <Route path="general" element={<SettingsGeneralPage />} />
              <Route path="users" element={<SettingsUsersPage />} />
              <Route path="roles" element={<SettingsRolesPage />} />
              <Route path="kpi" element={<SettingsKpiPage />} />
              <Route path="payroll" element={<SettingsPayrollPage />} />
              <Route path="drivers" element={<SettingsDriversPage />} />
              <Route path="cars" element={<SettingsCarsPage />} />
              <Route path="routes" element={<SettingsRoutesPage />} />
              <Route path="lookups" element={<SettingsLookupsPage />} />
              <Route path="integrations" element={<SettingsIntegrationsPage />} />
              <Route path="features" element={<SettingsFeaturesPage />} />
              <Route path="notifications" element={<SettingsNotificationsPage />} />
              <Route path="security" element={<SettingsSecurityPage />} />
              <Route path="audit" element={<SettingsAuditPage />} />
              <Route path="advanced" element={<SettingsAdvancedPage />} />
        </Route>
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppSettingsProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </AppSettingsProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

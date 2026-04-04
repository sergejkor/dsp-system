import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import PersonalQuestionnairePublicPage from './pages/PersonalQuestionnairePublicPage.jsx';
import DamageReportPublicPage from './pages/DamageReportPublicPage.jsx';
import PersonalQuestionnaireReviewPage from './pages/PersonalQuestionnaireReviewPage.jsx';
import PersonalQuestionnaireNotificationsPage from './pages/PersonalQuestionnaireNotificationsPage.jsx';
import DamageReportReviewPage from './pages/DamageReportReviewPage.jsx';
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
import FinancePage from './pages/FinancePage';
import CreateDocumentPage from './pages/CreateDocumentPage.jsx';
import SettingsLayout from './pages/settings/SettingsLayout';
import SettingsGeneralPage from './pages/settings/SettingsGeneralPage';
import SettingsUsersPage from './pages/settings/SettingsUsersPage';
import SettingsRolesPage from './pages/settings/SettingsRolesPage';
import SettingsKpiPage from './pages/settings/SettingsKpiPage';
import SettingsPayrollPage from './pages/settings/SettingsPayrollPage';
import SettingsPersonalfragebogenPage from './pages/settings/SettingsPersonalfragebogenPage';
import SettingsSchadenmeldungPage from './pages/settings/SettingsSchadenmeldungPage';
import SettingsCreateDocumentsPage from './pages/settings/SettingsCreateDocumentsPage';
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
import sidebarLogo from './assets/dsp-system-logo.png';
import { getIntakeSummary } from './services/intakeApi.js';

function resolvePublicHostKind() {
  if (typeof window === 'undefined') return null;
  const host = String(window.location.hostname || '').toLowerCase();
  if (host.startsWith('personalfragebogen.') || host.startsWith('personal-fragebogen.')) return 'personal';
  if (host.startsWith('schadenmeldung.') || host.startsWith('schadensmeldung.')) return 'damage';
  return null;
}

function AppRoutes() {
  const publicHostKind = resolvePublicHostKind();
  if (publicHostKind === 'personal') {
    return (
      <Routes>
        <Route path="*" element={<PersonalQuestionnairePublicPage />} />
      </Routes>
    );
  }
  if (publicHostKind === 'damage') {
    return (
      <Routes>
        <Route path="*" element={<DamageReportPublicPage />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/personal-fragebogen" element={<PersonalQuestionnairePublicPage />} />
        <Route path="/schadenmeldung" element={<DamageReportPublicPage />} />
        <Route path="*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function AppLayout() {
  const { t } = useAppSettings();
  const { hasPermission, isSuperAdmin } = useAuth();
  const location = useLocation();
  const can = (code) => isSuperAdmin || hasPermission(code);
  const canEmployees = can('page_employees');
  const canDamages = can('page_damages');
  const [intakeSummary, setIntakeSummary] = React.useState(null);

  React.useEffect(() => {
    if (!canEmployees && !canDamages) {
      setIntakeSummary(null);
      return;
    }
    let cancelled = false;
    getIntakeSummary()
      .then((data) => {
        if (!cancelled) setIntakeSummary(data);
      })
      .catch(() => {
        if (!cancelled) setIntakeSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, canEmployees, canDamages]);

  const unreadPersonalNotifications = Number(intakeSummary?.personalQuestionnaires?.unread || 0);
  const unreadDamageNotifications = Number(intakeSummary?.damageReports?.unread || 0);
  const unreadNotificationTotal = unreadPersonalNotifications + unreadDamageNotifications;

  const PagePermissionRoute = ({ permission, children }) => {
    if (can(permission)) return children;
    return <Navigate to="/unauthorized" replace />;
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-topbar">
          <div className="sidebar-brand">
            <img src={sidebarLogo} alt={t('appTitle')} className="sidebar-brand-logo" />
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>
          <NavLink to="/kenjo-sync">{t('nav.employeeList')}</NavLink>
          {canEmployees && <NavLink to="/personal-fragebogen-review">Personalfragebogen</NavLink>}
          {can('page_payroll') && <NavLink to="/payroll">{t('nav.payroll')}</NavLink>}
          <NavLink to="/calendar">{t('nav.cortexUploads')}</NavLink>
          <NavLink to="/scorecard-uploads">{t('nav.scorecardUploads')}</NavLink>
          <NavLink to="/kenjo-calendar">{t('nav.calendar')}</NavLink>
          {can('page_sync_kenjo') && <NavLink to="/sync-kenjo">{t('nav.syncKenjo')}</NavLink>}
          <NavLink to="/o2-telefonica">{t('nav.o2Telefonica')}</NavLink>
          <NavLink to="/cars">{t('nav.cars')}</NavLink>
          <NavLink to="/pave">{t('nav.pave')}</NavLink>
          {can('page_analytics') && <NavLink to="/analytics">{t('nav.analytics')}</NavLink>}
          {can('page_gift_cards') && <NavLink to="/gift-cards">{t('nav.giftCards')}</NavLink>}
          <NavLink to="/car-planning">{t('nav.carPlanning')}</NavLink>
          {can('page_fines') && <NavLink to="/fines">{t('nav.fines')}</NavLink>}
          {can('page_damages') && <NavLink to="/damages">{t('nav.damages')}</NavLink>}
          {canDamages && <NavLink to="/schadenmeldung-review">Schadenmeldung</NavLink>}
          {can('page_insurance') && <NavLink to="/insurance">{t('nav.insurance')}</NavLink>}
          {can('page_finance') && <NavLink to="/finance">{t('nav.finance')}</NavLink>}
          <NavLink to="/create-document">{t('nav.createDocument')}</NavLink>
        </nav>
      </aside>
      <main className="content">
        <div className="content-topbar">
          <div className="content-topbar-spacer" />
          <SidebarUser unreadNotificationTotal={unreadNotificationTotal} />
        </div>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/kenjo-sync" element={<KenjoSyncPage />} />
            <Route path="/employee" element={<EmployeeProfilePage />} />
            <Route path="/personal-fragebogen-notifications" element={<PersonalQuestionnaireNotificationsPage />} />
            <Route path="/personal-fragebogen-review" element={<PagePermissionRoute permission="page_employees"><PersonalQuestionnaireReviewPage /></PagePermissionRoute>} />
            <Route path="/payroll" element={<PagePermissionRoute permission="page_payroll"><PayrollPage /></PagePermissionRoute>} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/scorecard-uploads" element={<ScorecardUploadsPage />} />
            <Route path="/kenjo-calendar" element={<TimeOffCalendarPage />} />
            <Route path="/kenjo-sync" element={<KenjoSyncPage />} />
            <Route path="/sync-kenjo" element={<PagePermissionRoute permission="page_sync_kenjo"><SyncWithKenjoPage /></PagePermissionRoute>} />
            <Route path="/o2-telefonica" element={<O2TelefonicaPage />} />
            <Route path="/cars" element={<CarsPage />} />
            <Route path="/pave" element={<PavePage />} />
            <Route path="/pave/new" element={<PaveNewPage />} />
            <Route path="/pave/settings" element={<PaveSettingsPage />} />
            <Route path="/pave/return/:sessionKey" element={<PaveReturnPage />} />
            <Route path="/pave/:id" element={<PaveDetailPage />} />
            <Route path="/pave/gmail/:id" element={<PaveGmailReportDetailPage />} />
            <Route path="/analytics" element={<PagePermissionRoute permission="page_analytics"><AnalyticsPage /></PagePermissionRoute>} />
            <Route path="/gift-cards" element={<PagePermissionRoute permission="page_gift_cards"><GiftCardsPage /></PagePermissionRoute>} />
            <Route path="/car-planning" element={<CarPlanningPage />} />
            <Route path="/fines" element={<PagePermissionRoute permission="page_fines"><FinesPage /></PagePermissionRoute>} />
            <Route path="/damages" element={<PagePermissionRoute permission="page_damages"><DamagesPage /></PagePermissionRoute>} />
            <Route path="/schadenmeldung-review" element={<PagePermissionRoute permission="page_damages"><DamageReportReviewPage /></PagePermissionRoute>} />
            <Route path="/insurance" element={<PagePermissionRoute permission="page_insurance"><InsurancePage /></PagePermissionRoute>} />
            <Route path="/insurance/vehicle/:plate" element={<PagePermissionRoute permission="page_insurance"><InsuranceVehiclePage /></PagePermissionRoute>} />
            <Route path="/finance" element={<PagePermissionRoute permission="page_finance"><FinancePage /></PagePermissionRoute>} />
            <Route path="/create-document" element={<CreateDocumentPage />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/general" replace />} />
              <Route path="general" element={<SettingsGeneralPage />} />
              <Route path="users" element={<SettingsUsersPage />} />
              <Route path="roles" element={<SettingsRolesPage />} />
              <Route path="kpi" element={<SettingsKpiPage />} />
              <Route path="payroll" element={<SettingsPayrollPage />} />
              <Route path="personalfragebogen" element={<SettingsPersonalfragebogenPage />} />
              <Route path="schadenmeldung" element={<SettingsSchadenmeldungPage />} />
              <Route path="create-documents" element={<SettingsCreateDocumentsPage />} />
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

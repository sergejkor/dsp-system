import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppSettingsProvider, useAppSettings } from './context/AppSettingsContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppSidebar from './components/AppSidebar';
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
import ChatPage from './pages/ChatPage.jsx';
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="topbar-search-icon">
      <path
        d="M10.75 4.25a6.5 6.5 0 1 0 4.02 11.61l3.68 3.67a.75.75 0 1 0 1.06-1.06l-3.67-3.68a6.5 6.5 0 0 0-5.09-10.54Zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronIcon({ direction = 'down' }) {
  const rotation = direction === 'up' ? 'rotate(180 12 12)' : 'rotate(0 12 12)';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="topbar-search-action-icon">
      <path
        transform={rotation}
        d="M7.47 9.22a.75.75 0 0 1 1.06 0L12 12.69l3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="topbar-search-action-icon">
      <path
        d="M7.28 7.28a.75.75 0 0 1 1.06 0L12 10.94l3.66-3.66a.75.75 0 1 1 1.06 1.06L13.06 12l3.66 3.66a.75.75 0 1 1-1.06 1.06L12 13.06l-3.66 3.66a.75.75 0 1 1-1.06-1.06L10.94 12 7.28 8.34a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TopbarPageSearch({ scopeSelector = '.content' }) {
  const location = useLocation();
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const matchesRef = React.useRef([]);

  React.useEffect(() => {
    setQuery('');
    setStatus('');
    setCurrentIndex(0);
  }, [location.pathname, location.search]);

  const normalizeText = React.useCallback((value) => String(value || '').toLowerCase(), []);

  const clearHighlights = React.useCallback((root) => {
    if (!root) return;
    const marks = root.querySelectorAll('mark.topbar-search-highlight');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    });
  }, []);

  const highlightMatches = React.useCallback((root, rawQuery) => {
    if (!root) return [];
    const queryText = String(rawQuery || '').trim();
    if (!queryText) return [];
    const loweredQuery = normalizeText(queryText);
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-search-skip="true"]')) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    const marks = [];
    textNodes.forEach((textNode) => {
      const textValue = textNode.nodeValue || '';
      const loweredValue = normalizeText(textValue);
      let fromIndex = 0;
      let matchIndex = loweredValue.indexOf(loweredQuery, fromIndex);
      if (matchIndex === -1) return;

      const fragment = doc.createDocumentFragment();
      while (matchIndex !== -1) {
        if (matchIndex > fromIndex) {
          fragment.appendChild(doc.createTextNode(textValue.slice(fromIndex, matchIndex)));
        }
        const mark = doc.createElement('mark');
        mark.className = 'topbar-search-highlight';
        mark.textContent = textValue.slice(matchIndex, matchIndex + queryText.length);
        fragment.appendChild(mark);
        marks.push(mark);
        fromIndex = matchIndex + queryText.length;
        matchIndex = loweredValue.indexOf(loweredQuery, fromIndex);
      }
      if (fromIndex < textValue.length) {
        fragment.appendChild(doc.createTextNode(textValue.slice(fromIndex)));
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    });

    return marks;
  }, [normalizeText]);

  React.useEffect(() => {
    const scope = document.querySelector(scopeSelector);
    const root = scope?.querySelector('.content-body');
    if (!root) return undefined;
    clearHighlights(root);
    matchesRef.current = [];
    setCurrentIndex(0);

    const trimmed = String(query || '').trim();
    if (!trimmed) {
      setStatus('');
      return undefined;
    }

    const marks = highlightMatches(root, trimmed);
    matchesRef.current = marks;
    if (!marks.length) {
      setStatus('Nothing found on this page');
      return undefined;
    }

    setStatus(`${marks.length} match${marks.length === 1 ? '' : 'es'}`);
    setCurrentIndex(0);
    return () => {
      clearHighlights(root);
      matchesRef.current = [];
    };
  }, [query, location.pathname, location.search, scopeSelector, clearHighlights, highlightMatches]);

  React.useEffect(() => {
    const matches = matchesRef.current || [];
    matches.forEach((mark, index) => {
      if (!mark) return;
      if (index === currentIndex) {
        mark.classList.add('is-active');
      } else {
        mark.classList.remove('is-active');
      }
    });
    const active = matches[currentIndex];
    if (active) {
      active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      setStatus(`${currentIndex + 1} of ${matches.length} matches`);
    }
  }, [currentIndex]);

  function moveMatch(step) {
    const matches = matchesRef.current || [];
    if (!matches.length) {
      setStatus('Nothing found on this page');
      return;
    }
    setCurrentIndex((prev) => {
      const next = (prev + step + matches.length) % matches.length;
      return next;
    });
  }

  function runSearch(step = 1) {
    const text = String(query || '').trim();
    if (!text) {
      setStatus('');
      return;
    }
    moveMatch(step);
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(1);
  }

  return (
    <form className="topbar-search" onSubmit={handleSubmit} role="search" data-search-skip="true">
      <div className="topbar-search-shell">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (status) setStatus('');
          }}
          placeholder="Search this page"
          aria-label="Search this page"
        />
        {query ? (
          <>
            <button type="button" className="topbar-search-action" onClick={() => runSearch(-1)} title="Previous result">
              <ChevronIcon direction="up" />
            </button>
            <button type="button" className="topbar-search-action" onClick={() => runSearch(1)} title="Next result">
              <ChevronIcon direction="down" />
            </button>
            <button
              type="button"
              className="topbar-search-action topbar-search-action--clear"
              onClick={() => {
                const scope = document.querySelector(scopeSelector);
                const root = scope?.querySelector('.content-body');
                clearHighlights(root);
                matchesRef.current = [];
                setQuery('');
                setStatus('');
                setCurrentIndex(0);
              }}
              title="Clear search"
            >
              <CloseIcon />
            </button>
          </>
        ) : null}
      </div>
      {status ? <span className="topbar-search-status">{status}</span> : null}
    </form>
  );
}

function AppLayout() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [sidebarPresentation, setSidebarPresentation] = React.useState({
    isCollapsed: false,
    isHoverExpanded: false,
  });
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

  const shellClassName = [
    'app-shell',
    sidebarPresentation.isCollapsed ? 'is-sidebar-collapsed' : '',
    sidebarPresentation.isCollapsed && sidebarPresentation.isHoverExpanded ? 'is-sidebar-hover-expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClassName}>
      <AppSidebar canAccess={can} onPresentationChange={setSidebarPresentation} />
      <main className="content">
        <div className="content-topbar">
          <TopbarPageSearch />
          <SidebarUser unreadNotificationTotal={unreadNotificationTotal} />
        </div>
        <div className="content-body">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/chat" element={<ChatPage />} />
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
        </div>
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

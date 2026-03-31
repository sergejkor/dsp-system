import { NavLink, Outlet } from 'react-router-dom';
import { useAppSettings } from '../../context/AppSettingsContext';

const SECTION_KEYS = [
  { path: 'general', key: 'general' },
  { path: 'users', key: 'usersAccess' },
  { path: 'roles', key: 'rolesPermissions' },
  { path: 'kpi', key: 'kpi' },
  { path: 'payroll', key: 'payroll' },
  { path: 'personalfragebogen', key: 'personalfragebogen' },
  { path: 'schadenmeldung', key: 'schadenmeldung' },
  { path: 'create-documents', key: 'createDocuments' },
  { path: 'drivers', key: 'drivers' },
  { path: 'cars', key: 'carsFleet' },
  { path: 'routes', key: 'routes' },
  { path: 'lookups', key: 'lookups' },
  { path: 'integrations', key: 'integrations' },
  { path: 'features', key: 'features' },
  { path: 'notifications', key: 'notifications' },
  { path: 'security', key: 'security' },
  { path: 'audit', key: 'audit' },
  { path: 'advanced', key: 'advanced' },
];

export default function SettingsLayout() {
  const { t } = useAppSettings();
  return (
    <section className="card settings-page">
      <h2>{t('settings.title')}</h2>
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTION_KEYS.map(({ path, key }) => (
            <NavLink
              key={path}
              to={`/settings/${path}`}
              className={({ isActive }) => (isActive ? 'settings-nav-link active' : 'settings-nav-link')}
            >
              {t(`settings.${key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
      <style>{`
        .settings-page { max-width: 100%; }
        .settings-layout { display: flex; gap: 1.5rem; margin-top: 1rem; min-height: 400px; }
        .settings-nav { flex: 0 0 200px; display: flex; flex-direction: column; gap: 4px; }
        .settings-nav-link { padding: 0.5rem 0.75rem; border-radius: 8px; text-decoration: none; color: #374151; font-size: 0.9rem; }
        .settings-nav-link:hover { background: #f3f4f6; }
        .settings-nav-link.active { background: #e5e7eb; font-weight: 600; color: #111827; }
        .settings-content { flex: 1; min-width: 0; }
        @media (max-width: 768px) { .settings-layout { flex-direction: column; } .settings-nav { flex-direction: row; flex-wrap: wrap; } }
      `}</style>
    </section>
  );
}

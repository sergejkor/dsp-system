import { useAppSettings } from '../../context/AppSettingsContext';
import { APP_ACCESSIBLE_PAGES } from '../../config/appAccessiblePages';

/**
 * Reference list of main app routes (sidebar). Shown under Settings → Users & Access and Roles & Permissions.
 */
export default function AccessiblePagesReference() {
  const { t } = useAppSettings();

  return (
    <section className="settings-accessible-pages" aria-labelledby="settings-accessible-pages-heading">
      <h4 id="settings-accessible-pages-heading">Application pages</h4>
      <p className="muted small" style={{ marginTop: 0 }}>
        Main navigation routes. In <strong>Roles & Permissions</strong>, use the <strong>pages</strong> category to
        assign access per role (when your deployment enforces these checks on the API or UI).
      </p>
      <div className="settings-accessible-pages-table-wrap">
        <table className="settings-accessible-pages-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Label</th>
              <th>Permission code</th>
            </tr>
          </thead>
          <tbody>
            {APP_ACCESSIBLE_PAGES.map((row) => (
              <tr key={row.path}>
                <td>
                  <code>{row.path === '/' ? '/' : row.path}</code>
                </td>
                <td>{t(row.labelKey)}</td>
                <td>
                  <code>{row.permissionCode || '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Detail URLs (e.g. <code>/pave/gmail/:id</code>, <code>/employee</code>, <code>/insurance/vehicle/:plate</code>)
        follow the same section as their parent page.
      </p>
      <style>{`
        .settings-accessible-pages { margin: 1.25rem 0; padding: 1rem; background: var(--bg-page, #f3f4f6); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; }
        .settings-accessible-pages h4 { margin: 0 0 0.5rem; font-size: 1rem; }
        .settings-accessible-pages-table-wrap { overflow: auto; margin: 0.5rem 0; }
        .settings-accessible-pages-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .settings-accessible-pages-table th, .settings-accessible-pages-table td { border: 1px solid var(--border, #e5e7eb); padding: 0.35rem 0.5rem; text-align: left; }
        .settings-accessible-pages-table th { background: var(--bg-card, #fff); }
        .settings-accessible-pages-table code { font-size: 0.8rem; }
        body.dark .settings-accessible-pages { background: #1f2937; border-color: #374151; }
        body.dark .settings-accessible-pages-table th { background: #111827; }
      `}</style>
    </section>
  );
}

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import sidebarLogo from '../assets/leitcore-logo-sidebar-v2.png';
import { sidebarMenuItems } from '../config/sidebarMenu';
import { useAppSettings } from '../context/AppSettingsContext';
import './AppSidebar.css';

const COLLAPSE_STORAGE_KEY = 'app_sidebar_collapsed';
const COLLAPSED_BRAND_MARK = '/favicon-leitcore-v2.png';

function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FleetIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 16H9m10 0h2v-3l-2.2-3.67A2 2 0 0 0 17.09 8H14" />
      <path d="M2 16h2" />
      <path d="M6 16h5" />
      <path d="M5 16V6a2 2 0 0 1 2-2h7v12" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="17.5" cy="16.5" r="1.5" />
    </svg>
  );
}

function WalletIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M3 7h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3" />
      <path d="M16 12h.01" />
    </svg>
  );
}

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function FilesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="7" y="2.75" width="10" height="18.5" rx="2.5" />
      <path d="M11 18h2" />
      <path d="M10 6h4" />
    </svg>
  );
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

function PanelToggleIcon({ collapsed, ...props }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.25" y="3" width="15.5" height="14" rx="2.2" />
      <path d="M7 3v14" />
      {collapsed ? <path d="m10.25 10 2.5-2.5m-2.5 2.5 2.5 2.5" /> : <path d="m13 10-2.5-2.5m2.5 2.5-2.5 2.5" />}
    </svg>
  );
}

const iconMap = {
  users: UsersIcon,
  fleet: FleetIcon,
  wallet: WalletIcon,
  calendar: CalendarIcon,
  files: FilesIcon,
  phone: PhoneIcon,
};

function matchesPattern(pathname, pattern) {
  if (!pattern) return false;
  if (pattern.endsWith('*')) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  return pathname === pattern;
}

function itemMatchesPath(pathname, item) {
  const patterns = item.matchPatterns?.length ? item.matchPatterns : [item.path];
  return patterns.some((pattern) => matchesPattern(pathname, pattern));
}

function isItemVisible(item, canAccess) {
  return !item.permissionCode || canAccess(item.permissionCode);
}

function getVisibleMenuItems(items, canAccess) {
  return items.reduce((accumulator, item) => {
    if (item.type === 'group') {
      const visibleChildren = getVisibleMenuItems(item.items, canAccess);
      if (visibleChildren.length) {
        accumulator.push({ ...item, items: visibleChildren });
      }
      return accumulator;
    }

    if (isItemVisible(item, canAccess)) {
      accumulator.push(item);
    }

    return accumulator;
  }, []);
}

function findActiveEntry(items, pathname) {
  for (const item of items) {
    if (item.type === 'group') {
      const activeChild = item.items.find((child) => itemMatchesPath(pathname, child));
      if (activeChild) {
        return { groupId: item.id, itemId: activeChild.id };
      }
      continue;
    }

    if (itemMatchesPath(pathname, item)) {
      return { groupId: null, itemId: item.id };
    }
  }

  return { groupId: null, itemId: null };
}

export default function AppSidebar({ canAccess, onPresentationChange }) {
  const { pathname } = useLocation();
  const { t } = useAppSettings();
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
    } catch (_error) {
      return false;
    }
  });
  const [isHoverExpanded, setIsHoverExpanded] = React.useState(false);

  const visibleMenuItems = React.useMemo(() => getVisibleMenuItems(sidebarMenuItems, canAccess), [canAccess]);
  const activeEntry = React.useMemo(() => findActiveEntry(visibleMenuItems, pathname), [pathname, visibleMenuItems]);
  const [openGroup, setOpenGroup] = React.useState(activeEntry.groupId);

  React.useEffect(() => {
    if (activeEntry.groupId) {
      setOpenGroup(activeEntry.groupId);
    }
  }, [activeEntry.groupId]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, isCollapsed ? '1' : '0');
    } catch (_error) {
      // ignore storage errors
    }
  }, [isCollapsed]);

  const isExpanded = !isCollapsed || isHoverExpanded;

  React.useEffect(() => {
    onPresentationChange?.({
      isCollapsed,
      isHoverExpanded,
    });
  }, [isCollapsed, isHoverExpanded, onPresentationChange]);

  function handleGroupToggle(groupId) {
    setOpenGroup((current) => (current === groupId ? null : groupId));
  }

  function handleCollapseToggle() {
    setIsCollapsed((current) => {
      const next = !current;
      if (!next) {
        setIsHoverExpanded(false);
      }
      return next;
    });
  }

  function handleMouseEnter() {
    if (isCollapsed) {
      setIsHoverExpanded(true);
    }
  }

  function handleMouseLeave() {
    if (isCollapsed) {
      setIsHoverExpanded(false);
    }
  }

  function renderIcon(iconKey, className) {
    const IconComponent = iconMap[iconKey];
    return IconComponent ? <IconComponent className={className} aria-hidden="true" /> : null;
  }

  const brandSrc = isExpanded ? sidebarLogo : COLLAPSED_BRAND_MARK;
  const brandAlt = t('appTitle');

  return (
    <aside
      className={`app-sidebar${isCollapsed ? ' is-collapsed' : ''}${isHoverExpanded ? ' is-hover-expanded' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="app-sidebar__header">
        <Link to="/dashboard" className="app-sidebar__brand" aria-label={brandAlt} title={brandAlt}>
          <img src={brandSrc} alt={brandAlt} className={`app-sidebar__brand-logo${isExpanded ? '' : ' is-mark-only'}`} />
        </Link>

        <button
          type="button"
          className="app-sidebar__collapse-btn"
          onClick={handleCollapseToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelToggleIcon collapsed={isCollapsed && !isHoverExpanded} className="app-sidebar__collapse-icon" />
        </button>
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary navigation">
        {visibleMenuItems.map((item) => {
          if (item.type === 'group') {
            const isGroupActive = activeEntry.groupId === item.id;
            const isGroupOpen = openGroup === item.id && isExpanded;

            return (
              <div
                key={item.id}
                className={`app-sidebar__group${isGroupOpen ? ' is-open' : ''}${isGroupActive ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  className="app-sidebar__group-trigger"
                  onClick={() => handleGroupToggle(item.id)}
                  aria-expanded={isGroupOpen}
                  aria-controls={`sidebar-group-${item.id}`}
                  title={!isExpanded ? item.label : undefined}
                >
                  <span className="app-sidebar__item-main">
                    <span className="app-sidebar__icon-wrap">{renderIcon(item.icon, 'app-sidebar__icon')}</span>
                    <span className="app-sidebar__label">{item.label}</span>
                  </span>
                  <ChevronIcon className="app-sidebar__chevron" aria-hidden="true" />
                </button>

                <div
                  id={`sidebar-group-${item.id}`}
                  className="app-sidebar__submenu-shell"
                  aria-hidden={!isGroupOpen}
                >
                  <div className="app-sidebar__submenu">
                    {item.items.map((child) => {
                      const isChildActive = activeEntry.itemId === child.id;
                      const childLabel = child.labelKey ? t(child.labelKey) : child.label;

                      return (
                        <Link
                          key={child.id}
                          to={child.path}
                          className={`app-sidebar__submenu-link${isChildActive ? ' is-active' : ''}`}
                        >
                          <span className="app-sidebar__submenu-bullet" aria-hidden="true" />
                          <span className="app-sidebar__submenu-label">{childLabel}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          const isItemActive = activeEntry.itemId === item.id;
          const itemLabel = item.labelKey ? t(item.labelKey) : item.label;

          return (
            <Link
              key={item.id}
              to={item.path}
              className={`app-sidebar__single-link${isItemActive ? ' is-active' : ''}`}
              title={!isExpanded ? itemLabel : undefined}
            >
              <span className="app-sidebar__item-main">
                <span className="app-sidebar__icon-wrap">{renderIcon(item.icon, 'app-sidebar__icon')}</span>
                <span className="app-sidebar__label">{itemLabel}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

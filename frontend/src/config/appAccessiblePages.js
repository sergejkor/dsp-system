/**
 * Main navigation routes — keep in sync with `main.jsx` sidebar NavLinks.
 * @typedef {{ path: string, labelKey: string, permissionCode?: string }} AppPageRow
 * @type {AppPageRow[]}
 */
export const APP_ACCESSIBLE_PAGES = [
  { path: '/dashboard', labelKey: 'nav.dashboard', permissionCode: 'page_dashboard' },
  { path: '/', labelKey: 'nav.employeeList', permissionCode: 'page_employees' },
  { path: '/payroll', labelKey: 'nav.payroll', permissionCode: 'page_payroll' },
  { path: '/calendar', labelKey: 'nav.cortexUploads', permissionCode: 'page_cortex_uploads' },
  { path: '/scorecard-uploads', labelKey: 'nav.scorecardUploads', permissionCode: 'page_scorecard_uploads' },
  { path: '/kenjo-calendar', labelKey: 'nav.calendar', permissionCode: 'page_kenjo_calendar' },
  { path: '/sync-kenjo', labelKey: 'nav.syncKenjo', permissionCode: 'page_sync_kenjo' },
  { path: '/o2-telefonica', labelKey: 'nav.o2Telefonica', permissionCode: 'page_o2_telefonica' },
  { path: '/cars', labelKey: 'nav.cars', permissionCode: 'page_cars' },
  { path: '/pave', labelKey: 'nav.pave', permissionCode: 'page_pave' },
  { path: '/analytics', labelKey: 'nav.analytics', permissionCode: 'page_analytics' },
  { path: '/gift-cards', labelKey: 'nav.giftCards', permissionCode: 'page_gift_cards' },
  { path: '/car-planning', labelKey: 'nav.carPlanning', permissionCode: 'page_car_planning' },
  { path: '/fines', labelKey: 'nav.fines', permissionCode: 'page_fines' },
  { path: '/damages', labelKey: 'nav.damages', permissionCode: 'page_damages' },
  { path: '/insurance', labelKey: 'nav.insurance', permissionCode: 'page_insurance' },
  { path: '/settings', labelKey: 'nav.settings', permissionCode: 'page_settings' },
];

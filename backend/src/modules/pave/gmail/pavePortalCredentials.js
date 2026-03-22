/**
 * PAVE report portal web login (same env vars as Playwright in pavePortalSession).
 * Kept in a tiny module so HTTP routes don't need to load Playwright.
 */
export function portalCredentials() {
  const username = process.env.REPORT_PORTAL_USERNAME != null ? String(process.env.REPORT_PORTAL_USERNAME).trim() : '';
  const password = process.env.REPORT_PORTAL_PASSWORD != null ? String(process.env.REPORT_PORTAL_PASSWORD).trim() : '';
  return { username, password };
}

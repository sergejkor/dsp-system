# PAVE email ingestion — env & performance

Two-stage sync: **Stage A** imports matching emails and report URLs into `incoming_emails` (pending). **Stage B** opens each report in Playwright, **scrapes summary fields from the live HTML report** (date, masked VIN, grade, vehicle), downloads the **PDF** for archive and damage-item parsing, then merges HTML + PDF into `pave_reports`. If the PDF is corrupt, summary data can still come from the page (`summary_source` in `raw_extracted_payload`).

## Gmail

| Variable | Default | Description |
|----------|---------|-------------|
| `PAVE_GMAIL_QUERY` | `in:anywhere` | Base query for **unread/manual** sync (`fetchUnreadEmails`). Not limited to unread unless you add `is:unread`. Sync now searches a wider raw inbox window and stops after it queued the requested number of matching PAVE emails, so unrelated mailbox traffic no longer starves auto-ingestion. |
| `PAVE_GMAIL_HISTORICAL_QUERY` | `in:anywhere` | Base query for **backfill**; combined with `after:` / `before:` / `from:` / `subject:`. UI `dateTo` is treated as inclusive; Gmail `before:` is shifted by +1 day under the hood. |
| `PAVE_GMAIL_MESSAGE_FETCH_CONCURRENCY` | `8` | Parallel `messages.get` calls after list pagination (max 20). |

## Scheduler

| Variable | Default | Description |
|----------|---------|-------------|
| `PAVE_SYNC_ENABLED` | `false` | Enables the automatic PAVE email sync scheduler on backend startup. |
| `PAVE_SYNC_CRON` | `*/5 * * * *` | Cron expression for auto sync runs. |
| `PAVE_SYNC_MAX_EMAILS_PER_RUN` | `50` | Target number of matching PAVE emails queued per automatic run. |

## IMAP

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAP_MAILBOX` | `INBOX` | Folder opened for search/fetch. Set explicitly if PAVE mail lives elsewhere. |

## Report processing (Stage B)

| Variable | Default | Description |
|----------|---------|-------------|
| `REPORT_PORTAL_USERNAME` | — | PAVE dashboard login (required for Playwright fallback). |
| `REPORT_PORTAL_PASSWORD` | — | PAVE dashboard password. |
| `REPORT_PORTAL_LOGIN_URL` | _(optional)_ | **Not used for navigation.** Sync opens each **report URL** from email; the site redirects to login when needed. You can remove this from `.env`. |
| `REPORT_PORTAL_DOWNLOAD_TIMEOUT_MS` | `60000` | Timeouts for navigation, PDF button, and download. |
| `PAVE_PORTAL_DEBUG` | `false` | Set `true` to save screenshots + HTML under `backend-uploads/pave-portal-debug/` on portal failures (including PDF button not found when HTML summary succeeded). |
| `PAVE_HTML_SUMMARY_SNAPSHOT_ON_FAIL` | `false` | When `true`, saves `backend-uploads/pave-html-extract-debug/*.html` if core DOM fields (date/VIN/vehicle) are all missing after the report shell loads. |
| `PAVE_REPORT_PROCESS_CONCURRENCY` | `3` | Concurrent report jobs (1–8). One Playwright browser/context; cookies shared across pages. |
| `PAVE_REPORT_PROCESS_MAX_PER_RUN` | `limit` or `100` | Cap pending rows processed per sync (max 5000). |

## Logs & API

- `[pave-email]` logs: Gmail/IMAP query, pages, candidate counts, fetch timings.
- `[pave-portal]` logs: browser start, login when the report URL shows the login form, `sessionReuseCount` when the session is already valid, summary on close.
- `[pave-sync] timings summary` — structured stage timings.
- **Backfill** API response includes `gmailQuery`, `pagesFetched`, `listMatchCount`, IMAP `imapMailbox` / `imapSearch` / `imapScannedIds`, `historicalSearchMs`, and `timings` (including `totalPipelineMs` when applicable).

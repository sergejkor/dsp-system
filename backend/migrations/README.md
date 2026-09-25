# Database migrations

Run SQL files in order against your PostgreSQL database (e.g. in pgAdmin or `psql`).

- **001_add_daily_uploads_file_content.sql** — adds `file_content BYTEA` to `daily_uploads` so uploaded Excel files are stored in the database.

- **013_ev_monitoring.sql** — sanitized live EV-check history and idempotent per-Berlin-day Slack delivery state. Configure provider browser profiles outside the repository; see `docs/ev-monitoring.md`.

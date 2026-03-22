-- Store uploaded Excel file binary in daily_uploads (run once on existing DB)
ALTER TABLE daily_uploads
  ADD COLUMN IF NOT EXISTS file_content BYTEA;

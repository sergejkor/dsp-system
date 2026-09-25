CREATE TABLE IF NOT EXISTS car_planning_daily_excels (
  plan_date DATE PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_content BYTEA NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS car_planning_daily_excels_expiry
  ON car_planning_daily_excels (expires_at);

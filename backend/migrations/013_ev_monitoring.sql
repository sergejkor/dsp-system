CREATE TABLE IF NOT EXISTS ev_monitoring_checks (
  id BIGSERIAL PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('page', 'scheduled', 'startup')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  rivian_status TEXT NOT NULL,
  geotab_status TEXT NOT NULL,
  vehicle_count INTEGER NOT NULL DEFAULT 0,
  below_threshold_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  result_json JSONB NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ev_monitoring_checks_created_at_idx ON ev_monitoring_checks (created_at DESC);

CREATE TABLE IF NOT EXISTS ev_monitoring_slack_deliveries (
  service_date DATE PRIMARY KEY,
  check_id BIGINT REFERENCES ev_monitoring_checks(id),
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

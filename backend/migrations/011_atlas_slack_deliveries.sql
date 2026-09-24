CREATE TABLE IF NOT EXISTS atlas_slack_deliveries (
  service_date DATE PRIMARY KEY,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'sending', 'failed', 'sent')),
  payload_hash VARCHAR(64),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error VARCHAR(64),
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK ((status = 'sent' AND sent_at IS NOT NULL) OR (status <> 'sent' AND sent_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_atlas_slack_deliveries_status
  ON atlas_slack_deliveries (status, service_date);

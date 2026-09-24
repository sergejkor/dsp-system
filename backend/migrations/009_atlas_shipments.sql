CREATE TABLE IF NOT EXISTS atlas_shipments (
  id SERIAL PRIMARY KEY,
  incoming_email_id INT NOT NULL REFERENCES incoming_emails(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  tracking_id VARCHAR(64) NOT NULL,
  route_code VARCHAR(128) NOT NULL,
  transporter_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT atlas_shipments_service_date_tracking_id_key UNIQUE (service_date, tracking_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_shipments_service_date ON atlas_shipments (service_date);
CREATE INDEX IF NOT EXISTS idx_atlas_shipments_route_code ON atlas_shipments (route_code);
CREATE INDEX IF NOT EXISTS idx_atlas_shipments_incoming_email_id ON atlas_shipments (incoming_email_id);
CREATE INDEX IF NOT EXISTS idx_atlas_shipments_service_date_route ON atlas_shipments (service_date, route_code);

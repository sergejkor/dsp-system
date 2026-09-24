CREATE TABLE IF NOT EXISTS atlas_route_assignments (
  id SERIAL PRIMARY KEY,
  service_date DATE NOT NULL,
  route_code VARCHAR(128) NOT NULL,
  driver_name VARCHAR(255),
  match_status VARCHAR(16) NOT NULL CHECK (match_status IN ('MATCHED', 'UNMATCHED', 'AMBIGUOUS')),
  matched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_route_assignments_date_route_key UNIQUE (service_date, route_code),
  CONSTRAINT atlas_route_assignments_match_fields_check CHECK (
    (match_status = 'MATCHED' AND driver_name IS NOT NULL AND BTRIM(driver_name) <> '' AND matched_at IS NOT NULL)
    OR (match_status IN ('UNMATCHED', 'AMBIGUOUS') AND driver_name IS NULL AND matched_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_atlas_route_assignments_service_date
  ON atlas_route_assignments (service_date);
CREATE INDEX IF NOT EXISTS idx_atlas_route_assignments_status
  ON atlas_route_assignments (match_status);

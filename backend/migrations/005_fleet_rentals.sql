CREATE TABLE IF NOT EXISTS fleet_rental_details (
  car_id INTEGER PRIMARY KEY REFERENCES cars(id) ON DELETE CASCADE,
  daily_rate NUMERIC(12,2) CHECK (daily_rate >= 0),
  daily_km NUMERIC(12,2) CHECK (daily_km >= 0),
  odometer_start NUMERIC(12,2) CHECK (odometer_start >= 0),
  odometer_end NUMERIC(12,2) CHECK (odometer_end >= odometer_start),
  extra_km_rate NUMERIC(12,4) CHECK (extra_km_rate >= 0),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

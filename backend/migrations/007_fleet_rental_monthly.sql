ALTER TABLE fleet_rental_details ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12,2) CHECK (monthly_rate >= 0);
ALTER TABLE fleet_rental_details ADD COLUMN IF NOT EXISTS monthly_km NUMERIC(12,2) CHECK (monthly_km >= 0);

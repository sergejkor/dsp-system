ALTER TABLE fleet_rental_details ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) CHECK (total_price >= 0);
ALTER TABLE fleet_rental_details ADD COLUMN IF NOT EXISTS total_km NUMERIC(12,2) CHECK (total_km >= 0);

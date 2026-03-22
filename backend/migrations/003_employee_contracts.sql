-- Contract history per Kenjo employee (start and end of each contract)
CREATE TABLE IF NOT EXISTS employee_contracts (
  id SERIAL PRIMARY KEY,
  kenjo_employee_id VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_kenjo_id ON employee_contracts (kenjo_employee_id);

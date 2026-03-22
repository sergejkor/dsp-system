-- Table for ignored Cortex vs Kenjo conflicts (one row per user+day)
CREATE TABLE IF NOT EXISTS kenjo_ignored_conflicts (
  id SERIAL PRIMARY KEY,
  conflict_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kenjo_ignored_conflict_key ON kenjo_ignored_conflicts (conflict_key);

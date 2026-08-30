-- Widen gold purchase weight to 4 decimal places (0.0001 g resolution).
-- Safe on existing data: numeric(12,3) → numeric(12,4) preserves all values.
-- Apply manually when TYPEORM_SYNC=false (e.g. Railway PostgreSQL).

ALTER TABLE gold_purchases
  ALTER COLUMN weight_grams TYPE NUMERIC(12, 4);

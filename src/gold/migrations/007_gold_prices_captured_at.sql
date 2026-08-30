-- Phase 3: intraday screenshot price snapshots
-- Apply manually when TYPEORM_SYNC=false.

ALTER TABLE gold_prices
  ADD COLUMN IF NOT EXISTS captured_price_at TIMESTAMPTZ NULL;

ALTER TABLE gold_prices
  DROP CONSTRAINT IF EXISTS uq_gold_prices_user_date_source;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_prices_manual_user_date
  ON gold_prices (user_id, price_date, source)
  WHERE source = 'MANUAL';

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_prices_screenshot_user_captured
  ON gold_prices (user_id, captured_price_at, source)
  WHERE source = 'SCREENSHOT' AND captured_price_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gold_prices_user_captured_at
  ON gold_prices (user_id, captured_price_at DESC NULLS LAST);

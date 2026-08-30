-- Phase 3: Public Gold GAP price screenshot capture sessions
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS gold_price_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  pg_buy_price_per_gram_cents INT NULL,
  pg_sell_price_per_gram_cents INT NULL,
  captured_price_at TIMESTAMPTZ NULL,
  price_date DATE NULL,
  warnings JSONB NULL,
  extraction_error TEXT NULL,
  confirmed_gold_price_id UUID NULL REFERENCES gold_prices(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gold_price_captures_user_created
  ON gold_price_captures (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gold_price_captures_user_status
  ON gold_price_captures (user_id, status);

CREATE TABLE IF NOT EXISTS gold_price_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES gold_price_captures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side VARCHAR(8) NOT NULL,
  screen_type VARCHAR(16) NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size_bytes INT NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  extracted_pg_price_per_gram_cents INT NULL,
  extracted_updated_at TIMESTAMPTZ NULL,
  extraction_status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  extraction_error TEXT NULL,
  warnings JSONB NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gold_price_screenshots_side CHECK (side IN ('BUY', 'SELL')),
  CONSTRAINT uq_gold_price_screenshots_capture_side UNIQUE (capture_id, side)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_price_screenshots_user_sha256
  ON gold_price_screenshots (user_id, sha256_hash);

CREATE INDEX IF NOT EXISTS idx_gold_price_screenshots_capture
  ON gold_price_screenshots (capture_id);

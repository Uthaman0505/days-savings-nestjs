-- Phase 5 BTC market intelligence. Read-only Luno candles. No orders.
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS luno_btc_market_candles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair VARCHAR(16) NOT NULL,
  "interval" VARCHAR(8) NOT NULL,
  candle_time TIMESTAMPTZ NOT NULL,
  open NUMERIC(28, 18) NOT NULL,
  high NUMERIC(28, 18) NOT NULL,
  low NUMERIC(28, 18) NOT NULL,
  close NUMERIC(28, 18) NOT NULL,
  volume NUMERIC(28, 18) NOT NULL,
  source VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_btc_market_candles UNIQUE (pair, "interval", candle_time, source)
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_market_candles_pair_interval_time
  ON luno_btc_market_candles (pair, "interval", candle_time DESC);

CREATE TABLE IF NOT EXISTS luno_btc_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculated_at TIMESTAMPTZ NOT NULL,
  pair VARCHAR(16) NOT NULL,
  current_price_myr NUMERIC(28, 18) NULL,
  direction VARCHAR(16) NOT NULL,
  buying_condition VARCHAR(16) NOT NULL,
  stability VARCHAR(16) NOT NULL,
  confidence VARCHAR(16) NOT NULL,
  short_trend_pct NUMERIC(28, 18) NULL,
  medium_trend_pct NUMERIC(28, 18) NULL,
  drawdown_from_recent_high_pct NUMERIC(28, 18) NULL,
  volatility_pct NUMERIC(28, 18) NULL,
  momentum_value NUMERIC(28, 18) NULL,
  sma20_myr NUMERIC(28, 18) NULL,
  sma50_myr NUMERIC(28, 18) NULL,
  recent_high_myr NUMERIC(28, 18) NULL,
  recent_low_myr NUMERIC(28, 18) NULL,
  market_score NUMERIC(28, 18) NULL,
  reason_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source VARCHAR(32) NOT NULL,
  latest_candle_at TIMESTAMPTZ NULL,
  market_data_age_minutes NUMERIC(28, 18) NULL,
  market_context_status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_market_snapshots_calculated
  ON luno_btc_market_snapshots (pair, calculated_at DESC);

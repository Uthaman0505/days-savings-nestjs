-- Phase 7 BTC harvest guidance. Advisory only — no Luno sell/order/withdraw.
-- Apply manually when TYPEORM_SYNC=false.
-- Reuses luno_btc_money_buckets; does not duplicate bucket storage.

CREATE TABLE IF NOT EXISTS luno_btc_harvest_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_harvest_profit_pct NUMERIC(28, 18) NOT NULL,
  second_harvest_profit_pct NUMERIC(28, 18) NOT NULL,
  high_harvest_profit_pct NUMERIC(28, 18) NOT NULL,
  first_harvest_profit_fraction NUMERIC(28, 18) NOT NULL,
  second_harvest_profit_fraction NUMERIC(28, 18) NOT NULL,
  high_harvest_profit_fraction NUMERIC(28, 18) NOT NULL,
  protected_profit_pct NUMERIC(28, 18) NOT NULL,
  reinvestment_reserve_pct NUMERIC(28, 18) NOT NULL,
  minimum_core_pct NUMERIC(28, 18) NOT NULL,
  minimum_harvest_myr NUMERIC(28, 18) NOT NULL,
  estimated_sell_fee_myr NUMERIC(28, 18) NOT NULL DEFAULT 0,
  minimum_btc_sale NUMERIC(28, 18) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_btc_harvest_settings_user UNIQUE (user_id),
  CONSTRAINT chk_luno_btc_harvest_settings_min_harvest CHECK (minimum_harvest_myr > 0),
  CONSTRAINT chk_luno_btc_harvest_settings_core CHECK (
    minimum_core_pct > 0 AND minimum_core_pct < 100
  ),
  CONSTRAINT chk_luno_btc_harvest_settings_fee CHECK (estimated_sell_fee_myr >= 0)
);

CREATE TABLE IF NOT EXISTS luno_btc_harvest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  trigger_price_myr NUMERIC(28, 18) NULL,
  open_average_price_myr NUMERIC(28, 18) NULL,
  profit_pct NUMERIC(28, 18) NULL,
  suggested_harvest_myr NUMERIC(28, 18) NULL,
  suggested_btc_to_sell NUMERIC(28, 18) NULL,
  status VARCHAR(16) NOT NULL,
  reason_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NULL,
  acted_at TIMESTAMPTZ NULL,
  matched_transaction_ref VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_luno_btc_harvest_events_status CHECK (
    status IN ('OPEN', 'ACTED', 'EXPIRED', 'SUPERSEDED')
  )
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_harvest_events_user_status
  ON luno_btc_harvest_events (user_id, status, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_luno_btc_harvest_events_user_triggered
  ON luno_btc_harvest_events (user_id, triggered_at DESC);

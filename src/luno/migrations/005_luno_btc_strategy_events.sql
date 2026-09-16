-- Phase 4 BTC buy-decision events. Advisory only — no Luno orders.
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS luno_btc_strategy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_month DATE NOT NULL,
  action VARCHAR(32) NOT NULL,
  zone VARCHAR(32) NOT NULL,
  source VARCHAR(16) NULL,
  suggested_amount_myr NUMERIC(28, 18) NULL,
  current_price_myr NUMERIC(28, 18) NULL,
  average_buy_price_myr NUMERIC(28, 18) NULL,
  price_difference_pct NUMERIC(28, 18) NULL,
  monthly_remaining_before_myr NUMERIC(28, 18) NULL,
  expected_remaining_after_myr NUMERIC(28, 18) NULL,
  luno_myr_available_myr NUMERIC(28, 18) NULL,
  top_up_needed_myr NUMERIC(28, 18) NULL,
  status VARCHAR(16) NOT NULL,
  reason_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NULL,
  acted_at TIMESTAMPTZ NULL,
  matched_transaction_ref VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_luno_btc_strategy_events_status CHECK (
    status IN ('OPEN', 'ACTED', 'EXPIRED', 'SUPERSEDED')
  )
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_strategy_events_user_month
  ON luno_btc_strategy_events (user_id, budget_month, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_luno_btc_strategy_events_user_status
  ON luno_btc_strategy_events (user_id, status, triggered_at DESC);

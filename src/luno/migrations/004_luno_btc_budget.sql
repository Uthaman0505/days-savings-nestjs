-- Phase 3 monthly BTC budget and lifetime money-bucket ledger.
-- Apply manually when TYPEORM_SYNC=false.
-- Does not change Phase 1/2 Luno sync or FIFO accounting tables.

CREATE TABLE IF NOT EXISTS luno_btc_monthly_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_month DATE NOT NULL,
  monthly_budget_myr NUMERIC(28, 18) NOT NULL,
  normal_buy_allocation_myr NUMERIC(28, 18) NULL,
  dip_reserve_allocation_myr NUMERIC(28, 18) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_btc_monthly_budgets_user_month UNIQUE (user_id, budget_month),
  CONSTRAINT chk_luno_btc_monthly_budgets_positive CHECK (monthly_budget_myr > 0)
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_monthly_budgets_user_id
  ON luno_btc_monthly_budgets (user_id);

CREATE INDEX IF NOT EXISTS idx_luno_btc_monthly_budgets_user_month
  ON luno_btc_monthly_budgets (user_id, budget_month DESC);

CREATE TABLE IF NOT EXISTS luno_btc_money_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket_type VARCHAR(32) NOT NULL,
  amount_myr NUMERIC(28, 18) NOT NULL,
  source_reference VARCHAR(128) NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_luno_btc_money_buckets_amount_positive CHECK (amount_myr > 0),
  CONSTRAINT chk_luno_btc_money_buckets_type CHECK (
    bucket_type IN ('PROTECTED_PROFIT', 'REINVESTMENT_RESERVE')
  )
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_money_buckets_user_type
  ON luno_btc_money_buckets (user_id, bucket_type, created_at DESC);

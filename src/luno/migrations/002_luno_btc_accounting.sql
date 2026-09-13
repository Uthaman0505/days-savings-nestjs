-- Phase 2 derived BTC accounting. Never stores Luno API secrets.
-- Rebuild replaces these rows; raw luno_* Phase 1 tables are untouched.

CREATE TABLE IF NOT EXISTS luno_btc_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_transaction_id UUID NULL,
  reference VARCHAR(64) NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  origin VARCHAR(16) NOT NULL,
  btc_quantity_original NUMERIC(28, 18) NOT NULL,
  btc_quantity_remaining NUMERIC(28, 18) NOT NULL,
  myr_cost_original NUMERIC(28, 18) NOT NULL,
  myr_cost_remaining NUMERIC(28, 18) NOT NULL,
  fee_myr NUMERIC(28, 18) NOT NULL,
  effective_cost_myr NUMERIC(28, 18) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_lots_acquired_at
  ON luno_btc_lots (acquired_at);

CREATE TABLE IF NOT EXISTS luno_btc_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_transaction_id UUID NULL,
  reference VARCHAR(64) NULL,
  disposed_at TIMESTAMPTZ NOT NULL,
  kind VARCHAR(16) NOT NULL,
  btc_quantity NUMERIC(28, 18) NOT NULL,
  gross_proceeds_myr NUMERIC(28, 18) NOT NULL,
  fee_myr NUMERIC(28, 18) NOT NULL,
  net_proceeds_myr NUMERIC(28, 18) NOT NULL,
  cost_basis_myr NUMERIC(28, 18) NOT NULL,
  realised_pnl_myr NUMERIC(28, 18) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_disposals_disposed_at
  ON luno_btc_disposals (disposed_at);

CREATE TABLE IF NOT EXISTS luno_btc_disposal_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposal_id UUID NOT NULL REFERENCES luno_btc_disposals(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES luno_btc_lots(id) ON DELETE CASCADE,
  btc_quantity_consumed NUMERIC(28, 18) NOT NULL,
  cost_basis_consumed_myr NUMERIC(28, 18) NOT NULL
);

CREATE TABLE IF NOT EXISTS luno_btc_accounting_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculated_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL,
  cost_basis_method VARCHAR(16) NOT NULL,
  btc_quantity NUMERIC(28, 18) NOT NULL,
  btc_market_price_myr NUMERIC(28, 18) NULL,
  current_value_myr NUMERIC(28, 18) NULL,
  money_put_in_myr NUMERIC(28, 18) NOT NULL,
  remaining_cost_basis_myr NUMERIC(28, 18) NOT NULL,
  average_buy_price_myr NUMERIC(28, 18) NULL,
  realised_pnl_myr NUMERIC(28, 18) NOT NULL,
  unrealised_pnl_myr NUMERIC(28, 18) NULL,
  lifetime_pnl_myr NUMERIC(28, 18) NULL,
  principal_recovered_myr NUMERIC(28, 18) NOT NULL,
  principal_recovery_pct NUMERIC(28, 18) NULL,
  reconciliation_status VARCHAR(32) NOT NULL,
  reconciliation_difference_btc NUMERIC(28, 18) NOT NULL,
  portfolio_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_snapshots_calculated_at
  ON luno_btc_accounting_snapshots (calculated_at DESC);

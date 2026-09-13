-- Luno Phase 1 read-only sync tables.
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS luno_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(16) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  btc_account_id VARCHAR(64) NULL,
  myr_account_id VARCHAR(64) NULL,
  accounts_upserted INT NOT NULL DEFAULT 0,
  transactions_upserted INT NOT NULL DEFAULT 0,
  orders_upserted INT NOT NULL DEFAULT 0,
  withdrawals_upserted INT NOT NULL DEFAULT 0,
  transfers_upserted INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luno_sync_runs_started_at
  ON luno_sync_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS luno_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  luno_account_id VARCHAR(64) NOT NULL,
  asset VARCHAR(16) NOT NULL,
  name VARCHAR(120) NULL,
  account_type VARCHAR(64) NULL,
  balance NUMERIC(28, 18) NOT NULL DEFAULT 0,
  reserved NUMERIC(28, 18) NOT NULL DEFAULT 0,
  unconfirmed NUMERIC(28, 18) NOT NULL DEFAULT 0,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_accounts_account_id UNIQUE (luno_account_id)
);

CREATE TABLE IF NOT EXISTS luno_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES luno_sync_runs(id) ON DELETE CASCADE,
  luno_account_id VARCHAR(64) NOT NULL,
  asset VARCHAR(16) NOT NULL,
  balance NUMERIC(28, 18) NOT NULL DEFAULT 0,
  reserved NUMERIC(28, 18) NOT NULL DEFAULT 0,
  unconfirmed NUMERIC(28, 18) NOT NULL DEFAULT 0,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_balances_run_account UNIQUE (sync_run_id, luno_account_id)
);

CREATE TABLE IF NOT EXISTS luno_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  luno_account_id VARCHAR(64) NOT NULL,
  row_index BIGINT NOT NULL,
  reference VARCHAR(64) NULL,
  currency VARCHAR(16) NOT NULL,
  kind VARCHAR(32) NULL,
  description TEXT NULL,
  balance NUMERIC(28, 18) NOT NULL DEFAULT 0,
  balance_delta NUMERIC(28, 18) NOT NULL,
  available NUMERIC(28, 18) NOT NULL DEFAULT 0,
  available_delta NUMERIC(28, 18) NOT NULL DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_transactions_account_row UNIQUE (luno_account_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_luno_transactions_account_ts
  ON luno_transactions (luno_account_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS luno_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  luno_order_id VARCHAR(64) NOT NULL,
  pair VARCHAR(16) NOT NULL,
  type VARCHAR(16) NOT NULL,
  state VARCHAR(16) NOT NULL,
  base_amount NUMERIC(28, 18) NOT NULL,
  counter_amount NUMERIC(28, 18) NOT NULL,
  fee_base NUMERIC(28, 18) NOT NULL,
  fee_counter NUMERIC(28, 18) NOT NULL,
  limit_price NUMERIC(28, 18) NULL,
  created_at_luno TIMESTAMPTZ NOT NULL,
  completed_at_luno TIMESTAMPTZ NULL,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_orders_order_id UNIQUE (luno_order_id)
);

CREATE INDEX IF NOT EXISTS idx_luno_orders_pair_created
  ON luno_orders (pair, created_at_luno DESC);

CREATE TABLE IF NOT EXISTS luno_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  luno_withdrawal_id VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL,
  amount NUMERIC(28, 18) NOT NULL,
  fee NUMERIC(28, 18) NULL,
  status VARCHAR(32) NULL,
  type VARCHAR(64) NULL,
  transfer_id VARCHAR(64) NULL,
  created_at_luno TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_withdrawals_id UNIQUE (luno_withdrawal_id)
);

CREATE TABLE IF NOT EXISTS luno_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  luno_transfer_id VARCHAR(64) NOT NULL,
  luno_account_id VARCHAR(64) NOT NULL,
  amount NUMERIC(28, 18) NOT NULL,
  fee NUMERIC(28, 18) NULL,
  inbound BOOLEAN NOT NULL,
  chain_tx_id VARCHAR(128) NULL,
  created_at_luno TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_transfers_id UNIQUE (luno_transfer_id)
);

CREATE INDEX IF NOT EXISTS idx_luno_transfers_account
  ON luno_transfers (luno_account_id);

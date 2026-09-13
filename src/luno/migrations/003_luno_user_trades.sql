-- Phase 2B user trades from GET /api/1/listtrades (Perm_R_Orders).
-- Derived accounting still rebuilds from raw Luno tables; this is source data.

CREATE TABLE IF NOT EXISTS luno_user_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair VARCHAR(16) NOT NULL,
  sequence BIGINT NOT NULL,
  luno_order_id VARCHAR(64) NULL,
  type VARCHAR(16) NOT NULL,
  is_buy BOOLEAN NOT NULL,
  base NUMERIC(28, 18) NOT NULL,
  counter NUMERIC(28, 18) NOT NULL,
  fee_base NUMERIC(28, 18) NOT NULL,
  fee_counter NUMERIC(28, 18) NOT NULL,
  price NUMERIC(28, 18) NULL,
  traded_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_user_trades_pair_seq UNIQUE (pair, sequence)
);

ALTER TABLE luno_btc_accounting_snapshots
  ALTER COLUMN status TYPE VARCHAR(32);

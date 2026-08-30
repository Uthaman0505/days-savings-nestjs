-- Gold Investment module schema (PostgreSQL)
-- Apply manually when TYPEORM_SYNC=false, or use synchronize in development.
--
-- Public Gold terminology:
--   pg_sell_price_per_gram_cents = PG SELLS to customer (acquisition price)
--   pg_buy_price_per_gram_cents  = PG BUYS from customer (liquidation / valuation)

CREATE TABLE IF NOT EXISTS gold_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_date DATE NOT NULL,
  weight_grams NUMERIC(12, 4) NOT NULL,
  amount_paid_cents INT NOT NULL,
  price_per_gram_cents INT NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  reference_number VARCHAR(100) NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gold_purchases_weight_positive CHECK (weight_grams > 0),
  CONSTRAINT chk_gold_purchases_amount_positive CHECK (amount_paid_cents > 0),
  CONSTRAINT chk_gold_purchases_price_positive CHECK (price_per_gram_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_gold_purchases_user_id
  ON gold_purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_gold_purchases_user_purchase_date
  ON gold_purchases (user_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_gold_purchases_user_active
  ON gold_purchases (user_id, is_active);

CREATE TABLE IF NOT EXISTS gold_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_date DATE NOT NULL,
  pg_buy_price_per_gram_cents INT NOT NULL,
  pg_sell_price_per_gram_cents INT NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gold_prices_user_date_source UNIQUE (user_id, price_date, source),
  CONSTRAINT chk_gold_prices_buy_positive CHECK (pg_buy_price_per_gram_cents > 0),
  CONSTRAINT chk_gold_prices_sell_positive CHECK (pg_sell_price_per_gram_cents > 0),
  CONSTRAINT chk_gold_prices_spread CHECK (
    pg_sell_price_per_gram_cents >= pg_buy_price_per_gram_cents
  )
);

CREATE INDEX IF NOT EXISTS idx_gold_prices_user_id
  ON gold_prices (user_id);
CREATE INDEX IF NOT EXISTS idx_gold_prices_user_price_date
  ON gold_prices (user_id, price_date DESC);

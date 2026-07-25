-- Pawn Loan module schema (PostgreSQL)
-- Apply manually when TYPEORM_SYNC=false, or use synchronize in development.

CREATE TABLE IF NOT EXISTS pawn_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pawn_shop_name VARCHAR(120) NOT NULL,
  receipt_number VARCHAR(64) NOT NULL,
  principal_amount_cents INT NOT NULL,
  outstanding_principal_cents INT NOT NULL,
  interest_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  interest_type VARCHAR(32) NOT NULL DEFAULT 'FLAT',
  loan_term_months INT NOT NULL DEFAULT 6,
  grace_period_days INT NOT NULL DEFAULT 14,
  loan_start_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  grace_period_end_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  currency VARCHAR(3) NOT NULL DEFAULT 'MYR',
  remarks TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_pawn_loans_user_receipt UNIQUE (user_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_pawn_loans_user_id ON pawn_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_pawn_loans_status ON pawn_loans(status);
CREATE INDEX IF NOT EXISTS idx_pawn_loans_maturity_date ON pawn_loans(maturity_date);

CREATE TABLE IF NOT EXISTS pawn_collaterals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pawn_loan_id UUID NOT NULL REFERENCES pawn_loans(id) ON DELETE CASCADE,
  item_type VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  owner_name VARCHAR(120) NOT NULL,
  estimated_value_cents INT NOT NULL,
  weight NUMERIC(12,3) NULL,
  quantity INT NOT NULL DEFAULT 1,
  serial_number VARCHAR(120) NULL,
  image_urls JSONB NULL,
  current_status VARCHAR(32) NOT NULL DEFAULT 'HELD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pawn_collaterals_pawn_loan_id ON pawn_collaterals(pawn_loan_id);

CREATE TABLE IF NOT EXISTS pawn_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pawn_loan_id UUID NOT NULL REFERENCES pawn_loans(id) ON DELETE CASCADE,
  payment_type VARCHAR(32) NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  principal_paid_cents INT NOT NULL DEFAULT 0,
  interest_paid_cents INT NOT NULL DEFAULT 0,
  total_paid_cents INT NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  reference_number VARCHAR(120) NULL,
  remarks TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pawn_payments_pawn_loan_id ON pawn_payments(pawn_loan_id);

CREATE TABLE IF NOT EXISTS pawn_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pawn_loan_id UUID NOT NULL REFERENCES pawn_loans(id) ON DELETE CASCADE,
  renewal_date TIMESTAMPTZ NOT NULL,
  previous_maturity_date DATE NOT NULL,
  new_maturity_date DATE NOT NULL,
  interest_paid_cents INT NOT NULL DEFAULT 0,
  principal_reduction_cents INT NOT NULL DEFAULT 0,
  remarks TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pawn_renewals_pawn_loan_id ON pawn_renewals(pawn_loan_id);

CREATE TABLE IF NOT EXISTS pawn_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pawn_loan_id UUID NOT NULL REFERENCES pawn_loans(id) ON DELETE CASCADE,
  transaction_type VARCHAR(32) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  payload JSONB NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pawn_transactions_pawn_loan_id ON pawn_transactions(pawn_loan_id);

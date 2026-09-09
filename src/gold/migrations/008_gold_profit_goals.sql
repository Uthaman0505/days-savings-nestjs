-- Phase 5A: Gold profit goal (protected capital model)
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS gold_profit_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_profit_cents INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  achieved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gold_profit_goals_target_positive CHECK (target_profit_cents > 0),
  CONSTRAINT chk_gold_profit_goals_status CHECK (
    status IN ('ACTIVE', 'ACHIEVED', 'CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_gold_profit_goals_user_id
  ON gold_profit_goals (user_id);

CREATE INDEX IF NOT EXISTS idx_gold_profit_goals_user_status
  ON gold_profit_goals (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_profit_goals_one_active
  ON gold_profit_goals (user_id)
  WHERE is_active = TRUE AND status = 'ACTIVE';

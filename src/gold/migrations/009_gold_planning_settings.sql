-- Phase 6A: Gold planning settings (monthly budget for goal-based buy/wait/hold)
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS gold_planning_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monthly_budget_cents INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gold_planning_settings_budget_positive
    CHECK (monthly_budget_cents > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_planning_settings_user_id
  ON gold_planning_settings (user_id);

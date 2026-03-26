-- Year reset rollout script (PostgreSQL)
-- Adds challenge_year columns, backfills using Malaysia timezone (UTC+8),
-- and rebuilds unique indexes to include challenge_year.

BEGIN;

ALTER TABLE completed_challenges
  ADD COLUMN IF NOT EXISTS challenge_year INT;

UPDATE completed_challenges
SET challenge_year = EXTRACT(YEAR FROM (completed_at AT TIME ZONE 'Asia/Kuala_Lumpur'))::INT
WHERE challenge_year IS NULL;

ALTER TABLE completed_challenges
  ALTER COLUMN challenge_year SET NOT NULL;

DROP INDEX IF EXISTS idx_completed_challenges_user_total_days;
CREATE UNIQUE INDEX IF NOT EXISTS idx_completed_challenges_user_total_days_year
  ON completed_challenges (user_id, total_days, challenge_year);

ALTER TABLE give_up_challenges
  ADD COLUMN IF NOT EXISTS challenge_year INT;

UPDATE give_up_challenges
SET challenge_year = EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Asia/Kuala_Lumpur'))::INT
WHERE challenge_year IS NULL;

ALTER TABLE give_up_challenges
  ALTER COLUMN challenge_year SET NOT NULL;

DROP INDEX IF EXISTS idx_give_up_challenges_user_total_days;
CREATE UNIQUE INDEX IF NOT EXISTS idx_give_up_challenges_user_total_days_year
  ON give_up_challenges (user_id, total_days, challenge_year);

CREATE TABLE IF NOT EXISTS yearly_challenge_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_saving_plan_id UUID NOT NULL,
  from_year INT NOT NULL,
  to_year INT NOT NULL,
  transferred_cents INT NOT NULL DEFAULT 0,
  reason VARCHAR(64) NOT NULL,
  notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yearly_challenge_resets_user_created
  ON yearly_challenge_resets (user_id, created_at);

COMMIT;

-- Phase 2: a confirmed monthly BTC budget may be RM0.
-- Do not apply this file to production.
-- Existing rows are unchanged. There is no backfill.
--
-- The entity declares chk_luno_btc_monthly_budgets_nonnegative.
-- That name must match: while TYPEORM_SYNC=true, TypeORM drops check
-- constraints that are not declared on the entity.
-- Apply this file before the new revision boots. If the nonnegative
-- constraint already exists, skip the ADD below.

ALTER TABLE luno_btc_monthly_budgets
  DROP CONSTRAINT IF EXISTS chk_luno_btc_monthly_budgets_positive;

ALTER TABLE luno_btc_monthly_budgets
  ADD CONSTRAINT chk_luno_btc_monthly_budgets_nonnegative
  CHECK (monthly_budget_myr >= 0);

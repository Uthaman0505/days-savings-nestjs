-- Mission Control tables (apply manually when TYPEORM_SYNC is disabled)
-- Matches nest/src/mission-control/*.entity.ts

CREATE TABLE IF NOT EXISTS salary_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key varchar(7) NOT NULL,
  salary_amount_cents int NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'MYR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_key)
);

CREATE TABLE IF NOT EXISTS salary_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_plan_id uuid NOT NULL REFERENCES salary_plans(id) ON DELETE CASCADE,
  category varchar(32) NOT NULL,
  amount_cents int NOT NULL DEFAULT 0,
  percent_share numeric(8,4) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salary_plan_id, category)
);

CREATE TABLE IF NOT EXISTS debt_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type varchar(32) NOT NULL,
  source_id uuid NOT NULL,
  debt_name varchar(120) NOT NULL,
  outstanding_cents int NOT NULL DEFAULT 0,
  original_amount_cents int NOT NULL DEFAULT 0,
  interest_rate numeric(8,4) NOT NULL DEFAULT 0,
  minimum_payment_cents int NOT NULL DEFAULT 0,
  current_payment_cents int NOT NULL DEFAULT 0,
  priority_rank int NOT NULL DEFAULT 1,
  status varchar(32) NOT NULL DEFAULT 'QUEUED',
  priority_method varchar(32) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'MYR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS financial_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(160) NOT NULL,
  description text,
  mission_kind varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'ACTIVE',
  debt_priority_id uuid,
  goal_id uuid,
  sort_order int NOT NULL DEFAULT 0,
  progress_percent int NOT NULL DEFAULT 0,
  target_amount_cents int NOT NULL DEFAULT 0,
  current_amount_cents int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key varchar(7) NOT NULL,
  salary_cents int NOT NULL DEFAULT 0,
  cash_available_cents int NOT NULL DEFAULT 0,
  total_debt_cents int NOT NULL DEFAULT 0,
  debt_paid_cents int NOT NULL DEFAULT 0,
  expenses_cents int NOT NULL DEFAULT 0,
  income_cents int NOT NULL DEFAULT 0,
  savings_cents int NOT NULL DEFAULT 0,
  remaining_cash_cents int NOT NULL DEFAULT 0,
  health_score int NOT NULL DEFAULT 0,
  health_band varchar(32) NOT NULL DEFAULT 'FAIR',
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_key)
);

CREATE TABLE IF NOT EXISTS projection_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  monthly_extra_payment_cents int NOT NULL DEFAULT 0,
  priority_method varchar(32) NOT NULL DEFAULT 'AVALANCHE',
  currency varchar(3) NOT NULL DEFAULT 'MYR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

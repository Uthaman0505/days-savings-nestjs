import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, 'migrations/009_gold_planning_settings.sql'),
  'utf8',
);

describe('009_gold_planning_settings.sql', () => {
  it('creates gold_planning_settings with entity-matching types and constraints', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gold_planning_settings');
    expect(sql).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sql).toContain(
      'user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE',
    );
    expect(sql).toContain('monthly_budget_cents INT NOT NULL');
    expect(sql).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    expect(sql).toContain('updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    expect(sql).toContain(
      'CONSTRAINT chk_gold_planning_settings_budget_positive',
    );
    expect(sql).toContain('CHECK (monthly_budget_cents > 0)');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_planning_settings_user_id',
    );
    expect(sql).toContain('ON gold_planning_settings (user_id)');
    expect(sql).not.toMatch(/ALTER TABLE gold_purchases/);
    expect(sql).not.toMatch(/ALTER TABLE gold_prices/);
    expect(sql).not.toMatch(/ALTER TABLE gold_profit_goals/);
  });
});

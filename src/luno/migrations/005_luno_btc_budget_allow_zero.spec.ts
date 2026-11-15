import { readFileSync } from 'fs';
import { join } from 'path';
import {
  dropDisposableDatabase,
  lunoTestDataSource,
  recreateDisposableDatabase,
} from '../luno-test-postgres';

const PROBE = `luno_v2a_p2_migration_${process.pid}`;

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.replace(/--.*$/gm, '').trim())
    .filter((part) => part.length > 0);
}

describe('005 monthly budget allows RM0', () => {
  const admin = lunoTestDataSource('postgres');

  beforeAll(async () => {
    await admin.initialize();
    await recreateDisposableDatabase(admin, PROBE);
  });

  afterAll(async () => {
    if (admin.isInitialized) {
      await dropDisposableDatabase(admin, PROBE);
      await admin.destroy();
    }
  });

  it('keeps existing rows and unrelated checks while accepting RM0', async () => {
    const db = lunoTestDataSource(PROBE);
    await db.initialize();
    try {
      await db.query(`CREATE TABLE users (id UUID PRIMARY KEY)`);
      const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
      await db.query(`INSERT INTO users (id) VALUES ($1)`, [userId]);
      const schema = readFileSync(
        join(__dirname, '004_luno_btc_budget.sql'),
        'utf8',
      );
      for (const statement of statements(schema)) {
        await db.query(statement);
      }
      await db.query(
        `INSERT INTO luno_btc_monthly_budgets
          (user_id, budget_month, monthly_budget_myr, normal_buy_allocation_myr, dip_reserve_allocation_myr)
         VALUES ($1, '2026-10-01', 100, 20, 30)`,
        [userId],
      );
      await expect(
        db.query(
          `INSERT INTO luno_btc_monthly_budgets (user_id, budget_month, monthly_budget_myr)
           VALUES ($1, '2026-11-01', 0)`,
          [userId],
        ),
      ).rejects.toThrow(/chk_luno_btc_monthly_budgets_positive/);
      await expect(
        db.query(
          `INSERT INTO luno_btc_monthly_budgets (user_id, budget_month, monthly_budget_myr)
           VALUES ($1, '2026-11-01', -1)`,
          [userId],
        ),
      ).rejects.toThrow(/chk_luno_btc_monthly_budgets_positive/);

      const migration = readFileSync(
        join(__dirname, '005_luno_btc_budget_allow_zero.sql'),
        'utf8',
      );
      for (const statement of statements(migration)) {
        await db.query(statement);
      }

      const kept = await db.query(
        `SELECT monthly_budget_myr::text AS amount,
                normal_buy_allocation_myr::text AS normal,
                dip_reserve_allocation_myr::text AS dip
         FROM luno_btc_monthly_budgets
         WHERE budget_month = '2026-10-01'`,
      );
      expect(Number(kept[0].amount)).toBe(100);
      expect(Number(kept[0].normal)).toBe(20);
      expect(Number(kept[0].dip)).toBe(30);

      await db.query(
        `INSERT INTO luno_btc_monthly_budgets (user_id, budget_month, monthly_budget_myr)
         VALUES ($1, '2026-11-01', 0)`,
        [userId],
      );
      await expect(
        db.query(
          `INSERT INTO luno_btc_monthly_budgets (user_id, budget_month, monthly_budget_myr)
           VALUES ($1, '2026-12-01', -1)`,
          [userId],
        ),
      ).rejects.toThrow(/chk_luno_btc_monthly_budgets_nonnegative/);
      await expect(
        db.query(
          `INSERT INTO luno_btc_monthly_budgets (user_id, budget_month, monthly_budget_myr)
           VALUES ($1, '2026-11-01', 20)`,
          [userId],
        ),
      ).rejects.toThrow(/uq_luno_btc_monthly_budgets_user_month/);
      await expect(
        db.query(
          `INSERT INTO luno_btc_money_buckets (user_id, bucket_type, amount_myr)
           VALUES ($1, 'PROTECTED_PROFIT', 0)`,
          [userId],
        ),
      ).rejects.toThrow(/chk_luno_btc_money_buckets_amount_positive/);
      await expect(
        db.query(
          `INSERT INTO luno_btc_money_buckets (user_id, bucket_type, amount_myr)
           VALUES ($1, 'OTHER', 10)`,
          [userId],
        ),
      ).rejects.toThrow(/chk_luno_btc_money_buckets_type/);

      const checks = await db.query(
        `SELECT conname
         FROM pg_constraint
         WHERE conrelid = 'luno_btc_monthly_budgets'::regclass
         ORDER BY conname`,
      );
      const names = checks.map((row: { conname: string }) => row.conname);
      expect(names).toContain('chk_luno_btc_monthly_budgets_nonnegative');
      expect(names).toContain('uq_luno_btc_monthly_budgets_user_month');
      expect(names).not.toContain('chk_luno_btc_monthly_budgets_positive');
    } finally {
      await db.destroy();
    }
  });
});

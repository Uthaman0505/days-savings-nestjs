import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import os from 'os';
import { DataSource, type Repository } from 'typeorm';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import {
  conditionalBudgetUpdate,
  LunoBtcBudgetService,
} from './luno-btc-budget.service';
import { User } from '../user/user.entity';

const PROBE = `luno_v2a_p1_concurrency_${process.pid}`;
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const WHEN = new Date('2026-11-09T04:00:00.000Z');

function source(database: string): DataSource {
  return new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    username: os.userInfo().username,
    database,
    entities: [User, LunoBtcMonthlyBudget],
    synchronize: false,
    logging: false,
  });
}

function serviceFor(
  budgets: Repository<LunoBtcMonthlyBudget>,
): LunoBtcBudgetService {
  return new LunoBtcBudgetService(
    budgets,
    { find: async () => [] } as never,
    {
      getSpendContext: async () => ({
        accountingStatus: 'READY',
        classifiedEvents: [],
      }),
    } as never,
    { getHealth: async () => ({ myrAvailableBalance: '0' }) } as never,
  );
}

describe('Luno budget conditional writes on local Postgres', () => {
  let admin: DataSource;
  let db: DataSource;
  let available = true;

  beforeAll(async () => {
    try {
      admin = source('postgres');
      await admin.initialize();
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [PROBE],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${PROBE}"`);
      await admin.query(`CREATE DATABASE "${PROBE}"`);
      db = source(PROBE);
      await db.initialize();
      await db.query(`
        CREATE TABLE luno_btc_monthly_budgets (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL,
          budget_month date NOT NULL,
          monthly_budget_myr numeric(28,18) NOT NULL,
          normal_buy_allocation_myr numeric(28,18),
          dip_reserve_allocation_myr numeric(28,18),
          status varchar(32) NOT NULL DEFAULT 'ACTIVE',
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          UNIQUE (user_id, budget_month)
        )
      `);
    } catch (error) {
      available = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Local Postgres concurrency probe failed: ${message}`);
    }
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.destroy();
    }
    if (admin?.isInitialized) {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [PROBE],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${PROBE}"`);
      await admin.destroy();
    }
  });

  beforeEach(async () => {
    if (!available) {
      return;
    }
    await db.query('DELETE FROM luno_btc_monthly_budgets');
  });

  async function stored(): Promise<LunoBtcMonthlyBudget> {
    return db.getRepository(LunoBtcMonthlyBudget).findOneByOrFail({
      userId: USER_ID,
    });
  }

  it('keeps the 2 Nov clock when a sleeve edit wins, and the later amount write does not land', async () => {
    const budgets = db.getRepository(LunoBtcMonthlyBudget);
    await serviceFor(budgets).upsertCurrentBudget(
      USER_ID,
      { monthlyBudgetMyr: '100' },
      WHEN,
    );
    const observed = await stored();
    const original = observed.updatedAt.toISOString();
    const sleeve = await conditionalBudgetUpdate(budgets, observed, {
      monthlyBudgetMyr: observed.monthlyBudgetMyr,
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '40',
    }).execute();
    const amount = await conditionalBudgetUpdate(budgets, observed, {
      monthlyBudgetMyr: '200',
      normalBuyAllocationMyr: '80',
      dipReserveAllocationMyr: null,
    }).execute();
    const row = await stored();

    expect(sleeve.affected).toBe(1);
    expect(amount.affected).toBe(0);
    expect(row.updatedAt.toISOString()).toBe(original);
    expect(Number(row.monthlyBudgetMyr)).toBe(100);
    expect(Number(row.normalBuyAllocationMyr)).toBe(50);
    expect(Number(row.dipReserveAllocationMyr)).toBe(40);
  });

  it('keeps a newer amount when it wins, and the stale sleeve write does not restore the old clock', async () => {
    const budgets = db.getRepository(LunoBtcMonthlyBudget);
    await serviceFor(budgets).upsertCurrentBudget(
      USER_ID,
      { monthlyBudgetMyr: '100' },
      WHEN,
    );
    const observed = await stored();
    const amount = await conditionalBudgetUpdate(budgets, observed, {
      monthlyBudgetMyr: '200',
      normalBuyAllocationMyr: '80',
      dipReserveAllocationMyr: null,
    }).execute();
    const sleeve = await conditionalBudgetUpdate(budgets, observed, {
      monthlyBudgetMyr: observed.monthlyBudgetMyr,
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '40',
    }).execute();
    const row = await stored();

    expect(amount.affected).toBe(1);
    expect(sleeve.affected).toBe(0);
    expect(row.updatedAt.getTime()).toBeGreaterThan(
      observed.updatedAt.getTime(),
    );
    expect(Number(row.monthlyBudgetMyr)).toBe(200);
    expect(Number(row.normalBuyAllocationMyr)).toBe(80);
    expect(row.dipReserveAllocationMyr).toBeNull();
  });

  it('does not let a second sleeve edit with the same timestamp overwrite the first', async () => {
    const budgets = db.getRepository(LunoBtcMonthlyBudget);
    await serviceFor(budgets).upsertCurrentBudget(
      USER_ID,
      { monthlyBudgetMyr: '100' },
      WHEN,
    );
    const observed = await stored();
    const first = await conditionalBudgetUpdate(budgets, observed, {
      monthlyBudgetMyr: observed.monthlyBudgetMyr,
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '40',
    }).execute();
    const second = await conditionalBudgetUpdate(budgets, observed, {
      monthlyBudgetMyr: observed.monthlyBudgetMyr,
      normalBuyAllocationMyr: '30',
      dipReserveAllocationMyr: '20',
    }).execute();
    const row = await stored();

    expect(first.affected).toBe(1);
    expect(second.affected).toBe(0);
    expect(row.updatedAt.toISOString()).toBe(observed.updatedAt.toISOString());
    expect(Number(row.normalBuyAllocationMyr)).toBe(50);
    expect(Number(row.dipReserveAllocationMyr)).toBe(40);
  });

  it('returns a conflict from overlapping service saves and keeps exactly one write', async () => {
    const firstDb = source(PROBE);
    const secondDb = source(PROBE);
    await firstDb.initialize();
    await secondDb.initialize();
    try {
      const firstRepo = firstDb.getRepository(LunoBtcMonthlyBudget);
      const secondRepo = secondDb.getRepository(LunoBtcMonthlyBudget);
      await serviceFor(firstRepo).upsertCurrentBudget(
        USER_ID,
        { monthlyBudgetMyr: '100' },
        WHEN,
      );
      const original = (await stored()).updatedAt.toISOString();
      let arrived = 0;
      let release: () => void = () => undefined;
      const bothRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      for (const repo of [firstRepo, secondRepo]) {
        const originalFind = repo.findOne.bind(repo);
        repo.findOne = (async (options: never) => {
          const row = await originalFind(options);
          arrived += 1;
          if (arrived === 2) {
            release();
          }
          if (arrived <= 2) {
            await bothRead;
          }
          return row;
        }) as typeof repo.findOne;
      }
      const [sleeve, amount] = await Promise.allSettled([
        serviceFor(firstRepo).upsertCurrentBudget(
          USER_ID,
          {
            monthlyBudgetMyr: '100',
            normalBuyAllocationMyr: '50',
            dipReserveAllocationMyr: '40',
          },
          WHEN,
        ),
        serviceFor(secondRepo).upsertCurrentBudget(
          USER_ID,
          { monthlyBudgetMyr: '200', normalBuyAllocationMyr: '80' },
          WHEN,
        ),
      ]);
      const row = await stored();
      const fulfilled = [sleeve, amount].filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = [sleeve, amount].filter(
        (result) => result.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      const sleeveWon = Number(row.monthlyBudgetMyr) === 100;
      if (sleeveWon) {
        expect(row.updatedAt.toISOString()).toBe(original);
        expect(Number(row.normalBuyAllocationMyr)).toBe(50);
        expect(Number(row.dipReserveAllocationMyr)).toBe(40);
      } else {
        expect(row.updatedAt.toISOString()).not.toBe(original);
        expect(Number(row.monthlyBudgetMyr)).toBe(200);
        expect(Number(row.normalBuyAllocationMyr)).toBe(80);
        expect(row.dipReserveAllocationMyr).toBeNull();
      }
    } finally {
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  it('keeps one value when two first confirmations race', async () => {
    const admin = source('postgres');
    const firstDb = source(CONFIRM_PROBE);
    const secondDb = source(CONFIRM_PROBE);
    try {
      await admin.initialize();
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [CONFIRM_PROBE],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${CONFIRM_PROBE}"`);
      await admin.query(`CREATE DATABASE "${CONFIRM_PROBE}"`);
      await admin.destroy();
      await firstDb.initialize();
      await secondDb.initialize();
      await firstDb.query(BUDGET_TABLE);
      const outcome = await raceFirstConfirmations(
        firstDb.getRepository(LunoBtcMonthlyBudget),
        secondDb.getRepository(LunoBtcMonthlyBudget),
        '80',
        '120',
      );
      expect(outcome.stored).toMatch(/^(80|120)(\.0+)?$/);
      expect(outcome.rejected).toBeInstanceOf(ConflictException);
      const again = await firstDb.query(
        `SELECT monthly_budget_myr::text AS amount FROM luno_btc_monthly_budgets`,
      );
      expect(again).toHaveLength(1);
    } finally {
      await closeProbe(admin, firstDb, secondDb);
    }
  });

  it('does not mix a concurrent RM0 confirmation with a positive one', async () => {
    const admin = source('postgres');
    const firstDb = source(CONFIRM_PROBE);
    const secondDb = source(CONFIRM_PROBE);
    try {
      await admin.initialize();
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [CONFIRM_PROBE],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${CONFIRM_PROBE}"`);
      await admin.query(`CREATE DATABASE "${CONFIRM_PROBE}"`);
      await admin.destroy();
      await firstDb.initialize();
      await secondDb.initialize();
      await firstDb.query(BUDGET_TABLE);
      const outcome = await raceFirstConfirmations(
        firstDb.getRepository(LunoBtcMonthlyBudget),
        secondDb.getRepository(LunoBtcMonthlyBudget),
        '0',
        '50',
      );
      expect(['0', '50']).toContain(Number(outcome.stored).toString());
      expect(outcome.rejected).toBeInstanceOf(ConflictException);
      const rows = await firstDb.query(
        `SELECT monthly_budget_myr::text AS amount FROM luno_btc_monthly_budgets`,
      );
      expect(rows).toHaveLength(1);
      expect(
        Number(rows[0].amount) === 0 || Number(rows[0].amount) === 50,
      ).toBe(true);
    } finally {
      await closeProbe(admin, firstDb, secondDb);
    }
  });
});

async function closeProbe(
  admin: DataSource,
  firstDb: DataSource,
  secondDb: DataSource,
): Promise<void> {
  if (firstDb.isInitialized) await firstDb.destroy();
  if (secondDb.isInitialized) await secondDb.destroy();
  if (admin.isInitialized) await admin.destroy();
  const cleanup = source('postgres');
  await cleanup.initialize();
  await cleanup.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [CONFIRM_PROBE],
  );
  await cleanup.query(`DROP DATABASE IF EXISTS "${CONFIRM_PROBE}"`);
  await cleanup.destroy();
}

const CONFIRM_PROBE = `luno_v2a_p2_confirm_${process.pid}`;

const BUDGET_TABLE = `
  CREATE TABLE luno_btc_monthly_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    budget_month DATE NOT NULL,
    monthly_budget_myr NUMERIC(28, 18) NOT NULL,
    normal_buy_allocation_myr NUMERIC(28, 18) NULL,
    dip_reserve_allocation_myr NUMERIC(28, 18) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_luno_btc_monthly_budgets_user_month UNIQUE (user_id, budget_month)
  )
`;

async function raceFirstConfirmations(
  firstRepo: Repository<LunoBtcMonthlyBudget>,
  secondRepo: Repository<LunoBtcMonthlyBudget>,
  left: string,
  right: string,
): Promise<{ stored: string; rejected: unknown }> {
  let arrived = 0;
  let release: () => void = () => undefined;
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  for (const repo of [firstRepo, secondRepo]) {
    const originalFind = repo.findOne.bind(repo);
    repo.findOne = (async (options: never) => {
      const row = await originalFind(options);
      arrived += 1;
      if (arrived === 2) {
        release();
      }
      if (arrived <= 2) {
        await bothRead;
      }
      return row;
    }) as typeof repo.findOne;
  }
  const [one, two] = await Promise.allSettled([
    serviceFor(firstRepo).upsertCurrentBudget(
      USER_ID,
      { monthlyBudgetMyr: left },
      WHEN,
    ),
    serviceFor(secondRepo).upsertCurrentBudget(
      USER_ID,
      { monthlyBudgetMyr: right },
      WHEN,
    ),
  ]);
  const fulfilled = [one, two].filter((item) => item.status === 'fulfilled');
  const rejected = [one, two].filter((item) => item.status === 'rejected');
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  const stored = await firstRepo.findOne({ where: { userId: USER_ID } });
  return {
    stored: stored?.monthlyBudgetMyr ?? '',
    rejected: rejected[0].reason,
  };
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ClassifiedEvent } from './accounting/luno-btc.types';
import { LunoBtcMoneyBucket } from './entities/luno-btc-money-bucket.entity';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoHealthService } from './luno-health.service';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function copyBudget(
  row: LunoBtcMonthlyBudget | undefined,
): LunoBtcMonthlyBudget | null {
  if (!row) {
    return null;
  }
  return { ...row, updatedAt: new Date(row.updatedAt) };
}

function moneyEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }
  return Number(left) === Number(right);
}

function buy(partial: {
  occurredAt: Date;
  myrAmount: string;
  btcQuantity?: string;
  reference?: string;
}): ClassifiedEvent {
  return {
    classification: 'BTC_BUY',
    occurredAt: partial.occurredAt,
    reference: partial.reference ?? 'buy',
    sourceTransactionIds: ['1'],
    btcQuantity: partial.btcQuantity ?? '0.0001',
    btcDirection: 'IN',
    myrAmount: partial.myrAmount,
    feeMyr: '0',
    feeMyrReported: '0',
    feeBtc: null,
    feeStatus: 'EXACT',
    feeSource: 'INSTANT_DETAILS',
    feeTreatment: 'EMBEDDED',
    tradeChannel: 'INSTANT',
    derivationNote: null,
    warning: null,
    excludedAsset: null,
  };
}

function sell(occurredAt: Date, myrAmount: string): ClassifiedEvent {
  return {
    ...buy({
      occurredAt,
      myrAmount,
      btcQuantity: '0.00005',
      reference: 'sell',
    }),
    classification: 'BTC_SELL',
    btcDirection: 'OUT',
  };
}

describe('LunoBtcBudgetService', () => {
  const budgetRows: LunoBtcMonthlyBudget[] = [];
  const bucketRows: LunoBtcMoneyBucket[] = [];
  let events: ClassifiedEvent[] = [];
  let accountingStatus: 'READY' | 'PARTIAL' = 'READY';
  let myrAvailable = '14.37';
  let saveClock = NOW;
  let beforeConditionalUpdate: (() => void) | null = null;
  let service: LunoBtcBudgetService;

  const budgetsRepo = {
    findOne: jest.fn(
      async ({ where }: { where: { userId: string; budgetMonth: string } }) =>
        copyBudget(
          budgetRows.find(
            (row) =>
              row.userId === where.userId &&
              row.budgetMonth === where.budgetMonth,
          ),
        ),
    ),
    find: jest.fn(async ({ where }: { where: { userId: string } }) =>
      budgetRows
        .filter((row) => row.userId === where.userId)
        .sort((a, b) => b.budgetMonth.localeCompare(a.budgetMonth)),
    ),
    create: jest.fn((row: Partial<LunoBtcMonthlyBudget>) => row),
    save: jest.fn(async (row: LunoBtcMonthlyBudget) => {
      const saved = {
        ...row,
        id: row.id ?? `b-${budgetRows.length + 1}`,
        status: row.status ?? 'ACTIVE',
        createdAt: row.createdAt ?? saveClock,
        updatedAt: saveClock,
      } as LunoBtcMonthlyBudget;
      const index = budgetRows.findIndex(
        (item) =>
          item.userId === saved.userId &&
          item.budgetMonth === saved.budgetMonth,
      );
      if (index >= 0) {
        budgetRows[index] = saved;
      } else {
        budgetRows.push(saved);
      }
      return saved;
    }),
    update: jest.fn(
      async (id: string, partial: Partial<LunoBtcMonthlyBudget>) => {
        const row = budgetRows.find((item) => item.id === id);
        if (!row) {
          return { affected: 0 };
        }
        Object.assign(row, partial);
        if (partial.updatedAt === undefined) {
          row.updatedAt = saveClock;
        }
        return { affected: 1 };
      },
    ),
    createQueryBuilder: jest.fn(() => {
      const clauses: Array<{ sql: string; params?: Record<string, unknown> }> =
        [];
      let values: Partial<LunoBtcMonthlyBudget> = {};
      const builder = {
        update: () => builder,
        set: (next: Partial<LunoBtcMonthlyBudget>) => {
          values = next;
          return builder;
        },
        where: (sql: string, params?: Record<string, unknown>) => {
          clauses.push({ sql, params });
          return builder;
        },
        andWhere: (sql: string, params?: Record<string, unknown>) => {
          clauses.push({ sql, params });
          return builder;
        },
        execute: async () => {
          beforeConditionalUpdate?.();
          const params = Object.assign(
            {},
            ...clauses.map((clause) => clause.params ?? {}),
          ) as {
            id?: string;
            observedUpdatedAt?: Date;
            observedMonthlyBudgetMyr?: string;
            observedNormal?: string;
            observedDip?: string;
          };
          const row = budgetRows.find((item) => item.id === params.id);
          if (!row || !params.observedUpdatedAt) {
            return { affected: 0 };
          }
          const sql = clauses.map((clause) => clause.sql).join('\n');
          const normalMatches = sql.includes(
            '"normal_buy_allocation_myr" IS NULL',
          )
            ? row.normalBuyAllocationMyr == null
            : moneyEqual(row.normalBuyAllocationMyr, params.observedNormal);
          const dipMatches = sql.includes(
            '"dip_reserve_allocation_myr" IS NULL',
          )
            ? row.dipReserveAllocationMyr == null
            : moneyEqual(row.dipReserveAllocationMyr, params.observedDip);
          const matches =
            row.updatedAt.getTime() === params.observedUpdatedAt.getTime() &&
            moneyEqual(row.monthlyBudgetMyr, params.observedMonthlyBudgetMyr) &&
            normalMatches &&
            dipMatches;
          if (!matches) {
            return { affected: 0 };
          }
          Object.assign(row, values);
          if (values.updatedAt === undefined) {
            row.updatedAt = saveClock;
          }
          return { affected: 1 };
        },
      };
      return builder;
    }),
  };

  const bucketsRepo = {
    find: jest.fn(async ({ where }: { where: { userId: string } }) =>
      bucketRows.filter((row) => row.userId === where.userId),
    ),
    create: jest.fn((row: Partial<LunoBtcMoneyBucket>) => row),
    save: jest.fn(async (row: LunoBtcMoneyBucket) => {
      const saved = {
        id: `k-${bucketRows.length + 1}`,
        createdAt: NOW,
        ...row,
      } as LunoBtcMoneyBucket;
      bucketRows.push(saved);
      return saved;
    }),
  };

  beforeEach(async () => {
    budgetRows.length = 0;
    bucketRows.length = 0;
    saveClock = NOW;
    beforeConditionalUpdate = null;
    accountingStatus = 'READY';
    myrAvailable = '14.37';
    events = [
      buy({
        occurredAt: new Date('2026-09-14T00:00:00.000Z'),
        myrAmount: '30',
        btcQuantity: '0.00009336',
        reference: 'sep-30',
      }),
      buy({
        occurredAt: new Date('2026-09-16T01:42:45.418Z'),
        myrAmount: '20',
        btcQuantity: '0.00006301',
        reference: 'sep-20',
      }),
      sell(new Date('2026-09-10T00:00:00.000Z'), '80'),
      {
        ...buy({
          occurredAt: new Date('2026-09-12T00:00:00.000Z'),
          myrAmount: '10',
          reference: 'eth',
        }),
        classification: 'EXCLUDED_ASSET',
        excludedAsset: 'ETH',
        btcQuantity: '0',
        myrAmount: '0',
      },
    ];
    const module = await Test.createTestingModule({
      providers: [
        LunoBtcBudgetService,
        {
          provide: getRepositoryToken(LunoBtcMonthlyBudget),
          useValue: budgetsRepo,
        },
        {
          provide: getRepositoryToken(LunoBtcMoneyBucket),
          useValue: bucketsRepo,
        },
        {
          provide: LunoBtcAccountingService,
          useValue: {
            getSpendContext: async () => ({
              accountingStatus,
              classifiedEvents: events,
              currentMonth: {
                month: '2026-09',
                purchaseTotalMyr: '50',
                buyCount: 2,
                btcReceived: '0.00015637',
                latestBuyAt: '2026-09-16T01:42:45.418Z',
              },
            }),
          },
        },
        {
          provide: LunoHealthService,
          useValue: {
            getHealth: async () => ({ myrAvailableBalance: myrAvailable }),
          },
        },
      ],
    }).compile();
    service = module.get(LunoBtcBudgetService);
  });

  it('creates one budget per user/month and derives used from BTC buys', async () => {
    const created = await service.upsertCurrentBudget(
      'user-a',
      {
        monthlyBudgetMyr: '100',
        normalBuyAllocationMyr: '50',
        dipReserveAllocationMyr: '50',
      },
      NOW,
    );
    expect(created.month).toBe('2026-09');
    expect(created.monthlyBudgetMyr).toBe('100.00');
    expect(created.usedMyr).toBe('50.00');
    expect(created.remainingMyr).toBe('50.00');
    expect(created.maxAllowedNewSpendMyr).toBe('50.00');
    expect(created.status).toBe('WITHIN_BUDGET');
    expect(created.buyCount).toBe(2);
    expect(created.btcReceived).toBe('0.00015637');
    expect(created.lunoMyrAvailableMyr).toBe('14.37');
    expect(created.normalBuyUsedMyr).toBeNull();
    expect(created.dipReserveUsedMyr).toBeNull();
    expect(budgetRows).toHaveLength(1);
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      NOW,
    );
    expect(budgetRows).toHaveLength(1);
  });

  it('returns NOT_CONFIGURED without inventing a budget', async () => {
    const saves = budgetsRepo.save.mock.calls.length;
    const updates = budgetsRepo.update.mock.calls.length;
    const writes = budgetsRepo.createQueryBuilder.mock.calls.length;
    const view = await service.getCurrentBudget('user-a', NOW);
    expect(view.status).toBe('NOT_CONFIGURED');
    expect(view.confirmed).toBe(false);
    expect(view.displayState).toBe('NOT_CONFIRMED');
    expect(view.monthlyBudgetMyr).toBeNull();
    expect(view.suggestedBudget).toBeNull();
    expect(view.usedMyr).toBe('50.00');
    expect(view.maxAllowedNewSpendMyr).toBe('0.00');
    expect(budgetsRepo.save.mock.calls.length).toBe(saves);
    expect(budgetsRepo.update.mock.calls.length).toBe(updates);
    expect(budgetsRepo.createQueryBuilder.mock.calls.length).toBe(writes);
  });

  it('marks LIMIT_REACHED and OVER_BUDGET from real used amount', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '50' },
      NOW,
    );
    expect((await service.getCurrentBudget('user-a', NOW)).status).toBe(
      'LIMIT_REACHED',
    );
    const over = await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '40' },
      NOW,
    );
    expect(over.status).toBe('OVER_BUDGET');
    expect(over.displayState).toBe('EXHAUSTED');
    expect(over.confirmed).toBe(true);
    expect(over.remainingMyr).toBe('0.00');
    expect(over.maxAllowedNewSpendMyr).toBe('0.00');
    expect(over.usedMyr).toBe('50.00');
  });

  it('isolates budgets and money buckets by user', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      NOW,
    );
    await service.upsertCurrentBudget(
      'user-b',
      { monthlyBudgetMyr: '200' },
      NOW,
    );
    expect(
      (await service.getCurrentBudget('user-a', NOW)).monthlyBudgetMyr,
    ).toBe('100.00');
    expect(
      (await service.getCurrentBudget('user-b', NOW)).monthlyBudgetMyr,
    ).toBe('200.00');
    await service.allocateMoneyBucket('user-a', {
      bucketType: 'PROTECTED_PROFIT',
      amountMyr: '10',
    });
    expect((await service.getMoneyBuckets('user-a')).protectedProfitMyr).toBe(
      '10.00',
    );
    expect((await service.getMoneyBuckets('user-b')).protectedProfitMyr).toBe(
      '0.00',
    );
  });

  it('preserves the previous month after rollover', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '80' },
      new Date('2026-08-20T00:00:00.000Z'),
    );
    const september = await service.getCurrentBudget('user-a', NOW);
    expect(september.status).toBe('NOT_CONFIGURED');
    expect(september.confirmed).toBe(false);
    expect(september.monthlyBudgetMyr).toBeNull();
    expect(september.suggestedBudget).toEqual({
      month: '2026-08',
      monthlyBudgetMyr: '80.00',
      normalBuyAllocationMyr: null,
      dipReserveAllocationMyr: null,
    });
    const history = await service.getBudgetHistory('user-a');
    expect(history).toEqual([
      {
        month: '2026-08',
        budgetMyr: '80.00',
        usedMyr: '0.00',
        remainingMyr: '80.00',
        status: 'WITHIN_BUDGET',
      },
    ]);
  });

  it('tracks protected profit and reinvestment reserve without spending Luno cash', async () => {
    await service.allocateMoneyBucket('user-a', {
      bucketType: 'PROTECTED_PROFIT',
      amountMyr: '60',
      note: 'Protected after future harvest',
    });
    await service.allocateMoneyBucket('user-a', {
      bucketType: 'REINVESTMENT_RESERVE',
      amountMyr: '40',
    });
    const buckets = await service.getMoneyBuckets('user-a');
    expect(buckets.protectedProfitMyr).toBe('60.00');
    expect(buckets.reinvestmentReserveMyr).toBe('40.00');
    expect(buckets.lunoMyrAvailableMyr).toBe('14.37');
  });

  it('keeps MYR available separate from budget remaining', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      NOW,
    );
    const view = await service.getCurrentBudget('user-a', NOW);
    expect(view.remainingMyr).toBe('50.00');
    expect(view.lunoMyrAvailableMyr).toBe('14.37');
    expect(view.remainingMyr).not.toBe(view.lunoMyrAvailableMyr);
  });

  it('exposes getMaxAllowedNewBtcSpend as remaining budget', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      NOW,
    );
    await expect(service.getMaxAllowedNewBtcSpend('user-a', NOW)).resolves.toBe(
      '50.00',
    );
  });

  it('refuses strategy money readiness unless accounting is READY and remaining > 0', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      NOW,
    );
    expect(
      (await service.getStrategyContext('user-a', NOW)).strategyMoneyReady,
    ).toBe(true);
    accountingStatus = 'PARTIAL';
    expect(
      (await service.getStrategyContext('user-a', NOW)).strategyMoneyReady,
    ).toBe(false);
  });

  it('keeps the amount-revision clock when only the sleeves change', async () => {
    const amountSavedAt = new Date('2026-11-02T02:00:00.000Z');
    saveClock = amountSavedAt;
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      new Date('2026-11-02T02:00:00.000Z'),
    );
    saveClock = new Date('2026-11-06T02:00:00.000Z');
    await service.upsertCurrentBudget(
      'user-a',
      {
        monthlyBudgetMyr: '100.00',
        normalBuyAllocationMyr: '50',
        dipReserveAllocationMyr: '40',
      },
      new Date('2026-11-06T02:00:00.000Z'),
    );
    expect(budgetRows[0].updatedAt).toEqual(amountSavedAt);
    expect(budgetsRepo.createQueryBuilder).toHaveBeenCalled();
    expect(budgetRows[0].normalBuyAllocationMyr).toBe('50');
    expect(budgetRows[0].dipReserveAllocationMyr).toBe('40');
    expect(budgetRows[0].monthlyBudgetMyr).toBe('100');
  });

  it('moves the amount-revision clock when the monthly amount changes', async () => {
    saveClock = new Date('2026-11-02T02:00:00.000Z');
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      new Date('2026-11-02T02:00:00.000Z'),
    );
    const revisedAt = new Date('2026-11-06T02:00:00.000Z');
    saveClock = revisedAt;
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '200', normalBuyAllocationMyr: '80' },
      new Date('2026-11-06T02:00:00.000Z'),
    );
    expect(budgetRows[0].updatedAt).toEqual(revisedAt);
    expect(budgetRows[0].monthlyBudgetMyr).toBe('200');
    expect(budgetRows[0].normalBuyAllocationMyr).toBe('80');
  });

  it('rejects a sleeve write after the monthly amount has changed', async () => {
    const amountSavedAt = new Date('2026-11-02T02:00:00.000Z');
    saveClock = amountSavedAt;
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100' },
      new Date('2026-11-02T02:00:00.000Z'),
    );
    const revisedAt = new Date('2026-11-06T02:00:00.000Z');
    beforeConditionalUpdate = () => {
      budgetRows[0].monthlyBudgetMyr = '200';
      budgetRows[0].updatedAt = revisedAt;
    };
    await expect(
      service.upsertCurrentBudget(
        'user-a',
        {
          monthlyBudgetMyr: '100',
          normalBuyAllocationMyr: '50',
          dipReserveAllocationMyr: '40',
        },
        new Date('2026-11-09T02:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(budgetRows[0].monthlyBudgetMyr).toBe('200');
    expect(budgetRows[0].updatedAt).toEqual(revisedAt);
    expect(budgetRows[0].normalBuyAllocationMyr).toBeNull();
    expect(budgetRows[0].dipReserveAllocationMyr).toBeNull();
  });

  it('confirms RM0 and the example budgets without using a suggestion as the cap', async () => {
    const november = new Date('2026-11-09T04:00:00.000Z');
    await service.upsertCurrentBudget(
      'user-a',
      {
        monthlyBudgetMyr: '100',
        normalBuyAllocationMyr: '20',
        dipReserveAllocationMyr: '30',
      },
      NOW,
    );
    const unconfirmed = await service.getCurrentBudget('user-a', november);
    expect(unconfirmed.confirmed).toBe(false);
    expect(unconfirmed.monthlyBudgetMyr).toBeNull();
    expect(unconfirmed.maxAllowedNewSpendMyr).toBe('0.00');
    expect(unconfirmed.suggestedBudget?.monthlyBudgetMyr).toBe('100.00');
    const zero = await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '0' },
      november,
    );
    expect(zero.confirmed).toBe(true);
    expect(zero.monthlyBudgetMyr).toBe('0.00');
    expect(zero.displayState).toBe('RM0_STOP');
    expect(zero.remainingMyr).toBe('0.00');
    expect(zero.suggestedBudget?.month).toBe('2026-09');
    for (const amount of ['20', '50', '100', '200']) {
      const view = await service.upsertCurrentBudget(
        'user-a',
        { monthlyBudgetMyr: amount },
        november,
      );
      expect(view.confirmed).toBe(true);
      expect(view.monthlyBudgetMyr).toBe(`${amount}.00`);
      expect(view.remainingMyr).toBe(`${amount}.00`);
      expect(view.displayState).toBe('CONFIRMED');
    }
  });

  it('requires confirmation again after the Kuala Lumpur month changes', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '100', normalBuyAllocationMyr: '40' },
      new Date('2026-10-31T15:30:00.000Z'),
    );
    const stillOctober = await service.getCurrentBudget(
      'user-a',
      new Date('2026-10-31T15:30:00.000Z'),
    );
    const november = await service.getCurrentBudget(
      'user-a',
      new Date('2026-10-31T16:00:00.000Z'),
    );
    expect(stillOctober.confirmed).toBe(true);
    expect(stillOctober.month).toBe('2026-10');
    expect(stillOctober.monthlyBudgetMyr).toBe('100.00');
    expect(november.confirmed).toBe(false);
    expect(november.month).toBe('2026-11');
    expect(november.monthlyBudgetMyr).toBeNull();
    expect(november.displayState).toBe('NOT_CONFIRMED');
    expect(november.suggestedBudget).toEqual({
      month: '2026-10',
      monthlyBudgetMyr: '100.00',
      normalBuyAllocationMyr: '40.00',
      dipReserveAllocationMyr: null,
    });
    const savesBefore = budgetsRepo.save.mock.calls.length;
    await service.getCurrentBudget(
      'user-a',
      new Date('2026-10-31T16:00:00.000Z'),
    );
    expect(budgetsRepo.save.mock.calls.length).toBe(savesBefore);
  });

  it('does not let PATCH confirm a month from the previous suggestion', async () => {
    await service.upsertCurrentBudget(
      'user-a',
      {
        monthlyBudgetMyr: '100',
        normalBuyAllocationMyr: '20',
        dipReserveAllocationMyr: '30',
      },
      NOW,
    );
    const november = new Date('2026-11-09T04:00:00.000Z');
    await expect(
      service.patchCurrentBudget(
        'user-a',
        {
          monthlyBudgetMyr: '100',
          normalBuyAllocationMyr: '20',
          dipReserveAllocationMyr: '30',
        },
        november,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const view = await service.getCurrentBudget('user-a', november);
    expect(view.confirmed).toBe(false);
    expect(view.monthlyBudgetMyr).toBeNull();
    expect(view.suggestedBudget?.monthlyBudgetMyr).toBe('100.00');
    expect(
      budgetRows.filter((row) => row.budgetMonth.startsWith('2026-11')),
    ).toHaveLength(0);
    const confirmed = await service.upsertCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '0' },
      november,
    );
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.monthlyBudgetMyr).toBe('0.00');
    const revised = await service.patchCurrentBudget(
      'user-a',
      { monthlyBudgetMyr: '20' },
      november,
    );
    expect(revised.monthlyBudgetMyr).toBe('20.00');
    expect(revised.confirmed).toBe(true);
  });

  it('turns a positive-budget database check into a clear RM0 error', async () => {
    budgetsRepo.save.mockRejectedValueOnce({ code: '23514' });
    await expect(
      service.upsertCurrentBudget('user-a', { monthlyBudgetMyr: '0' }, NOW),
    ).rejects.toThrow(
      'RM0 could not be saved because the database still requires a positive monthly budget.',
    );
    expect(budgetRows).toHaveLength(0);
  });

  it('rejects a negative or non-finite confirmation', async () => {
    await expect(
      service.upsertCurrentBudget('user-a', { monthlyBudgetMyr: '-5' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upsertCurrentBudget(
        'user-a',
        { monthlyBudgetMyr: 'Infinity' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(budgetRows).toHaveLength(0);
  });

  it('rejects allocation that exceeds monthly budget', async () => {
    await expect(
      service.upsertCurrentBudget(
        'user-a',
        {
          monthlyBudgetMyr: '100',
          normalBuyAllocationMyr: '80',
          dipReserveAllocationMyr: '30',
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

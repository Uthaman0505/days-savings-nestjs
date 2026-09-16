import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ClassifiedEvent } from './accounting/luno-btc.types';
import { LunoBtcMoneyBucket } from './entities/luno-btc-money-bucket.entity';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoHealthService } from './luno-health.service';

const NOW = new Date('2026-09-16T12:00:00.000Z');

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
  let service: LunoBtcBudgetService;

  const budgetsRepo = {
    findOne: jest.fn(
      async ({ where }: { where: { userId: string; budgetMonth: string } }) =>
        budgetRows.find(
          (row) =>
            row.userId === where.userId &&
            row.budgetMonth === where.budgetMonth,
        ) ?? null,
    ),
    find: jest.fn(async ({ where }: { where: { userId: string } }) =>
      budgetRows
        .filter((row) => row.userId === where.userId)
        .sort((a, b) => b.budgetMonth.localeCompare(a.budgetMonth)),
    ),
    create: jest.fn((row: Partial<LunoBtcMonthlyBudget>) => row),
    save: jest.fn(async (row: LunoBtcMonthlyBudget) => {
      const saved = {
        id: row.id ?? `b-${budgetRows.length + 1}`,
        status: 'ACTIVE',
        createdAt: NOW,
        updatedAt: NOW,
        ...row,
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
    const view = await service.getCurrentBudget('user-a', NOW);
    expect(view.status).toBe('NOT_CONFIGURED');
    expect(view.monthlyBudgetMyr).toBeNull();
    expect(view.usedMyr).toBe('50.00');
    expect(view.maxAllowedNewSpendMyr).toBe('0.00');
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
    expect(over.remainingMyr).toBe('0.00');
    expect(over.maxAllowedNewSpendMyr).toBe('0.00');
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

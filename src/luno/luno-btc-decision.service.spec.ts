import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ClassifiedEvent } from './accounting/luno-btc.types';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import { LunoBtcStrategyEvent } from './entities/luno-btc-strategy-event.entity';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoBtcDecisionService } from './luno-btc-decision.service';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function buy(partial: {
  occurredAt: Date;
  myrAmount: string;
  reference: string;
}): ClassifiedEvent {
  return {
    classification: 'BTC_BUY',
    occurredAt: partial.occurredAt,
    reference: partial.reference,
    sourceTransactionIds: [partial.reference],
    btcQuantity: '0.00006',
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

describe('LunoBtcDecisionService', () => {
  const eventRows: LunoBtcStrategyEvent[] = [];
  let service: LunoBtcDecisionService;
  let price = '309000';
  let remaining = '50.00';
  let used = '50.00';
  let status: 'READY' | 'PARTIAL' = 'READY';
  let classified: ClassifiedEvent[] = [];

  const eventsRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      eventRows.filter((row) => {
        if (where.userId && row.userId !== where.userId) {
          return false;
        }
        if (where.budgetMonth && row.budgetMonth !== where.budgetMonth) {
          return false;
        }
        if (where.status && row.status !== where.status) {
          return false;
        }
        return true;
      }),
    ),
    create: jest.fn((row: Partial<LunoBtcStrategyEvent>) => ({ ...row })),
    save: jest.fn(
      async (row: LunoBtcStrategyEvent | LunoBtcStrategyEvent[]) => {
        const list = Array.isArray(row) ? row : [row];
        const saved = list.map((item) => {
          const next = {
            createdAt: NOW,
            updatedAt: NOW,
            ...item,
            id: item.id ?? `e-${eventRows.length + 1}`,
          } as LunoBtcStrategyEvent;
          const index = eventRows.findIndex(
            (existing) => existing.id === next.id,
          );
          if (index >= 0) {
            eventRows[index] = next;
          } else {
            eventRows.push(next);
          }
          return next;
        });
        return Array.isArray(row) ? saved : saved[0];
      },
    ),
  };

  beforeEach(async () => {
    eventRows.length = 0;
    price = '309000';
    remaining = '50.00';
    used = '50.00';
    status = 'READY';
    classified = [
      buy({
        occurredAt: new Date('2026-09-14T00:00:00.000Z'),
        myrAmount: '30',
        reference: 'sep-30',
      }),
      buy({
        occurredAt: new Date('2026-09-16T01:42:45.418Z'),
        myrAmount: '20',
        reference: 'sep-20',
      }),
    ];
    const module = await Test.createTestingModule({
      providers: [
        LunoBtcDecisionService,
        {
          provide: getRepositoryToken(LunoBtcStrategyEvent),
          useValue: eventsRepo,
        },
        {
          provide: getRepositoryToken(LunoBtcMonthlyBudget),
          useValue: { find: jest.fn(async () => []) },
        },
        {
          provide: LunoBtcAccountingService,
          useValue: {
            getSpendContext: async () => ({
              accountingStatus: status,
              classifiedEvents: classified,
              currentMonth: {
                month: '2026-09',
                purchaseTotalMyr: used,
                buyCount: 2,
                btcReceived: '0.00015637',
                latestBuyAt: '2026-09-16T01:42:45.418Z',
              },
              currentBtcPriceMyr: price,
              averageBuyPriceMyr: '326000',
            }),
          },
        },
        {
          provide: LunoBtcBudgetService,
          useValue: {
            getCurrentBudget: async () => ({
              month: '2026-09',
              monthlyBudgetMyr: '100.00',
              usedMyr: used,
              remainingMyr: remaining,
              maxAllowedNewSpendMyr: remaining,
              normalBuyAllocationMyr: '50.00',
              dipReserveAllocationMyr: '50.00',
              lunoMyrAvailableMyr: '64.37',
            }),
          },
        },
      ],
    }).compile();
    service = module.get(LunoBtcDecisionService);
  });

  it('marks the RM20 first-buy zone as already acted and then returns WAIT', async () => {
    const decision = await service.recalculateCurrentBtcDecision('user-a', NOW);
    expect(decision.action).toBe('WAIT');
    expect(eventRows.some((row) => row.status === 'ACTED')).toBe(true);
    const again = await service.recalculateCurrentBtcDecision('user-a', NOW);
    expect(again.action).toBe('WAIT');
    expect(
      eventRows.filter((row) => row.action === 'WAIT' && row.status === 'OPEN'),
    ).toHaveLength(1);
  });

  it('matches a later purchase to an open BUY SMALL recommendation', async () => {
    classified = [];
    const open = await service.recalculateCurrentBtcDecision('user-a', NOW);
    expect(open.action).toBe('BUY_SMALL');
    classified = [
      buy({
        occurredAt: new Date('2026-09-16T13:00:00.000Z'),
        myrAmount: '20.40',
        reference: 'matched-20',
      }),
    ];
    await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-16T14:00:00.000Z'),
    );
    expect(
      eventRows.some(
        (row) => row.status === 'ACTED' && row.action === 'BUY_SMALL',
      ),
    ).toBe(true);
  });

  it('does not match an unrelated larger purchase to BUY SMALL', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    classified = [
      buy({
        occurredAt: new Date('2026-09-16T13:00:00.000Z'),
        myrAmount: '80',
        reference: 'other',
      }),
    ];
    await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-16T14:00:00.000Z'),
    );
    expect(eventRows.every((row) => row.status !== 'ACTED')).toBe(true);
  });

  it('expires a buy recommendation after 24 hours', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    const later = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-18T12:00:00.000Z'),
    );
    expect(eventRows.some((row) => row.status === 'EXPIRED')).toBe(true);
    expect(later.action).toBe('BUY_SMALL');
  });

  it('isolates events by user', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    await service.recalculateCurrentBtcDecision('user-b', NOW);
    expect(
      eventRows.filter((row) => row.userId === 'user-a').length,
    ).toBeGreaterThan(0);
    expect(
      eventRows.filter((row) => row.userId === 'user-b').length,
    ).toBeGreaterThan(0);
  });

  it('returns BLOCKED when accounting is not READY', async () => {
    status = 'PARTIAL';
    const decision = await service.recalculateCurrentBtcDecision('user-a', NOW);
    expect(decision.action).toBe('BLOCKED');
  });

  it('expires an open BUY SMALL when price leaves the buy zone', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    expect(
      eventRows.some(
        (row) => row.action === 'BUY_SMALL' && row.status === 'OPEN',
      ),
    ).toBe(true);
    price = '317000';
    const wait = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-16T13:00:00.000Z'),
    );
    expect(wait.action).toBe('WAIT');
    expect(
      eventRows.some(
        (row) => row.action === 'BUY_SMALL' && row.status === 'EXPIRED',
      ),
    ).toBe(true);
  });

  it('supersedes an open BUY SMALL when a stronger zone is reached', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    price = '290000';
    const stronger = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-16T13:00:00.000Z'),
    );
    expect(stronger.action).toBe('BUY_MORE');
    expect(
      eventRows.some(
        (row) => row.action === 'BUY_SMALL' && row.status === 'SUPERSEDED',
      ),
    ).toBe(true);
    expect(
      eventRows.some(
        (row) => row.action === 'BUY_MORE' && row.status === 'OPEN',
      ),
    ).toBe(true);
  });

  it('expires open buy recommendations when accounting leaves READY', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    status = 'PARTIAL';
    const blocked = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-16T13:00:00.000Z'),
    );
    expect(blocked.action).toBe('BLOCKED');
    expect(
      eventRows.some(
        (row) => row.action === 'BUY_SMALL' && row.status === 'EXPIRED',
      ),
    ).toBe(true);
  });
});

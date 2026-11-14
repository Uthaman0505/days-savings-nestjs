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
  let monthlyBudget = '100.00';
  let budgetUpdatedAt: Date | null = null;

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
    monthlyBudget = '100.00';
    budgetUpdatedAt = null;
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
          useValue: {
            find: jest.fn(async () => []),
            findOne: jest.fn(async () =>
              budgetUpdatedAt
                ? {
                    userId: 'user-a',
                    budgetMonth: '2026-09-01',
                    monthlyBudgetMyr: monthlyBudget,
                    updatedAt: budgetUpdatedAt,
                  }
                : null,
            ),
          },
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
              monthlyBudgetMyr: monthlyBudget,
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

  it('does not let an October purchase lock November', async () => {
    classified = [
      buy({
        occurredAt: new Date('2026-10-15T04:00:00.000Z'),
        myrAmount: '20',
        reference: 'oct-20',
      }),
    ];
    const decision = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-11-09T04:00:00.000Z'),
    );
    expect(decision.action).toBe('BUY_SMALL');
    expect(eventRows.some((row) => row.status === 'ACTED')).toBe(false);
  });

  it('respects the Kuala Lumpur month boundary around midnight', async () => {
    classified = [
      buy({
        occurredAt: new Date('2026-10-31T15:30:00.000Z'),
        myrAmount: '20',
        reference: 'still-october',
      }),
    ];
    const beforeMidnight = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-11-01T01:00:00.000Z'),
    );
    expect(beforeMidnight.action).toBe('BUY_SMALL');
    expect(eventRows.some((row) => row.status === 'ACTED')).toBe(false);

    eventRows.length = 0;
    classified = [
      buy({
        occurredAt: new Date('2026-10-31T16:30:00.000Z'),
        myrAmount: '20',
        reference: 'now-november',
      }),
    ];
    const afterMidnight = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-11-01T01:00:00.000Z'),
    );
    expect(afterMidnight.action).toBe('WAIT');
    expect(
      eventRows.filter(
        (row) => row.status === 'ACTED' && row.zone === 'FIRST_BUY_ZONE',
      ),
    ).toHaveLength(1);
  });

  it('does not match a RM12 buy to a stored RM20 recommendation', async () => {
    classified = [];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    classified = [
      buy({
        occurredAt: new Date('2026-09-16T13:00:00.000Z'),
        myrAmount: '12',
        reference: 'rm-12',
      }),
    ];
    used = '12.00';
    remaining = '88.00';
    const decision = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-16T14:00:00.000Z'),
    );
    expect(eventRows.some((row) => row.status === 'ACTED')).toBe(false);
    expect(decision.action).toBe('BUY_SMALL');
    expect(decision.monthlyUsedMyr).toBe('12.00');
    expect(decision.monthlyRemainingMyr).toBe('88.00');
  });

  it('links the earliest current-month purchase once across recalculations', async () => {
    classified = [
      buy({
        occurredAt: new Date('2026-09-12T02:00:00.000Z'),
        myrAmount: '20',
        reference: 'later-20',
      }),
      buy({
        occurredAt: new Date('2026-09-10T02:00:00.000Z'),
        myrAmount: '20',
        reference: 'early-20',
      }),
    ];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    const acted = eventRows.filter(
      (row) => row.status === 'ACTED' && row.zone === 'FIRST_BUY_ZONE',
    );
    expect(acted).toHaveLength(1);
    expect(acted[0].matchedTransactionRef).toBe('early-20');
  });

  it('does not link one purchase identity to two acted events', async () => {
    const first = buy({
      occurredAt: new Date('2026-09-10T02:00:00.000Z'),
      myrAmount: '20',
      reference: 'ref-a',
    });
    first.sourceTransactionIds = ['shared-tx'];
    const second = buy({
      occurredAt: new Date('2026-09-12T02:00:00.000Z'),
      myrAmount: '20',
      reference: 'ref-b',
    });
    second.sourceTransactionIds = ['shared-tx'];
    classified = [first, second];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    const acted = eventRows.filter((row) => row.status === 'ACTED');
    expect(acted).toHaveLength(1);
    expect(acted[0].matchedTransactionRef).toBe('ref-a');
  });

  it('locks a 4 Nov RM20 buy when the amount revision stays on 2 Nov', async () => {
    monthlyBudget = '100.00';
    budgetUpdatedAt = new Date('2026-11-02T02:00:00.000Z');
    classified = [
      buy({
        occurredAt: new Date('2026-11-04T02:00:00.000Z'),
        myrAmount: '20',
        reference: 'nov-20',
      }),
    ];
    const decision = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-11-09T04:00:00.000Z'),
    );
    expect(decision.action).toBe('WAIT');
    const acted = eventRows.filter((row) => row.status === 'ACTED');
    expect(acted).toHaveLength(1);
    expect(acted[0].matchedTransactionRef).toBe('nov-20');
    expect(acted[0].suggestedAmountMyr).toBe('20');
  });

  it('does not invent an identity for a buy with no reference or source id', async () => {
    const anonymous = buy({
      occurredAt: new Date('2026-11-04T02:00:00.000Z'),
      myrAmount: '20',
      reference: 'unused',
    });
    anonymous.reference = null;
    anonymous.sourceTransactionIds = [];
    classified = [anonymous];
    used = '20.00';
    remaining = '80.00';
    const decision = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-11-09T04:00:00.000Z'),
    );
    expect(eventRows.some((row) => row.status === 'ACTED')).toBe(false);
    expect(decision.action).toBe('BUY_SMALL');
    expect(decision.monthlyUsedMyr).toBe('20.00');
    expect(decision.monthlyRemainingMyr).toBe('80.00');
  });

  it('does not infer a lock from a buy that predates the current budget revision', async () => {
    monthlyBudget = '200.00';
    budgetUpdatedAt = new Date('2026-09-18T00:00:00.000Z');
    classified = [
      buy({
        occurredAt: new Date('2026-09-14T02:00:00.000Z'),
        myrAmount: '40',
        reference: 'before-revision',
      }),
    ];
    const decision = await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-20T02:00:00.000Z'),
    );
    expect(eventRows.some((row) => row.status === 'ACTED')).toBe(false);
    expect(decision.action).toBe('BUY_SMALL');
    expect(decision.suggestedAmountMyr).toBe('40.00');
  });

  it('keeps an acted association after the budget changes', async () => {
    budgetUpdatedAt = new Date('2026-09-01T00:00:00.000Z');
    classified = [
      buy({
        occurredAt: new Date('2026-09-10T02:00:00.000Z'),
        myrAmount: '20',
        reference: 'kept-20',
      }),
    ];
    await service.recalculateCurrentBtcDecision('user-a', NOW);
    monthlyBudget = '200.00';
    budgetUpdatedAt = new Date('2026-09-18T00:00:00.000Z');
    classified = [
      ...classified,
      buy({
        occurredAt: new Date('2026-09-14T02:00:00.000Z'),
        myrAmount: '40',
        reference: 'older-40',
      }),
    ];
    await service.recalculateCurrentBtcDecision(
      'user-a',
      new Date('2026-09-20T02:00:00.000Z'),
    );
    const acted = eventRows.filter((row) => row.status === 'ACTED');
    expect(acted).toHaveLength(1);
    expect(acted[0].matchedTransactionRef).toBe('kept-20');
    expect(acted[0].suggestedAmountMyr).toBe('20');
  });
});

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ClassifiedEvent, FifoLot } from './accounting/luno-btc.types';
import { LunoBtcHarvestEvent } from './entities/luno-btc-harvest-event.entity';
import { LunoBtcHarvestSettings } from './entities/luno-btc-harvest-settings.entity';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoBtcHarvestService } from './luno-btc-harvest.service';
import { LunoConfigService } from './luno-config.service';

const NOW = new Date('2026-09-26T04:00:00.000Z');

function openLot(): FifoLot {
  return {
    key: 'lot-1',
    sourceTransactionId: 'buy-1',
    reference: 'buy-1',
    acquiredAt: new Date('2026-01-01T00:00:00.000Z'),
    btcQuantityOriginal: '0.004',
    btcQuantityRemaining: '0.004',
    myrCostOriginal: '200',
    myrCostRemaining: '200',
    feeMyr: '0',
    effectiveCostMyr: '200',
    origin: 'BUY',
  };
}

function sell(partial: {
  occurredAt: Date;
  btcQuantity: string;
  myrAmount: string;
  reference: string;
}): ClassifiedEvent {
  return {
    classification: 'BTC_SELL',
    occurredAt: partial.occurredAt,
    reference: partial.reference,
    sourceTransactionIds: [partial.reference],
    btcQuantity: partial.btcQuantity,
    btcDirection: 'OUT',
    myrAmount: partial.myrAmount,
    feeMyr: '0',
    feeMyrReported: '0',
    feeBtc: null,
    feeStatus: 'EXACT',
    feeSource: 'INSTANT_DETAILS',
    feeTreatment: 'SUBTRACTED_FROM_PROCEEDS',
    tradeChannel: 'INSTANT',
    derivationNote: null,
    warning: null,
    excludedAsset: null,
  };
}

describe('LunoBtcHarvestService', () => {
  const eventRows: LunoBtcHarvestEvent[] = [];
  const settingRows: LunoBtcHarvestSettings[] = [];
  let service: LunoBtcHarvestService;
  let price = '60000';
  let realized = '0';
  let classified: ClassifiedEvent[] = [];
  let disposals: { reference: string | null; realisedPnlMyr: string }[] = [];
  const allocateMoneyBucket = jest.fn(async () => ({
    protectedProfitMyr: '0.00',
    reinvestmentReserveMyr: '0.00',
    lunoMyrAvailableMyr: '0.00',
  }));

  const eventsRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      eventRows.filter((row) => {
        if (where.userId && row.userId !== where.userId) {
          return false;
        }
        if (where.status && row.status !== where.status) {
          return false;
        }
        return true;
      }),
    ),
    create: jest.fn((row: Partial<LunoBtcHarvestEvent>) => ({ ...row })),
    save: jest.fn(async (row: LunoBtcHarvestEvent | LunoBtcHarvestEvent[]) => {
      const list = Array.isArray(row) ? row : [row];
      const saved = list.map((item) => {
        const next = {
          createdAt: NOW,
          updatedAt: NOW,
          ...item,
          id: item.id ?? `h-${eventRows.length + 1}`,
        } as LunoBtcHarvestEvent;
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
    }),
  };

  const settingsRepo = {
    find: jest.fn(async () => settingRows),
    findOne: jest.fn(
      async ({ where }: { where: { userId: string } }) =>
        settingRows.find((row) => row.userId === where.userId) ?? null,
    ),
    create: jest.fn((row: Partial<LunoBtcHarvestSettings>) => ({ ...row })),
    save: jest.fn(async (row: LunoBtcHarvestSettings) => {
      const next = {
        createdAt: NOW,
        updatedAt: NOW,
        ...row,
        id: row.id ?? `s-${settingRows.length + 1}`,
      } as LunoBtcHarvestSettings;
      const index = settingRows.findIndex((item) => item.id === next.id);
      if (index >= 0) {
        settingRows[index] = next;
      } else {
        settingRows.push(next);
      }
      return next;
    }),
  };

  beforeEach(async () => {
    eventRows.length = 0;
    settingRows.length = 0;
    price = '60000';
    realized = '0';
    classified = [];
    disposals = [];
    allocateMoneyBucket.mockClear();
    const module = await Test.createTestingModule({
      providers: [
        LunoBtcHarvestService,
        {
          provide: getRepositoryToken(LunoBtcHarvestEvent),
          useValue: eventsRepo,
        },
        {
          provide: getRepositoryToken(LunoBtcHarvestSettings),
          useValue: settingsRepo,
        },
        {
          provide: LunoBtcAccountingService,
          useValue: {
            getComputeDetails: async () => ({
              portfolio: {
                status: 'READY',
                btcQuantity: '0.004',
                btcPriceMyr: price,
                remainingCostBasisMyr: '200',
                averageBuyPriceMyr: '50000',
                moneyPutInMyr: '200',
                principalRecoveredMyr: '0',
                profitAlreadyTakenMyr: realized,
                overallReturnPct: '20',
              },
              fifo: {
                lots: [openLot()],
                disposals,
              },
              classifiedEvents: classified,
            }),
          },
        },
        {
          provide: LunoBtcBudgetService,
          useValue: { allocateMoneyBucket },
        },
        {
          provide: LunoConfigService,
          useValue: {
            minHarvestMyr: '5',
            estimatedSellFeeMyr: '0',
          },
        },
      ],
    }).compile();
    service = module.get(LunoBtcHarvestService);
  });

  it('does not write cash buckets when recommending a harvest', async () => {
    const view = await service.recalculateCurrentHarvest('user-a', NOW);
    expect(view.action).toBe('TAKE_SOME_PROFIT');
    expect(view.manualSellNote).toContain('manually in Luno');
    expect(allocateMoneyBucket).not.toHaveBeenCalled();
    expect(view.lifetime.realizedProfitMyr).toBe('0.00');
  });

  it('isolates events and settings by user', async () => {
    await service.recalculateCurrentHarvest('user-a', NOW);
    await service.recalculateCurrentHarvest('user-b', NOW);
    expect(
      eventRows.every(
        (row) => row.userId === 'user-a' || row.userId === 'user-b',
      ),
    ).toBe(true);
    expect(settingRows.map((row) => row.userId).sort()).toEqual([
      'user-a',
      'user-b',
    ]);
    const historyA = await service.getHarvestHistory('user-a');
    const historyB = await service.getHarvestHistory('user-b');
    expect(
      historyA.every(
        (row) =>
          eventRows.find((item) => item.id === row.id)?.userId === 'user-a',
      ),
    ).toBe(true);
    expect(
      historyB.every(
        (row) =>
          eventRows.find((item) => item.id === row.id)?.userId === 'user-b',
      ),
    ).toBe(true);
  });

  it('expires an open harvest after valid_until', async () => {
    await service.recalculateCurrentHarvest('user-a', NOW);
    const open = eventRows.find((row) => row.action === 'TAKE_SOME_PROFIT');
    expect(open?.status).toBe('OPEN');
    open!.validUntil = new Date(NOW.getTime() - 1000);
    price = '57000';
    await service.recalculateCurrentHarvest(
      'user-a',
      new Date(NOW.getTime() + 1000),
    );
    expect(open!.status).toBe('EXPIRED');
  });

  it('supersedes a weaker open harvest when a stronger zone is current', async () => {
    await service.recalculateCurrentHarvest('user-a', NOW);
    const first = eventRows.find((row) => row.zone === 'FIRST_HARVEST');
    expect(first?.status).toBe('OPEN');
    price = '65000';
    await service.recalculateCurrentHarvest(
      'user-a',
      new Date(NOW.getTime() + 1000),
    );
    expect(first?.status).toBe('SUPERSEDED');
    expect(
      eventRows.some((row) => row.zone === 'PROTECT' && row.status === 'OPEN'),
    ).toBe(true);
  });

  it('matches a real sale, marks ACTED, and splits actual realized profit only', async () => {
    const first = await service.recalculateCurrentHarvest('user-a', NOW);
    const harvestMyr = first.recommendation?.suggestedHarvestMyr ?? '8.00';
    const btc = first.recommendation?.btcToSell ?? '0.00013333';
    classified = [
      sell({
        occurredAt: new Date(NOW.getTime() + 60_000),
        btcQuantity: btc,
        myrAmount: harvestMyr,
        reference: 'sell-matched',
      }),
    ];
    disposals = [{ reference: 'sell-matched', realisedPnlMyr: '10' }];
    await service.recalculateCurrentHarvest(
      'user-a',
      new Date(NOW.getTime() + 120_000),
    );
    const acted = eventRows.find(
      (row) => row.matchedTransactionRef === 'sell-matched',
    );
    expect(acted?.status).toBe('ACTED');
    expect(allocateMoneyBucket).toHaveBeenCalledWith('user-a', {
      bucketType: 'PROTECTED_PROFIT',
      amountMyr: '7',
      sourceReference: 'sell-matched',
      note: 'Protected profit from matched BTC harvest sale.',
    });
    expect(allocateMoneyBucket).toHaveBeenCalledWith('user-a', {
      bucketType: 'REINVESTMENT_RESERVE',
      amountMyr: '3',
      sourceReference: 'sell-matched',
      note: 'Reinvestment reserve from matched BTC harvest sale.',
    });
    const allocated = allocateMoneyBucket.mock.calls.reduce(
      (sum, [, body]) => sum + Number(body.amountMyr),
      0,
    );
    expect(allocated).toBe(10);
    expect(allocated).not.toBe(Number(harvestMyr));
  });

  it('does not match an unrelated sale or put principal into profit buckets', async () => {
    await service.recalculateCurrentHarvest('user-a', NOW);
    classified = [
      sell({
        occurredAt: new Date(NOW.getTime() + 60_000),
        btcQuantity: '0.01',
        myrAmount: '400',
        reference: 'unrelated',
      }),
    ];
    disposals = [{ reference: 'unrelated', realisedPnlMyr: '50' }];
    await service.recalculateCurrentHarvest(
      'user-a',
      new Date(NOW.getTime() + 120_000),
    );
    expect(
      eventRows.some((row) => row.matchedTransactionRef === 'unrelated'),
    ).toBe(false);
    expect(allocateMoneyBucket).not.toHaveBeenCalled();
  });
});

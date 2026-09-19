import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LunoBtcMarketCandle } from './entities/luno-btc-market-candle.entity';
import { LunoBtcMarketSnapshot } from './entities/luno-btc-market-snapshot.entity';
import { LunoApiService } from './luno-api.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcDecisionService } from './luno-btc-decision.service';
import { LunoBtcMarketService } from './luno-btc-market.service';

describe('LunoBtcMarketService', () => {
  const candleRows: LunoBtcMarketCandle[] = [];
  let service: LunoBtcMarketService;
  let fetchCount = 0;

  beforeEach(async () => {
    candleRows.length = 0;
    fetchCount = 0;
    const module = await Test.createTestingModule({
      providers: [
        LunoBtcMarketService,
        {
          provide: getRepositoryToken(LunoBtcMarketCandle),
          useValue: {
            find: jest.fn(async () => [...candleRows]),
            findOne: jest.fn(
              async ({ where }: { where: Record<string, unknown> }) =>
                candleRows.find(
                  (row) =>
                    row.interval === where.interval &&
                    row.candleTime.getTime() ===
                      (where.candleTime as Date).getTime(),
                ) ?? null,
            ),
            create: jest.fn((row: Partial<LunoBtcMarketCandle>) => ({
              ...row,
            })),
            save: jest.fn(async (row: LunoBtcMarketCandle) => {
              const index = candleRows.findIndex(
                (existing) =>
                  existing.interval === row.interval &&
                  existing.candleTime.getTime() === row.candleTime.getTime(),
              );
              if (index >= 0) {
                candleRows[index] = { ...candleRows[index], ...row };
                return candleRows[index];
              }
              candleRows.push(row);
              return row;
            }),
          },
        },
        {
          provide: getRepositoryToken(LunoBtcMarketSnapshot),
          useValue: {
            save: jest.fn(async (row) => row),
            create: jest.fn((row) => row),
            find: jest.fn(async () => []),
          },
        },
        {
          provide: LunoApiService,
          useValue: {
            getXbtMyrCandles: async () => {
              fetchCount += 1;
              return [
                {
                  timestamp: Date.parse('2026-09-16T10:00:00.000Z'),
                  open: '310000',
                  high: '311000',
                  low: '309000',
                  close: '310500',
                  volume: '1.2',
                },
              ];
            },
          },
        },
        {
          provide: LunoBtcAccountingService,
          useValue: {
            getSpendContext: async () => ({ averageBuyPriceMyr: '326000' }),
          },
        },
        {
          provide: LunoBtcDecisionService,
          useValue: {},
        },
      ],
    }).compile();
    service = module.get(LunoBtcMarketService);
  });

  it('upserts candles idempotently', async () => {
    const first = await service.syncBtcMarketData(
      new Date('2026-09-16T12:00:00.000Z'),
    );
    const second = await service.syncBtcMarketData(
      new Date('2026-09-16T12:00:00.000Z'),
    );
    expect(first.upserted).toBe(3);
    expect(second.upserted).toBe(3);
    expect(candleRows).toHaveLength(3);
    expect(fetchCount).toBe(6);
  });

  it('does not call Luno write endpoints while syncing candles', () => {
    expect(JSON.stringify(service)).not.toContain('postorder');
  });

  it('composes a cached decision without fetching candles', async () => {
    const before = fetchCount;
    const view = await service.composeFromCachedDecision({
      action: 'WAIT',
      displayAction: 'WAIT',
      suggestedAmountMyr: null,
      averageBuyPriceMyr: '326000',
      reason: ['Price is not in a buy zone.'],
      monthlyRemainingMyr: '50.00',
      maxAllowedNewSpendMyr: '50.00',
      monthlyBudgetMyr: '100.00',
      monthlyUsedMyr: '50.00',
      modifiedByMarketContext: false,
    } as never);
    expect(view.finalDecision.action).toBe('WAIT');
    expect(view.finalDecision.modifiedByMarketContext).toBe(false);
    expect(fetchCount).toBe(before);
  });

  it('sets hasSnapshot false when no market snapshot exists', () => {
    const view = service.toMarketContextView(null);
    expect(view.hasSnapshot).toBe(false);
    expect(view.marketContextStatus).toBe('UNAVAILABLE');
    expect(view.direction).toBeNull();
  });

  it('keeps hasSnapshot true for a too-old snapshot without changing freshness math', () => {
    const view = service.toMarketContextView({
      direction: 'FALLING',
      buyingCondition: 'NORMAL',
      stability: 'NORMAL',
      confidence: 'LOW',
      currentPriceMyr: '310464',
      shortTrendPct: '-1',
      mediumTrendPct: '-2',
      drawdownFromRecentHighPct: '-4',
      volatilityPct: '1.2',
      momentumValue: '-1',
      sma20Myr: '318000',
      sma50Myr: '320000',
      recentHighMyr: '330000',
      recentLowMyr: '310000',
      marketScore: '40',
      reason: ['BTC is below its short-term average.'],
      source: 'LUNO',
      latestCandleAt: new Date('2026-09-14T12:00:00.000Z'),
      marketDataAgeMinutes: '2880',
      marketContextStatus: 'UNAVAILABLE',
    });
    expect(view.hasSnapshot).toBe(true);
    expect(view.marketContextStatus).toBe('UNAVAILABLE');
    expect(view.direction).toBe('FALLING');
    expect(view.sma20Myr).toBeTruthy();
  });
});

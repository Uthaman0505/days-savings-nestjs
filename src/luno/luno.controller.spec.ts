import { LunoController } from './luno.controller';
import { LunoHealthService } from './luno-health.service';
import { LunoApiService } from './luno-api.service';
import { LunoSyncService } from './luno-sync.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoBtcDecisionService } from './luno-btc-decision.service';
import { LunoBtcMarketService } from './luno-btc-market.service';

function guardsOn(
  methodName:
    | 'healthCheck'
    | 'syncNow'
    | 'ticker'
    | 'btcPortfolio'
    | 'btcAccountingDetails'
    | 'rebuildAccounting'
    | 'getCurrentBudget'
    | 'createCurrentBudget'
    | 'updateCurrentBudget'
    | 'getBudgetHistory'
    | 'getMoneyBuckets'
    | 'allocateMoneyBucket'
    | 'getStrategyContext'
    | 'getCurrentDecision'
    | 'getDecisionHistory'
    | 'recalculateDecision'
    | 'getMarketContext'
    | 'getFinalDecision'
    | 'recalculateMarketContext'
    | 'syncMarketData',
): unknown[] {
  const proto = LunoController.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;
  const metadata = Reflect.getMetadata('__guards__', proto[methodName]) as
    | unknown[]
    | undefined;
  return metadata ?? [];
}

describe('LunoController', () => {
  it('guards health, sync, accounting, and budget endpoints with JWT', async () => {
    expect(guardsOn('healthCheck')).toHaveLength(1);
    expect(guardsOn('syncNow')).toHaveLength(1);
    expect(guardsOn('btcPortfolio')).toHaveLength(1);
    expect(guardsOn('btcAccountingDetails')).toHaveLength(1);
    expect(guardsOn('rebuildAccounting')).toHaveLength(1);
    expect(guardsOn('getCurrentBudget')).toHaveLength(1);
    expect(guardsOn('createCurrentBudget')).toHaveLength(1);
    expect(guardsOn('updateCurrentBudget')).toHaveLength(1);
    expect(guardsOn('getBudgetHistory')).toHaveLength(1);
    expect(guardsOn('getMoneyBuckets')).toHaveLength(1);
    expect(guardsOn('allocateMoneyBucket')).toHaveLength(1);
    expect(guardsOn('getStrategyContext')).toHaveLength(1);
    expect(guardsOn('getCurrentDecision')).toHaveLength(1);
    expect(guardsOn('getDecisionHistory')).toHaveLength(1);
    expect(guardsOn('recalculateDecision')).toHaveLength(1);
    expect(guardsOn('getMarketContext')).toHaveLength(1);
    expect(guardsOn('getFinalDecision')).toHaveLength(1);
    expect(guardsOn('recalculateMarketContext')).toHaveLength(1);
    expect(guardsOn('syncMarketData')).toHaveLength(1);
    expect(guardsOn('ticker')).toHaveLength(0);

    const api = {
      getBtcMyrMarketPrice: jest.fn(async () => ({
        pair: 'XBTMYR',
        last_trade: '100.00',
        bid: '99.00',
        ask: '101.00',
        timestamp: 1,
      })),
    };
    const controller = new LunoController(
      { getHealth: jest.fn() } as unknown as LunoHealthService,
      { runSync: jest.fn() } as unknown as LunoSyncService,
      api as unknown as LunoApiService,
      {
        rebuildBtcAccounting: jest.fn(),
      } as unknown as LunoBtcAccountingService,
      {} as unknown as LunoBtcBudgetService,
      {} as unknown as LunoBtcDecisionService,
      {} as unknown as LunoBtcMarketService,
    );
    await expect(controller.ticker()).resolves.toEqual({
      pair: 'XBTMYR',
      lastTrade: '100.00',
      bid: '99.00',
      ask: '101.00',
      timestamp: 1,
    });
  });
});

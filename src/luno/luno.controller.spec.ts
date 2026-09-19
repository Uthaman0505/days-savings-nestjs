import { LunoController } from './luno.controller';
import { LunoHealthService } from './luno-health.service';
import { LunoApiService } from './luno-api.service';
import { LunoSyncService } from './luno-sync.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoBtcDecisionService } from './luno-btc-decision.service';
import { LunoBtcMarketService } from './luno-btc-market.service';
import { LunoBtcExternalRiskService } from './luno-btc-external-risk.service';

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
    | 'getExternalRisk'
    | 'getExternalRiskEvents'
    | 'syncExternalRisk'
    | 'recalculateExternalRisk'
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
    expect(guardsOn('getExternalRisk')).toHaveLength(1);
    expect(guardsOn('getExternalRiskEvents')).toHaveLength(1);
    expect(guardsOn('syncExternalRisk')).toHaveLength(1);
    expect(guardsOn('recalculateExternalRisk')).toHaveLength(1);
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
      {} as unknown as LunoBtcExternalRiskService,
    );
    await expect(controller.ticker()).resolves.toEqual({
      pair: 'XBTMYR',
      lastTrade: '100.00',
      bid: '99.00',
      ask: '101.00',
      timestamp: 1,
    });
  });

  it('keeps POST /luno/sync to portfolio data and cached Phase 5/6', async () => {
    const runSync = jest.fn(async () => ({
      status: 'SUCCESS' as const,
      startedAt: '2026-09-19T00:00:00.000Z',
      finishedAt: '2026-09-19T00:00:01.000Z',
      btcAccountId: 'btc-1',
      myrAccountId: 'myr-1',
      accountsUpserted: 2,
      transactionsUpserted: 3,
      ordersUpserted: 1,
      withdrawalsUpserted: 0,
      transfersUpserted: 0,
      errors: [],
    }));
    const rebuildBtcAccounting = jest.fn(async () => ({ portfolio: {} }));
    const recalculateCurrentBtcDecision = jest.fn(async () => ({
      action: 'WAIT',
      averageBuyPriceMyr: '326000',
    }));
    const syncBtcMarketData = jest.fn();
    const calculateBtcMarketSnapshot = jest.fn();
    const syncExternalRisk = jest.fn();
    const recalculateExternalRisk = jest.fn();
    const composeFromCachedDecision = jest.fn(async () => ({
      finalDecision: { action: 'WAIT' },
    }));
    const controller = new LunoController(
      { getHealth: jest.fn() } as unknown as LunoHealthService,
      { runSync } as unknown as LunoSyncService,
      { getBtcMyrMarketPrice: jest.fn() } as unknown as LunoApiService,
      { rebuildBtcAccounting } as unknown as LunoBtcAccountingService,
      {} as unknown as LunoBtcBudgetService,
      {
        recalculateCurrentBtcDecision,
        recalculateAllForCurrentMonth: jest.fn(),
      } as unknown as LunoBtcDecisionService,
      {
        syncBtcMarketData,
        calculateBtcMarketSnapshot,
      } as unknown as LunoBtcMarketService,
      {
        syncExternalRisk,
        recalculateExternalRisk,
        composeFromCachedDecision,
      } as unknown as LunoBtcExternalRiskService,
    );
    const result = await controller.syncNow({
      user: { id: 'user-1' },
    } as never);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(rebuildBtcAccounting).toHaveBeenCalledTimes(1);
    expect(recalculateCurrentBtcDecision).toHaveBeenCalledTimes(1);
    expect(recalculateCurrentBtcDecision).toHaveBeenCalledWith('user-1');
    expect(composeFromCachedDecision).toHaveBeenCalledTimes(1);
    expect(syncBtcMarketData).not.toHaveBeenCalled();
    expect(calculateBtcMarketSnapshot).not.toHaveBeenCalled();
    expect(syncExternalRisk).not.toHaveBeenCalled();
    expect(recalculateExternalRisk).not.toHaveBeenCalled();
    expect(result.sync).toEqual({
      lunoDataUpdated: true,
      accountingUpdated: true,
      decisionUpdated: true,
      marketContextSource: 'CACHED',
      externalRiskSource: 'CACHED',
    });
  });

  it('still returns Luno sync when cached Phase 5/6 compose fails', async () => {
    const controller = new LunoController(
      { getHealth: jest.fn() } as unknown as LunoHealthService,
      {
        runSync: jest.fn(async () => ({
          status: 'SUCCESS' as const,
          startedAt: '2026-09-19T00:00:00.000Z',
          finishedAt: '2026-09-19T00:00:01.000Z',
          btcAccountId: 'btc-1',
          myrAccountId: 'myr-1',
          accountsUpserted: 2,
          transactionsUpserted: 1,
          ordersUpserted: 0,
          withdrawalsUpserted: 0,
          transfersUpserted: 0,
          errors: [],
        })),
      } as unknown as LunoSyncService,
      { getBtcMyrMarketPrice: jest.fn() } as unknown as LunoApiService,
      {
        rebuildBtcAccounting: jest.fn(async () => ({})),
      } as unknown as LunoBtcAccountingService,
      {} as unknown as LunoBtcBudgetService,
      {
        recalculateCurrentBtcDecision: jest.fn(async () => ({
          action: 'WAIT',
        })),
      } as unknown as LunoBtcDecisionService,
      {
        syncBtcMarketData: jest.fn(),
        calculateBtcMarketSnapshot: jest.fn(),
      } as unknown as LunoBtcMarketService,
      {
        composeFromCachedDecision: jest.fn(async () => {
          throw new Error('Finnhub down');
        }),
        syncExternalRisk: jest.fn(),
      } as unknown as LunoBtcExternalRiskService,
    );
    const result = await controller.syncNow({
      user: { id: 'user-1' },
    } as never);
    expect(result.status).toBe('SUCCESS');
    expect(result.sync?.decisionUpdated).toBe(true);
    expect(result.sync?.marketContextSource).toBe('CACHED');
  });
});

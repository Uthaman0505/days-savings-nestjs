import { LunoController } from './luno.controller';
import { LunoHealthService } from './luno-health.service';
import { LunoApiService } from './luno-api.service';
import { LunoSyncService } from './luno-sync.service';

function guardsOn(
  methodName:
    | 'healthCheck'
    | 'syncNow'
    | 'ticker'
    | 'btcPortfolio'
    | 'btcAccountingDetails'
    | 'rebuildAccounting',
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
  it('guards health and sync with JWT and exposes a public ticker', async () => {
    expect(guardsOn('healthCheck')).toHaveLength(1);
    expect(guardsOn('syncNow')).toHaveLength(1);
    expect(guardsOn('btcPortfolio')).toHaveLength(1);
    expect(guardsOn('btcAccountingDetails')).toHaveLength(1);
    expect(guardsOn('rebuildAccounting')).toHaveLength(1);

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
      { rebuildBtcAccounting: jest.fn() } as never,
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

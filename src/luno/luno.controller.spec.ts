import { LunoController } from './luno.controller';
import { LunoHealthService } from './luno-health.service';
import { LunoApiService } from './luno-api.service';
import { LunoSyncService } from './luno-sync.service';

describe('LunoController', () => {
  it('guards health and sync with JWT and exposes a public ticker', async () => {
    const healthMeta = Reflect.getMetadata(
      '__guards__',
      LunoController.prototype.healthCheck,
    ) as unknown[];
    const syncMeta = Reflect.getMetadata(
      '__guards__',
      LunoController.prototype.syncNow,
    ) as unknown[];
    const tickerMeta = Reflect.getMetadata(
      '__guards__',
      LunoController.prototype.ticker,
    ) as unknown[] | undefined;
    expect(healthMeta).toHaveLength(1);
    expect(syncMeta).toHaveLength(1);
    expect(tickerMeta ?? []).toHaveLength(0);

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

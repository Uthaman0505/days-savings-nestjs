import { ConfigService } from '@nestjs/config';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { LunoHealthService } from './luno-health.service';
import type { LunoAccount } from './entities/luno-account.entity';
import type { LunoAccountBalance } from './luno.types';

function config(enabled = true): LunoConfigService {
  return new LunoConfigService({
    get: (key: string) =>
      ({
        LUNO_ENABLED: enabled ? 'true' : 'false',
        LUNO_API_KEY_ID: 'key-id',
        LUNO_API_KEY_SECRET: 'super-secret-value-xyz',
      })[key],
  } as ConfigService);
}

function makeHealth(options: {
  enabled?: boolean;
  balances: LunoAccountBalance[];
  lastTrade: string;
}) {
  const api = {
    getBalances: jest.fn(async () => options.balances),
    getBtcMyrMarketPrice: jest.fn(async () => ({
      last_trade: options.lastTrade,
      pair: 'XBTMYR',
      ask: options.lastTrade,
      bid: options.lastTrade,
      rolling_24_hour_volume: '0',
      timestamp: 1,
    })),
  };
  const accounts = { find: jest.fn(async () => [] as LunoAccount[]) };
  const emptyCount = { count: jest.fn(async () => 3) };
  const syncRuns = {
    findOne: jest.fn(async () => ({
      finishedAt: new Date('2026-09-13T05:00:00.000Z'),
      status: 'SUCCESS',
    })),
  };
  const service = new LunoHealthService(
    api as unknown as LunoApiService,
    config(options.enabled),
    accounts as never,
    syncRuns as never,
    emptyCount as never,
    emptyCount as never,
    emptyCount as never,
    emptyCount as never,
  );
  return { service, api };
}

describe('LunoHealthService', () => {
  it('reports connection state with decimal-safe balances and no secrets', async () => {
    const { service } = makeHealth({
      balances: [
        {
          account_id: 'btc-1',
          account_type: 'TRANSACTIONAL',
          asset: 'XBT',
          balance: '0.01234567',
          reserved: '0',
          unconfirmed: '0',
        },
        {
          account_id: 'myr-1',
          account_type: 'TRANSACTIONAL',
          asset: 'MYR',
          balance: '150.25',
          reserved: '10.00',
          unconfirmed: '0',
        },
      ],
      lastTrade: '512100.50',
    });
    const health = await service.getHealth();
    expect(health).toMatchObject({
      connected: true,
      btcAccountFound: true,
      myrAccountFound: true,
      btcBalance: '0.01234567',
      myrAvailableBalance: '150.25',
      myrBalance: '160.25',
      marketPair: 'XBTMYR',
      lastTradePrice: '512100.50',
      lastSyncAt: '2026-09-13T05:00:00.000Z',
    });
    expect(JSON.stringify(health)).not.toContain('super-secret-value-xyz');
    expect(service.formatDevSummary(health)).toContain('Luno connection: OK');
  });

  it('is not connected when Luno is disabled', async () => {
    const { service, api } = makeHealth({
      enabled: false,
      balances: [],
      lastTrade: '1',
    });
    const health = await service.getHealth();
    expect(health.connected).toBe(false);
    expect(health.enabled).toBe(false);
    expect(api.getBalances).not.toHaveBeenCalled();
  });
});

import { ConfigService } from '@nestjs/config';
import { isAllowedLunoGetPath, LUNO_GET_PATHS } from './luno.constants';
import { LunoConfigService } from './luno-config.service';

function config(env: Record<string, string>): LunoConfigService {
  return new LunoConfigService({
    get: (key: string) => env[key],
  } as ConfigService);
}

describe('LunoConfigService', () => {
  it('builds HTTP Basic Auth from key id and secret', () => {
    const service = config({
      LUNO_ENABLED: 'true',
      LUNO_API_KEY_ID: 'key-id',
      LUNO_API_KEY_SECRET: 'key-secret',
    });
    const header = service.basicAuthHeader();
    expect(header.startsWith('Basic ')).toBe(true);
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    expect(decoded).toBe('key-id:key-secret');
  });

  it('fails startup when Luno is enabled without credentials', () => {
    const service = config({ LUNO_ENABLED: 'true' });
    expect(() => service.onModuleInit()).toThrow(/credentials are missing/);
  });

  it('does not require credentials when Luno is disabled', () => {
    const service = config({ LUNO_ENABLED: 'false' });
    expect(() => service.onModuleInit()).not.toThrow();
  });
});

describe('isAllowedLunoGetPath', () => {
  it('allows official read-only endpoints and account transactions', () => {
    expect(isAllowedLunoGetPath(`${LUNO_GET_PATHS.ticker}?pair=XBTMYR`)).toBe(
      true,
    );
    expect(isAllowedLunoGetPath(LUNO_GET_PATHS.balances)).toBe(true);
    expect(isAllowedLunoGetPath(LUNO_GET_PATHS.orders)).toBe(true);
    expect(isAllowedLunoGetPath(LUNO_GET_PATHS.withdrawals)).toBe(true);
    expect(isAllowedLunoGetPath(`${LUNO_GET_PATHS.transfers}?account_id=1`)).toBe(
      true,
    );
    expect(isAllowedLunoGetPath('/api/1/accounts/123/transactions')).toBe(true);
  });

  it('rejects write and unknown Luno paths', () => {
    expect(isAllowedLunoGetPath('/api/1/postorder')).toBe(false);
    expect(isAllowedLunoGetPath('/api/1/marketorder')).toBe(false);
    expect(isAllowedLunoGetPath('/api/1/send')).toBe(false);
    expect(isAllowedLunoGetPath('/api/1/withdrawals/123')).toBe(false);
  });
});

import { ConfigService } from '@nestjs/config';
import { LunoApiException } from './luno-api.errors';
import { LunoApiService, type LunoFetch } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { redactSecrets } from './luno-redact';

const SECRET = 'super-secret-value-xyz';
const KEY_ID = 'luno-key-id-abc12345';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

function makeApi(fetchImpl: LunoFetch): LunoApiService {
  const config = new LunoConfigService({
    get: (key: string) =>
      ({
        LUNO_ENABLED: 'true',
        LUNO_API_KEY_ID: KEY_ID,
        LUNO_API_KEY_SECRET: SECRET,
        LUNO_API_BASE_URL: 'https://api.luno.com',
      })[key],
  } as ConfigService);
  return new LunoApiService(config, fetchImpl);
}

describe('LunoApiService', () => {
  it('sends HTTP Basic Auth on authenticated GET requests only', async () => {
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.luno.com/api/1/balance');
      expect(init?.method).toBe('GET');
      const header = String(
        (init?.headers as Record<string, string>).Authorization,
      );
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      expect(decoded).toBe(`${KEY_ID}:${SECRET}`);
      return jsonResponse({ balance: [] });
    });
    await makeApi(fetchImpl).getBalances();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('parses the official XBTMYR ticker without float math', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        ask: '512345.12',
        bid: '512000.01',
        last_trade: '512100.50',
        pair: 'XBTMYR',
        rolling_24_hour_volume: '12.345678',
        status: 'ACTIVE',
        timestamp: 1750000000000,
      }),
    );
    const ticker = await makeApi(fetchImpl).getBtcMyrMarketPrice();
    expect(ticker.pair).toBe('XBTMYR');
    expect(ticker.last_trade).toBe('512100.50');
    expect(ticker.ask).toBe('512345.12');
    expect(String(ticker.last_trade)).not.toMatch(/e/i);
  });

  it('parses official Luno candles without inventing fields', () => {
    const api = makeApi(jest.fn());
    const rows = api.parseCandles({
      pair: 'XBTMYR',
      duration: 3600,
      candles: [
        {
          timestamp: 1750000000000,
          open: '310000.00',
          high: '312000.00',
          low: '308000.00',
          close: '311000.50',
          volume: '1.25',
        },
      ],
    });
    expect(rows[0].close).toBe('311000.50');
    expect(String(rows[0].close)).not.toMatch(/e/i);
  });

  it('requests Luno candles with authentication', async () => {
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('/api/exchange/1/candles');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toMatch(
        /^Basic /,
      );
      return jsonResponse({
        pair: 'XBTMYR',
        duration: 3600,
        candles: [],
      });
    });
    await makeApi(fetchImpl).getXbtMyrCandles(3600, 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('parses balances using Luno field names', () => {
    const api = makeApi(jest.fn());
    const rows = api.parseBalances({
      balance: [
        {
          account_id: '111',
          account_type: 'TRANSACTIONAL',
          asset: 'XBT',
          balance: '0.01234567',
          name: 'BTC',
          reserved: '0.00010000',
          unconfirmed: '0',
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      account_id: '111',
      asset: 'XBT',
      balance: '0.01234567',
      reserved: '0.00010000',
    });
  });

  it('maps 401 / 403 / 429 without leaking secrets', async () => {
    const cases: Array<[number, string]> = [
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [429, 'RATE_LIMITED'],
    ];
    for (const [status, code] of cases) {
      const fetchImpl = jest.fn(async () =>
        textResponse(`denied ${SECRET} ${KEY_ID}`, status),
      );
      try {
        await makeApi(fetchImpl).getBalances();
        throw new Error('expected failure');
      } catch (error) {
        expect(error).toBeInstanceOf(LunoApiException);
        const exception = error as LunoApiException;
        expect(exception.lunoCode).toBe(code);
        const body = JSON.stringify(exception.getResponse());
        expect(body).not.toContain(SECRET);
        expect(redactSecrets(body, [SECRET, KEY_ID])).toBe(body);
      }
    }
  });

  it('maps timeouts and malformed JSON', async () => {
    const abort = jest.fn(async () => {
      throw new Error('The operation was aborted due to timeout');
    });
    await expect(makeApi(abort).getBtcMyrMarketPrice()).rejects.toMatchObject({
      lunoCode: 'TIMEOUT',
    });

    const badJson = jest.fn(async () => textResponse('not-json', 200));
    await expect(makeApi(badJson).getBtcMyrMarketPrice()).rejects.toMatchObject(
      {
        lunoCode: 'MALFORMED',
      },
    );
  });

  it('does not attach Authorization to the public ticker request', async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(
        (init?.headers as Record<string, string>).Authorization,
      ).toBeUndefined();
      return jsonResponse({
        ask: '1',
        bid: '1',
        last_trade: '1',
        pair: 'XBTMYR',
        rolling_24_hour_volume: '0',
        timestamp: 1,
      });
    });
    await makeApi(fetchImpl).getBtcMyrMarketPrice();
  });

  it('requests transactions from a min_row for incremental sync', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      expect(url).toContain(
        '/api/1/accounts/btc-1/transactions?min_row=4901&max_row=5901',
      );
      return jsonResponse({ id: 'btc-1', transactions: [] });
    });
    await makeApi(fetchImpl).getTransactions('btc-1', { minRow: 4901 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

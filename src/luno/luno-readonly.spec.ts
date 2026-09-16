import { readFileSync } from 'fs';
import { join } from 'path';
import { LUNO_GET_PATHS } from './luno.constants';

describe('Luno read-only surface', () => {
  it('never calls Luno write/trade/withdraw endpoints', () => {
    const apiSrc = readFileSync(join(__dirname, 'luno-api.service.ts'), 'utf8');
    expect(apiSrc).toContain("method: 'GET'");
    expect(apiSrc).not.toMatch(/method:\s*'POST'/);
    expect(apiSrc).not.toContain('/api/1/postorder');
    expect(apiSrc).not.toContain('/api/1/marketorder');
    expect(apiSrc).not.toContain('/api/1/send');
    expect(Object.values(LUNO_GET_PATHS)).toEqual(
      expect.arrayContaining([
        '/api/1/ticker',
        '/api/1/balance',
        '/api/1/listorders',
        '/api/1/listtrades',
        '/api/1/withdrawals',
        '/api/exchange/1/transfers',
        '/api/exchange/1/candles',
      ]),
    );
  });

  it('does not add Luno write endpoints or sell/harvest', () => {
    const src = [
      'luno-api.service.ts',
      'luno-sync.service.ts',
      'luno-btc-accounting.service.ts',
      'luno-btc-budget.service.ts',
      'luno-btc-decision.service.ts',
      'accounting/luno-btc-fifo.ts',
      'accounting/luno-btc-formulas.ts',
      'accounting/luno-btc-decision.ts',
      'accounting/luno-btc-market.ts',
      'luno-btc-market.service.ts',
      'accounting/luno-btc-external-risk.ts',
      'luno-btc-external-risk.service.ts',
      'luno.controller.ts',
    ]
      .map((file) => readFileSync(join(__dirname, file), 'utf8'))
      .join('\n');
    expect(src).not.toMatch(/\bHARVEST\b/);
    expect(src).not.toMatch(/\bTAKE SOME PROFIT\b/);
    expect(src).not.toContain('/api/1/marketorder');
    expect(src).not.toContain('/api/1/postorder');
    expect(src).not.toContain('/api/1/send');
  });
});

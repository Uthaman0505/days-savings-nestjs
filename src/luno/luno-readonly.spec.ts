import { readFileSync } from 'fs';
import { join } from 'path';
import { LUNO_GET_PATHS } from './luno.constants';

describe('Luno Phase 1 read-only surface', () => {
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
        '/api/1/withdrawals',
        '/api/exchange/1/transfers',
      ]),
    );
  });
});

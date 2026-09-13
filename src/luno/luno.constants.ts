/**
 * Luno Phase 1 — read-only connectivity.
 * Write/trade/withdraw paths must never be added to this list.
 */
export const LUNO_DEFAULT_BASE_URL = 'https://api.luno.com';
export const LUNO_MARKET_PAIR = 'XBTMYR';
export const LUNO_ASSET_BTC = 'XBT';
export const LUNO_ASSET_MYR = 'MYR';

export const LUNO_GET_PATHS = {
  ticker: '/api/1/ticker',
  balances: '/api/1/balance',
  transactions: '/api/1/accounts/{id}/transactions',
  orders: '/api/1/listorders',
  withdrawals: '/api/1/withdrawals',
  transfers: '/api/exchange/1/transfers',
} as const;

/** Phase 1 allows only these GET paths. Write/trade/withdraw Luno paths are rejected. */
export function isAllowedLunoGetPath(pathAndQuery: string): boolean {
  const pathname = pathAndQuery.split('?')[0] ?? '';
  if (
    pathname === LUNO_GET_PATHS.ticker ||
    pathname === LUNO_GET_PATHS.balances ||
    pathname === LUNO_GET_PATHS.orders ||
    pathname === LUNO_GET_PATHS.withdrawals ||
    pathname === LUNO_GET_PATHS.transfers
  ) {
    return true;
  }
  return /^\/api\/1\/accounts\/[A-Za-z0-9_-]+\/transactions$/.test(pathname);
}

export const LUNO_HTTP_TIMEOUT_MS = 15_000;
export const LUNO_PAGE_LIMIT = 100;
export const LUNO_TX_PAGE_SIZE = 1000;
export const LUNO_MAX_PAGES = 50;

export const LUNO_FETCH = 'LUNO_FETCH';

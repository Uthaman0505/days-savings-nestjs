import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  LUNO_FETCH,
  LUNO_GET_PATHS,
  LUNO_HTTP_TIMEOUT_MS,
  LUNO_MARKET_PAIR,
  LUNO_MAX_PAGES,
  LUNO_PAGE_LIMIT,
  LUNO_TX_PAGE_SIZE,
  isAllowedLunoGetPath,
} from './luno.constants';
import { LunoConfigService } from './luno-config.service';
import { LunoApiException, mapLunoHttpError } from './luno-api.errors';
import { asDecimalString } from './luno-decimal';
import { redactSecrets } from './luno-redact';
import type {
  LunoAccountBalance,
  LunoBalancesResponse,
  LunoOrder,
  LunoOrdersResponse,
  LunoTickerResponse,
  LunoTransaction,
  LunoTransactionsResponse,
  LunoTransfer,
  LunoTransfersResponse,
  LunoUserTrade,
  LunoUserTradesResponse,
  LunoWithdrawal,
  LunoWithdrawalsResponse,
  LunoCandle,
  LunoCandlesResponse,
} from './luno.types';

export type LunoFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

@Injectable()
export class LunoApiService {
  private readonly logger = new Logger(LunoApiService.name);

  constructor(
    private readonly config: LunoConfigService,
    @Optional()
    @Inject(LUNO_FETCH)
    private readonly fetchImpl: LunoFetch | null,
  ) {}

  buildBasicAuthHeader(): string {
    return this.config.basicAuthHeader();
  }

  async getBtcMyrMarketPrice(): Promise<LunoTickerResponse> {
    const raw = await this.getJson<LunoTickerResponse>(
      `${LUNO_GET_PATHS.ticker}?pair=${encodeURIComponent(LUNO_MARKET_PAIR)}`,
      { auth: false },
    );
    return this.parseTicker(raw);
  }

  parseTicker(raw: LunoTickerResponse): LunoTickerResponse {
    if (!raw || typeof raw !== 'object') {
      throw new LunoApiException('MALFORMED', 'Ticker response was empty.');
    }
    return {
      ask: this.decimal(raw.ask, 'ask'),
      bid: this.decimal(raw.bid, 'bid'),
      last_trade: this.decimal(raw.last_trade, 'last_trade'),
      pair: String(raw.pair ?? LUNO_MARKET_PAIR),
      rolling_24_hour_volume: this.decimal(
        raw.rolling_24_hour_volume ?? '0',
        'rolling_24_hour_volume',
      ),
      status: raw.status,
      timestamp: Number(raw.timestamp) || 0,
    };
  }

  async getXbtMyrCandles(
    durationSeconds: number,
    sinceMs: number,
  ): Promise<LunoCandle[]> {
    // Luno candles are authenticated even though other market data is public.
    if (!this.config.apiKeyId || !this.config.apiKeySecret) {
      throw new LunoApiException(
        'NOT_CONFIGURED',
        'Luno candles require API authentication.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const path = `${LUNO_GET_PATHS.candles}?pair=${encodeURIComponent(LUNO_MARKET_PAIR)}&since=${sinceMs}&duration=${durationSeconds}`;
    const raw = await this.getJson<LunoCandlesResponse>(path, { auth: true });
    return this.parseCandles(raw);
  }

  parseCandles(raw: LunoCandlesResponse): LunoCandle[] {
    const rows = Array.isArray(raw?.candles) ? raw.candles : [];
    return rows.map((row) => ({
      timestamp: Number(row.timestamp) || 0,
      open: this.decimal(row.open, 'open'),
      high: this.decimal(row.high, 'high'),
      low: this.decimal(row.low, 'low'),
      close: this.decimal(row.close, 'close'),
      volume: this.decimal(row.volume ?? '0', 'volume'),
    }));
  }

  async getBalances(): Promise<LunoAccountBalance[]> {
    const raw = await this.getJson<LunoBalancesResponse>(
      LUNO_GET_PATHS.balances,
      {
        auth: true,
      },
    );
    return this.parseBalances(raw);
  }

  parseBalances(raw: LunoBalancesResponse): LunoAccountBalance[] {
    const rows = Array.isArray(raw?.balance) ? raw.balance : [];
    return rows.map((row) => ({
      account_id: String(row.account_id ?? ''),
      account_type: row.account_type,
      asset: String(row.asset ?? '').toUpperCase(),
      balance: this.decimal(row.balance, 'balance'),
      name: row.name,
      reserved: this.decimal(row.reserved ?? '0', 'reserved'),
      unconfirmed: this.decimal(row.unconfirmed ?? '0', 'unconfirmed'),
    }));
  }

  async getTransactions(accountId: string): Promise<LunoTransaction[]> {
    const all: LunoTransaction[] = [];
    let minRow = 1;
    for (let page = 0; page < LUNO_MAX_PAGES; page += 1) {
      const maxRow = minRow + LUNO_TX_PAGE_SIZE;
      const path = `/api/1/accounts/${encodeURIComponent(accountId)}/transactions?min_row=${minRow}&max_row=${maxRow}`;
      const raw = await this.getJson<LunoTransactionsResponse>(path, {
        auth: true,
      });
      const chunk = Array.isArray(raw?.transactions) ? raw.transactions : [];
      all.push(...chunk.map((row) => this.parseTransaction(row, accountId)));
      if (chunk.length < LUNO_TX_PAGE_SIZE) {
        break;
      }
      minRow = maxRow;
    }
    return all;
  }

  parseTransaction(
    row: LunoTransaction,
    fallbackAccountId: string,
  ): LunoTransaction {
    return {
      account_id: String(row.account_id ?? fallbackAccountId),
      available: this.decimal(row.available ?? '0', 'available'),
      available_delta: this.decimal(
        row.available_delta ?? '0',
        'available_delta',
      ),
      balance: this.decimal(row.balance ?? '0', 'balance'),
      balance_delta: this.decimal(row.balance_delta ?? '0', 'balance_delta'),
      currency: String(row.currency ?? '').toUpperCase(),
      description: row.description,
      details: row.details,
      kind: row.kind,
      reference: row.reference,
      row_index: Number(row.row_index),
      timestamp: Number(row.timestamp) || 0,
    };
  }

  async getOrders(): Promise<LunoOrder[]> {
    const all: LunoOrder[] = [];
    let createdBefore: number | undefined;
    for (let page = 0; page < LUNO_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        limit: String(LUNO_PAGE_LIMIT),
      });
      if (createdBefore) {
        query.set('created_before', String(createdBefore));
      }
      const raw = await this.getJson<LunoOrdersResponse>(
        `${LUNO_GET_PATHS.orders}?${query.toString()}`,
        { auth: true },
      );
      const chunk = Array.isArray(raw?.orders) ? raw.orders : [];
      all.push(...chunk.map((row) => this.parseOrder(row)));
      if (chunk.length < LUNO_PAGE_LIMIT) {
        break;
      }
      const oldest = chunk[chunk.length - 1]?.creation_timestamp;
      if (!oldest || oldest === createdBefore) {
        break;
      }
      createdBefore = Number(oldest);
    }
    return all;
  }

  parseOrder(row: LunoOrder): LunoOrder {
    return {
      order_id: String(row.order_id ?? ''),
      pair: String(row.pair ?? ''),
      type: String(row.type ?? ''),
      state: String(row.state ?? ''),
      base: this.decimal(row.base ?? '0', 'base'),
      counter: this.decimal(row.counter ?? '0', 'counter'),
      fee_base: this.decimal(row.fee_base ?? '0', 'fee_base'),
      fee_counter: this.decimal(row.fee_counter ?? '0', 'fee_counter'),
      limit_price:
        row.limit_price == null
          ? undefined
          : this.decimal(row.limit_price, 'limit_price'),
      limit_volume:
        row.limit_volume == null
          ? undefined
          : this.decimal(row.limit_volume, 'limit_volume'),
      creation_timestamp: Number(row.creation_timestamp) || 0,
      completed_timestamp: Number(row.completed_timestamp) || 0,
      expiration_timestamp: Number(row.expiration_timestamp) || 0,
      time_in_force: row.time_in_force,
    };
  }

  async getUserTrades(pair = LUNO_MARKET_PAIR): Promise<LunoUserTrade[]> {
    const all: LunoUserTrade[] = [];
    let before: number | undefined;
    for (let page = 0; page < LUNO_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        pair,
        limit: String(LUNO_PAGE_LIMIT),
      });
      if (before) {
        query.set('before', String(before));
      }
      const raw = await this.getJson<LunoUserTradesResponse>(
        `${LUNO_GET_PATHS.trades}?${query.toString()}`,
        { auth: true },
      );
      const chunk = Array.isArray(raw?.trades) ? raw.trades : [];
      all.push(...chunk.map((row) => this.parseUserTrade(row, pair)));
      if (chunk.length < LUNO_PAGE_LIMIT) {
        break;
      }
      const oldest = chunk[chunk.length - 1]?.timestamp;
      if (!oldest || oldest === before) {
        break;
      }
      before = Number(oldest);
    }
    return all;
  }

  parseUserTrade(row: LunoUserTrade, fallbackPair: string): LunoUserTrade {
    return {
      base: this.decimal(row.base ?? '0', 'base'),
      counter: this.decimal(row.counter ?? '0', 'counter'),
      fee_base: this.decimal(row.fee_base ?? '0', 'fee_base'),
      fee_counter: this.decimal(row.fee_counter ?? '0', 'fee_counter'),
      is_buy: Boolean(row.is_buy),
      order_id: String(row.order_id ?? ''),
      pair: String(row.pair ?? fallbackPair),
      price: this.decimal(row.price ?? '0', 'price'),
      sequence: Number(row.sequence) || 0,
      timestamp: Number(row.timestamp) || 0,
      type: String(row.type ?? ''),
      volume: this.decimal(row.volume ?? '0', 'volume'),
    };
  }

  async getWithdrawals(): Promise<LunoWithdrawal[]> {
    const all: LunoWithdrawal[] = [];
    let beforeId: string | undefined;
    for (let page = 0; page < LUNO_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        limit: String(LUNO_PAGE_LIMIT),
      });
      if (beforeId) {
        query.set('before_id', beforeId);
      }
      const raw = await this.getJson<LunoWithdrawalsResponse>(
        `${LUNO_GET_PATHS.withdrawals}?${query.toString()}`,
        { auth: true },
      );
      const chunk = Array.isArray(raw?.withdrawals) ? raw.withdrawals : [];
      all.push(...chunk.map((row) => this.parseWithdrawal(row)));
      if (chunk.length < LUNO_PAGE_LIMIT) {
        break;
      }
      const lastId = chunk[chunk.length - 1]?.id;
      if (!lastId || lastId === beforeId) {
        break;
      }
      beforeId = String(lastId);
    }
    return all;
  }

  parseWithdrawal(row: LunoWithdrawal): LunoWithdrawal {
    return {
      id: String(row.id ?? ''),
      amount: this.decimal(row.amount ?? '0', 'amount'),
      currency: String(row.currency ?? '').toUpperCase(),
      fee: row.fee == null ? undefined : this.decimal(row.fee, 'fee'),
      status: row.status,
      type: row.type,
      created_at: Number(row.created_at) || 0,
      external_id: row.external_id,
      transfer_id: row.transfer_id,
    };
  }

  async getTransfers(accountId: string): Promise<LunoTransfer[]> {
    const all: LunoTransfer[] = [];
    let before: number | undefined;
    for (let page = 0; page < LUNO_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        account_id: accountId,
        limit: String(LUNO_PAGE_LIMIT),
      });
      if (before) {
        query.set('before', String(before));
      }
      const raw = await this.getJson<LunoTransfersResponse>(
        `${LUNO_GET_PATHS.transfers}?${query.toString()}`,
        { auth: true },
      );
      const chunk = Array.isArray(raw?.transfers) ? raw.transfers : [];
      all.push(...chunk.map((row) => this.parseTransfer(row)));
      if (chunk.length < LUNO_PAGE_LIMIT) {
        break;
      }
      const oldest = chunk[chunk.length - 1]?.created_at;
      if (!oldest || oldest === before) {
        break;
      }
      before = Number(oldest);
    }
    return all;
  }

  parseTransfer(row: LunoTransfer): LunoTransfer {
    return {
      id: String(row.id ?? ''),
      amount: this.decimal(row.amount ?? '0', 'amount'),
      fee: row.fee == null ? undefined : this.decimal(row.fee, 'fee'),
      inbound: Boolean(row.inbound),
      created_at: Number(row.created_at) || 0,
      transaction_id: row.transaction_id,
    };
  }

  private decimal(value: unknown, field: string): string {
    try {
      return asDecimalString(value);
    } catch {
      throw new LunoApiException(
        'MALFORMED',
        `Luno returned an invalid decimal for ${field}.`,
      );
    }
  }

  private async getJson<T>(
    path: string,
    options: { auth: boolean },
  ): Promise<T> {
    if (!path.startsWith('/') || !isAllowedLunoGetPath(path)) {
      throw new LunoApiException(
        'FORBIDDEN',
        'Blocked a non-allowlisted Luno path (Phase 1 is GET-only).',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (options.auth) {
      try {
        headers.Authorization = this.buildBasicAuthHeader();
      } catch {
        throw new LunoApiException(
          'NOT_CONFIGURED',
          'Luno credentials are not configured.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const init: RequestInit = {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(LUNO_HTTP_TIMEOUT_MS),
    };

    const fetchFn = this.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchFn(url, init);
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : 'network error',
        [this.config.apiKeySecret, this.config.apiKeyId],
      );
      if (
        message.toLowerCase().includes('abort') ||
        message.toLowerCase().includes('timeout')
      ) {
        throw new LunoApiException('TIMEOUT', 'Luno API request timed out.');
      }
      this.logger.warn(`Luno network error: ${message}`);
      throw new LunoApiException('NETWORK', 'Unable to reach Luno API.');
    }

    const bodyText = await response.text();
    const safeBody = redactSecrets(bodyText, [
      this.config.apiKeySecret,
      this.config.apiKeyId,
    ]);
    if (!response.ok) {
      this.logger.warn(
        `Luno HTTP ${response.status}: ${safeBody.slice(0, 200)}`,
      );
      throw mapLunoHttpError(response.status, safeBody);
    }
    if (!bodyText) {
      throw new LunoApiException('MALFORMED', 'Luno returned an empty body.');
    }
    try {
      return JSON.parse(bodyText) as T;
    } catch {
      throw new LunoApiException('MALFORMED', 'Luno returned non-JSON.');
    }
  }
}

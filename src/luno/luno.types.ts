/**
 * Official Luno JSON shapes (luno-go types.go / GET endpoints).
 * Amounts arrive as decimal strings (sometimes JSON numbers). Store as strings.
 */

export type LunoAccountBalance = {
  account_id: string;
  account_type?: string;
  asset: string;
  balance: string;
  name?: string;
  reserved: string;
  unconfirmed: string;
};

export type LunoBalancesResponse = {
  balance: LunoAccountBalance[];
};

export type LunoTickerResponse = {
  ask: string;
  bid: string;
  last_trade: string;
  pair: string;
  rolling_24_hour_volume: string;
  status?: string;
  timestamp: number;
};

export type LunoTransaction = {
  account_id: string;
  available: string;
  available_delta: string;
  balance: string;
  balance_delta: string;
  currency: string;
  description?: string;
  details?: Record<string, string>;
  kind?: string;
  reference?: string;
  row_index: number;
  timestamp: number;
};

export type LunoTransactionsResponse = {
  id: string;
  transactions: LunoTransaction[];
};

export type LunoOrder = {
  order_id: string;
  pair: string;
  type: string;
  state: string;
  base: string;
  counter: string;
  fee_base: string;
  fee_counter: string;
  limit_price?: string;
  limit_volume?: string;
  creation_timestamp: number;
  completed_timestamp?: number;
  expiration_timestamp?: number;
  time_in_force?: string;
};

export type LunoOrdersResponse = {
  orders: LunoOrder[];
};

export type LunoUserTrade = {
  base: string;
  counter: string;
  fee_base: string;
  fee_counter: string;
  is_buy: boolean;
  order_id: string;
  pair: string;
  price: string;
  sequence: number;
  timestamp: number;
  type: string;
  volume: string;
};

export type LunoUserTradesResponse = {
  trades: LunoUserTrade[];
};

export type LunoWithdrawal = {
  id: string;
  amount: string;
  currency: string;
  fee?: string;
  status?: string;
  type?: string;
  created_at: number;
  external_id?: string;
  transfer_id?: string;
};

export type LunoWithdrawalsResponse = {
  withdrawals: LunoWithdrawal[];
};

export type LunoTransfer = {
  id: string;
  amount: string;
  fee?: string;
  inbound: boolean;
  created_at: number;
  transaction_id?: string;
};

export type LunoTransfersResponse = {
  transfers: LunoTransfer[];
};

export type LunoHealthResult = {
  connected: boolean;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  btcAccountFound: boolean;
  myrAccountFound: boolean;
  btcBalance: string | null;
  myrBalance: string | null;
  myrAvailableBalance: string | null;
  marketPair: string;
  lastTradePrice: string | null;
  transactionsSynced: number;
  ordersSynced: number;
  withdrawalsSynced: number;
  transfersSynced: number;
  errors: string[];
};

export type LunoSyncResult = {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  startedAt: string;
  finishedAt: string;
  btcAccountId: string | null;
  myrAccountId: string | null;
  accountsUpserted: number;
  transactionsUpserted: number;
  ordersUpserted: number;
  withdrawalsUpserted: number;
  transfersUpserted: number;
  errors: string[];
};

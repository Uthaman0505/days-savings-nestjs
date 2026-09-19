import { ConfigService } from '@nestjs/config';
import { LunoApiException } from './luno-api.errors';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { LunoSyncService } from './luno-sync.service';
import type { LunoAccount } from './entities/luno-account.entity';
import type { LunoBalance } from './entities/luno-balance.entity';
import type { LunoOrderRow } from './entities/luno-order.entity';
import type { LunoSyncRun } from './entities/luno-sync-run.entity';
import type { LunoTransactionRow } from './entities/luno-transaction.entity';
import type { LunoTransferRow } from './entities/luno-transfer.entity';
import type { LunoWithdrawalRow } from './entities/luno-withdrawal.entity';
import { LUNO_TX_OVERLAP_ROWS } from './luno.constants';
import type {
  LunoAccountBalance,
  LunoOrder,
  LunoTransaction,
  LunoTransfer,
  LunoWithdrawal,
} from './luno.types';

type MemoryRow = { id?: string } & Record<string, unknown>;

function memoryRepo<T extends MemoryRow>(keyOf: (row: T) => string) {
  const rows = new Map<string, T>();
  return {
    rows,
    create: (data: Partial<T>) => ({ ...data }) as T,
    save: jest.fn(async (row: T) => {
      if (!row.id) {
        row.id = `id-${rows.size + 1}`;
      }
      rows.set(keyOf(row), row);
      return row;
    }),
    find: jest.fn(
      async (opts?: {
        where?: Record<string, unknown>;
        order?: Record<string, 'ASC' | 'DESC'>;
        take?: number;
        select?: string[];
      }) => {
        let list = [...rows.values()];
        if (opts?.where) {
          list = list.filter((row) =>
            Object.entries(opts.where ?? {}).every(
              ([key, value]) => row[key] === value,
            ),
          );
        }
        if (opts?.order) {
          const [key, dir] = Object.entries(opts.order)[0] ?? [];
          if (key && dir) {
            list.sort((a, b) => {
              const av = Number(a[key]) || 0;
              const bv = Number(b[key]) || 0;
              return dir === 'DESC' ? bv - av : av - bv;
            });
          }
        }
        if (opts?.take != null) {
          list = list.slice(0, opts.take);
        }
        return list;
      },
    ),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const match = [...rows.values()].find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
      return match ?? null;
    }),
  };
}

function enabledConfig(): LunoConfigService {
  return new LunoConfigService({
    get: (key: string) =>
      ({
        LUNO_ENABLED: 'true',
        LUNO_API_KEY_ID: 'key-id',
        LUNO_API_KEY_SECRET: 'super-secret-value-xyz',
      })[key],
  } as ConfigService);
}

const sampleBalances: LunoAccountBalance[] = [
  {
    account_id: 'btc-1',
    account_type: 'TRANSACTIONAL',
    asset: 'XBT',
    balance: '0.01000000',
    reserved: '0',
    unconfirmed: '0',
    name: 'BTC',
  },
  {
    account_id: 'myr-1',
    account_type: 'TRANSACTIONAL',
    asset: 'MYR',
    balance: '150.25',
    reserved: '10.00',
    unconfirmed: '0',
    name: 'MYR',
  },
];

const sampleTx: LunoTransaction = {
  account_id: 'btc-1',
  available: '0.01',
  available_delta: '0.01',
  balance: '0.01',
  balance_delta: '0.01',
  currency: 'XBT',
  description: 'Deposit',
  kind: 'RECEIVED',
  reference: 'ref-1',
  row_index: 1,
  timestamp: 1_700_000_000_000,
};

function makeSync(api: Partial<LunoApiService>) {
  const syncRuns = memoryRepo<LunoSyncRun>((row) => String(row.id));
  const accounts = memoryRepo<LunoAccount>((row) => row.lunoAccountId);
  const balances = memoryRepo<LunoBalance>(
    (row) => `${row.syncRunId}:${row.lunoAccountId}`,
  );
  const transactions = memoryRepo<LunoTransactionRow>(
    (row) => `${row.lunoAccountId}:${row.rowIndex}`,
  );
  const orders = memoryRepo<LunoOrderRow>((row) => row.lunoOrderId);
  const withdrawals = memoryRepo<LunoWithdrawalRow>(
    (row) => row.lunoWithdrawalId,
  );
  const transfers = memoryRepo<LunoTransferRow>((row) => row.lunoTransferId);
  const userTrades = memoryRepo<{ pair: string; sequence: string } & MemoryRow>(
    (row) => `${row.pair}:${row.sequence}`,
  );
  const service = new LunoSyncService(
    api as LunoApiService,
    enabledConfig(),
    syncRuns as never,
    accounts as never,
    balances as never,
    transactions as never,
    orders as never,
    withdrawals as never,
    transfers as never,
    userTrades as never,
  );
  return {
    service,
    accounts,
    transactions,
    orders,
    withdrawals,
    transfers,
  };
}

describe('LunoSyncService', () => {
  it('upserts transactions idempotently using (account_id, row_index)', async () => {
    const api = {
      getBalances: jest.fn(async () => sampleBalances),
      getOrders: jest.fn(async () => [] as LunoOrder[]),
      getWithdrawals: jest.fn(async () => [] as LunoWithdrawal[]),
      getTransactions: jest.fn(async (accountId: string) =>
        accountId === 'btc-1' ? [sampleTx] : [],
      ),
      getTransfers: jest.fn(async () => [] as LunoTransfer[]),
      getUserTrades: jest.fn(async () => []),
    };
    const { service, transactions } = makeSync(api);
    await service.runSync();
    await service.runSync();
    expect(transactions.rows.size).toBe(1);
    expect(api.getTransactions).toHaveBeenCalledWith('btc-1', { minRow: 1 });
    expect(api.getTransactions).toHaveBeenCalledWith('myr-1', { minRow: 1 });
  });

  it('fetches only newer transactions with an overlap window', async () => {
    const api = {
      getBalances: jest.fn(async () => sampleBalances),
      getOrders: jest.fn(async () => [] as LunoOrder[]),
      getWithdrawals: jest.fn(async () => [] as LunoWithdrawal[]),
      getTransactions: jest.fn(async () => []),
      getTransfers: jest.fn(async () => [] as LunoTransfer[]),
      getUserTrades: jest.fn(async () => []),
    };
    const { service, transactions } = makeSync(api);
    await transactions.save({
      lunoAccountId: 'btc-1',
      rowIndex: '5000',
      currency: 'XBT',
      balance: '0.01',
      balanceDelta: '0.01',
      available: '0.01',
      availableDelta: '0.01',
      occurredAt: new Date(),
      syncedAt: new Date(),
    } as LunoTransactionRow);
    await service.runSync();
    expect(api.getTransactions).toHaveBeenCalledWith('btc-1', {
      minRow: 5000 - LUNO_TX_OVERLAP_ROWS + 1,
    });
    expect(api.getTransactions).toHaveBeenCalledWith('myr-1', { minRow: 1 });
  });

  it('does not duplicate orders, withdrawals, or transfers', async () => {
    const api = {
      getBalances: jest.fn(async () => sampleBalances),
      getOrders: jest.fn(async () => [
        {
          order_id: 'BX1',
          pair: 'XBTMYR',
          type: 'BUY',
          state: 'COMPLETE',
          base: '0.01',
          counter: '5000.00',
          fee_base: '0',
          fee_counter: '10.00',
          creation_timestamp: 1,
        },
      ]),
      getWithdrawals: jest.fn(async () => [
        {
          id: 'W1',
          amount: '100.00',
          currency: 'MYR',
          fee: '1.00',
          created_at: 1,
        },
      ]),
      getTransactions: jest.fn(async () => []),
      getTransfers: jest.fn(async () => [
        {
          id: 'T1',
          amount: '50.00',
          inbound: true,
          created_at: 1,
        },
      ]),
      getUserTrades: jest.fn(async () => []),
    };
    const { service, orders, withdrawals, transfers } = makeSync(api);
    await service.runSync();
    await service.runSync();
    expect(orders.rows.size).toBe(1);
    expect(withdrawals.rows.size).toBe(1);
    expect(transfers.rows.size).toBe(1);
  });

  it('keeps previously stored rows when one endpoint fails', async () => {
    const api = {
      getBalances: jest.fn(async () => sampleBalances),
      getOrders: jest.fn(async () => [
        {
          order_id: 'BX1',
          pair: 'XBTMYR',
          type: 'BUY',
          state: 'COMPLETE',
          base: '0.01',
          counter: '1',
          fee_base: '0',
          fee_counter: '0',
          creation_timestamp: 1,
        },
      ]),
      getWithdrawals: jest.fn(async () => {
        throw new LunoApiException(
          'FORBIDDEN',
          'Luno API key is missing a required read permission.',
        );
      }),
      getTransactions: jest.fn(async () => []),
      getTransfers: jest.fn(async () => []),
      getUserTrades: jest.fn(async () => []),
    };
    const { service, orders } = makeSync(api);
    const result = await service.runSync();
    expect(result.status).toBe('PARTIAL');
    expect(orders.rows.size).toBe(1);
    expect(result.errors.some((row) => row.includes('withdrawals'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('super-secret-value-xyz');
  });

  it('rejects sync when Luno is disabled', async () => {
    const disabled = new LunoConfigService({
      get: () => 'false',
    } as unknown as ConfigService);
    const service = new LunoSyncService(
      {} as LunoApiService,
      disabled,
      memoryRepo<LunoSyncRun>((row) => String(row.id)) as never,
      memoryRepo<LunoAccount>((row) => row.lunoAccountId) as never,
      memoryRepo<LunoBalance>((row) => String(row.id)) as never,
      memoryRepo<LunoTransactionRow>((row) => String(row.id)) as never,
      memoryRepo<LunoOrderRow>((row) => row.lunoOrderId) as never,
      memoryRepo<LunoWithdrawalRow>((row) => row.lunoWithdrawalId) as never,
      memoryRepo<LunoTransferRow>((row) => row.lunoTransferId) as never,
      memoryRepo<{ pair: string; sequence: string } & MemoryRow>(
        (row) => `${row.pair}:${row.sequence}`,
      ) as never,
    );
    await expect(service.runSync()).rejects.toMatchObject({
      lunoCode: 'NOT_ENABLED',
    });
  });
});

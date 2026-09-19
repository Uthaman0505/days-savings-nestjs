import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { identifyBtcMyrAccounts } from './luno-accounts';
import { LunoApiException } from './luno-api.errors';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { redactSecrets } from './luno-redact';
import { LUNO_TX_OVERLAP_ROWS } from './luno.constants';
import { LunoAccount } from './entities/luno-account.entity';
import { LunoBalance } from './entities/luno-balance.entity';
import { LunoOrderRow } from './entities/luno-order.entity';
import { LunoSyncRun } from './entities/luno-sync-run.entity';
import { LunoTransactionRow } from './entities/luno-transaction.entity';
import { LunoTransferRow } from './entities/luno-transfer.entity';
import { LunoUserTradeRow } from './entities/luno-user-trade.entity';
import { LunoWithdrawalRow } from './entities/luno-withdrawal.entity';
import type {
  LunoAccountBalance,
  LunoOrder,
  LunoSyncResult,
  LunoTransaction,
  LunoTransfer,
  LunoUserTrade,
  LunoWithdrawal,
} from './luno.types';

export async function measureSyncStage<T>(
  logger: Logger,
  stage: string,
  fn: () => Promise<T>,
): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - started;
    logger.log(JSON.stringify({ event: 'LUNO_SYNC', stage, ms }));
    return { value, ms };
  } catch (error) {
    const ms = Date.now() - started;
    logger.warn(
      JSON.stringify({
        event: 'LUNO_SYNC',
        stage,
        ms,
        failed: true,
      }),
    );
    throw error;
  }
}

@Injectable()
export class LunoSyncService {
  private readonly logger = new Logger(LunoSyncService.name);

  constructor(
    private readonly api: LunoApiService,
    private readonly config: LunoConfigService,
    @InjectRepository(LunoSyncRun)
    private readonly syncRuns: Repository<LunoSyncRun>,
    @InjectRepository(LunoAccount)
    private readonly accounts: Repository<LunoAccount>,
    @InjectRepository(LunoBalance)
    private readonly balances: Repository<LunoBalance>,
    @InjectRepository(LunoTransactionRow)
    private readonly transactions: Repository<LunoTransactionRow>,
    @InjectRepository(LunoOrderRow)
    private readonly orders: Repository<LunoOrderRow>,
    @InjectRepository(LunoWithdrawalRow)
    private readonly withdrawals: Repository<LunoWithdrawalRow>,
    @InjectRepository(LunoTransferRow)
    private readonly transfers: Repository<LunoTransferRow>,
    @InjectRepository(LunoUserTradeRow)
    private readonly userTrades: Repository<LunoUserTradeRow>,
  ) {}

  async runSync(): Promise<LunoSyncResult> {
    if (!this.config.enabled) {
      throw new LunoApiException(
        'NOT_ENABLED',
        'Luno sync is not enabled.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const startedAt = new Date();
    const run = await this.syncRuns.save(
      this.syncRuns.create({
        status: 'RUNNING',
        startedAt,
        finishedAt: null,
        accountsUpserted: 0,
        transactionsUpserted: 0,
        ordersUpserted: 0,
        withdrawalsUpserted: 0,
        transfersUpserted: 0,
        errorMessage: null,
      }),
    );
    const errors: string[] = [];
    const result: LunoSyncResult = {
      status: 'SUCCESS',
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      btcAccountId: null,
      myrAccountId: null,
      accountsUpserted: 0,
      transactionsUpserted: 0,
      ordersUpserted: 0,
      withdrawalsUpserted: 0,
      transfersUpserted: 0,
      errors,
    };

    let listed: LunoAccountBalance[] = [];
    try {
      const timed = await measureSyncStage(this.logger, 'balanceMs', () =>
        this.api.getBalances(),
      );
      listed = timed.value;
      const identified = identifyBtcMyrAccounts(listed);
      result.btcAccountId = identified.btc?.account_id ?? null;
      result.myrAccountId = identified.myr?.account_id ?? null;
      if (!identified.btc) {
        errors.push('BTC (XBT) account was not found.');
      }
      if (!identified.myr) {
        errors.push('MYR account was not found.');
      }
      result.accountsUpserted = await this.persistAccounts(listed, run);
    } catch (error) {
      errors.push(this.safeError('balances', error));
    }

    const accountIds = listed
      .map((row) => row.account_id)
      .filter((id) => id.length > 0);

    const independent = await Promise.allSettled([
      measureSyncStage(this.logger, 'orderMs', () => this.api.getOrders()),
      measureSyncStage(this.logger, 'tradeMs', () => this.api.getUserTrades()),
      measureSyncStage(this.logger, 'withdrawalMs', () =>
        this.api.getWithdrawals(),
      ),
    ]);

    if (independent[0].status === 'fulfilled') {
      result.ordersUpserted = await this.persistOrders(
        independent[0].value.value,
      );
    } else {
      errors.push(this.safeError('orders', independent[0].reason));
    }
    if (independent[1].status === 'fulfilled') {
      await this.persistUserTrades(independent[1].value.value);
    } else {
      errors.push(this.safeError('trades', independent[1].reason));
    }
    if (independent[2].status === 'fulfilled') {
      result.withdrawalsUpserted = await this.persistWithdrawals(
        independent[2].value.value,
      );
    } else {
      errors.push(this.safeError('withdrawals', independent[2].reason));
    }

    const accountResults = await Promise.all(
      accountIds.map(async (accountId) => {
        const minRow = await this.nextTransactionMinRow(accountId);
        const [txResult, transferResult] = await Promise.allSettled([
          measureSyncStage(this.logger, `transactionMs:${accountId}`, () =>
            this.api.getTransactions(accountId, { minRow }),
          ),
          measureSyncStage(this.logger, `transferMs:${accountId}`, () =>
            this.api.getTransfers(accountId),
          ),
        ]);
        const localErrors: string[] = [];
        let transactionsUpserted = 0;
        let transfersUpserted = 0;
        if (txResult.status === 'fulfilled') {
          transactionsUpserted = await this.persistTransactions(
            txResult.value.value,
          );
        } else {
          localErrors.push(
            this.safeError(`transactions:${accountId}`, txResult.reason),
          );
        }
        if (transferResult.status === 'fulfilled') {
          transfersUpserted = await this.persistTransfers(
            accountId,
            transferResult.value.value,
          );
        } else {
          localErrors.push(
            this.safeError(`transfers:${accountId}`, transferResult.reason),
          );
        }
        return { transactionsUpserted, transfersUpserted, localErrors };
      }),
    );
    for (const row of accountResults) {
      result.transactionsUpserted += row.transactionsUpserted;
      result.transfersUpserted += row.transfersUpserted;
      errors.push(...row.localErrors);
    }

    result.status =
      errors.length === 0
        ? 'SUCCESS'
        : result.accountsUpserted +
              result.transactionsUpserted +
              result.ordersUpserted +
              result.withdrawalsUpserted +
              result.transfersUpserted >
            0
          ? 'PARTIAL'
          : 'FAILED';
    const finishedAt = new Date();
    result.finishedAt = finishedAt.toISOString();
    run.status = result.status;
    run.finishedAt = finishedAt;
    run.btcAccountId = result.btcAccountId;
    run.myrAccountId = result.myrAccountId;
    run.accountsUpserted = result.accountsUpserted;
    run.transactionsUpserted = result.transactionsUpserted;
    run.ordersUpserted = result.ordersUpserted;
    run.withdrawalsUpserted = result.withdrawalsUpserted;
    run.transfersUpserted = result.transfersUpserted;
    run.errorMessage = errors.length ? errors.join(' | ') : null;
    await this.syncRuns.save(run);
    this.logger.log(
      JSON.stringify({
        event: 'LUNO_SYNC',
        stage: 'lunoDataMs',
        ms: finishedAt.getTime() - startedAt.getTime(),
        status: result.status,
      }),
    );
    return result;
  }

  private async nextTransactionMinRow(accountId: string): Promise<number> {
    const latest = await this.transactions.find({
      where: { lunoAccountId: accountId },
      order: { rowIndex: 'DESC' },
      take: 1,
      select: ['rowIndex'],
    });
    const rowIndex = Number(latest[0]?.rowIndex);
    if (!Number.isFinite(rowIndex) || rowIndex < 1) {
      return 1;
    }
    return Math.max(1, rowIndex - LUNO_TX_OVERLAP_ROWS + 1);
  }

  private async persistAccounts(
    listed: LunoAccountBalance[],
    run: LunoSyncRun,
  ): Promise<number> {
    const syncedAt = new Date();
    for (const row of listed) {
      if (!row.account_id) {
        continue;
      }
      const existing = await this.accounts.findOne({
        where: { lunoAccountId: row.account_id },
      });
      const payload = existing ?? this.accounts.create();
      payload.lunoAccountId = row.account_id;
      payload.asset = row.asset;
      payload.name = row.name ?? null;
      payload.accountType = row.account_type ?? null;
      payload.balance = row.balance;
      payload.reserved = row.reserved;
      payload.unconfirmed = row.unconfirmed;
      payload.rawPayload = row as unknown as Record<string, unknown>;
      payload.syncedAt = syncedAt;
      await this.accounts.save(payload);
      await this.balances.save(
        this.balances.create({
          syncRunId: run.id,
          lunoAccountId: row.account_id,
          asset: row.asset,
          balance: row.balance,
          reserved: row.reserved,
          unconfirmed: row.unconfirmed,
          rawPayload: row as unknown as Record<string, unknown>,
          syncedAt,
        }),
      );
    }
    return listed.length;
  }

  private async persistTransactions(rows: LunoTransaction[]): Promise<number> {
    const syncedAt = new Date();
    let count = 0;
    for (const row of rows) {
      if (!row.account_id || !Number.isFinite(row.row_index)) {
        continue;
      }
      const existing = await this.transactions.findOne({
        where: {
          lunoAccountId: row.account_id,
          rowIndex: String(row.row_index),
        },
      });
      const payload = existing ?? this.transactions.create();
      payload.lunoAccountId = row.account_id;
      payload.rowIndex = String(row.row_index);
      payload.reference = row.reference ?? null;
      payload.currency = row.currency;
      payload.kind = row.kind ?? null;
      payload.description = row.description ?? null;
      payload.balance = row.balance;
      payload.balanceDelta = row.balance_delta;
      payload.available = row.available;
      payload.availableDelta = row.available_delta;
      payload.occurredAt = new Date(row.timestamp);
      payload.rawPayload = row as unknown as Record<string, unknown>;
      payload.syncedAt = syncedAt;
      await this.transactions.save(payload);
      count += 1;
    }
    return count;
  }

  private async persistOrders(rows: LunoOrder[]): Promise<number> {
    const syncedAt = new Date();
    let count = 0;
    for (const row of rows) {
      if (!row.order_id) {
        continue;
      }
      const existing = await this.orders.findOne({
        where: { lunoOrderId: row.order_id },
      });
      const payload = existing ?? this.orders.create();
      payload.lunoOrderId = row.order_id;
      payload.pair = row.pair;
      payload.type = row.type;
      payload.state = row.state;
      payload.baseAmount = row.base;
      payload.counterAmount = row.counter;
      payload.feeBase = row.fee_base;
      payload.feeCounter = row.fee_counter;
      payload.limitPrice = row.limit_price ?? null;
      payload.createdAtLuno = new Date(row.creation_timestamp);
      payload.completedAtLuno = row.completed_timestamp
        ? new Date(row.completed_timestamp)
        : null;
      payload.rawPayload = row as unknown as Record<string, unknown>;
      payload.syncedAt = syncedAt;
      await this.orders.save(payload);
      count += 1;
    }
    return count;
  }

  private async persistUserTrades(rows: LunoUserTrade[]): Promise<number> {
    const syncedAt = new Date();
    let count = 0;
    for (const row of rows) {
      if (!Number.isFinite(row.sequence)) {
        continue;
      }
      const existing = await this.userTrades.findOne({
        where: { pair: row.pair, sequence: String(row.sequence) },
      });
      const payload = existing ?? this.userTrades.create();
      payload.pair = row.pair;
      payload.sequence = String(row.sequence);
      payload.lunoOrderId = row.order_id || null;
      payload.type = row.type;
      payload.isBuy = row.is_buy;
      payload.base = row.base;
      payload.counter = row.counter;
      payload.feeBase = row.fee_base;
      payload.feeCounter = row.fee_counter;
      payload.price = row.price ?? null;
      payload.tradedAt = new Date(row.timestamp);
      payload.rawPayload = row as unknown as Record<string, unknown>;
      payload.syncedAt = syncedAt;
      await this.userTrades.save(payload);
      count += 1;
    }
    return count;
  }

  private async persistWithdrawals(rows: LunoWithdrawal[]): Promise<number> {
    const syncedAt = new Date();
    let count = 0;
    for (const row of rows) {
      if (!row.id) {
        continue;
      }
      const existing = await this.withdrawals.findOne({
        where: { lunoWithdrawalId: row.id },
      });
      const payload = existing ?? this.withdrawals.create();
      payload.lunoWithdrawalId = row.id;
      payload.currency = row.currency;
      payload.amount = row.amount;
      payload.fee = row.fee ?? null;
      payload.status = row.status ?? null;
      payload.type = row.type ?? null;
      payload.transferId = row.transfer_id ?? null;
      payload.createdAtLuno = new Date(row.created_at);
      payload.rawPayload = row as unknown as Record<string, unknown>;
      payload.syncedAt = syncedAt;
      await this.withdrawals.save(payload);
      count += 1;
    }
    return count;
  }

  private async persistTransfers(
    accountId: string,
    rows: LunoTransfer[],
  ): Promise<number> {
    const syncedAt = new Date();
    let count = 0;
    for (const row of rows) {
      if (!row.id) {
        continue;
      }
      const existing = await this.transfers.findOne({
        where: { lunoTransferId: row.id },
      });
      const payload = existing ?? this.transfers.create();
      payload.lunoTransferId = row.id;
      payload.lunoAccountId = accountId;
      payload.amount = row.amount;
      payload.fee = row.fee ?? null;
      payload.inbound = row.inbound;
      payload.chainTxId = row.transaction_id ?? null;
      payload.createdAtLuno = new Date(row.created_at);
      payload.rawPayload = row as unknown as Record<string, unknown>;
      payload.syncedAt = syncedAt;
      await this.transfers.save(payload);
      count += 1;
    }
    return count;
  }

  private safeError(scope: string, error: unknown): string {
    const raw =
      error instanceof Error ? error.message : `Unknown ${scope} failure`;
    const message = redactSecrets(raw, [
      this.config.apiKeySecret,
      this.config.apiKeyId,
    ]);
    this.logger.warn(`Luno sync ${scope}: ${message}`);
    return `${scope}: ${message}`;
  }
}

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { identifyBtcMyrAccounts } from './luno-accounts';
import { LunoApiException } from './luno-api.errors';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { redactSecrets } from './luno-redact';
import { LunoAccount } from './entities/luno-account.entity';
import { LunoBalance } from './entities/luno-balance.entity';
import { LunoOrderRow } from './entities/luno-order.entity';
import { LunoSyncRun } from './entities/luno-sync-run.entity';
import { LunoTransactionRow } from './entities/luno-transaction.entity';
import { LunoTransferRow } from './entities/luno-transfer.entity';
import { LunoWithdrawalRow } from './entities/luno-withdrawal.entity';
import type {
  LunoAccountBalance,
  LunoOrder,
  LunoSyncResult,
  LunoTransaction,
  LunoTransfer,
  LunoWithdrawal,
} from './luno.types';

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
      listed = await this.api.getBalances();
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

    try {
      result.ordersUpserted = await this.persistOrders(
        await this.api.getOrders(),
      );
    } catch (error) {
      errors.push(this.safeError('orders', error));
    }

    try {
      result.withdrawalsUpserted = await this.persistWithdrawals(
        await this.api.getWithdrawals(),
      );
    } catch (error) {
      errors.push(this.safeError('withdrawals', error));
    }

    for (const accountId of accountIds) {
      try {
        const rows = await this.api.getTransactions(accountId);
        result.transactionsUpserted += await this.persistTransactions(rows);
      } catch (error) {
        errors.push(this.safeError(`transactions:${accountId}`, error));
      }
      try {
        const rows = await this.api.getTransfers(accountId);
        result.transfersUpserted += await this.persistTransfers(
          accountId,
          rows,
        );
      } catch (error) {
        errors.push(this.safeError(`transfers:${accountId}`, error));
      }
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
    return result;
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

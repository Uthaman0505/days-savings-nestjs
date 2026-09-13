import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { identifyBtcMyrAccounts } from './luno-accounts';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { addDecimalStrings } from './luno-decimal';
import { LUNO_MARKET_PAIR } from './luno.constants';
import { LunoAccount } from './entities/luno-account.entity';
import { LunoOrderRow } from './entities/luno-order.entity';
import { LunoSyncRun } from './entities/luno-sync-run.entity';
import { LunoTransactionRow } from './entities/luno-transaction.entity';
import { LunoTransferRow } from './entities/luno-transfer.entity';
import { LunoWithdrawalRow } from './entities/luno-withdrawal.entity';
import type { LunoAccountBalance, LunoHealthResult } from './luno.types';

@Injectable()
export class LunoHealthService {
  constructor(
    private readonly api: LunoApiService,
    private readonly config: LunoConfigService,
    @InjectRepository(LunoAccount)
    private readonly accounts: Repository<LunoAccount>,
    @InjectRepository(LunoSyncRun)
    private readonly syncRuns: Repository<LunoSyncRun>,
    @InjectRepository(LunoTransactionRow)
    private readonly transactions: Repository<LunoTransactionRow>,
    @InjectRepository(LunoOrderRow)
    private readonly orders: Repository<LunoOrderRow>,
    @InjectRepository(LunoWithdrawalRow)
    private readonly withdrawals: Repository<LunoWithdrawalRow>,
    @InjectRepository(LunoTransferRow)
    private readonly transfers: Repository<LunoTransferRow>,
  ) {}

  async getHealth(): Promise<LunoHealthResult> {
    const errors: string[] = [];
    const lastRun = await this.syncRuns.findOne({
      where: {},
      order: { startedAt: 'DESC' },
    });
    const stored = await this.accounts.find();
    let listed = stored.map(accountToBalance);
    let liveBalancesOk = false;

    if (this.config.enabled && this.config.apiKeyId && this.config.apiKeySecret) {
      try {
        listed = await this.api.getBalances();
        liveBalancesOk = true;
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : 'Unable to fetch Luno balances.',
        );
      }
    } else if (!this.config.enabled) {
      errors.push('Luno is not enabled.');
    } else {
      errors.push('Luno credentials are not configured.');
    }

    const identified = identifyBtcMyrAccounts(listed);
    const btc = identified.btc;
    const myr = identified.myr;

    let lastTradePrice: string | null = null;
    try {
      const ticker = await this.api.getBtcMyrMarketPrice();
      lastTradePrice = ticker.last_trade;
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : 'Unable to fetch BTC/MYR ticker.',
      );
    }

    return {
      connected: liveBalancesOk && Boolean(btc) && Boolean(myr),
      enabled: this.config.enabled,
      lastSyncAt: lastRun?.finishedAt?.toISOString() ?? null,
      lastSyncStatus: lastRun?.status ?? null,
      btcAccountFound: Boolean(btc),
      myrAccountFound: Boolean(myr),
      btcBalance: btc?.balance ?? null,
      myrBalance: myr
        ? addDecimalStrings(myr.balance, myr.reserved)
        : null,
      myrAvailableBalance: myr?.balance ?? null,
      marketPair: LUNO_MARKET_PAIR,
      lastTradePrice,
      transactionsSynced: await this.transactions.count(),
      ordersSynced: await this.orders.count(),
      withdrawalsSynced: await this.withdrawals.count(),
      transfersSynced: await this.transfers.count(),
      errors,
    };
  }

  formatDevSummary(health: LunoHealthResult): string {
    return [
      `Luno connection: ${health.connected ? 'OK' : 'NOT CONNECTED'}`,
      `BTC account: ${health.btcAccountFound ? 'found' : 'missing'}`,
      `MYR account: ${health.myrAccountFound ? 'found' : 'missing'}`,
      `BTC balance: ${health.btcBalance ?? 'n/a'}`,
      `MYR available: ${health.myrAvailableBalance ?? 'n/a'}`,
      `BTC/MYR last trade: ${health.lastTradePrice ?? 'n/a'}`,
      `Transactions synced: ${health.transactionsSynced}`,
      `Orders synced: ${health.ordersSynced}`,
      `Withdrawals synced: ${health.withdrawalsSynced}`,
      `Transfers synced: ${health.transfersSynced}`,
    ].join('\n');
  }
}

function accountToBalance(row: LunoAccount): LunoAccountBalance {
  return {
    account_id: row.lunoAccountId,
    account_type: row.accountType ?? undefined,
    asset: row.asset,
    balance: row.balance,
    name: row.name ?? undefined,
    reserved: row.reserved,
    unconfirmed: row.unconfirmed,
  };
}

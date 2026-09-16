import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { identifyBtcMyrAccounts } from './luno-accounts';
import { LunoApiService } from './luno-api.service';
import { addDecimalStrings, compareDecimal } from './luno-decimal';
import {
  attachOrderFees,
  classifyLunoTransactions,
} from './accounting/luno-btc-classify';
import {
  effectiveBuyPriceMyr,
  formatDisplayDate,
} from './accounting/luno-btc-activity';
import { buildFeeAudit, cashAppliedFee } from './accounting/luno-btc-fees';
import { runFifo, type FifoResult } from './accounting/luno-btc-fifo';
import {
  buildPortfolioView,
  roundBtc,
  roundMyr,
} from './accounting/luno-btc-formulas';
import type {
  BtcPortfolioView,
  ClassifiedEvent,
  SourceTx,
} from './accounting/luno-btc.types';
import { LunoAccount } from './entities/luno-account.entity';
import { LunoBtcDisposal } from './entities/luno-btc-disposal.entity';
import { LunoBtcDisposalLot } from './entities/luno-btc-disposal-lot.entity';
import { LunoBtcLot } from './entities/luno-btc-lot.entity';
import { LunoBtcAccountingSnapshot } from './entities/luno-btc-snapshot.entity';
import { LunoOrderRow } from './entities/luno-order.entity';
import { LunoTransactionRow } from './entities/luno-transaction.entity';
import { LunoUserTradeRow } from './entities/luno-user-trade.entity';

export type BtcAccountingDetails = {
  portfolio: BtcPortfolioView;
  fifo: FifoResult;
  classifiedEvents: ClassifiedEvent[];
};

@Injectable()
export class LunoBtcAccountingService {
  private readonly logger = new Logger(LunoBtcAccountingService.name);

  constructor(
    private readonly api: LunoApiService,
    @InjectRepository(LunoAccount)
    private readonly accounts: Repository<LunoAccount>,
    @InjectRepository(LunoTransactionRow)
    private readonly transactions: Repository<LunoTransactionRow>,
    @InjectRepository(LunoOrderRow)
    private readonly orders: Repository<LunoOrderRow>,
    @InjectRepository(LunoUserTradeRow)
    private readonly userTrades: Repository<LunoUserTradeRow>,
    @InjectRepository(LunoBtcLot)
    private readonly lots: Repository<LunoBtcLot>,
    @InjectRepository(LunoBtcDisposal)
    private readonly disposals: Repository<LunoBtcDisposal>,
    @InjectRepository(LunoBtcDisposalLot)
    private readonly disposalLots: Repository<LunoBtcDisposalLot>,
    @InjectRepository(LunoBtcAccountingSnapshot)
    private readonly snapshots: Repository<LunoBtcAccountingSnapshot>,
  ) {}

  async rebuildBtcAccounting(): Promise<BtcAccountingDetails> {
    const details = await this.compute();
    await this.persist(details);
    return details;
  }

  async getPortfolio(): Promise<BtcPortfolioView> {
    return (await this.compute()).portfolio;
  }

  async getAccountingDetails() {
    const details = await this.compute();
    return {
      portfolio: this.toUserPortfolio(details.portfolio),
      feeCoverage: details.portfolio.feeCoverage,
      formula: {
        costBasisMethod: 'FIFO',
        currentValue: 'btcQuantity × XBTMYR last_trade',
        unrealised: 'currentValue − remainingCostBasis',
        realised: 'sum(net sale proceeds − FIFO cost basis of BTC sold)',
        lifetime: 'realised + unrealised',
        averageBuyPrice: 'remainingCostBasis / btcQuantity (null if qty is 0)',
        overallReturnPct:
          'lifetimePnL / moneyPutInMyr × 100, where lifetimePnL = realised + unrealised. Equivalent to (currentValue + net sale proceeds − moneyPutIn) / moneyPutIn when remaining cost + sold cost = moneyPutIn.',
        moneyPutInMyr:
          'sum of effective MYR cost of BTC buys (price + buy fee)',
        principalRecovered: 'sum of FIFO cost basis consumed by BTC sales only',
        principalRecoveryPct:
          'min(100, principalRecovered / moneyPutInMyr × 100) for display; raw ratio kept separately',
        remainingUnrecoveredPrincipal:
          'max(moneyPutInMyr − principalRecovered, 0)',
        lifetimeContribution:
          'same as moneyPutInMyr: lifetime MYR spent on BTC buys. Deposit-vs-reinvestment split is audit-only and is not the recovery denominator.',
      },
      openLots: details.fifo.lots
        .filter((lot) => compareDecimal(lot.btcQuantityRemaining, '0') > 0)
        .map((lot) => ({
          acquiredAt: lot.acquiredAt.toISOString(),
          displayDate: formatDisplayDate(lot.acquiredAt),
          reference: lot.reference,
          origin: lot.origin,
          btcQuantityRemaining: roundBtc(lot.btcQuantityRemaining),
          remainingCostMyr: roundMyr(lot.myrCostRemaining),
          feeMyr: roundMyr(lot.feeMyr),
        })),
      purchases: details.classifiedEvents
        .filter((row) => row.classification === 'BTC_BUY')
        .map((row) => ({
          occurredAt: row.occurredAt.toISOString(),
          displayDate: formatDisplayDate(row.occurredAt),
          reference: row.reference,
          moneyUsedMyr: roundMyr(
            addDecimalStrings(row.myrAmount, cashAppliedFee(row)),
          ),
          btcReceived: roundBtc(row.btcQuantity),
          feeMyr: roundMyr(row.feeMyrReported),
          effectiveBuyPriceMyr: roundMyr(effectiveBuyPriceMyr(row)),
        }))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      disposals: details.fifo.disposals.map((row) => ({
        disposedAt: row.disposedAt.toISOString(),
        displayDate: formatDisplayDate(row.disposedAt),
        kind: row.kind,
        reference: row.reference,
        btcQuantity: roundBtc(row.btcQuantity),
        moneyReceivedMyr: roundMyr(row.grossProceedsMyr),
        costOfBtcSoldMyr: roundMyr(row.costBasisMyr),
        profitMyr: roundMyr(row.realisedPnlMyr),
        feeMyr: roundMyr(row.feeMyr),
        batchesUsed: row.lotsUsed.length,
      })),
      classifiedEvents: details.classifiedEvents,
      feeAudit: buildFeeAudit(details.classifiedEvents).map((row) => ({
        ...row,
        occurredAt: row.occurredAt,
        displayDate: formatDisplayDate(new Date(row.occurredAt)),
        btcQuantity: roundBtc(row.btcQuantity),
        grossMyr: roundMyr(row.grossMyr),
        feeMyr: roundMyr(row.feeMyr),
      })),
      excludedAssets: details.portfolio.excludedAssets,
      currentMonth: {
        month: details.portfolio.currentMonth.month,
        purchaseTotalMyr: roundMyr(
          details.portfolio.currentMonth.purchaseTotalMyr,
        ),
        buyCount: details.portfolio.currentMonth.buyCount,
        btcReceived: roundBtc(details.portfolio.currentMonth.btcReceived),
        latestBuyAt: details.portfolio.currentMonth.latestBuyAt,
        latestBuyDisplay: details.portfolio.currentMonth.latestBuyAt
          ? formatDisplayDate(
              new Date(details.portfolio.currentMonth.latestBuyAt),
            )
          : null,
      },
      warnings: details.portfolio.warnings.filter(
        (row) => !/untracked asset/i.test(row),
      ),
      technical: {
        openLots: details.fifo.lots.filter(
          (lot) => compareDecimal(lot.btcQuantityRemaining, '0') > 0,
        ),
        disposals: details.fifo.disposals,
      },
    };
  }

  toUserPortfolio(view: BtcPortfolioView) {
    return {
      status: view.status,
      strategyReady: view.strategyReady,
      btcQuantity: roundBtc(view.btcQuantity),
      btcPriceMyr: roundMyr(view.btcPriceMyr),
      currentValueMyr: roundMyr(view.currentValueMyr),
      moneyPutInMyr: roundMyr(view.moneyPutInMyr),
      remainingCostBasisMyr: roundMyr(view.remainingCostBasisMyr),
      averageBuyPriceMyr: roundMyr(view.averageBuyPriceMyr),
      breakEvenPriceMyr: roundMyr(view.breakEvenPriceMyr),
      profitStillInsideBtcMyr: roundMyr(view.profitStillInsideBtcMyr),
      profitAlreadyTakenMyr: roundMyr(view.profitAlreadyTakenMyr),
      lifetimeProfitMyr: roundMyr(view.lifetimeProfitMyr),
      principalRecoveredMyr: roundMyr(view.principalRecoveredMyr),
      principalRecoveryPct: roundMyr(view.principalRecoveryPct),
      principalRecoveryPctRaw: view.principalRecoveryPctRaw,
      remainingUnrecoveredPrincipalMyr: roundMyr(
        view.remainingUnrecoveredPrincipalMyr,
      ),
      overallReturnPct: roundMyr(view.overallReturnPct),
      totalBtcBought: roundBtc(view.totalBtcBought),
      totalBtcSold: roundBtc(view.totalBtcSold),
      totalBuyFeesMyr: roundMyr(view.totalBuyFeesMyr),
      totalSellFeesMyr: roundMyr(view.totalSellFeesMyr),
      feeStatus: view.feeStatus,
      feeCoverage: {
        knownFeesMyr: roundMyr(view.feeCoverage.knownFeesMyr),
        feeCoveragePct: view.feeCoverage.feeCoveragePct,
        missingFeeTransactions: view.feeCoverage.missingFeeTransactions,
        impactStatus: view.feeCoverage.impactStatus,
      },
      externalContributionMyr: roundMyr(view.externalContributionMyr),
      reinvestedMyr: roundMyr(view.reinvestedMyr),
      externalContributionConfidence: view.externalContributionConfidence,
      currentMonth: {
        month: view.currentMonth.month,
        purchaseTotalMyr: roundMyr(view.currentMonth.purchaseTotalMyr),
        buyCount: view.currentMonth.buyCount,
        btcReceived: roundBtc(view.currentMonth.btcReceived),
        latestBuyAt: view.currentMonth.latestBuyAt,
      },
      excludedAssets: view.excludedAssets,
      reconciliation: {
        status: view.reconciliation.status,
        differenceBtc: view.reconciliation.differenceBtc,
      },
      warnings: view.warnings.filter((row) => !/untracked asset/i.test(row)),
    };
  }

  private async compute(): Promise<BtcAccountingDetails> {
    const storedAccounts = await this.accounts.find();
    const identified = identifyBtcMyrAccounts(
      storedAccounts.map((row) => ({
        account_id: row.lunoAccountId,
        account_type: row.accountType ?? undefined,
        asset: row.asset,
        balance: row.balance,
        reserved: row.reserved,
        unconfirmed: row.unconfirmed,
        name: row.name ?? undefined,
      })),
    );
    const rows = await this.transactions.find({
      order: { occurredAt: 'ASC', rowIndex: 'ASC' },
    });
    const source: SourceTx[] = rows.map((row) => ({
      id: row.id,
      lunoAccountId: row.lunoAccountId,
      rowIndex: row.rowIndex,
      reference: row.reference,
      currency: row.currency,
      kind: row.kind,
      description: row.description,
      balanceDelta: row.balanceDelta,
      occurredAt: row.occurredAt,
      details:
        row.rawPayload && typeof row.rawPayload.details === 'object'
          ? (row.rawPayload.details as Record<string, string>)
          : null,
      rawPayload: row.rawPayload,
    }));
    const orderRows = await this.orders.find();
    const tradeRows = await this.userTrades.find();
    const classifiedEvents = attachOrderFees(
      classifyLunoTransactions(
        source,
        identified.btc?.account_id ?? null,
        identified.myr?.account_id ?? null,
      ),
      orderRows.map((row) => ({
        lunoOrderId: row.lunoOrderId,
        feeCounter: row.feeCounter,
        feeBase: row.feeBase,
      })),
      tradeRows.map((row) => ({
        id: row.lunoOrderId ?? '',
        feeCounter: row.feeCounter,
        feeBase: row.feeBase,
      })),
    );
    const fifo = runFifo(classifiedEvents);
    let price: string | null = null;
    try {
      price = (await this.api.getBtcMyrMarketPrice()).last_trade;
    } catch (error) {
      this.logger.warn(
        `Ticker unavailable for mark-to-market: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
    const liveBtc =
      identified.btc == null
        ? null
        : addDecimalStrings(identified.btc.balance, identified.btc.reserved);
    return {
      classifiedEvents,
      fifo,
      portfolio: buildPortfolioView({
        fifo,
        liveBtcBalance: liveBtc,
        btcPriceMyr: price,
        classifiedEvents,
      }),
    };
  }

  private async persist(details: BtcAccountingDetails): Promise<void> {
    await this.disposalLots.createQueryBuilder().delete().execute();
    await this.disposals.createQueryBuilder().delete().execute();
    await this.lots.createQueryBuilder().delete().execute();

    const lotIdByKey = new Map<string, string>();
    for (const lot of details.fifo.lots) {
      const saved = await this.lots.save(
        this.lots.create({
          sourceTransactionId: lot.sourceTransactionId,
          reference: lot.reference,
          acquiredAt: lot.acquiredAt,
          origin: lot.origin,
          btcQuantityOriginal: lot.btcQuantityOriginal,
          btcQuantityRemaining: lot.btcQuantityRemaining,
          myrCostOriginal: lot.myrCostOriginal,
          myrCostRemaining: lot.myrCostRemaining,
          feeMyr: lot.feeMyr,
          effectiveCostMyr: lot.effectiveCostMyr,
        }),
      );
      lotIdByKey.set(lot.key, saved.id);
    }
    for (const disposal of details.fifo.disposals) {
      const saved = await this.disposals.save(
        this.disposals.create({
          sourceTransactionId: disposal.sourceTransactionId,
          reference: disposal.reference,
          disposedAt: disposal.disposedAt,
          kind: disposal.kind,
          btcQuantity: disposal.btcQuantity,
          grossProceedsMyr: disposal.grossProceedsMyr,
          feeMyr: disposal.feeMyr,
          netProceedsMyr: disposal.netProceedsMyr,
          costBasisMyr: disposal.costBasisMyr,
          realisedPnlMyr: disposal.realisedPnlMyr,
        }),
      );
      for (const use of disposal.lotsUsed) {
        const lotId = lotIdByKey.get(use.lotKey);
        if (!lotId) {
          continue;
        }
        await this.disposalLots.save(
          this.disposalLots.create({
            disposalId: saved.id,
            lotId,
            btcQuantityConsumed: use.btcQuantityConsumed,
            costBasisConsumedMyr: use.costBasisConsumedMyr,
          }),
        );
      }
    }

    const view = details.portfolio;
    await this.snapshots.save(
      this.snapshots.create({
        calculatedAt: new Date(),
        status: view.status,
        costBasisMethod: 'FIFO',
        btcQuantity: view.btcQuantity,
        btcMarketPriceMyr: view.btcPriceMyr,
        currentValueMyr: view.currentValueMyr,
        moneyPutInMyr: view.moneyPutInMyr,
        remainingCostBasisMyr: view.remainingCostBasisMyr,
        averageBuyPriceMyr: view.averageBuyPriceMyr,
        realisedPnlMyr: view.profitAlreadyTakenMyr,
        unrealisedPnlMyr: view.profitStillInsideBtcMyr,
        lifetimePnlMyr: view.lifetimeProfitMyr,
        principalRecoveredMyr: view.principalRecoveredMyr,
        principalRecoveryPct: view.principalRecoveryPct,
        reconciliationStatus: view.reconciliation.status,
        reconciliationDifferenceBtc: view.reconciliation.differenceBtc,
        portfolioPayload: view as unknown as Record<string, unknown>,
      }),
    );
  }
}

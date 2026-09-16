import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { User } from '../user/user.entity';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoBtcDecisionService } from './luno-btc-decision.service';
import { LunoBtcMarketService } from './luno-btc-market.service';
import { LunoBtcExternalRiskService } from './luno-btc-external-risk.service';
import { LunoHealthService } from './luno-health.service';

/**
 * Development-only safe summary. Never prints secrets.
 *   npx ts-node -r tsconfig-paths/register src/luno/luno-dev-summary.ts
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const health = app.get(LunoHealthService);
  const snapshot = await health.getHealth();
  Logger.log(`\n${health.formatDevSummary(snapshot)}\n`, 'LunoDevSummary');
  try {
    const accounting = app.get(LunoBtcAccountingService);
    const details = await accounting.getAccountingDetails();
    const view = details.portfolio;
    const unknown = details.classifiedEvents.filter(
      (row) => row.classification === 'UNKNOWN',
    );
    Logger.log(
      [
        'BTC accounting (Phase 2B)',
        `status=${view.status} recon=${view.reconciliation.status} diffBtc=${view.reconciliation.differenceBtc}`,
        `btcQty=${view.btcQuantity} bought=${view.totalBtcBought} sold=${view.totalBtcSold} price=${view.btcPriceMyr} value=${view.currentValueMyr}`,
        `moneyPutIn=${view.moneyPutInMyr} remainingCost=${view.remainingCostBasisMyr} avgBuy=${view.averageBuyPriceMyr}`,
        `profitTaken=${view.profitAlreadyTakenMyr} profitInside=${view.profitStillInsideBtcMyr} lifetime=${view.lifetimeProfitMyr}`,
        `principalRecovered=${view.principalRecoveredMyr} recoveryPct=${view.principalRecoveryPct} unrecovered=${view.remainingUnrecoveredPrincipalMyr} returnPct=${view.overallReturnPct}`,
        `fees buy=${view.totalBuyFeesMyr} sell=${view.totalSellFeesMyr} feeStatus=${view.feeStatus} external=${view.externalContributionMyr} reinvested=${view.reinvestedMyr}`,
        `currentMonth buys=${view.currentMonth.buyCount} total=${view.currentMonth.purchaseTotalMyr} btc=${view.currentMonth.btcReceived} latest=${view.currentMonth.latestBuyAt}`,
        `excludedAssets=${view.excludedAssets.map((row) => row.asset).join(',') || 'none'}`,
        `feeCoverage known=${details.feeCoverage.knownFeesMyr} pct=${details.feeCoverage.feeCoveragePct} missing=${details.feeCoverage.missingFeeTransactions} exact=${details.feeCoverage.exactFeeTransactions} derived=${details.feeCoverage.derivedFeeTransactions} unknown=${details.feeCoverage.unknownFeeTransactions} impact=${details.feeCoverage.impactStatus}`,
        `feeAuditRows=${details.feeAudit.length}`,
        `buys=${details.classifiedEvents.filter((row) => row.classification === 'BTC_BUY').length} sells=${details.classifiedEvents.filter((row) => row.classification === 'BTC_SELL').length}`,
        `channels instant=${details.classifiedEvents.filter((row) => (row.classification === 'BTC_BUY' || row.classification === 'BTC_SELL') && row.tradeChannel === 'INSTANT').length} exchange=${details.classifiedEvents.filter((row) => (row.classification === 'BTC_BUY' || row.classification === 'BTC_SELL') && row.tradeChannel === 'EXCHANGE').length}`,
        `unknownEvents=${unknown.length}`,
        ...unknown.map(
          (row) =>
            `UNKNOWN ref=${row.reference ?? 'none'} src=${row.sourceTransactionIds.join(',')} ${row.warning ?? ''}`,
        ),
        view.warnings.length
          ? `warnings=${view.warnings.length}`
          : 'warnings=none',
      ].join('\n'),
      'LunoBtcAccounting',
    );
  } catch (error) {
    Logger.warn(
      `Accounting summary skipped: ${error instanceof Error ? error.message : 'unknown'}`,
      'LunoBtcAccounting',
    );
  }
  try {
    const users = app.get(DataSource).getRepository(User);
    const owner = await users.find({
      take: 1,
      order: { createdAt: 'ASC' },
    });
    if (owner[0]) {
      const budget = app.get(LunoBtcBudgetService);
      const view = await budget.getCurrentBudget(owner[0].id);
      const context = await budget.getStrategyContext(owner[0].id);
      Logger.log(
        [
          'BTC monthly budget (Phase 3)',
          `user=${owner[0].id}`,
          `month=${view.month} status=${view.status}`,
          `budget=${view.monthlyBudgetMyr ?? 'not set'} used=${view.usedMyr} remaining=${view.remainingMyr ?? 'n/a'}`,
          `maxAllowedNewSpend=${view.maxAllowedNewSpendMyr} buyCount=${view.buyCount} btcReceived=${view.btcReceived}`,
          `normal=${view.normalBuyAllocationMyr ?? 'n/a'} dip=${view.dipReserveAllocationMyr ?? 'n/a'}`,
          `lunoMyrAvailable=${view.lunoMyrAvailableMyr ?? 'n/a'} protectedProfit=${view.protectedProfitMyr} reinvestmentReserve=${view.reinvestmentReserveMyr}`,
          `strategyMoneyReady=${context.strategyMoneyReady} accountingStatus=${context.accountingStatus}`,
        ].join('\n'),
        'LunoBtcBudget',
      );
      const decision = await app
        .get(LunoBtcDecisionService)
        .getCurrentDecision(owner[0].id);
      Logger.log(
        [
          'BTC decision (Phase 4)',
          `action=${decision.action} zone=${decision.zone} pct=${decision.priceDifferencePct ?? 'n/a'}`,
          `suggested=${decision.suggestedAmountMyr ?? 'none'} remaining=${decision.monthlyRemainingMyr ?? 'n/a'} maxAllowed=${decision.maxAllowedNewSpendMyr}`,
          `price=${decision.currentPriceMyr ?? 'n/a'} avgBuy=${decision.averageBuyPriceMyr ?? 'n/a'}`,
          `lunoMyrAvailable=${decision.lunoMyrAvailableMyr ?? 'n/a'} topUp=${decision.topUpNeededMyr ?? 'n/a'}`,
          `eventId=${decision.eventId ?? 'none'}`,
          ...decision.reason,
        ].join('\n'),
        'LunoBtcDecision',
      );
      try {
        const market = app.get(LunoBtcMarketService);
        try {
          await market.syncBtcMarketData();
          await market.calculateBtcMarketSnapshot();
        } catch (error) {
          Logger.warn(
            `Market candle refresh skipped: ${error instanceof Error ? error.message : 'unknown'}`,
            'LunoBtcMarket',
          );
        }
        const final = await market.getFinalDecision(owner[0].id);
        const context = final.marketContext;
        Logger.log(
          [
            'BTC market context (Phase 5)',
            `source=${context?.marketDataSource ?? 'n/a'} status=${context?.marketContextStatus ?? 'n/a'}`,
            `direction=${context?.direction ?? 'n/a'} buying=${context?.buyingCondition ?? 'n/a'} stability=${context?.stability ?? 'n/a'} confidence=${context?.confidence ?? 'n/a'}`,
            `base=${final.baseDecision.action} final=${final.finalDecision.action} modified=${final.finalDecision.modifiedByMarketContext}`,
            ...(context?.reasons ?? []),
          ].join('\n'),
          'LunoBtcMarket',
        );
      } catch (error) {
        Logger.warn(
          `Market summary skipped: ${error instanceof Error ? error.message : 'unknown'}`,
          'LunoBtcMarket',
        );
      }
      try {
        const risk = app.get(LunoBtcExternalRiskService);
        await risk.syncExternalRisk();
        await risk.recalculateExternalRisk();
        const combined = await risk.getFinalDecision(owner[0].id);
        Logger.log(
          [
            'BTC external risk (Phase 6)',
            `status=${combined.externalRisk.status} level=${combined.externalRisk.riskLevel} category=${combined.externalRisk.dominantCategory} confidence=${combined.externalRisk.confidence}`,
            `marketReaction=${combined.externalRisk.marketReactionConfirmed} upcomingMacro=${combined.externalRisk.upcomingMacroEventCount}`,
            `base=${combined.baseDecision.action} marketAdjusted=${combined.marketAdjustedDecision.action} final=${combined.finalDecision.action} modified=${combined.finalDecision.modifiedByExternalRisk}`,
            ...combined.externalRisk.reasons,
            ...combined.finalDecision.reason,
          ].join('\n'),
          'LunoBtcExternalRisk',
        );
      } catch (error) {
        Logger.warn(
          `External risk summary skipped: ${error instanceof Error ? error.message : 'unknown'}`,
          'LunoBtcExternalRisk',
        );
      }
    } else {
      Logger.log('No user found for budget summary.', 'LunoBtcBudget');
    }
  } catch (error) {
    Logger.warn(
      `Budget summary skipped: ${error instanceof Error ? error.message : 'unknown'}`,
      'LunoBtcBudget',
    );
  }
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

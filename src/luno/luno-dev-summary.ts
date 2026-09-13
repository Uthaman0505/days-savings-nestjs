import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
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
        `principalRecovered=${view.principalRecoveredMyr} recoveryPct=${view.principalRecoveryPct} returnPct=${view.overallReturnPct}`,
        `fees buy=${view.totalBuyFeesMyr} sell=${view.totalSellFeesMyr} feeStatus=${view.feeStatus} external=${view.externalContributionMyr} reinvested=${view.reinvestedMyr}`,
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
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

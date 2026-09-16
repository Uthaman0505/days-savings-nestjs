import {
  absDecimal,
  addDecimalStrings,
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  multiplyDecimalStrings,
  roundDecimal,
  subtractDecimalStrings,
} from '../luno-decimal';
import {
  collectExcludedAssets,
  summarizeCurrentMonthBuys,
} from './luno-btc-activity';
import { buildFeeAudit, summarizeFeeCoverage } from './luno-btc-fees';
import type { FifoResult } from './luno-btc-fifo';
import type { ClassifiedEvent, FifoLot } from './luno-btc.types';
import {
  BTC_DUST_TOLERANCE,
  LUNO_COST_BASIS_METHOD,
  type AccountingReadiness,
  type BtcPortfolioView,
  type ContributionConfidence,
  type FeeCoverage,
  type FeeStatus,
  type ReconciliationStatus,
} from './luno-btc.types';

export function remainingBtc(lots: FifoLot[]): string {
  return lots.reduce(
    (sum, lot) => addDecimalStrings(sum, lot.btcQuantityRemaining),
    '0',
  );
}

export function remainingCostBasis(lots: FifoLot[]): string {
  return lots.reduce(
    (sum, lot) => addDecimalStrings(sum, lot.myrCostRemaining),
    '0',
  );
}

export function emptyFeeCoverage(): FeeCoverage {
  return {
    knownFeesMyr: '0',
    feeCoveragePct: null,
    missingFeeTransactions: 0,
    exactFeeTransactions: 0,
    derivedFeeTransactions: 0,
    unknownFeeTransactions: 0,
    tradeCount: 0,
    affectedGrossAmountMyr: '0',
    impactStatus: 'EXACT',
    estimatedMinAccountingImpactMyr: null,
    estimatedMaxAccountingImpactMyr: null,
  };
}

export function buildPortfolioView(input: {
  fifo: FifoResult;
  liveBtcBalance: string | null;
  btcPriceMyr: string | null;
  extraWarnings?: string[];
  feeCoverage?: FeeCoverage;
  classifiedEvents?: ClassifiedEvent[];
}): BtcPortfolioView {
  const qty = remainingBtc(input.fifo.lots);
  const cost = remainingCostBasis(input.fifo.lots);
  const price = input.btcPriceMyr;
  const currentValueMyr =
    price == null ? null : multiplyDecimalStrings(qty, price);
  const averageBuyPriceMyr = isZeroDecimal(qty)
    ? null
    : divideDecimalStrings(cost, qty, 18);
  const profitStillInsideBtcMyr =
    currentValueMyr == null
      ? null
      : subtractDecimalStrings(currentValueMyr, cost);
  const lifetimeProfitMyr =
    profitStillInsideBtcMyr == null
      ? null
      : addDecimalStrings(input.fifo.realisedPnlMyr, profitStillInsideBtcMyr);
  const moneyPutIn = input.fifo.moneyPutInMyr;
  const recovered = input.fifo.principalRecoveredMyr;
  const recoveryRaw = isZeroDecimal(moneyPutIn)
    ? null
    : divideDecimalStrings(
        multiplyDecimalStrings(recovered, '100'),
        moneyPutIn,
        8,
      );
  const unrecovered = subtractDecimalStrings(moneyPutIn, recovered);
  const remainingUnrecoveredPrincipalMyr =
    compareDecimal(unrecovered, '0') < 0 ? '0' : unrecovered;
  const overallReturnPct =
    lifetimeProfitMyr == null || isZeroDecimal(moneyPutIn)
      ? null
      : divideDecimalStrings(
          multiplyDecimalStrings(lifetimeProfitMyr, '100'),
          moneyPutIn,
          8,
        );

  const live = input.liveBtcBalance;
  const differenceBtc = live == null ? qty : subtractDecimalStrings(qty, live);
  const absDiff = absDecimal(differenceBtc);
  let reconciliationStatus: ReconciliationStatus;
  if (live == null) {
    reconciliationStatus = 'MISMATCH';
  } else if (isZeroDecimal(absDiff)) {
    reconciliationStatus = 'MATCHED';
  } else if (compareDecimal(absDiff, BTC_DUST_TOLERANCE) <= 0) {
    reconciliationStatus = 'SMALL_ROUNDING_DIFFERENCE';
  } else {
    reconciliationStatus = 'MISMATCH';
  }

  const classifiedEvents = input.classifiedEvents ?? [];
  const excludedAssets = collectExcludedAssets(classifiedEvents);
  const currentMonth = summarizeCurrentMonthBuys(classifiedEvents);
  const unknownWarnings = input.fifo.warnings.filter(
    (row) => !/untracked asset/i.test(row),
  );
  const hasZeroCostLot = input.fifo.lots.some(
    (lot) =>
      compareDecimal(lot.btcQuantityRemaining, '0') > 0 && lot.origin !== 'BUY',
  );
  const feeCoverage =
    input.feeCoverage ??
    (input.classifiedEvents
      ? summarizeFeeCoverage(buildFeeAudit(input.classifiedEvents))
      : emptyFeeCoverage());
  const feeStatus: FeeStatus = feeStatusFrom(feeCoverage, input.fifo);
  const contributionConfidence: ContributionConfidence = isZeroDecimal(
    input.fifo.unexplainedBuyMyr,
  )
    ? hasZeroCostLot
      ? 'PARTIAL'
      : 'HIGH'
    : 'PARTIAL';

  const materialHistoryGap = unknownWarnings.some((row) =>
    /malformed|unmatched remainder|without MYR cost|zero-cost/i.test(row),
  );
  const holdingsOk =
    reconciliationStatus === 'MATCHED' ||
    reconciliationStatus === 'SMALL_ROUNDING_DIFFERENCE';
  const feesComplete =
    feeCoverage.tradeCount === 0 ||
    (feeCoverage.missingFeeTransactions === 0 &&
      feeCoverage.unknownFeeTransactions === 0);

  let status: AccountingReadiness = 'READY';
  if (reconciliationStatus === 'MISMATCH') {
    status = 'NOT_READY';
  } else if (!holdingsOk) {
    status = 'NOT_READY';
  } else if (hasZeroCostLot || materialHistoryGap) {
    status = 'PARTIAL';
  } else if (!feesComplete) {
    status = 'APPROVED_PARTIAL';
  }

  const warnings = [...(input.extraWarnings ?? []), ...unknownWarnings];
  if (reconciliationStatus === 'MISMATCH') {
    warnings.unshift(
      'Holdings do not match Luno BTC. Accounting is NOT_READY and not strategy-ready.',
    );
  } else if (status === 'APPROVED_PARTIAL') {
    warnings.unshift(
      'BTC holdings match Luno. Some trade fees are unavailable; profit uses statement cash amounts and fee uncertainty is quantified.',
    );
  }

  return {
    status,
    strategyReady: status === 'READY',
    costBasisMethod: LUNO_COST_BASIS_METHOD,
    btcQuantity: qty,
    btcPriceMyr: price,
    currentValueMyr,
    moneyPutInMyr: moneyPutIn,
    remainingCostBasisMyr: cost,
    averageBuyPriceMyr,
    breakEvenPriceMyr: averageBuyPriceMyr,
    profitStillInsideBtcMyr,
    profitAlreadyTakenMyr: input.fifo.realisedPnlMyr,
    lifetimeProfitMyr,
    principalRecoveredMyr: input.fifo.principalRecoveredMyr,
    principalRecoveryPct: capPct(recoveryRaw),
    principalRecoveryPctRaw: recoveryRaw,
    remainingUnrecoveredPrincipalMyr,
    overallReturnPct,
    totalBtcBought: input.fifo.totalBtcBought,
    totalBtcSold: input.fifo.totalBtcSold,
    totalBuyFeesMyr: input.fifo.totalBuyFeesMyr,
    totalSellFeesMyr: input.fifo.totalSellFeesMyr,
    feeStatus,
    feeCoverage,
    externalContributionMyr: input.fifo.externalContributionMyr,
    reinvestedMyr: input.fifo.reinvestedMyr,
    externalContributionConfidence: contributionConfidence,
    currentMonth,
    excludedAssets,
    reconciliation: {
      status: reconciliationStatus,
      differenceBtc,
      liveBtcBalance: live,
      calculatedBtcQuantity: qty,
    },
    warnings,
  };
}

function padFractional(value: string, places: number): string {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, frac = ''] = unsigned.split('.');
  return `${negative ? '-' : ''}${whole}.${frac.padEnd(places, '0')}`;
}

function capPct(raw: string | null): string | null {
  if (raw == null) {
    return null;
  }
  return compareDecimal(raw, '100') > 0 ? '100' : raw;
}

function feeStatusFrom(coverage: FeeCoverage, fifo: FifoResult): FeeStatus {
  const hasTrades =
    compareDecimal(fifo.totalBtcBought, '0') > 0 ||
    compareDecimal(fifo.totalBtcSold, '0') > 0;
  if (!hasTrades) {
    return 'NONE';
  }
  if (
    coverage.missingFeeTransactions === 0 &&
    coverage.unknownFeeTransactions === 0 &&
    coverage.tradeCount > 0
  ) {
    return 'KNOWN';
  }
  if (coverage.exactFeeTransactions + coverage.derivedFeeTransactions > 0) {
    return 'PARTIAL';
  }
  return 'UNKNOWN';
}

export function roundMyr(value: string | null): string | null {
  return value == null ? null : padFractional(roundDecimal(value, 2), 2);
}

export function roundBtc(value: string | null): string | null {
  return value == null ? null : roundDecimal(value, 8);
}

import { amountsMatch, priceDifferencePct } from './luno-btc-decision';
import { previewFifoSale, type FifoSalePreview } from './luno-btc-sale-preview';
import { BTC_DUST_TOLERANCE, type FifoLot } from './luno-btc.types';
import {
  absDecimal,
  addDecimalStrings,
  compareDecimal,
  divideDecimalStrings,
  isZeroDecimal,
  maxDecimal,
  multiplyDecimalStrings,
  subtractDecimalStrings,
} from '../luno-decimal';

export const HARVEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_FIRST_HARVEST_PCT = '15';
export const DEFAULT_SECOND_HARVEST_PCT = '25';
export const DEFAULT_HIGH_HARVEST_PCT = '40';
export const DEFAULT_FIRST_HARVEST_FRACTION = '0.20';
export const DEFAULT_SECOND_HARVEST_FRACTION = '0.35';
export const DEFAULT_HIGH_HARVEST_FRACTION = '0.50';
export const DEFAULT_PROTECTED_PROFIT_PCT = '70';
export const DEFAULT_REINVESTMENT_RESERVE_PCT = '30';
export const DEFAULT_MINIMUM_CORE_PCT = '50';
export const DEFAULT_MINIMUM_HARVEST_MYR = '5';
export const DEFAULT_ESTIMATED_SELL_FEE_MYR = '0';
export const DEFAULT_MINIMUM_BTC_SALE = '0.00000001';

export type LunoBtcHarvestAction =
  | 'HOLD'
  | 'TAKE_SOME_PROFIT'
  | 'PROTECT_PROFIT'
  | 'HOLD_CORE';

export type LunoBtcHarvestZone =
  | 'BELOW_FIRST'
  | 'FIRST_HARVEST'
  | 'PROTECT'
  | 'HIGH_PROTECT'
  | 'CORE_FLOOR';

export type LunoBtcHarvestSettingsValues = {
  firstHarvestProfitPct: string;
  secondHarvestProfitPct: string;
  highHarvestProfitPct: string;
  firstHarvestProfitFraction: string;
  secondHarvestProfitFraction: string;
  highHarvestProfitFraction: string;
  protectedProfitPct: string;
  reinvestmentReservePct: string;
  minimumCorePct: string;
  minimumHarvestMyr: string;
  estimatedSellFeeMyr: string;
  minimumBtcSale: string;
};

export type OpenPositionMetrics = {
  currentBtcBalance: string;
  currentPriceMyr: string | null;
  openAverageBuyPriceMyr: string | null;
  openCostBasisMyr: string;
  currentMarketValueMyr: string | null;
  unrealizedProfitMyr: string | null;
  unrealizedProfitPct: string | null;
  lifetimeMoneyPutInMyr: string;
  principalRecoveredMyr: string;
  remainingUnrecoveredMyr: string;
  lifetimeRealizedProfitMyr: string;
};

export type HarvestDecision = {
  action: LunoBtcHarvestAction;
  displayAction: string;
  zone: LunoBtcHarvestZone;
  currentPosition: {
    marketValueMyr: string | null;
    openCostBasisMyr: string;
    unrealizedProfitMyr: string | null;
    unrealizedProfitPct: string | null;
  };
  recommendation: {
    suggestedHarvestMyr: string | null;
    btcToSell: string | null;
    estimatedRealizedProfitMyr: string | null;
    fifoCostBasisReleasedMyr: string | null;
    remainingBtc: string | null;
    remainingMarketValueMyr: string | null;
    estimatedFeesMyr: string | null;
  } | null;
  profitSplit: {
    protectedProfitMyr: string | null;
    reinvestmentReserveMyr: string | null;
  };
  principalRecovery: {
    currentPct: string | null;
    projectedPct: string | null;
    remainingUnrecoveredAfterMyr: string | null;
    recoveredMyr: string;
    remainingUnrecoveredMyr: string;
    projectedRecoveredMyr: string | null;
    milestoneNote: string | null;
  };
  salePreview: FifoSalePreview | null;
  reason: string[];
};

export function defaultHarvestSettings(overrides?: {
  minimumHarvestMyr?: string;
  estimatedSellFeeMyr?: string;
  minimumBtcSale?: string;
}): LunoBtcHarvestSettingsValues {
  return {
    firstHarvestProfitPct: DEFAULT_FIRST_HARVEST_PCT,
    secondHarvestProfitPct: DEFAULT_SECOND_HARVEST_PCT,
    highHarvestProfitPct: DEFAULT_HIGH_HARVEST_PCT,
    firstHarvestProfitFraction: DEFAULT_FIRST_HARVEST_FRACTION,
    secondHarvestProfitFraction: DEFAULT_SECOND_HARVEST_FRACTION,
    highHarvestProfitFraction: DEFAULT_HIGH_HARVEST_FRACTION,
    protectedProfitPct: DEFAULT_PROTECTED_PROFIT_PCT,
    reinvestmentReservePct: DEFAULT_REINVESTMENT_RESERVE_PCT,
    minimumCorePct: DEFAULT_MINIMUM_CORE_PCT,
    minimumHarvestMyr:
      overrides?.minimumHarvestMyr ?? DEFAULT_MINIMUM_HARVEST_MYR,
    estimatedSellFeeMyr:
      overrides?.estimatedSellFeeMyr ?? DEFAULT_ESTIMATED_SELL_FEE_MYR,
    minimumBtcSale: overrides?.minimumBtcSale ?? DEFAULT_MINIMUM_BTC_SALE,
  };
}

export function displayHarvestAction(action: LunoBtcHarvestAction): string {
  switch (action) {
    case 'TAKE_SOME_PROFIT':
      return 'TAKE SOME PROFIT';
    case 'PROTECT_PROFIT':
      return 'PROTECT PROFIT';
    case 'HOLD_CORE':
      return 'HOLD CORE';
    case 'HOLD':
      return 'HOLD';
  }
}

export function buildOpenPositionMetrics(input: {
  currentBtcBalance: string;
  currentPriceMyr: string | null;
  openAverageBuyPriceMyr: string | null;
  openCostBasisMyr: string;
  lifetimeMoneyPutInMyr: string;
  principalRecoveredMyr: string;
  lifetimeRealizedProfitMyr: string;
}): OpenPositionMetrics {
  const currentMarketValueMyr =
    input.currentPriceMyr == null
      ? null
      : multiplyDecimalStrings(input.currentBtcBalance, input.currentPriceMyr);
  const unrealizedProfitMyr =
    currentMarketValueMyr == null
      ? null
      : subtractDecimalStrings(currentMarketValueMyr, input.openCostBasisMyr);
  const fromPrice =
    input.currentPriceMyr != null && input.openAverageBuyPriceMyr != null
      ? priceDifferencePct(input.currentPriceMyr, input.openAverageBuyPriceMyr)
      : null;
  const unrecovered = subtractDecimalStrings(
    input.lifetimeMoneyPutInMyr,
    input.principalRecoveredMyr,
  );
  return {
    currentBtcBalance: input.currentBtcBalance,
    currentPriceMyr: input.currentPriceMyr,
    openAverageBuyPriceMyr: input.openAverageBuyPriceMyr,
    openCostBasisMyr: input.openCostBasisMyr,
    currentMarketValueMyr,
    unrealizedProfitMyr,
    unrealizedProfitPct: fromPrice,
    lifetimeMoneyPutInMyr: input.lifetimeMoneyPutInMyr,
    principalRecoveredMyr: input.principalRecoveredMyr,
    remainingUnrecoveredMyr:
      compareDecimal(unrecovered, '0') < 0 ? '0' : unrecovered,
    lifetimeRealizedProfitMyr: input.lifetimeRealizedProfitMyr,
  };
}

export function harvestZoneFromProfitPct(
  pct: string,
  settings: LunoBtcHarvestSettingsValues,
): LunoBtcHarvestZone {
  if (compareDecimal(pct, settings.firstHarvestProfitPct) < 0) {
    return 'BELOW_FIRST';
  }
  if (compareDecimal(pct, settings.secondHarvestProfitPct) < 0) {
    return 'FIRST_HARVEST';
  }
  if (compareDecimal(pct, settings.highHarvestProfitPct) < 0) {
    return 'PROTECT';
  }
  return 'HIGH_PROTECT';
}

export function harvestFractionForZone(
  zone: LunoBtcHarvestZone,
  settings: LunoBtcHarvestSettingsValues,
): string | null {
  if (zone === 'FIRST_HARVEST') {
    return settings.firstHarvestProfitFraction;
  }
  if (zone === 'PROTECT') {
    return settings.secondHarvestProfitFraction;
  }
  if (zone === 'HIGH_PROTECT') {
    return settings.highHarvestProfitFraction;
  }
  return null;
}

export function actionForHarvestZone(
  zone: LunoBtcHarvestZone,
): LunoBtcHarvestAction {
  if (zone === 'FIRST_HARVEST') {
    return 'TAKE_SOME_PROFIT';
  }
  if (zone === 'PROTECT' || zone === 'HIGH_PROTECT') {
    return 'PROTECT_PROFIT';
  }
  if (zone === 'CORE_FLOOR') {
    return 'HOLD_CORE';
  }
  return 'HOLD';
}

export function splitRealizedProfit(
  realizedProfitMyr: string,
  settings: LunoBtcHarvestSettingsValues,
): { protectedProfitMyr: string; reinvestmentReserveMyr: string } {
  if (compareDecimal(realizedProfitMyr, '0') <= 0) {
    return { protectedProfitMyr: '0', reinvestmentReserveMyr: '0' };
  }
  const protectedProfitMyr =
    divideDecimalStrings(
      multiplyDecimalStrings(realizedProfitMyr, settings.protectedProfitPct),
      '100',
      18,
    ) ?? '0';
  return {
    protectedProfitMyr,
    reinvestmentReserveMyr: subtractDecimalStrings(
      realizedProfitMyr,
      protectedProfitMyr,
    ),
  };
}

export function principalRecoveryPct(
  recoveredMyr: string,
  lifetimeContributionMyr: string,
): string | null {
  if (isZeroDecimal(lifetimeContributionMyr)) {
    return null;
  }
  const raw = divideDecimalStrings(
    multiplyDecimalStrings(recoveredMyr, '100'),
    lifetimeContributionMyr,
    8,
  );
  if (raw == null) {
    return null;
  }
  return compareDecimal(raw, '100') > 0 ? '100' : raw;
}

export function principalMilestoneNote(pct: string | null): string | null {
  if (pct == null) {
    return null;
  }
  if (compareDecimal(pct, '100') >= 0) {
    return 'Your original BTC contributions have been recovered through completed sales. Remaining BTC is still exposed to market risk.';
  }
  return null;
}

export function isActionableHarvest(action: LunoBtcHarvestAction): boolean {
  return action === 'TAKE_SOME_PROFIT' || action === 'PROTECT_PROFIT';
}

export function evaluateBtcHarvest(input: {
  accountingStatus: string;
  metrics: OpenPositionMetrics;
  lots: FifoLot[];
  settings: LunoBtcHarvestSettingsValues;
  actedZones: LunoBtcHarvestZone[];
}): HarvestDecision {
  const metrics = input.metrics;
  const recoveryPct = principalRecoveryPct(
    metrics.principalRecoveredMyr,
    metrics.lifetimeMoneyPutInMyr,
  );
  const baseRecovery = {
    currentPct: recoveryPct,
    projectedPct: recoveryPct,
    remainingUnrecoveredAfterMyr: metrics.remainingUnrecoveredMyr,
    recoveredMyr: metrics.principalRecoveredMyr,
    remainingUnrecoveredMyr: metrics.remainingUnrecoveredMyr,
    projectedRecoveredMyr: metrics.principalRecoveredMyr,
    milestoneNote: principalMilestoneNote(recoveryPct),
  };
  const emptyRec = {
    suggestedHarvestMyr: null,
    btcToSell: null,
    estimatedRealizedProfitMyr: null,
    fifoCostBasisReleasedMyr: null,
    remainingBtc: metrics.currentBtcBalance,
    remainingMarketValueMyr: metrics.currentMarketValueMyr,
    estimatedFeesMyr: input.settings.estimatedSellFeeMyr,
  };

  if (input.accountingStatus === 'NOT_READY') {
    return hold('BELOW_FIRST', metrics, baseRecovery, emptyRec, [
      'BTC accounting is not ready. Harvest guidance is paused.',
    ]);
  }
  if (
    isZeroDecimal(metrics.currentBtcBalance) ||
    metrics.currentPriceMyr == null ||
    metrics.openAverageBuyPriceMyr == null ||
    isZeroDecimal(metrics.openAverageBuyPriceMyr) ||
    metrics.unrealizedProfitPct == null
  ) {
    return hold('BELOW_FIRST', metrics, baseRecovery, emptyRec, [
      'No open BTC position is available for harvest guidance.',
    ]);
  }

  const pct = metrics.unrealizedProfitPct;
  const zone = harvestZoneFromProfitPct(pct, input.settings);
  if (zone === 'BELOW_FIRST') {
    return hold(zone, metrics, baseRecovery, emptyRec, [
      'Profit is growing, but it has not reached the first harvest zone.',
    ]);
  }
  if (input.actedZones.includes(zone)) {
    return hold(zone, metrics, baseRecovery, emptyRec, [
      'This harvest zone was already used. Wait for a stronger profit zone.',
    ]);
  }

  const unrealized = metrics.unrealizedProfitMyr ?? '0';
  if (compareDecimal(unrealized, '0') <= 0) {
    return hold('BELOW_FIRST', metrics, baseRecovery, emptyRec, [
      'Profit is growing, but it has not reached the first harvest zone.',
    ]);
  }

  const fraction = harvestFractionForZone(zone, input.settings);
  if (fraction == null) {
    return hold('BELOW_FIRST', metrics, baseRecovery, emptyRec, [
      'Profit is growing, but it has not reached the first harvest zone.',
    ]);
  }

  let suggestedHarvestMyr = multiplyDecimalStrings(unrealized, fraction);
  if (
    compareDecimal(suggestedHarvestMyr, input.settings.minimumHarvestMyr) < 0
  ) {
    return hold(zone, metrics, baseRecovery, emptyRec, [
      'Profit is growing, but the harvest amount is still too small to be practical.',
    ]);
  }

  let btcToSell =
    divideDecimalStrings(suggestedHarvestMyr, metrics.currentPriceMyr, 18) ??
    '0';
  const coreFloor =
    divideDecimalStrings(
      multiplyDecimalStrings(
        metrics.currentBtcBalance,
        input.settings.minimumCorePct,
      ),
      '100',
      18,
    ) ?? '0';
  let remainingAfter = subtractDecimalStrings(
    metrics.currentBtcBalance,
    btcToSell,
  );
  if (compareDecimal(remainingAfter, coreFloor) < 0) {
    btcToSell = maxDecimal(
      subtractDecimalStrings(metrics.currentBtcBalance, coreFloor),
      '0',
    );
    suggestedHarvestMyr = multiplyDecimalStrings(
      btcToSell,
      metrics.currentPriceMyr,
    );
    remainingAfter = subtractDecimalStrings(
      metrics.currentBtcBalance,
      btcToSell,
    );
    if (
      compareDecimal(btcToSell, input.settings.minimumBtcSale) < 0 ||
      compareDecimal(suggestedHarvestMyr, input.settings.minimumHarvestMyr) < 0
    ) {
      return hold(
        'CORE_FLOOR',
        metrics,
        baseRecovery,
        emptyRec,
        ['Keep this BTC as your long-term core.'],
        'HOLD_CORE',
      );
    }
  }

  if (compareDecimal(remainingAfter, '0') <= 0) {
    return hold(
      'CORE_FLOOR',
      metrics,
      baseRecovery,
      emptyRec,
      ['Keep this BTC as your long-term core.'],
      'HOLD_CORE',
    );
  }

  const preview = previewFifoSale({
    lots: input.lots,
    btcToSell,
    estimatedSalePriceMyr: metrics.currentPriceMyr,
    estimatedFeeMyr: input.settings.estimatedSellFeeMyr,
  });
  if (!preview) {
    return hold(zone, metrics, baseRecovery, emptyRec, [
      'A harvest sale cannot be previewed from the current open lots.',
    ]);
  }

  const remainingMarketValueMyr = multiplyDecimalStrings(
    preview.remainingBtc,
    metrics.currentPriceMyr,
  );
  const projectedRecovered = addDecimalStrings(
    metrics.principalRecoveredMyr,
    preview.fifoCostBasisReleasedMyr,
  );
  const projectedPct = principalRecoveryPct(
    projectedRecovered,
    metrics.lifetimeMoneyPutInMyr,
  );
  const projectedUnrecovered = maxDecimal(
    subtractDecimalStrings(metrics.lifetimeMoneyPutInMyr, projectedRecovered),
    '0',
  );
  const split = splitRealizedProfit(
    preview.estimatedRealizedProfitMyr,
    input.settings,
  );
  const action = actionForHarvestZone(zone);
  const reasons =
    action === 'TAKE_SOME_PROFIT'
      ? [
          `Your open BTC position is ${formatPctPlain(pct)}% above its average cost.`,
          'This is the first staged profit zone.',
          'Most of your BTC remains invested.',
          'Sale must be completed manually in Luno.',
        ]
      : [
          `Your open BTC position is ${formatPctPlain(pct)}% above its average cost.`,
          'This is a stronger partial-harvest zone.',
          'Keep this BTC as your long-term core.',
          'Sale must be completed manually in Luno.',
        ];

  return {
    action,
    displayAction: displayHarvestAction(action),
    zone,
    currentPosition: {
      marketValueMyr: metrics.currentMarketValueMyr,
      openCostBasisMyr: metrics.openCostBasisMyr,
      unrealizedProfitMyr: metrics.unrealizedProfitMyr,
      unrealizedProfitPct: metrics.unrealizedProfitPct,
    },
    recommendation: {
      suggestedHarvestMyr,
      btcToSell,
      estimatedRealizedProfitMyr: preview.estimatedRealizedProfitMyr,
      fifoCostBasisReleasedMyr: preview.fifoCostBasisReleasedMyr,
      remainingBtc: preview.remainingBtc,
      remainingMarketValueMyr,
      estimatedFeesMyr: preview.estimatedFeesMyr,
    },
    profitSplit: {
      protectedProfitMyr: split.protectedProfitMyr,
      reinvestmentReserveMyr: split.reinvestmentReserveMyr,
    },
    principalRecovery: {
      currentPct: recoveryPct,
      projectedPct,
      remainingUnrecoveredAfterMyr: projectedUnrecovered,
      recoveredMyr: metrics.principalRecoveredMyr,
      remainingUnrecoveredMyr: metrics.remainingUnrecoveredMyr,
      projectedRecoveredMyr: projectedRecovered,
      milestoneNote: principalMilestoneNote(projectedPct),
    },
    salePreview: preview,
    reason: reasons,
  };
}

export function harvestAmountsMatch(
  actual: string,
  suggested: string,
): boolean {
  return amountsMatch(actual, suggested);
}

export function harvestBtcQuantitiesMatch(
  actualBtc: string,
  suggestedBtc: string,
): boolean {
  const diff = absDecimal(subtractDecimalStrings(actualBtc, suggestedBtc));
  if (compareDecimal(diff, BTC_DUST_TOLERANCE) <= 0) {
    return true;
  }
  if (isZeroDecimal(suggestedBtc)) {
    return false;
  }
  const pct = divideDecimalStrings(
    multiplyDecimalStrings(diff, '100'),
    suggestedBtc,
    8,
  );
  return pct != null && compareDecimal(pct, '15') <= 0;
}

export function saleMatchesHarvestRecommendation(input: {
  soldBtc: string;
  proceedsMyr: string;
  suggestedBtc: string | null;
  suggestedHarvestMyr: string | null;
}): boolean {
  const btcOk =
    input.suggestedBtc != null &&
    harvestBtcQuantitiesMatch(input.soldBtc, input.suggestedBtc);
  const myrOk =
    input.suggestedHarvestMyr != null &&
    harvestAmountsMatch(input.proceedsMyr, input.suggestedHarvestMyr);
  return btcOk || myrOk;
}

function hold(
  zone: LunoBtcHarvestZone,
  metrics: OpenPositionMetrics,
  recovery: HarvestDecision['principalRecovery'],
  recommendation: HarvestDecision['recommendation'],
  reason: string[],
  action: LunoBtcHarvestAction = 'HOLD',
): HarvestDecision {
  return {
    action,
    displayAction: displayHarvestAction(action),
    zone,
    currentPosition: {
      marketValueMyr: metrics.currentMarketValueMyr,
      openCostBasisMyr: metrics.openCostBasisMyr,
      unrealizedProfitMyr: metrics.unrealizedProfitMyr,
      unrealizedProfitPct: metrics.unrealizedProfitPct,
    },
    recommendation,
    profitSplit: {
      protectedProfitMyr: null,
      reinvestmentReserveMyr: null,
    },
    principalRecovery: recovery,
    salePreview: null,
    reason,
  };
}

function formatPctPlain(value: string): string {
  const rounded = divideDecimalStrings(value, '1', 2) ?? value;
  if (!rounded.includes('.')) {
    return `${rounded}.00`;
  }
  const [whole, frac = ''] = rounded.split('.');
  return `${whole}.${frac.padEnd(2, '0').slice(0, 2)}`;
}

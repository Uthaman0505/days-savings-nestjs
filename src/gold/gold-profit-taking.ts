/**
 * Phase 5B capital-protected profit-taking planner (preview only).
 *
 * grams_to_sell = desired_cash_profit / current PG BUY
 *
 * This is NOT realised accounting profit. Do NOT use
 * (PG BUY − weighted average cost) as profit per gram.
 * That formula answers an accounting P/L question.
 * This planner withdraws cash equal to excess *current* portfolio value
 * while leaving the protected-capital *current value* invested.
 *
 * Executable grams are floored to 4 decimal places so rounding cannot
 * consume protected capital. No sale is recorded. No holdings change.
 * The preview payload is PDF-extensible for a later Strategy
 * "Profit-Taking Plan" section (Phase 5C/5D). No PDF content in 5B.
 */
import {
  GRAM_SCALE,
  floorGramsFromCentsAtUnitPrice,
  parseGramsToUnitsOrZero,
  subtractGramsFloorZero,
  theoreticalGramsFromCentsAtUnitPrice,
  valueCentsFromGramsAndUnitPrice,
  valueCentsFromGramsAndUnitPriceAllowZero,
} from './gold-math';
import {
  evaluateGoldProfitGoal,
  type GoldProfitGoalRecord,
} from './gold-profit-goal';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';

export const GOLD_PROFIT_TAKING_MODES = ['TARGET', 'PARTIAL'] as const;
export type GoldProfitTakingMode = (typeof GOLD_PROFIT_TAKING_MODES)[number];

export const GOLD_PROFIT_TAKING_BLOCKING_REASONS = [
  'NO_ACTIVE_GOAL',
  'NO_HOLDINGS',
  'NO_CURRENT_PG_BUY',
  'NO_AVAILABLE_PROFIT',
  'TARGET_NOT_REACHED',
  'REQUEST_EXCEEDS_AVAILABLE_PROFIT',
  'INVALID_REQUESTED_PROFIT',
  'CAPITAL_PRESERVATION_FAILED',
] as const;
export type GoldProfitTakingBlockingReason =
  (typeof GOLD_PROFIT_TAKING_BLOCKING_REASONS)[number];

export type GoldProfitTakingPreview = {
  goalId: string | null;
  mode: GoldProfitTakingMode;
  targetProfitCents: number | null;
  requestedProfitCents: number | null;
  protectedCapitalCents: number;
  currentPortfolioValueCents: number | null;
  availableProfitCents: number | null;
  maxWithdrawableProfitCents: number | null;
  maxExecutableGramsToSell: string | null;
  maxExecutableProceedsCents: number | null;
  currentPgBuyPerGramCents: number | null;
  requiredPgBuyPerGramCents: number | null;
  totalGrams: string;
  theoreticalGramsToSell: string | null;
  executableGramsToSell: string | null;
  estimatedSaleProceedsCents: number | null;
  profitRoundingDifferenceCents: number | null;
  remainingGrams: string | null;
  remainingPortfolioValueCents: number | null;
  capitalBufferCents: number | null;
  isFullTargetAchievable: boolean;
  isPreviewAllowed: boolean;
  isCapitalPreserved: boolean | null;
  blockingReason: GoldProfitTakingBlockingReason | null;
};

function emptyPreview(
  mode: GoldProfitTakingMode,
  extras: Partial<GoldProfitTakingPreview> = {},
): GoldProfitTakingPreview {
  return {
    goalId: null,
    mode,
    targetProfitCents: null,
    requestedProfitCents: null,
    protectedCapitalCents: 0,
    currentPortfolioValueCents: null,
    availableProfitCents: null,
    maxWithdrawableProfitCents: null,
    maxExecutableGramsToSell: null,
    maxExecutableProceedsCents: null,
    currentPgBuyPerGramCents: null,
    requiredPgBuyPerGramCents: null,
    totalGrams: '0.0000',
    theoreticalGramsToSell: null,
    executableGramsToSell: null,
    estimatedSaleProceedsCents: null,
    profitRoundingDifferenceCents: null,
    remainingGrams: null,
    remainingPortfolioValueCents: null,
    capitalBufferCents: null,
    isFullTargetAchievable: false,
    isPreviewAllowed: false,
    isCapitalPreserved: null,
    blockingReason: null,
    ...extras,
  };
}

function capUnits(units: bigint, maxUnits: bigint): bigint {
  return units > maxUnits ? maxUnits : units;
}

function formatUnits(units: bigint): string {
  return `${(units / GRAM_SCALE).toString()}.${(units % GRAM_SCALE)
    .toString()
    .padStart(4, '0')}`;
}

/**
 * Largest 0.0001g sell that keeps remaining_value >= protected capital.
 */
function maxCapitalSafeSellUnits(
  totalUnits: bigint,
  pgBuyCents: number,
  protectedCapitalCents: number,
): bigint {
  let lo = 0n;
  let hi = totalUnits;
  let best = 0n;
  while (lo <= hi) {
    const mid = (lo + hi) / 2n;
    const remainingUnits = totalUnits - mid;
    const remainingValue =
      remainingUnits === 0n
        ? 0
        : valueCentsFromGramsAndUnitPriceAllowZero(
            formatUnits(remainingUnits),
            pgBuyCents,
          );
    if (remainingValue >= protectedCapitalCents) {
      best = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }
  return best;
}

function planSale(input: {
  requestedProfitCents: number;
  totalGrams: string;
  pgBuyCents: number;
  protectedCapitalCents: number;
  maxSellUnits: bigint;
}): {
  theoreticalGrams: string;
  executableGrams: string;
  proceedsCents: number;
  remainingGrams: string;
  remainingValueCents: number;
  capitalBufferCents: number;
  roundingDifferenceCents: number;
  capitalPreserved: boolean;
} | null {
  const theoreticalGrams = theoreticalGramsFromCentsAtUnitPrice(
    input.requestedProfitCents,
    input.pgBuyCents,
  );
  let sellUnits = parseGramsToUnitsOrZero(
    floorGramsFromCentsAtUnitPrice(
      input.requestedProfitCents,
      input.pgBuyCents,
    ),
  );
  sellUnits = capUnits(sellUnits, input.maxSellUnits);

  while (sellUnits > 0n) {
    const executableGrams = formatUnits(sellUnits);
    const remainingGrams = subtractGramsFloorZero(
      input.totalGrams,
      executableGrams,
    );
    const remainingValueCents = valueCentsFromGramsAndUnitPriceAllowZero(
      remainingGrams,
      input.pgBuyCents,
    );
    if (remainingValueCents >= input.protectedCapitalCents) {
      const proceedsCents = valueCentsFromGramsAndUnitPrice(
        executableGrams,
        input.pgBuyCents,
      );
      return {
        theoreticalGrams,
        executableGrams,
        proceedsCents,
        remainingGrams,
        remainingValueCents,
        capitalBufferCents: remainingValueCents - input.protectedCapitalCents,
        roundingDifferenceCents: input.requestedProfitCents - proceedsCents,
        capitalPreserved: true,
      };
    }
    sellUnits -= 1n;
  }

  const remainingValueCents = valueCentsFromGramsAndUnitPriceAllowZero(
    input.totalGrams,
    input.pgBuyCents,
  );
  if (remainingValueCents >= input.protectedCapitalCents) {
    return {
      theoreticalGrams,
      executableGrams: '0.0000',
      proceedsCents: 0,
      remainingGrams: input.totalGrams,
      remainingValueCents,
      capitalBufferCents: remainingValueCents - input.protectedCapitalCents,
      roundingDifferenceCents: input.requestedProfitCents,
      capitalPreserved: true,
    };
  }
  return null;
}

export function evaluateGoldProfitTakingPreview(input: {
  goal: GoldProfitGoalRecord | null;
  purchases: GoldPurchaseObservation[];
  latestPrice: { pgBuyPricePerGramCents: number } | null;
  mode: GoldProfitTakingMode;
  requestedProfitCents?: number | null;
}): GoldProfitTakingPreview {
  const mode = input.mode;
  if (!input.goal) {
    return emptyPreview(mode, { blockingReason: 'NO_ACTIVE_GOAL' });
  }

  const evaluation = evaluateGoldProfitGoal({
    goal: input.goal,
    purchases: input.purchases,
    latestPrice: input.latestPrice,
  });

  const context: Partial<GoldProfitTakingPreview> = {
    goalId: input.goal.id,
    targetProfitCents: evaluation.goal.targetProfitCents,
    protectedCapitalCents: evaluation.protectedCapitalCents,
    currentPortfolioValueCents: evaluation.currentValueCents,
    availableProfitCents: evaluation.availableProfitCents,
    maxWithdrawableProfitCents: evaluation.availableProfitCents,
    currentPgBuyPerGramCents: evaluation.currentPgBuyPerGramCents,
    requiredPgBuyPerGramCents: evaluation.requiredPgBuyPerGramCents,
    totalGrams: evaluation.totalGrams,
    isFullTargetAchievable: evaluation.isTargetReached,
  };

  const requestedProfitCents =
    mode === 'TARGET'
      ? evaluation.goal.targetProfitCents
      : (input.requestedProfitCents ?? null);

  const withRequest = emptyPreview(mode, {
    ...context,
    requestedProfitCents,
  });

  if (!evaluation.hasHoldings) {
    return { ...withRequest, blockingReason: 'NO_HOLDINGS' };
  }
  if (
    !evaluation.hasCurrentPrice ||
    evaluation.currentPgBuyPerGramCents == null
  ) {
    return { ...withRequest, blockingReason: 'NO_CURRENT_PG_BUY' };
  }

  const pgBuy = evaluation.currentPgBuyPerGramCents;
  const available = evaluation.availableProfitCents ?? 0;
  const totalUnits = parseGramsToUnitsOrZero(evaluation.totalGrams);
  const capitalSafe = maxCapitalSafeSellUnits(
    totalUnits,
    pgBuy,
    evaluation.protectedCapitalCents,
  );
  const availableUnits = parseGramsToUnitsOrZero(
    floorGramsFromCentsAtUnitPrice(available, pgBuy),
  );
  const maxSellUnits = capUnits(availableUnits, capitalSafe);
  const maxExecutableGrams =
    maxSellUnits === 0n ? '0.0000' : formatUnits(maxSellUnits);
  const maxExecutableProceeds =
    maxSellUnits === 0n
      ? 0
      : valueCentsFromGramsAndUnitPrice(maxExecutableGrams, pgBuy);

  const withMax = {
    ...withRequest,
    maxExecutableGramsToSell: maxExecutableGrams,
    maxExecutableProceedsCents: maxExecutableProceeds,
  };

  if (available <= 0) {
    return { ...withMax, blockingReason: 'NO_AVAILABLE_PROFIT' };
  }

  if (mode === 'PARTIAL') {
    const requested = input.requestedProfitCents;
    if (requested == null || !Number.isInteger(requested) || requested < 1) {
      return { ...withMax, blockingReason: 'INVALID_REQUESTED_PROFIT' };
    }
    if (requested > available) {
      return {
        ...withMax,
        requestedProfitCents: requested,
        blockingReason: 'REQUEST_EXCEEDS_AVAILABLE_PROFIT',
      };
    }
  }

  if (mode === 'TARGET' && !evaluation.isTargetReached) {
    return { ...withMax, blockingReason: 'TARGET_NOT_REACHED' };
  }

  const requested = requestedProfitCents as number;
  const planned = planSale({
    requestedProfitCents: requested,
    totalGrams: evaluation.totalGrams,
    pgBuyCents: pgBuy,
    protectedCapitalCents: evaluation.protectedCapitalCents,
    maxSellUnits,
  });

  if (!planned || !planned.capitalPreserved) {
    return { ...withMax, blockingReason: 'CAPITAL_PRESERVATION_FAILED' };
  }

  return {
    ...withMax,
    theoreticalGramsToSell: planned.theoreticalGrams,
    executableGramsToSell: planned.executableGrams,
    estimatedSaleProceedsCents: planned.proceedsCents,
    profitRoundingDifferenceCents: planned.roundingDifferenceCents,
    remainingGrams: planned.remainingGrams,
    remainingPortfolioValueCents: planned.remainingValueCents,
    capitalBufferCents: planned.capitalBufferCents,
    isPreviewAllowed: true,
    isCapitalPreserved: true,
    blockingReason: null,
  };
}

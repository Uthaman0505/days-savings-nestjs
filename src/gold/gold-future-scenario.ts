/**
 * Phase 6C — hypothetical future PG BUY scenario simulator.
 *
 * Scenario math only. Not a forecast, not a purchase, not a sale.
 * Future valuation uses PG BUY. Planned-buy grams reuse Phase 6A
 * (acquisition at current PG SELL). Profit-taking reuses Phase 5B.
 */
import {
  derivePricePerGramCents,
  parseGramsToUnitsOrZero,
  roundHalfUpDiv,
} from './gold-math';
import type { GoldBuyScenario, GoldGoalDecision } from './gold-goal-decision';
import {
  evaluateGoldProfitGoal,
  type GoldProfitGoalRecord,
} from './gold-profit-goal';
import {
  computeGoldHoldingsSummary,
  type GoldPurchaseObservation,
} from './gold-portfolio-analytics';
import { evaluateGoldProfitTakingPreview } from './gold-profit-taking';

export const MAX_FUTURE_SCENARIO_PRICES = 6;
export const PLANNED_DEPLOYMENT_PERCENTS = [25, 50, 75, 100] as const;
export type GoldPlannedDeploymentPercent =
  (typeof PLANNED_DEPLOYMENT_PERCENTS)[number];

export const GOLD_FUTURE_SCENARIO_STATUSES = [
  'BELOW_PROTECTED_CAPITAL',
  'PROFIT_AVAILABLE',
  'TARGET_REACHED',
  'ABOVE_TARGET',
] as const;
export type GoldFutureScenarioStatus =
  (typeof GOLD_FUTURE_SCENARIO_STATUSES)[number];

export const GOLD_TARGET_PRICE_RELATIONSHIPS = [
  'BELOW_TARGET',
  'AT_TARGET',
  'ABOVE_TARGET',
] as const;
export type GoldTargetPriceRelationship =
  (typeof GOLD_TARGET_PRICE_RELATIONSHIPS)[number];

export const GOLD_FUTURE_SCENARIO_DISCLAIMER =
  'This is a hypothetical scenario, not a prediction.';

export type GoldFutureProfitTakingSlice = {
  executableGramsToSell: string | null;
  estimatedSaleProceedsCents: number | null;
  remainingGrams: string | null;
  remainingValueCents: number | null;
  capitalBufferCents: number | null;
  capitalPreserved: boolean | null;
  theoreticalGramsToSell: string | null;
  isPreviewAllowed: boolean;
  blockingReason: string | null;
};

export type GoldFutureScenario = {
  futurePgBuyPerGramCents: number;
  scenarioStatus: GoldFutureScenarioStatus;
  totalGrams: string;
  protectedCapitalCents: number;
  futurePortfolioValueCents: number;
  futureAvailableProfitCents: number;
  futureRemainingProfitCents: number | null;
  futureExcessProfitCents: number | null;
  progressPercent: number | null;
  isTargetReached: boolean;
  hasActiveGoal: boolean;
  hasHoldings: boolean;
  hasMonthlyBudget: boolean;
  monthlyBudgetCents: number | null;
  currentPgBuyCents: number | null;
  currentRequiredPgBuyCents: number | null;
  targetProfitCents: number | null;
  targetPriceRelationship: GoldTargetPriceRelationship | null;
  futurePgBuyMinusRequiredCents: number | null;
  suggestedComparisonPricesCents: number[];
  plannedPurchaseAvailable: boolean;
  plannedPurchaseUnavailableReason: string | null;
  deploymentPercent: number | null;
  deploymentCents: number | null;
  estimatedNewGrams: string | null;
  postBuyTotalGrams: string | null;
  postBuyProtectedCapitalCents: number | null;
  postBuyRequiredPgBuyCents: number | null;
  futureValueAfterBuyCents: number | null;
  futureAvailableProfitAfterBuyCents: number | null;
  futureRemainingProfitAfterBuyCents: number | null;
  futureExcessProfitAfterBuyCents: number | null;
  futureProgressAfterBuyPercent: number | null;
  futureTargetReachedAfterBuy: boolean | null;
  futureStatusAfterBuy: GoldFutureScenarioStatus | null;
  changeInFutureValueCents: number | null;
  changeInFutureProfitCents: number | null;
  changeInProgressPercent: number | null;
  helpsReachTargetAtThisPrice: boolean | null;
  executableGramsToSell: string | null;
  estimatedSaleProceedsCents: number | null;
  remainingGrams: string | null;
  remainingValueCents: number | null;
  capitalBufferCents: number | null;
  capitalPreserved: boolean | null;
  profitTaking: GoldFutureProfitTakingSlice;
  profitTakingAfterBuy: GoldFutureProfitTakingSlice | null;
};

export type GoldFutureScenarioComparison = {
  monthlyBudgetCents: number | null;
  currentPgBuyCents: number | null;
  currentRequiredPgBuyCents: number | null;
  hasActiveGoal: boolean;
  hasHoldings: boolean;
  hasMonthlyBudget: boolean;
  plannedDeploymentPercent: number | null;
  suggestedComparisonPricesCents: number[];
  scenarios: GoldFutureScenario[];
};

export type ComputeGoldFutureScenarioInput = {
  futurePgBuyPerGramCents: number;
  plannedDeploymentPercent: number | null;
  requestedProfitCents: number | null;
  goal: GoldProfitGoalRecord | null;
  purchases: GoldPurchaseObservation[];
  decision: GoldGoalDecision;
};

function percentOfCents(cents: number, percent: number): number {
  return Number(roundHalfUpDiv(BigInt(cents) * BigInt(percent), 100n));
}

export function suggestedFuturePgBuyPrices(input: {
  currentPgBuyCents: number | null;
  requiredPgBuyCents: number | null;
}): number[] {
  const prices: number[] = [];
  if (input.currentPgBuyCents != null && input.currentPgBuyCents > 0) {
    prices.push(percentOfCents(input.currentPgBuyCents, 95));
    prices.push(input.currentPgBuyCents);
    prices.push(percentOfCents(input.currentPgBuyCents, 105));
    prices.push(percentOfCents(input.currentPgBuyCents, 110));
  }
  if (input.requiredPgBuyCents != null && input.requiredPgBuyCents > 0) {
    prices.push(input.requiredPgBuyCents);
  }
  return normalizeFuturePrices(prices);
}

export function normalizeFuturePrices(prices: number[]): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const price of prices) {
    if (!Number.isInteger(price) || price < 1) {
      continue;
    }
    if (seen.has(price)) {
      continue;
    }
    seen.add(price);
    unique.push(price);
  }
  unique.sort((a, b) => a - b);
  return unique.slice(0, MAX_FUTURE_SCENARIO_PRICES);
}

export function assertFuturePgBuyCents(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('FUTURE_PG_BUY_INVALID');
  }
}

export function isPlannedDeploymentPercent(
  value: number,
): value is GoldPlannedDeploymentPercent {
  return (PLANNED_DEPLOYMENT_PERCENTS as readonly number[]).includes(value);
}

function targetRelationship(
  futurePgBuyCents: number,
  requiredPgBuyCents: number | null,
): {
  relationship: GoldTargetPriceRelationship | null;
  differenceCents: number | null;
} {
  if (requiredPgBuyCents == null) {
    return { relationship: null, differenceCents: null };
  }
  const differenceCents = futurePgBuyCents - requiredPgBuyCents;
  if (differenceCents < 0) {
    return { relationship: 'BELOW_TARGET', differenceCents };
  }
  if (differenceCents > 0) {
    return { relationship: 'ABOVE_TARGET', differenceCents };
  }
  return { relationship: 'AT_TARGET', differenceCents: 0 };
}

function scenarioStatus(input: {
  futureValueCents: number;
  protectedCapitalCents: number;
  availableProfitCents: number;
  targetProfitCents: number | null;
}): GoldFutureScenarioStatus {
  if (input.futureValueCents <= input.protectedCapitalCents) {
    return 'BELOW_PROTECTED_CAPITAL';
  }
  if (input.targetProfitCents != null && input.targetProfitCents > 0) {
    if (input.availableProfitCents > input.targetProfitCents) {
      return 'ABOVE_TARGET';
    }
    if (input.availableProfitCents >= input.targetProfitCents) {
      return 'TARGET_REACHED';
    }
  }
  if (input.availableProfitCents > 0) {
    return 'PROFIT_AVAILABLE';
  }
  return 'BELOW_PROTECTED_CAPITAL';
}

function emptyProfitTaking(): GoldFutureProfitTakingSlice {
  return {
    executableGramsToSell: null,
    estimatedSaleProceedsCents: null,
    remainingGrams: null,
    remainingValueCents: null,
    capitalBufferCents: null,
    capitalPreserved: null,
    theoreticalGramsToSell: null,
    isPreviewAllowed: false,
    blockingReason: null,
  };
}

function toProfitTakingSlice(
  preview: ReturnType<typeof evaluateGoldProfitTakingPreview>,
): GoldFutureProfitTakingSlice {
  return {
    executableGramsToSell: preview.executableGramsToSell,
    estimatedSaleProceedsCents: preview.estimatedSaleProceedsCents,
    remainingGrams: preview.remainingGrams,
    remainingValueCents: preview.remainingPortfolioValueCents,
    capitalBufferCents: preview.capitalBufferCents,
    capitalPreserved: preview.isCapitalPreserved,
    theoreticalGramsToSell: preview.theoreticalGramsToSell,
    isPreviewAllowed: preview.isPreviewAllowed,
    blockingReason: preview.blockingReason,
  };
}

function profitTakingForPosition(input: {
  goal: GoldProfitGoalRecord | null;
  purchases: GoldPurchaseObservation[];
  futurePgBuyCents: number;
  requestedProfitCents: number | null;
  isTargetReached: boolean;
  availableProfitCents: number;
}): GoldFutureProfitTakingSlice {
  if (!input.goal) {
    return { ...emptyProfitTaking(), blockingReason: 'NO_ACTIVE_GOAL' };
  }
  const grams = parseGramsToUnitsOrZero(
    computeGoldHoldingsSummary(input.purchases, {
      pgBuyPricePerGramCents: input.futurePgBuyCents,
      pgSellPricePerGramCents: 0,
      priceDate: '',
    }).totalGrams,
  );
  if (grams <= 0n) {
    return { ...emptyProfitTaking(), blockingReason: 'NO_HOLDINGS' };
  }
  const requested = input.requestedProfitCents;
  if (requested != null) {
    if (!Number.isInteger(requested) || requested < 1) {
      return {
        ...emptyProfitTaking(),
        blockingReason: 'INVALID_REQUESTED_PROFIT',
      };
    }
    if (requested > input.availableProfitCents) {
      return {
        ...emptyProfitTaking(),
        blockingReason: 'REQUEST_EXCEEDS_AVAILABLE_PROFIT',
      };
    }
    return toProfitTakingSlice(
      evaluateGoldProfitTakingPreview({
        goal: input.goal,
        purchases: input.purchases,
        latestPrice: { pgBuyPricePerGramCents: input.futurePgBuyCents },
        mode: 'PARTIAL',
        requestedProfitCents: requested,
      }),
    );
  }
  if (!input.isTargetReached) {
    return { ...emptyProfitTaking(), blockingReason: 'TARGET_NOT_REACHED' };
  }
  return toProfitTakingSlice(
    evaluateGoldProfitTakingPreview({
      goal: input.goal,
      purchases: input.purchases,
      latestPrice: { pgBuyPricePerGramCents: input.futurePgBuyCents },
      mode: 'TARGET',
    }),
  );
}

function syntheticPostBuyPurchases(
  scenario: GoldBuyScenario,
): GoldPurchaseObservation[] | null {
  const grams = String(scenario.postBuyTotalGrams);
  if (parseGramsToUnitsOrZero(grams) <= 0n) {
    return null;
  }
  let pricePerGramCents = 1;
  if (scenario.postBuyProtectedCapitalCents > 0) {
    try {
      pricePerGramCents = derivePricePerGramCents(
        scenario.postBuyProtectedCapitalCents,
        grams,
      );
    } catch {
      pricePerGramCents = 1;
    }
  }
  return [
    {
      id: 'hypothetical-planned-buy',
      purchaseDate: '1970-01-01',
      weightGrams: grams,
      amountPaidCents: scenario.postBuyProtectedCapitalCents,
      pricePerGramCents,
      source: 'MANUAL',
      referenceNumber: null,
      createdAt: new Date(0),
      isActive: true,
    },
  ];
}

type PositionSnapshot = {
  totalGrams: string;
  protectedCapitalCents: number;
  futurePortfolioValueCents: number;
  futureAvailableProfitCents: number;
  futureRemainingProfitCents: number | null;
  futureExcessProfitCents: number | null;
  progressPercent: number | null;
  isTargetReached: boolean;
  hasHoldings: boolean;
  status: GoldFutureScenarioStatus;
};

function positionAtHypotheticalPrice(input: {
  goal: GoldProfitGoalRecord | null;
  purchases: GoldPurchaseObservation[];
  futurePgBuyCents: number;
}): PositionSnapshot {
  const hypotheticalPrice = {
    pgBuyPricePerGramCents: input.futurePgBuyCents,
    pgSellPricePerGramCents: 0,
    priceDate: '',
  };
  if (input.goal) {
    const evaluation = evaluateGoldProfitGoal({
      goal: input.goal,
      purchases: input.purchases,
      latestPrice: { pgBuyPricePerGramCents: input.futurePgBuyCents },
    });
    const available = evaluation.availableProfitCents ?? 0;
    const value = evaluation.currentValueCents ?? 0;
    return {
      totalGrams: evaluation.totalGrams,
      protectedCapitalCents: evaluation.protectedCapitalCents,
      futurePortfolioValueCents: value,
      futureAvailableProfitCents: available,
      futureRemainingProfitCents: evaluation.remainingProfitCents,
      futureExcessProfitCents: evaluation.excessProfitCents,
      progressPercent: evaluation.progressPercent,
      isTargetReached: evaluation.isTargetReached,
      hasHoldings: evaluation.hasHoldings,
      status: scenarioStatus({
        futureValueCents: value,
        protectedCapitalCents: evaluation.protectedCapitalCents,
        availableProfitCents: available,
        targetProfitCents: evaluation.goal.targetProfitCents,
      }),
    };
  }
  const summary = computeGoldHoldingsSummary(
    input.purchases,
    hypotheticalPrice,
  );
  const value = summary.currentValueCents ?? 0;
  const available = Math.max(0, value - summary.totalInvestedCents);
  return {
    totalGrams: summary.totalGrams,
    protectedCapitalCents: summary.totalInvestedCents,
    futurePortfolioValueCents: value,
    futureAvailableProfitCents: available,
    futureRemainingProfitCents: null,
    futureExcessProfitCents: null,
    progressPercent: null,
    isTargetReached: false,
    hasHoldings: summary.hasGrams,
    status: scenarioStatus({
      futureValueCents: value,
      protectedCapitalCents: summary.totalInvestedCents,
      availableProfitCents: available,
      targetProfitCents: null,
    }),
  };
}

export function computeGoldFutureScenario(
  input: ComputeGoldFutureScenarioInput,
): GoldFutureScenario {
  assertFuturePgBuyCents(input.futurePgBuyPerGramCents);
  const futurePgBuy = input.futurePgBuyPerGramCents;
  const decision = input.decision;
  const goal = input.goal;
  const targetProfitCents = goal?.targetProfitCents ?? null;
  const base = positionAtHypotheticalPrice({
    goal,
    purchases: input.purchases,
    futurePgBuyCents: futurePgBuy,
  });
  const required = targetRelationship(
    futurePgBuy,
    decision.currentRequiredPgBuyCents,
  );
  const suggested = suggestedFuturePgBuyPrices({
    currentPgBuyCents: decision.currentPgBuyCents,
    requiredPgBuyCents: decision.currentRequiredPgBuyCents,
  });

  const profitTaking = profitTakingForPosition({
    goal,
    purchases: input.purchases,
    futurePgBuyCents: futurePgBuy,
    requestedProfitCents: input.requestedProfitCents,
    isTargetReached: base.isTargetReached,
    availableProfitCents: base.futureAvailableProfitCents,
  });

  let plannedPurchaseUnavailableReason: string | null = null;
  let plannedPurchaseAvailable = false;
  const plannedPercent = input.plannedDeploymentPercent;
  let buyScenario: GoldBuyScenario | null = null;
  if (plannedPercent != null) {
    if (!isPlannedDeploymentPercent(plannedPercent)) {
      throw new Error('PLANNED_DEPLOYMENT_INVALID');
    }
    if (!decision.hasMonthlyBudget || decision.monthlyBudgetCents == null) {
      plannedPurchaseUnavailableReason =
        'A monthly Gold budget is not set, so a planned purchase cannot be compared.';
    } else if (
      decision.currentPgSellCents == null ||
      decision.currentPgSellCents <= 0
    ) {
      plannedPurchaseUnavailableReason =
        'A current PG SELL is needed to estimate grams for a planned purchase.';
    } else {
      buyScenario =
        decision.scenarios.find(
          (row) => row.deploymentPercent === plannedPercent,
        ) ?? null;
      if (!buyScenario || buyScenario.deploymentCents <= 0) {
        plannedPurchaseUnavailableReason =
          'No planned-purchase scenario is available at this budget percent.';
      } else {
        plannedPurchaseAvailable = true;
      }
    }
  }

  let after: PositionSnapshot | null = null;
  let afterPurchases: GoldPurchaseObservation[] | null = null;
  let profitTakingAfterBuy: GoldFutureProfitTakingSlice | null = null;
  if (plannedPurchaseAvailable && buyScenario) {
    afterPurchases = syntheticPostBuyPurchases(buyScenario);
    after = positionAtHypotheticalPrice({
      goal,
      purchases: afterPurchases ?? [],
      futurePgBuyCents: futurePgBuy,
    });
    if (afterPurchases) {
      profitTakingAfterBuy = profitTakingForPosition({
        goal,
        purchases: afterPurchases,
        futurePgBuyCents: futurePgBuy,
        requestedProfitCents: input.requestedProfitCents,
        isTargetReached: after.isTargetReached,
        availableProfitCents: after.futureAvailableProfitCents,
      });
    } else {
      profitTakingAfterBuy = {
        ...emptyProfitTaking(),
        blockingReason: 'NO_HOLDINGS',
      };
    }
  }

  const progressAfter = after?.progressPercent ?? null;
  const changeInProgress =
    progressAfter != null && base.progressPercent != null
      ? Number((progressAfter - base.progressPercent).toFixed(2))
      : progressAfter != null && targetProfitCents != null
        ? progressAfter
        : null;

  return {
    futurePgBuyPerGramCents: futurePgBuy,
    scenarioStatus: base.status,
    totalGrams: base.totalGrams,
    protectedCapitalCents: base.protectedCapitalCents,
    futurePortfolioValueCents: base.futurePortfolioValueCents,
    futureAvailableProfitCents: base.futureAvailableProfitCents,
    futureRemainingProfitCents: base.futureRemainingProfitCents,
    futureExcessProfitCents: base.futureExcessProfitCents,
    progressPercent: base.progressPercent,
    isTargetReached: base.isTargetReached,
    hasActiveGoal: goal != null,
    hasHoldings: base.hasHoldings,
    hasMonthlyBudget: decision.hasMonthlyBudget,
    monthlyBudgetCents: decision.monthlyBudgetCents,
    currentPgBuyCents: decision.currentPgBuyCents,
    currentRequiredPgBuyCents: decision.currentRequiredPgBuyCents,
    targetProfitCents,
    targetPriceRelationship: required.relationship,
    futurePgBuyMinusRequiredCents: required.differenceCents,
    suggestedComparisonPricesCents: suggested,
    plannedPurchaseAvailable,
    plannedPurchaseUnavailableReason,
    deploymentPercent: plannedPurchaseAvailable
      ? (buyScenario?.deploymentPercent ?? null)
      : plannedPercent,
    deploymentCents: plannedPurchaseAvailable
      ? (buyScenario?.deploymentCents ?? null)
      : null,
    estimatedNewGrams: plannedPurchaseAvailable
      ? (buyScenario?.estimatedNewGrams ?? null)
      : null,
    postBuyTotalGrams: plannedPurchaseAvailable
      ? (buyScenario?.postBuyTotalGrams ?? null)
      : null,
    postBuyProtectedCapitalCents: plannedPurchaseAvailable
      ? (buyScenario?.postBuyProtectedCapitalCents ?? null)
      : null,
    postBuyRequiredPgBuyCents: plannedPurchaseAvailable
      ? (buyScenario?.postBuyRequiredPgBuyCents ?? null)
      : null,
    futureValueAfterBuyCents: after?.futurePortfolioValueCents ?? null,
    futureAvailableProfitAfterBuyCents:
      after?.futureAvailableProfitCents ?? null,
    futureRemainingProfitAfterBuyCents:
      after?.futureRemainingProfitCents ?? null,
    futureExcessProfitAfterBuyCents: after?.futureExcessProfitCents ?? null,
    futureProgressAfterBuyPercent: progressAfter,
    futureTargetReachedAfterBuy: after?.isTargetReached ?? null,
    futureStatusAfterBuy: after?.status ?? null,
    changeInFutureValueCents:
      after == null
        ? null
        : after.futurePortfolioValueCents - base.futurePortfolioValueCents,
    changeInFutureProfitCents:
      after == null
        ? null
        : after.futureAvailableProfitCents - base.futureAvailableProfitCents,
    changeInProgressPercent: changeInProgress,
    helpsReachTargetAtThisPrice:
      after == null ? null : after.isTargetReached && !base.isTargetReached,
    executableGramsToSell: profitTaking.executableGramsToSell,
    estimatedSaleProceedsCents: profitTaking.estimatedSaleProceedsCents,
    remainingGrams: profitTaking.remainingGrams,
    remainingValueCents: profitTaking.remainingValueCents,
    capitalBufferCents: profitTaking.capitalBufferCents,
    capitalPreserved: profitTaking.capitalPreserved,
    profitTaking,
    profitTakingAfterBuy,
  };
}

export function computeGoldFutureScenarioComparison(input: {
  futurePriceCents: number[];
  plannedDeploymentPercent: number | null;
  requestedProfitCents: number | null;
  goal: GoldProfitGoalRecord | null;
  purchases: GoldPurchaseObservation[];
  decision: GoldGoalDecision;
}): GoldFutureScenarioComparison {
  const prices = normalizeFuturePrices(input.futurePriceCents);
  if (input.futurePriceCents.length > MAX_FUTURE_SCENARIO_PRICES) {
    throw new Error('FUTURE_SCENARIO_LIMIT');
  }
  const scenarios = prices.map((futurePgBuyPerGramCents) =>
    computeGoldFutureScenario({
      futurePgBuyPerGramCents,
      plannedDeploymentPercent: input.plannedDeploymentPercent,
      requestedProfitCents: input.requestedProfitCents,
      goal: input.goal,
      purchases: input.purchases,
      decision: input.decision,
    }),
  );
  return {
    monthlyBudgetCents: input.decision.monthlyBudgetCents,
    currentPgBuyCents: input.decision.currentPgBuyCents,
    currentRequiredPgBuyCents: input.decision.currentRequiredPgBuyCents,
    hasActiveGoal: input.goal != null,
    hasHoldings: input.decision.hasHoldings,
    hasMonthlyBudget: input.decision.hasMonthlyBudget,
    plannedDeploymentPercent: input.plannedDeploymentPercent,
    suggestedComparisonPricesCents: suggestedFuturePgBuyPrices({
      currentPgBuyCents: input.decision.currentPgBuyCents,
      requiredPgBuyCents: input.decision.currentRequiredPgBuyCents,
    }),
    scenarios,
  };
}

/**
 * Phase 5A profit-goal evaluation.
 * Uses Phase 4B holdings summary (PG BUY valuation). No sell planning.
 * Status payload is PDF-extensible for a later Strategy section (Phase 5C/5D).
 */
import {
  derivePricePerGramCents,
  ratioPercent,
  signedPercentChange,
} from './gold-math';
import {
  computeGoldHoldingsSummary,
  type GoldPurchaseObservation,
} from './gold-portfolio-analytics';

export type GoldProfitGoalRecord = {
  id: string;
  targetProfitCents: number;
  status: 'ACTIVE' | 'ACHIEVED' | 'CANCELLED';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  achievedAt: Date | null;
};

export type GoldProfitGoalEvaluation = {
  goal: GoldProfitGoalRecord;
  protectedCapitalCents: number;
  currentValueCents: number | null;
  availableProfitCents: number | null;
  remainingProfitCents: number | null;
  requiredPortfolioValueCents: number;
  requiredPgBuyPerGramCents: number | null;
  currentPgBuyPerGramCents: number | null;
  averageCostPerGramCents: number;
  distanceToRequiredPgBuyCents: number | null;
  distanceToRequiredPgBuyPercent: number | null;
  progressPercent: number | null;
  excessProfitCents: number | null;
  isTargetReached: boolean;
  hasCurrentPrice: boolean;
  hasHoldings: boolean;
  totalGrams: string;
};

function clampDisplayProgress(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

export function evaluateGoldProfitGoal(input: {
  goal: GoldProfitGoalRecord;
  purchases: GoldPurchaseObservation[];
  latestPrice: { pgBuyPricePerGramCents: number } | null;
}): GoldProfitGoalEvaluation {
  const targetProfitCents = input.goal.targetProfitCents;
  const summary = computeGoldHoldingsSummary(
    input.purchases,
    input.latestPrice
      ? {
          pgBuyPricePerGramCents: input.latestPrice.pgBuyPricePerGramCents,
          pgSellPricePerGramCents: 0,
          priceDate: '',
        }
      : null,
  );
  const protectedCapitalCents = summary.totalInvestedCents;
  const requiredPortfolioValueCents = protectedCapitalCents + targetProfitCents;
  const hasHoldings = summary.hasGrams;
  const hasCurrentPrice = summary.hasPrice;
  let requiredPgBuyPerGramCents: number | null = null;
  if (hasHoldings) {
    requiredPgBuyPerGramCents = derivePricePerGramCents(
      requiredPortfolioValueCents,
      summary.totalGrams,
    );
  }

  const currentValueCents = summary.currentValueCents;
  const availableProfitCents =
    currentValueCents == null
      ? null
      : Math.max(0, currentValueCents - protectedCapitalCents);
  const remainingProfitCents =
    availableProfitCents == null
      ? null
      : Math.max(0, targetProfitCents - availableProfitCents);
  const excessProfitCents =
    availableProfitCents == null
      ? null
      : Math.max(0, availableProfitCents - targetProfitCents);

  let progressPercent: number | null = null;
  if (availableProfitCents != null && targetProfitCents > 0) {
    const raw = ratioPercent(availableProfitCents, targetProfitCents);
    progressPercent = raw == null ? 0 : clampDisplayProgress(raw);
  }

  const currentPgBuy = summary.currentPgBuyCents;
  let distanceToRequiredPgBuyCents: number | null = null;
  let distanceToRequiredPgBuyPercent: number | null = null;
  if (requiredPgBuyPerGramCents != null && currentPgBuy != null) {
    distanceToRequiredPgBuyCents = requiredPgBuyPerGramCents - currentPgBuy;
    distanceToRequiredPgBuyPercent = signedPercentChange(
      currentPgBuy,
      requiredPgBuyPerGramCents,
    );
  }

  const isTargetReached =
    hasCurrentPrice &&
    hasHoldings &&
    availableProfitCents != null &&
    availableProfitCents >= targetProfitCents;

  return {
    goal: input.goal,
    protectedCapitalCents,
    currentValueCents,
    availableProfitCents,
    remainingProfitCents,
    requiredPortfolioValueCents,
    requiredPgBuyPerGramCents,
    currentPgBuyPerGramCents: currentPgBuy,
    averageCostPerGramCents: summary.averageCostPerGramCents,
    distanceToRequiredPgBuyCents,
    distanceToRequiredPgBuyPercent,
    progressPercent,
    excessProfitCents,
    isTargetReached,
    hasCurrentPrice,
    hasHoldings,
    totalGrams: summary.totalGrams,
  };
}

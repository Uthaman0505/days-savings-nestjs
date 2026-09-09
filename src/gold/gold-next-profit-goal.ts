/**
 * Phase 5C next-target proposal.
 * Uses Phase 5A evaluation for required portfolio value / required PG BUY.
 * Does not record sales or change holdings.
 */
import { evaluateGoldProfitGoal } from './gold-profit-goal';
import { roundHalfUpDiv } from './gold-math';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';

export const GOLD_NEXT_TARGET_RULES = [
  'SAME',
  'FIXED_RM_INCREASE',
  'PERCENT_INCREASE',
] as const;

export type GoldNextTargetRule = (typeof GOLD_NEXT_TARGET_RULES)[number];

export const MAX_NEXT_TARGET_PERCENT = 100;
const PERCENT_SCALE_DECIMALS = 4;
const MS_PER_DAY = 86_400_000;

export type GoldNextProfitGoalPreviewEvaluation = {
  previousGoalId: string;
  previousTargetCents: number;
  proposedTargetCents: number;
  rule: GoldNextTargetRule;
  fixedIncreaseCents: number | null;
  percentage: number | null;
  requiredPortfolioValueCents: number;
  requiredPgBuyPerGramCents: number | null;
  currentPgBuyPerGramCents: number | null;
  distanceToRequiredPgBuyCents: number | null;
  totalGrams: string;
  protectedCapitalCents: number;
};

function toPositiveScaledInt(value: number, scaleDecimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('INVALID_NUMBER');
  }
  const fixed = value.toFixed(scaleDecimals);
  const [whole, frac = ''] = fixed.split('.');
  return BigInt(`${whole}${frac.padEnd(scaleDecimals, '0')}`);
}

export function proposeNextTargetCents(input: {
  previousTargetCents: number;
  rule: GoldNextTargetRule;
  fixedIncreaseCents?: number | null;
  percentage?: number | null;
}): number {
  if (
    !Number.isInteger(input.previousTargetCents) ||
    input.previousTargetCents < 1
  ) {
    throw new Error('INVALID_PREVIOUS_TARGET');
  }

  switch (input.rule) {
    case 'SAME':
      return input.previousTargetCents;
    case 'FIXED_RM_INCREASE': {
      const increase = input.fixedIncreaseCents;
      if (!Number.isInteger(increase) || increase == null || increase < 1) {
        throw new Error('INVALID_FIXED_INCREASE');
      }
      const next = input.previousTargetCents + increase;
      if (!Number.isSafeInteger(next) || next < 1) {
        throw new Error('INVALID_NEXT_TARGET');
      }
      return next;
    }
    case 'PERCENT_INCREASE': {
      const percentage = input.percentage;
      if (
        percentage == null ||
        !Number.isFinite(percentage) ||
        percentage <= 0 ||
        percentage > MAX_NEXT_TARGET_PERCENT
      ) {
        throw new Error('INVALID_PERCENTAGE');
      }
      const scale = 10n ** BigInt(PERCENT_SCALE_DECIMALS);
      const hundredScaled = 100n * scale;
      const factor =
        hundredScaled + toPositiveScaledInt(percentage, PERCENT_SCALE_DECIMALS);
      const next = Number(
        roundHalfUpDiv(
          BigInt(input.previousTargetCents) * factor,
          hundredScaled,
        ),
      );
      if (!Number.isSafeInteger(next) || next < 1) {
        throw new Error('INVALID_NEXT_TARGET');
      }
      return next;
    }
    default:
      throw new Error('INVALID_NEXT_TARGET_RULE');
  }
}

export function goalHistoryDurationDays(
  createdAt: Date,
  achievedAt: Date | null,
  updatedAt: Date,
): number {
  const end = achievedAt ?? updatedAt;
  const ms = end.getTime() - createdAt.getTime();
  if (!Number.isFinite(ms)) {
    return 0;
  }
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

export function evaluateNextProfitGoalPreview(input: {
  previousGoalId: string;
  previousTargetCents: number;
  purchases: GoldPurchaseObservation[];
  latestPrice: { pgBuyPricePerGramCents: number } | null;
  rule: GoldNextTargetRule;
  fixedIncreaseCents?: number | null;
  percentage?: number | null;
}): GoldNextProfitGoalPreviewEvaluation {
  const proposedTargetCents = proposeNextTargetCents({
    previousTargetCents: input.previousTargetCents,
    rule: input.rule,
    fixedIncreaseCents: input.fixedIncreaseCents,
    percentage: input.percentage,
  });
  const now = new Date(0);
  const evaluation = evaluateGoldProfitGoal({
    goal: {
      id: input.previousGoalId,
      targetProfitCents: proposedTargetCents,
      status: 'ACTIVE',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      achievedAt: null,
    },
    purchases: input.purchases,
    latestPrice: input.latestPrice,
  });
  return {
    previousGoalId: input.previousGoalId,
    previousTargetCents: input.previousTargetCents,
    proposedTargetCents,
    rule: input.rule,
    fixedIncreaseCents:
      input.rule === 'FIXED_RM_INCREASE'
        ? (input.fixedIncreaseCents ?? null)
        : null,
    percentage:
      input.rule === 'PERCENT_INCREASE' ? (input.percentage ?? null) : null,
    requiredPortfolioValueCents: evaluation.requiredPortfolioValueCents,
    requiredPgBuyPerGramCents: evaluation.requiredPgBuyPerGramCents,
    currentPgBuyPerGramCents: evaluation.currentPgBuyPerGramCents,
    distanceToRequiredPgBuyCents: evaluation.distanceToRequiredPgBuyCents,
    totalGrams: evaluation.totalGrams,
    protectedCapitalCents: evaluation.protectedCapitalCents,
  };
}

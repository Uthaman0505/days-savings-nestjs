/**
 * Phase 6B — budget allocation ranking on top of Phase 6A buy scenarios.
 *
 * Does not re-simulate purchases. Does not change Phase 6A rule order.
 *
 * goal_efficiency_score units:
 *   Required PG BUY cents-per-gram reduced per MYR 1 deployed (signed integer).
 *   Example: MYR 20/g improvement on MYR 200 spend → 10.
 *
 * BUY 100% vs partial:
 *   Choose 100% only when its absolute required-PG-BUY reduction is more than
 *   10% better than the best improving partial (25/50/75). Otherwise keep reserve.
 */
import { ratioPercent, roundHalfUpDiv } from './gold-math';
import type {
  GoldBuyScenario,
  GoldGoalDecision,
  GoldGoalDecisionSignal,
  GoldTargetImpact,
} from './gold-goal-decision';

/** 100% is "materially better" only if absolute improvement exceeds this. */
export const FULL_BUDGET_MATERIAL_GAIN_PERCENT = 10;
/** Next-tier marginal improvement dropped by this much → diminishing returns. */
export const DIMINISHING_RETURNS_DROP_PERCENT = 30;
export const GOAL_EFFICIENCY_SCORE_UNITS =
  'Required PG BUY cents-per-gram reduced per MYR 1 deployed';

export type GoldBudgetAllocationScenario = GoldBuyScenario & {
  reserveCents: number;
  targetImprovementCentsPerGram: number | null;
  targetImprovementPercent: number | null;
  goalEfficiencyScore: number | null;
  spreadCostPercentOfDeployment: number | null;
  rank: number | null;
  rankingReason: string;
  marginalImprovementCentsPerGram: number | null;
};

export type GoldBudgetAllocationAnalysis = {
  monthlyBudgetCents: number | null;
  phase6aSignal: GoldGoalDecisionSignal;
  phase6aRuleCode: string;
  recommendedAllocationCents: number;
  recommendedDeploymentCents: number;
  recommendedReserveCents: number;
  recommendationReason: string;
  bestEfficiencyPercent: number | null;
  bestAbsolutePercent: number | null;
  hasDiminishingReturns: boolean;
  isRankingAvailable: boolean;
  unavailableReason: string | null;
  goalEfficiencyScoreUnits: string;
  cautionReasons: string[];
  scenarios: GoldBudgetAllocationScenario[];
};

function impactRank(impact: GoldTargetImpact): number {
  if (impact === 'IMPROVES_TARGET') {
    return 0;
  }
  if (impact === 'WORSENS_TARGET') {
    return 2;
  }
  return 1;
}

export function reserveCentsForDeployment(
  monthlyBudgetCents: number | null,
  deploymentCents: number,
): number {
  const budget = monthlyBudgetCents ?? 0;
  const reserved = budget - Math.max(0, deploymentCents);
  return reserved < 0 ? 0 : reserved;
}

export function targetImprovementFromRequiredChange(
  requiredPgBuyChangeCents: number | null,
): number | null {
  if (requiredPgBuyChangeCents == null) {
    return null;
  }
  const improvement = -requiredPgBuyChangeCents;
  return improvement === 0 ? 0 : improvement;
}

export function targetImprovementPercentFromRequiredChange(
  requiredPgBuyChangePercent: number | null,
): number | null {
  if (requiredPgBuyChangePercent == null) {
    return null;
  }
  return -requiredPgBuyChangePercent;
}

/**
 * Required PG BUY cents/g reduced per MYR 1 deployed.
 * Integer half-up: (improvement_cents_per_gram × 100) / deployment_cents.
 */
export function goalEfficiencyScore(
  targetImprovementCentsPerGram: number | null,
  deploymentCents: number,
): number | null {
  if (targetImprovementCentsPerGram == null || deploymentCents <= 0) {
    return null;
  }
  const signed = targetImprovementCentsPerGram < 0 ? -1 : 1;
  const abs = Math.abs(targetImprovementCentsPerGram);
  const score = Number(
    roundHalfUpDiv(BigInt(abs) * 100n, BigInt(deploymentCents)),
  );
  return signed * score;
}

export function spreadCostPercentOfDeployment(
  immediateSpreadCostCents: number | null,
  deploymentCents: number,
): number | null {
  if (immediateSpreadCostCents == null || deploymentCents <= 0) {
    return null;
  }
  return ratioPercent(immediateSpreadCostCents, deploymentCents);
}

function compareScenarios(
  a: GoldBudgetAllocationScenario,
  b: GoldBudgetAllocationScenario,
): number {
  const byImpact = impactRank(a.targetImpact) - impactRank(b.targetImpact);
  if (byImpact !== 0) {
    return byImpact;
  }
  const effA = a.goalEfficiencyScore ?? Number.NEGATIVE_INFINITY;
  const effB = b.goalEfficiencyScore ?? Number.NEGATIVE_INFINITY;
  if (effA !== effB) {
    return effB - effA;
  }
  const spreadA = a.spreadCostPercentOfDeployment ?? Number.POSITIVE_INFINITY;
  const spreadB = b.spreadCostPercentOfDeployment ?? Number.POSITIVE_INFINITY;
  if (spreadA !== spreadB) {
    return spreadA - spreadB;
  }
  return a.deploymentCents - b.deploymentCents;
}

function rankingReason(input: {
  scenario: GoldBudgetAllocationScenario;
  bestEfficiencyPercent: number | null;
  bestAbsolutePercent: number | null;
  rankingAvailable: boolean;
}): string {
  if (!input.rankingAvailable) {
    return 'Not ranked because goal, budget, price, or holdings are missing.';
  }
  if (input.scenario.targetImpact === 'WORSENS_TARGET') {
    return 'Worsens target';
  }
  if (
    input.bestEfficiencyPercent != null &&
    input.scenario.deploymentPercent === input.bestEfficiencyPercent
  ) {
    return 'Best target improvement per MYR';
  }
  if (
    input.bestAbsolutePercent != null &&
    input.scenario.deploymentPercent === input.bestAbsolutePercent
  ) {
    return 'Largest total target improvement';
  }
  if (
    input.scenario.spreadCostPercentOfDeployment != null &&
    input.scenario.spreadCostPercentOfDeployment >= 8
  ) {
    return 'High spread impact';
  }
  if (input.scenario.targetImpact === 'NEUTRAL') {
    return 'Little extra target improvement';
  }
  return 'Higher spend with limited extra improvement';
}

export function rankingUnavailableReason(
  decision: GoldGoalDecision,
): string | null {
  if (!decision.hasCurrentPrice) {
    return 'A current Public Gold price is not recorded.';
  }
  if (!decision.hasActiveGoal) {
    return 'There is no active profit goal.';
  }
  if (!decision.hasMonthlyBudget) {
    return 'A monthly Gold budget is not set.';
  }
  if (!decision.hasHoldings || decision.currentRequiredPgBuyCents == null) {
    return 'Holdings are needed to rank how a purchase would change the required PG BUY.';
  }
  return null;
}

function bestImprovingPartial(
  scenarios: GoldBudgetAllocationScenario[],
): GoldBudgetAllocationScenario | null {
  const partials = scenarios.filter(
    (row) =>
      row.deploymentPercent < 100 &&
      row.deploymentCents > 0 &&
      row.targetImpact === 'IMPROVES_TARGET',
  );
  if (partials.length === 0) {
    return null;
  }
  return [...partials].sort(compareScenarios)[0];
}

function bestAbsoluteAmong(
  scenarios: GoldBudgetAllocationScenario[],
): GoldBudgetAllocationScenario | null {
  const usable = scenarios.filter(
    (row) => row.targetImprovementCentsPerGram != null,
  );
  if (usable.length === 0) {
    return null;
  }
  return [...usable].sort((a, b) => {
    const left = a.targetImprovementCentsPerGram ?? Number.NEGATIVE_INFINITY;
    const right = b.targetImprovementCentsPerGram ?? Number.NEGATIVE_INFINITY;
    if (right !== left) {
      return right - left;
    }
    return a.deploymentCents - b.deploymentCents;
  })[0];
}

export function isFullBudgetMateriallyBetter(
  fullImprovementCents: number,
  partialImprovementCents: number,
): boolean {
  if (partialImprovementCents <= 0) {
    return fullImprovementCents > 0;
  }
  return (
    fullImprovementCents * 100 >
    partialImprovementCents * (100 + FULL_BUDGET_MATERIAL_GAIN_PERCENT)
  );
}

function recommendAllocation(input: {
  decision: GoldGoalDecision;
  scenarios: GoldBudgetAllocationScenario[];
}): { cents: number; reason: string } {
  const budget = input.decision.monthlyBudgetCents;
  const signal = input.decision.signal;
  const none = (reason: string) => ({ cents: 0, reason });

  if (!input.decision.hasCurrentPrice) {
    return none(
      'No allocation is suggested because a current Public Gold price is not recorded.',
    );
  }
  if (!input.decision.hasActiveGoal) {
    return none(
      'No allocation is suggested because there is no active profit goal.',
    );
  }
  if (!input.decision.hasMonthlyBudget || budget == null) {
    return none(
      'No allocation is suggested because a monthly Gold budget is not set.',
    );
  }
  if (signal === 'GOAL_REACHED') {
    return none(
      'No additional Gold allocation is suggested because the current protected-profit target is already reached.',
    );
  }
  if (signal === 'WAIT') {
    const history =
      input.decision.ruleCode === 'INSUFFICIENT_PRICE_HISTORY'
        ? 'Scenarios are shown for comparison, but no allocation is suggested while price history is insufficient.'
        : 'No allocation is suggested while wait conditions apply. Scenarios remain available for comparison.';
    return none(history);
  }

  const clamp = (cents: number) => (cents > budget ? budget : cents);

  if (signal === 'HOLD') {
    if (input.decision.ruleCode !== 'HOLD_NO_COMPELLING_BUY') {
      return none(
        'No allocation is suggested while the current Gold position is being held.',
      );
    }
    const improvingPartial = bestImprovingPartial(input.scenarios);
    if (!improvingPartial) {
      return none(
        'No allocation is suggested. Current conditions are neutral and no partial purchase clearly improves the target.',
      );
    }
    return {
      cents: clamp(improvingPartial.deploymentCents),
      reason:
        'A partial purchase currently improves the required PG BUY, so part of the monthly Gold budget can be considered while keeping the rest unused.',
    };
  }

  if (signal === 'BUY_PARTIAL') {
    const partials = input.scenarios.filter(
      (row) => row.deploymentPercent < 100 && row.deploymentCents > 0,
    );
    const pick =
      bestImprovingPartial(input.scenarios) ??
      [...partials].sort(compareScenarios)[0] ??
      null;
    if (!pick) {
      return none(
        'No partial allocation could be selected from the 25%, 50%, and 75% scenarios.',
      );
    }
    return {
      cents: clamp(pick.deploymentCents),
      reason: `The ${pick.deploymentPercent}% scenario currently gives the strongest target improvement per MYR without using the full monthly budget.`,
    };
  }

  if (signal === 'BUY') {
    const full =
      input.scenarios.find((row) => row.deploymentPercent === 100) ?? null;
    const improvingPartials = input.scenarios.filter(
      (row) =>
        row.deploymentPercent < 100 &&
        row.deploymentCents > 0 &&
        row.targetImpact === 'IMPROVES_TARGET',
    );
    const bestAbsolutePartial = bestAbsoluteAmong(improvingPartials);
    const bestEfficiencyPartial = bestImprovingPartial(input.scenarios);
    const fullImprovement = full?.targetImprovementCentsPerGram ?? 0;
    const partialAbsoluteImprovement =
      bestAbsolutePartial?.targetImprovementCentsPerGram ?? 0;
    if (
      full &&
      full.targetImpact === 'IMPROVES_TARGET' &&
      bestAbsolutePartial &&
      isFullBudgetMateriallyBetter(fullImprovement, partialAbsoluteImprovement)
    ) {
      return {
        cents: clamp(full.deploymentCents),
        reason:
          'Using the full monthly Gold budget currently improves the required PG BUY enough more than a partial purchase to consider the extra spend.',
      };
    }
    if (bestEfficiencyPartial) {
      return {
        cents: clamp(bestEfficiencyPartial.deploymentCents),
        reason:
          'Based on the current goal math, using part of the monthly Gold budget gives a better balance between target improvement and immediate spread impact.',
      };
    }
    if (full && full.targetImpact === 'IMPROVES_TARGET') {
      return {
        cents: clamp(full.deploymentCents),
        reason:
          'The full monthly Gold budget is the only analyzed scenario that currently lowers the required PG BUY.',
      };
    }
    return none(
      'No allocation is suggested because none of the analyzed amounts currently improve the target.',
    );
  }

  return none('No allocation is suggested under the current decision.');
}

export function analyzeGoldBudgetAllocation(
  decision: GoldGoalDecision,
): GoldBudgetAllocationAnalysis {
  const unavailableReason = rankingUnavailableReason(decision);
  const rankingAvailable = unavailableReason == null;
  const budget = decision.monthlyBudgetCents;

  const withMetrics: GoldBudgetAllocationScenario[] = decision.scenarios.map(
    (row, index, rows) => {
      const improvement = targetImprovementFromRequiredChange(
        row.requiredPgBuyChangeCents,
      );
      const previous = index === 0 ? null : rows[index - 1];
      const previousImprovement = previous
        ? targetImprovementFromRequiredChange(previous.requiredPgBuyChangeCents)
        : null;
      let marginal: number | null = null;
      if (index > 0 && improvement != null && previousImprovement != null) {
        marginal = improvement - previousImprovement;
      }
      return {
        ...row,
        reserveCents: reserveCentsForDeployment(budget, row.deploymentCents),
        targetImprovementCentsPerGram: improvement,
        targetImprovementPercent: targetImprovementPercentFromRequiredChange(
          row.requiredPgBuyChangePercent,
        ),
        goalEfficiencyScore: goalEfficiencyScore(
          improvement,
          row.deploymentCents,
        ),
        spreadCostPercentOfDeployment: spreadCostPercentOfDeployment(
          row.immediateSpreadCostCents,
          row.deploymentCents,
        ),
        rank: null,
        rankingReason: '',
        marginalImprovementCentsPerGram: marginal,
      };
    },
  );

  let bestEfficiency: GoldBudgetAllocationScenario | null = null;
  let bestAbsolute: GoldBudgetAllocationScenario | null = null;
  if (rankingAvailable && withMetrics.some((row) => row.deploymentCents > 0)) {
    bestEfficiency = [...withMetrics].sort(compareScenarios)[0] ?? null;
    bestAbsolute = bestAbsoluteAmong(withMetrics);
    const ordered = [...withMetrics].sort(compareScenarios);
    ordered.forEach((row, index) => {
      row.rank = index + 1;
    });
  }

  for (const row of withMetrics) {
    row.rankingReason = rankingReason({
      scenario: row,
      bestEfficiencyPercent: bestEfficiency?.deploymentPercent ?? null,
      bestAbsolutePercent: bestAbsolute?.deploymentPercent ?? null,
      rankingAvailable,
    });
  }

  const hasDiminishingReturns = withMetrics.some((row, index, rows) => {
    if (index < 2) {
      return false;
    }
    const prev = rows[index - 1].marginalImprovementCentsPerGram;
    const curr = row.marginalImprovementCentsPerGram;
    if (prev == null || curr == null) {
      return false;
    }
    if (prev <= 0) {
      return curr < prev;
    }
    return curr * 100 <= prev * (100 - DIMINISHING_RETURNS_DROP_PERCENT);
  });

  const recommendation = recommendAllocation({
    decision,
    scenarios: withMetrics,
  });
  const recommendedAllocationCents = recommendation.cents;
  const recommendedReserveCents = reserveCentsForDeployment(
    budget,
    recommendedAllocationCents,
  );

  const caution = [...decision.cautionReasons];
  if (hasDiminishingReturns) {
    caution.push(
      'Spending more of the monthly Gold budget currently adds less extra target improvement at the higher tiers.',
    );
  }
  if (
    bestEfficiency &&
    bestAbsolute &&
    bestEfficiency.deploymentPercent !== bestAbsolute.deploymentPercent
  ) {
    caution.push(
      `Using the full compared amount can improve the target more in total, but the ${bestEfficiency.deploymentPercent}% option provides more target improvement for each MYR deployed.`,
    );
  }

  return {
    monthlyBudgetCents: budget,
    phase6aSignal: decision.signal,
    phase6aRuleCode: decision.ruleCode,
    recommendedAllocationCents,
    recommendedDeploymentCents: recommendedAllocationCents,
    recommendedReserveCents,
    recommendationReason: recommendation.reason,
    bestEfficiencyPercent: bestEfficiency?.deploymentPercent ?? null,
    bestAbsolutePercent: bestAbsolute?.deploymentPercent ?? null,
    hasDiminishingReturns,
    isRankingAvailable: rankingAvailable,
    unavailableReason,
    goalEfficiencyScoreUnits: GOAL_EFFICIENCY_SCORE_UNITS,
    cautionReasons: caution,
    scenarios: withMetrics,
  };
}

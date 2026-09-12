import type { GoldPriceDataQuality } from './gold-price-analytics';
import type {
  GoldBuyScenario,
  GoldGoalDecision,
  GoldGoalDecisionSignal,
} from './gold-goal-decision';
import {
  analyzeGoldBudgetAllocation,
  FULL_BUDGET_MATERIAL_GAIN_PERCENT,
  GOAL_EFFICIENCY_SCORE_UNITS,
  goalEfficiencyScore,
  isFullBudgetMateriallyBetter,
  reserveCentsForDeployment,
  spreadCostPercentOfDeployment,
  targetImprovementFromRequiredChange,
  targetImprovementPercentFromRequiredChange,
} from './gold-budget-allocation';

const QUALITY: GoldPriceDataQuality = {
  sampleCount: 12,
  firstSampleAt: null,
  latestSampleAt: null,
  daysWithData: 12,
  requestedRange: 'D30',
  fromDate: null,
  toDate: null,
  hasSufficientHistory: true,
};

function scenario(
  partial: Partial<GoldBuyScenario> & {
    deploymentPercent: number;
    deploymentCents: number;
  },
): GoldBuyScenario {
  return {
    acquisitionPgSellCents: 67000,
    estimatedNewGrams: '0.1000',
    postBuyTotalGrams: '2.1000',
    postBuyProtectedCapitalCents: 110000,
    postBuyRequiredPortfolioValueCents: 150000,
    postBuyRequiredPgBuyCents: 70000,
    requiredPgBuyChangeCents: 0,
    requiredPgBuyChangePercent: 0,
    targetImpact: 'NEUTRAL',
    immediateSpreadCostCents: 300,
    ...partial,
  };
}

function decision(overrides: Partial<GoldGoalDecision> = {}): GoldGoalDecision {
  return {
    signal: 'BUY',
    ruleCode: 'BUY_TARGET_IMPROVEMENT',
    headline:
      'Current conditions support considering your planned Gold budget.',
    primaryReason: 'A purchase lowers the required PG BUY.',
    supportingReasons: [],
    cautionReasons: [],
    monthlyBudgetCents: 40000,
    recommendedDeploymentCents: 40000,
    currentPgBuyCents: 65000,
    currentPgSellCents: 67000,
    spreadCents: 2000,
    spreadPercent: 2.99,
    targetProfitCents: 40000,
    protectedCapitalCents: 100000,
    currentRequiredPgBuyCents: 70000,
    progressPercent: 20,
    trend: 'FALLING',
    spreadQuality: 'NORMAL',
    recentPricePositionPercent: 40,
    dataQuality: QUALITY,
    hasActiveGoal: true,
    hasHoldings: true,
    hasCurrentPrice: true,
    hasMonthlyBudget: true,
    scenarios: [],
    ...overrides,
  };
}

/** Fixture A: 50% best per MYR; 100% only slightly better absolutely. */
function fixtureAScenarios(): GoldBuyScenario[] {
  return [
    scenario({
      deploymentPercent: 25,
      deploymentCents: 10000,
      requiredPgBuyChangeCents: -800,
      requiredPgBuyChangePercent: -1.14,
      postBuyRequiredPgBuyCents: 69200,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 300,
    }),
    scenario({
      deploymentPercent: 50,
      deploymentCents: 20000,
      requiredPgBuyChangeCents: -1800,
      requiredPgBuyChangePercent: -2.57,
      postBuyRequiredPgBuyCents: 68200,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 600,
    }),
    scenario({
      deploymentPercent: 75,
      deploymentCents: 30000,
      requiredPgBuyChangeCents: -2400,
      requiredPgBuyChangePercent: -3.43,
      postBuyRequiredPgBuyCents: 67600,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 900,
    }),
    scenario({
      deploymentPercent: 100,
      deploymentCents: 40000,
      requiredPgBuyChangeCents: -2600,
      requiredPgBuyChangePercent: -3.71,
      postBuyRequiredPgBuyCents: 67400,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 1200,
    }),
  ];
}

/** Fixture B: 100% is more than 10% better absolutely than the best partial. */
function fixtureBScenarios(): GoldBuyScenario[] {
  return [
    scenario({
      deploymentPercent: 25,
      deploymentCents: 10000,
      requiredPgBuyChangeCents: -800,
      requiredPgBuyChangePercent: -1.14,
      postBuyRequiredPgBuyCents: 69200,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 300,
    }),
    scenario({
      deploymentPercent: 50,
      deploymentCents: 20000,
      requiredPgBuyChangeCents: -1800,
      requiredPgBuyChangePercent: -2.57,
      postBuyRequiredPgBuyCents: 68200,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 600,
    }),
    scenario({
      deploymentPercent: 75,
      deploymentCents: 30000,
      requiredPgBuyChangeCents: -2000,
      requiredPgBuyChangePercent: -2.86,
      postBuyRequiredPgBuyCents: 68000,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 900,
    }),
    scenario({
      deploymentPercent: 100,
      deploymentCents: 40000,
      requiredPgBuyChangeCents: -2800,
      requiredPgBuyChangePercent: -4.0,
      postBuyRequiredPgBuyCents: 67200,
      targetImpact: 'IMPROVES_TARGET',
      immediateSpreadCostCents: 1200,
    }),
  ];
}

describe('gold-budget-allocation formulas', () => {
  it('calculates unallocated Gold budget as reserve', () => {
    expect(reserveCentsForDeployment(40000, 20000)).toBe(20000);
    expect(reserveCentsForDeployment(40000, 40000)).toBe(0);
    expect(reserveCentsForDeployment(40000, 0)).toBe(40000);
    expect(reserveCentsForDeployment(null, 10000)).toBe(0);
  });

  it('treats target improvement as the negated required PG BUY change', () => {
    expect(targetImprovementFromRequiredChange(-2000)).toBe(2000);
    expect(targetImprovementFromRequiredChange(500)).toBe(-500);
    expect(targetImprovementFromRequiredChange(0)).toBe(0);
    expect(targetImprovementFromRequiredChange(null)).toBeNull();
  });

  it('uses the same percent basis as Phase 6A, signed so positive improves the goal', () => {
    expect(targetImprovementPercentFromRequiredChange(-2.57)).toBe(2.57);
    expect(targetImprovementPercentFromRequiredChange(1.1)).toBe(-1.1);
    expect(targetImprovementPercentFromRequiredChange(null)).toBeNull();
  });

  it('scores goal efficiency as required PG BUY cents/g reduced per MYR 1 deployed', () => {
    expect(goalEfficiencyScore(2000, 20000)).toBe(10);
    expect(goalEfficiencyScore(800, 10000)).toBe(8);
    expect(goalEfficiencyScore(-500, 10000)).toBe(-5);
    expect(goalEfficiencyScore(null, 10000)).toBeNull();
    expect(goalEfficiencyScore(100, 0)).toBeNull();
  });

  it('measures immediate spread impact as a percent of deployment', () => {
    expect(spreadCostPercentOfDeployment(600, 20000)).toBe(3);
    expect(spreadCostPercentOfDeployment(null, 20000)).toBeNull();
  });

  it('requires more than 10% extra absolute improvement to prefer 100%', () => {
    expect(FULL_BUDGET_MATERIAL_GAIN_PERCENT).toBe(10);
    expect(isFullBudgetMateriallyBetter(2600, 2400)).toBe(false);
    expect(isFullBudgetMateriallyBetter(2800, 2000)).toBe(true);
    expect(isFullBudgetMateriallyBetter(100, 0)).toBe(true);
  });
});

describe('analyzeGoldBudgetAllocation', () => {
  it('extends Phase 6A scenarios with reserve, improvement, efficiency, and rank', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.scenarios).toHaveLength(4);
    expect(analysis.goalEfficiencyScoreUnits).toBe(GOAL_EFFICIENCY_SCORE_UNITS);
    const fifty = analysis.scenarios.find(
      (row) => row.deploymentPercent === 50,
    );
    expect(fifty?.reserveCents).toBe(20000);
    expect(fifty?.targetImprovementCentsPerGram).toBe(1800);
    expect(fifty?.targetImprovementPercent).toBe(2.57);
    expect(fifty?.goalEfficiencyScore).toBe(9);
    expect(fifty?.spreadCostPercentOfDeployment).toBe(3);
    expect(fifty?.rank).toBe(1);
    expect(fifty?.rankingReason).toBe('Best target improvement per MYR');
    const full = analysis.scenarios.find(
      (row) => row.deploymentPercent === 100,
    );
    expect(full?.rankingReason).toBe('Largest total target improvement');
    expect(full?.rank).toBe(4);
  });

  it('ranks IMPROVES_TARGET before NEUTRAL and WORSENS_TARGET', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        scenarios: [
          scenario({
            deploymentPercent: 25,
            deploymentCents: 10000,
            requiredPgBuyChangeCents: 400,
            requiredPgBuyChangePercent: 0.57,
            targetImpact: 'WORSENS_TARGET',
          }),
          scenario({
            deploymentPercent: 50,
            deploymentCents: 20000,
            requiredPgBuyChangeCents: 0,
            requiredPgBuyChangePercent: 0,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 75,
            deploymentCents: 30000,
            requiredPgBuyChangeCents: -100,
            requiredPgBuyChangePercent: -0.14,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 100,
            deploymentCents: 40000,
            requiredPgBuyChangeCents: -800,
            requiredPgBuyChangePercent: -1.14,
            targetImpact: 'IMPROVES_TARGET',
          }),
        ],
      }),
    );
    const byRank = [...analysis.scenarios].sort(
      (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
    );
    expect(byRank.map((row) => row.deploymentPercent)).toEqual([
      100, 75, 50, 25,
    ]);
    expect(byRank[3].rankingReason).toBe('Worsens target');
  });

  it('breaks remaining ties with lower spread impact, then lower deployment', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        scenarios: [
          scenario({
            deploymentPercent: 25,
            deploymentCents: 10000,
            requiredPgBuyChangeCents: -800,
            requiredPgBuyChangePercent: -1.14,
            targetImpact: 'IMPROVES_TARGET',
            immediateSpreadCostCents: 800,
          }),
          scenario({
            deploymentPercent: 50,
            deploymentCents: 20000,
            requiredPgBuyChangeCents: -1600,
            requiredPgBuyChangePercent: -2.29,
            targetImpact: 'IMPROVES_TARGET',
            immediateSpreadCostCents: 400,
          }),
          scenario({
            deploymentPercent: 75,
            deploymentCents: 30000,
            requiredPgBuyChangeCents: -2400,
            requiredPgBuyChangePercent: -3.43,
            targetImpact: 'IMPROVES_TARGET',
            immediateSpreadCostCents: 600,
          }),
          scenario({
            deploymentPercent: 100,
            deploymentCents: 40000,
            requiredPgBuyChangeCents: -3200,
            requiredPgBuyChangePercent: -4.57,
            targetImpact: 'IMPROVES_TARGET',
            immediateSpreadCostCents: 800,
          }),
        ],
      }),
    );
    expect(analysis.scenarios.map((row) => row.goalEfficiencyScore)).toEqual([
      8, 8, 8, 8,
    ]);
    const byRank = [...analysis.scenarios].sort(
      (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
    );
    expect(byRank.map((row) => row.deploymentPercent)).toEqual([
      50, 75, 100, 25,
    ]);
  });

  it('returns the same ranks for the same input', () => {
    const input = decision({ scenarios: fixtureAScenarios() });
    const first = analyzeGoldBudgetAllocation(input);
    const second = analyzeGoldBudgetAllocation(input);
    expect(first.scenarios.map((row) => row.rank)).toEqual(
      second.scenarios.map((row) => row.rank),
    );
    expect(first.bestEfficiencyPercent).toBe(second.bestEfficiencyPercent);
    expect(first.recommendedAllocationCents).toBe(
      second.recommendedAllocationCents,
    );
  });

  it('selects best-efficiency and best-absolute scenarios independently', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({ scenarios: fixtureAScenarios() }),
    );
    expect(analysis.bestEfficiencyPercent).toBe(50);
    expect(analysis.bestAbsolutePercent).toBe(100);
  });

  it('computes extra improvement from spending more, with a null first tier', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({ scenarios: fixtureAScenarios() }),
    );
    expect(analysis.scenarios[0].marginalImprovementCentsPerGram).toBeNull();
    expect(analysis.scenarios[1].marginalImprovementCentsPerGram).toBe(1000);
    expect(analysis.scenarios[2].marginalImprovementCentsPerGram).toBe(600);
    expect(analysis.scenarios[3].marginalImprovementCentsPerGram).toBe(200);
  });

  it('flags diminishing returns when the next tier drops by at least 30%', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({ scenarios: fixtureAScenarios() }),
    );
    expect(analysis.hasDiminishingReturns).toBe(true);
    expect(
      analysis.cautionReasons.some((reason) =>
        reason.includes('less extra target improvement'),
      ),
    ).toBe(true);
  });

  it('does not flag diminishing returns when the drop is under 30%', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        scenarios: [
          scenario({
            deploymentPercent: 25,
            deploymentCents: 10000,
            requiredPgBuyChangeCents: -1000,
            requiredPgBuyChangePercent: -1.43,
            targetImpact: 'IMPROVES_TARGET',
          }),
          scenario({
            deploymentPercent: 50,
            deploymentCents: 20000,
            requiredPgBuyChangeCents: -2000,
            requiredPgBuyChangePercent: -2.86,
            targetImpact: 'IMPROVES_TARGET',
          }),
          scenario({
            deploymentPercent: 75,
            deploymentCents: 30000,
            requiredPgBuyChangeCents: -2710,
            requiredPgBuyChangePercent: -3.87,
            targetImpact: 'IMPROVES_TARGET',
          }),
          scenario({
            deploymentPercent: 100,
            deploymentCents: 40000,
            requiredPgBuyChangeCents: -3420,
            requiredPgBuyChangePercent: -4.89,
            targetImpact: 'IMPROVES_TARGET',
          }),
        ],
      }),
    );
    expect(analysis.scenarios[1].marginalImprovementCentsPerGram).toBe(1000);
    expect(analysis.scenarios[2].marginalImprovementCentsPerGram).toBe(710);
    expect(analysis.hasDiminishingReturns).toBe(false);
  });

  it('Fixture A: BUY prefers 50% when 100% adds less than 10% extra absolute benefit', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'BUY',
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.recommendedAllocationCents).toBe(20000);
    expect(analysis.recommendedDeploymentCents).toBe(20000);
    expect(analysis.recommendedReserveCents).toBe(20000);
    expect(analysis.recommendedAllocationCents).toBeLessThan(40000);
    expect(analysis.recommendationReason).toContain(
      'using part of the monthly Gold budget',
    );
  });

  it('Fixture B: BUY can choose 100% when it is materially better absolutely', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'BUY',
        scenarios: fixtureBScenarios(),
      }),
    );
    expect(analysis.bestEfficiencyPercent).toBe(50);
    expect(analysis.bestAbsolutePercent).toBe(100);
    expect(analysis.recommendedAllocationCents).toBe(40000);
    expect(analysis.recommendedReserveCents).toBe(0);
  });

  it('never recommends more than the monthly Gold budget', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        monthlyBudgetCents: 40000,
        signal: 'BUY',
        scenarios: fixtureBScenarios(),
      }),
    );
    expect(analysis.recommendedAllocationCents).toBeLessThanOrEqual(40000);
    for (const row of analysis.scenarios) {
      expect(row.deploymentCents).toBeLessThanOrEqual(40000);
      expect(row.reserveCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('BUY_PARTIAL never recommends 100%', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'BUY_PARTIAL',
        ruleCode: 'BUY_PARTIAL_TARGET_IMPROVEMENT',
        scenarios: fixtureBScenarios(),
      }),
    );
    expect(analysis.recommendedAllocationCents).toBe(20000);
    expect(analysis.recommendedAllocationCents).not.toBe(40000);
    expect(analysis.recommendedReserveCents).toBe(20000);
  });

  it('Fixture C: WAIT recommends 0 while keeping scenarios viewable', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'WAIT',
        ruleCode: 'INSUFFICIENT_PRICE_HISTORY',
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.recommendedAllocationCents).toBe(0);
    expect(analysis.recommendedReserveCents).toBe(40000);
    expect(analysis.scenarios).toHaveLength(4);
    expect(analysis.isRankingAvailable).toBe(true);
    expect(analysis.recommendationReason).toContain(
      'price history is insufficient',
    );
  });

  it('WAIT for other wait rules also recommends 0', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'WAIT',
        ruleCode: 'WAIT_WIDE_SPREAD_HIGH_PRICE',
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.recommendedAllocationCents).toBe(0);
    expect(analysis.recommendationReason).toContain('wait conditions apply');
  });

  it('Fixture D: GOAL_REACHED recommends 0', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'GOAL_REACHED',
        ruleCode: 'GOAL_REACHED',
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.recommendedAllocationCents).toBe(0);
    expect(analysis.recommendedReserveCents).toBe(40000);
    expect(analysis.recommendationReason).toContain('already reached');
  });

  it('HOLD stays at 0 unless HOLD_NO_COMPELLING_BUY has an improving partial', () => {
    const conservative = analyzeGoldBudgetAllocation(
      decision({
        signal: 'HOLD',
        ruleCode: 'MISSING_BUDGET',
        hasMonthlyBudget: false,
        monthlyBudgetCents: null,
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(conservative.recommendedAllocationCents).toBe(0);

    const improvingHold = analyzeGoldBudgetAllocation(
      decision({
        signal: 'HOLD',
        ruleCode: 'HOLD_NO_COMPELLING_BUY',
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(improvingHold.recommendedAllocationCents).toBe(20000);
    expect(improvingHold.recommendedAllocationCents).not.toBe(40000);

    const neutralHold = analyzeGoldBudgetAllocation(
      decision({
        signal: 'HOLD',
        ruleCode: 'HOLD_NO_COMPELLING_BUY',
        scenarios: [
          scenario({
            deploymentPercent: 25,
            deploymentCents: 10000,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 50,
            deploymentCents: 20000,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 75,
            deploymentCents: 30000,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 100,
            deploymentCents: 40000,
            targetImpact: 'NEUTRAL',
          }),
        ],
      }),
    );
    expect(neutralHold.recommendedAllocationCents).toBe(0);
  });

  it('does not invent ranking when the goal is missing', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'WAIT',
        ruleCode: 'NO_ACTIVE_GOAL',
        hasActiveGoal: false,
        currentRequiredPgBuyCents: 70000,
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.isRankingAvailable).toBe(false);
    expect(analysis.unavailableReason).toContain('no active profit goal');
    expect(analysis.scenarios.every((row) => row.rank == null)).toBe(true);
    expect(analysis.bestEfficiencyPercent).toBeNull();
    expect(analysis.recommendedAllocationCents).toBe(0);
  });

  it('does not invent ranking when the current price is missing', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'HOLD',
        ruleCode: 'MISSING_CURRENT_PRICE',
        hasCurrentPrice: false,
        currentPgBuyCents: null,
        currentPgSellCents: null,
        scenarios: fixtureAScenarios(),
      }),
    );
    expect(analysis.isRankingAvailable).toBe(false);
    expect(analysis.unavailableReason).toContain('price is not recorded');
    expect(analysis.recommendedAllocationCents).toBe(0);
    expect(analysis.scenarios.every((row) => row.rank == null)).toBe(true);
  });

  it('does not invent ranking when the monthly budget is missing', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'HOLD',
        ruleCode: 'MISSING_BUDGET',
        hasMonthlyBudget: false,
        monthlyBudgetCents: null,
        scenarios: [
          scenario({
            deploymentPercent: 25,
            deploymentCents: 0,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 50,
            deploymentCents: 0,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 75,
            deploymentCents: 0,
            targetImpact: 'NEUTRAL',
          }),
          scenario({
            deploymentPercent: 100,
            deploymentCents: 0,
            targetImpact: 'NEUTRAL',
          }),
        ],
      }),
    );
    expect(analysis.isRankingAvailable).toBe(false);
    expect(analysis.unavailableReason).toContain(
      'monthly Gold budget is not set',
    );
    expect(analysis.recommendedAllocationCents).toBe(0);
    expect(analysis.scenarios.every((row) => row.rank == null)).toBe(true);
  });

  it('does not invent ranking when holdings are missing', () => {
    const analysis = analyzeGoldBudgetAllocation(
      decision({
        signal: 'BUY_PARTIAL',
        ruleCode: 'BUY_PARTIAL_INITIAL_POSITION',
        hasHoldings: false,
        currentRequiredPgBuyCents: null,
        scenarios: fixtureAScenarios().map((row) => ({
          ...row,
          requiredPgBuyChangeCents: null,
          requiredPgBuyChangePercent: null,
          postBuyRequiredPgBuyCents: null,
          targetImpact: 'NEUTRAL' as const,
        })),
      }),
    );
    expect(analysis.isRankingAvailable).toBe(false);
    expect(analysis.recommendedAllocationCents).toBe(10000);
    expect(analysis.recommendedAllocationCents).not.toBe(40000);
    expect(analysis.scenarios.every((row) => row.rank == null)).toBe(true);
  });

  it('recommended allocation is always 0, 25%, 50%, 75%, or 100% of budget', () => {
    const signals: GoldGoalDecisionSignal[] = [
      'BUY',
      'BUY_PARTIAL',
      'WAIT',
      'HOLD',
      'GOAL_REACHED',
    ];
    for (const signal of signals) {
      const analysis = analyzeGoldBudgetAllocation(
        decision({
          signal,
          ruleCode: signal,
          scenarios: fixtureAScenarios(),
        }),
      );
      const allowed = new Set([0, 10000, 20000, 30000, 40000]);
      expect(allowed.has(analysis.recommendedAllocationCents)).toBe(true);
    }
  });
});

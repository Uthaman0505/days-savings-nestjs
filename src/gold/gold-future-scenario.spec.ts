import { computeGoldGoalDecision } from './gold-goal-decision';
import { floorGramsFromCentsAtUnitPrice } from './gold-math';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';
import type { GoldPriceObservation } from './gold-price-analytics';
import type { GoldProfitGoalRecord } from './gold-profit-goal';
import {
  computeGoldFutureScenario,
  computeGoldFutureScenarioComparison,
  MAX_FUTURE_SCENARIO_PRICES,
  normalizeFuturePrices,
  suggestedFuturePgBuyPrices,
} from './gold-future-scenario';

const NOW = new Date('2026-09-05T02:00:00.000Z');
const TODAY = '2026-09-05';

function goal(
  partial: Partial<GoldProfitGoalRecord> = {},
): GoldProfitGoalRecord {
  return {
    id: 'goal-1',
    targetProfitCents: 40000,
    status: 'ACTIVE',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    achievedAt: null,
    ...partial,
  };
}

function purchase(
  partial: Partial<GoldPurchaseObservation> & { id: string },
): GoldPurchaseObservation {
  return {
    purchaseDate: '2026-08-30',
    weightGrams: '2.0000',
    amountPaidCents: 100000,
    pricePerGramCents: 50000,
    source: 'MANUAL',
    referenceNumber: null,
    createdAt: NOW,
    isActive: true,
    ...partial,
  };
}

const FIXTURE_PURCHASES = [
  purchase({ id: 'lot', amountPaidCents: 100000, weightGrams: '2.0000' }),
];

function latest(buy: number, sell: number) {
  return {
    pgBuyPricePerGramCents: buy,
    pgSellPricePerGramCents: sell,
    priceDate: TODAY,
  };
}

function priceObs(buy: number, sell: number): GoldPriceObservation {
  return {
    id: 'p1',
    priceDate: TODAY,
    capturedPriceAt: NOW,
    createdAt: NOW,
    pgBuyPricePerGramCents: buy,
    pgSellPricePerGramCents: sell,
    source: 'SCREENSHOT',
  };
}

function decision(input: {
  purchases?: GoldPurchaseObservation[];
  goal?: GoldProfitGoalRecord | null;
  budget?: number | null;
  buy?: number;
  sell?: number;
}) {
  const buy = input.buy ?? 65000;
  const sell = input.sell ?? 67000;
  return computeGoldGoalDecision({
    monthlyBudgetCents: input.budget === undefined ? 40000 : input.budget,
    goal: input.goal === undefined ? goal() : input.goal,
    purchases: input.purchases ?? FIXTURE_PURCHASES,
    prices: [priceObs(buy, sell)],
    latestPrice: latest(buy, sell),
    todayPriceDate: TODAY,
    now: NOW,
  });
}

function scenario(input: {
  future: number;
  planned?: number | null;
  requested?: number | null;
  purchases?: GoldPurchaseObservation[];
  goal?: GoldProfitGoalRecord | null;
  budget?: number | null;
  buy?: number;
  sell?: number;
}) {
  const purchases = input.purchases ?? FIXTURE_PURCHASES;
  const activeGoal = input.goal === undefined ? goal() : input.goal;
  return computeGoldFutureScenario({
    futurePgBuyPerGramCents: input.future,
    plannedDeploymentPercent: input.planned ?? null,
    requestedProfitCents: input.requested ?? null,
    goal: activeGoal,
    purchases,
    decision: decision({
      purchases,
      goal: activeGoal,
      budget: input.budget,
      buy: input.buy,
      sell: input.sell,
    }),
  });
}

describe('gold-future-scenario', () => {
  it('computes base future value at hypothetical PG BUY only', () => {
    const result = scenario({ future: 70000, buy: 65000, sell: 90000 });
    expect(result.futurePortfolioValueCents).toBe(140000);
    expect(result.totalGrams).toBe('2.0000');
    expect(result.protectedCapitalCents).toBe(100000);
  });

  it('computes future available protected profit', () => {
    const result = scenario({ future: 70000 });
    expect(result.futureAvailableProfitCents).toBe(40000);
  });

  it('computes remaining profit to target', () => {
    const below = scenario({ future: 60000 });
    expect(below.futureRemainingProfitCents).toBe(20000);
    const reached = scenario({ future: 70000 });
    expect(reached.futureRemainingProfitCents).toBe(0);
  });

  it('computes clamped progress percent', () => {
    const half = scenario({ future: 60000 });
    expect(half.progressPercent).toBe(50);
    const over = scenario({ future: 80000 });
    expect(over.progressPercent).toBe(100);
  });

  it('marks the target reached at and above the required PG BUY', () => {
    const exact = scenario({ future: 70000 });
    expect(exact.isTargetReached).toBe(true);
    expect(exact.scenarioStatus).toBe('TARGET_REACHED');
    expect(exact.targetPriceRelationship).toBe('AT_TARGET');
    const above = scenario({ future: 80000 });
    expect(above.isTargetReached).toBe(true);
    expect(above.scenarioStatus).toBe('ABOVE_TARGET');
    expect(above.targetPriceRelationship).toBe('ABOVE_TARGET');
    expect(above.futureExcessProfitCents).toBe(20000);
  });

  it('flags below protected capital and below the required PG BUY', () => {
    const result = scenario({ future: 40000 });
    expect(result.futurePortfolioValueCents).toBe(80000);
    expect(result.futureAvailableProfitCents).toBe(0);
    expect(result.scenarioStatus).toBe('BELOW_PROTECTED_CAPITAL');
    expect(result.isTargetReached).toBe(false);
    expect(result.targetPriceRelationship).toBe('BELOW_TARGET');
  });

  it('keeps profit available when value is above capital but below the target', () => {
    const result = scenario({ future: 60000 });
    expect(result.scenarioStatus).toBe('PROFIT_AVAILABLE');
    expect(result.futureExcessProfitCents).toBe(0);
  });

  it('reuses Phase 5B conservative 4dp profit-taking at the hypothetical PG BUY', () => {
    const result = scenario({ future: 70000 });
    expect(result.profitTaking.isPreviewAllowed).toBe(true);
    expect(result.executableGramsToSell).toBe('0.5714');
    expect(result.estimatedSaleProceedsCents).toBe(39998);
    expect(result.remainingGrams).toBe('1.4286');
    expect(result.remainingValueCents).toBe(100002);
    expect(result.capitalBufferCents).toBe(2);
    expect(result.capitalPreserved).toBe(true);
    expect(result.profitTaking.theoreticalGramsToSell).toBe('0.5714285714');
  });

  it('previews a partial hypothetical profit when it does not exceed available', () => {
    const result = scenario({ future: 70000, requested: 20000 });
    expect(result.profitTaking.isPreviewAllowed).toBe(true);
    expect(result.executableGramsToSell).toBe('0.2857');
    expect(result.estimatedSaleProceedsCents).toBe(19999);
  });

  it('blocks a requested profit above hypothetical available profit', () => {
    const result = scenario({ future: 60000, requested: 30000 });
    expect(result.futureAvailableProfitCents).toBe(20000);
    expect(result.profitTaking.isPreviewAllowed).toBe(false);
    expect(result.profitTaking.blockingReason).toBe(
      'REQUEST_EXCEEDS_AVAILABLE_PROFIT',
    );
    expect(result.executableGramsToSell).toBeNull();
  });

  it('simulates portfolio value without an active goal and leaves goal fields null', () => {
    const result = scenario({ future: 70000, goal: null });
    expect(result.futurePortfolioValueCents).toBe(140000);
    expect(result.hasActiveGoal).toBe(false);
    expect(result.progressPercent).toBeNull();
    expect(result.futureRemainingProfitCents).toBeNull();
    expect(result.isTargetReached).toBe(false);
    expect(result.profitTaking.blockingReason).toBe('NO_ACTIVE_GOAL');
  });

  it('returns zero future value and no profit-taking when there are no holdings', () => {
    const result = scenario({ future: 70000, purchases: [] });
    expect(result.futurePortfolioValueCents).toBe(0);
    expect(result.hasHoldings).toBe(false);
    expect(result.executableGramsToSell).toBeNull();
    expect(result.profitTaking.blockingReason).toBe('NO_HOLDINGS');
  });

  it('simulates planned 25/50/75/100 purchases on the post-buy position', () => {
    const percents = [25, 50, 75, 100] as const;
    for (const percent of percents) {
      const result = scenario({ future: 70000, planned: percent });
      expect(result.plannedPurchaseAvailable).toBe(true);
      expect(result.deploymentPercent).toBe(percent);
      expect(result.deploymentCents).toBe(percent * 400);
      expect(result.postBuyProtectedCapitalCents).toBe(100000 + percent * 400);
      const expectedNew = floorGramsFromCentsAtUnitPrice(percent * 400, 67000);
      expect(result.estimatedNewGrams).toBe(expectedNew);
      expect(result.postBuyTotalGrams).not.toBe('2.0000');
      expect(result.futureValueAfterBuyCents).toBeGreaterThan(
        result.futurePortfolioValueCents,
      );
    }
  });

  it('compares no-buy vs planned buy at the same hypothetical PG BUY', () => {
    const result = scenario({ future: 60000, planned: 100 });
    expect(result.changeInFutureValueCents).not.toBeNull();
    expect(result.changeInFutureProfitCents).not.toBeNull();
    expect(result.futureValueAfterBuyCents).toBeGreaterThan(
      result.futurePortfolioValueCents,
    );
    expect(typeof result.helpsReachTargetAtThisPrice).toBe('boolean');
  });

  it('reuses post-buy required PG BUY as the break-even for the planned purchase', () => {
    const result = scenario({ future: 70000, planned: 50 });
    expect(result.postBuyRequiredPgBuyCents).toBeGreaterThan(0);
    expect(result.postBuyRequiredPgBuyCents).not.toBe(
      result.currentRequiredPgBuyCents,
    );
  });

  it('does not offer a planned purchase when no monthly budget is set', () => {
    const result = scenario({ future: 70000, planned: 50, budget: null });
    expect(result.plannedPurchaseAvailable).toBe(false);
    expect(result.plannedPurchaseUnavailableReason).toContain(
      'monthly Gold budget is not set',
    );
    expect(result.futureValueAfterBuyCents).toBeNull();
  });

  it('dedupes, drops invalid, and caps comparison prices at 6', () => {
    expect(normalizeFuturePrices([70000, 65000, 70000, 0, -1, 60000])).toEqual([
      60000, 65000, 70000,
    ]);
    const many = [1, 2, 3, 4, 5, 6, 7];
    expect(normalizeFuturePrices(many)).toHaveLength(
      MAX_FUTURE_SCENARIO_PRICES,
    );
  });

  it('sorts multi-scenario comparison by hypothetical PG BUY', () => {
    const computed = computeGoldFutureScenarioComparison({
      futurePriceCents: [70000, 60000, 70000],
      plannedDeploymentPercent: null,
      requestedProfitCents: null,
      goal: goal(),
      purchases: FIXTURE_PURCHASES,
      decision: decision({}),
    });
    expect(
      computed.scenarios.map((row) => row.futurePgBuyPerGramCents),
    ).toEqual([60000, 70000]);
  });

  it('rejects more than six comparison prices', () => {
    expect(() =>
      computeGoldFutureScenarioComparison({
        futurePriceCents: [1, 2, 3, 4, 5, 6, 7],
        plannedDeploymentPercent: null,
        requestedProfitCents: null,
        goal: goal(),
        purchases: FIXTURE_PURCHASES,
        decision: decision({}),
      }),
    ).toThrow('FUTURE_SCENARIO_LIMIT');
  });

  it('suggests current, +/-5%, +10%, and required PG BUY without calling them forecasts', () => {
    const prices = suggestedFuturePgBuyPrices({
      currentPgBuyCents: 65000,
      requiredPgBuyCents: 70000,
    });
    expect(prices).toEqual([61750, 65000, 68250, 70000, 71500]);
  });

  it('throws on a non-positive hypothetical PG BUY', () => {
    expect(() => scenario({ future: 0 })).toThrow('FUTURE_PG_BUY_INVALID');
    expect(() => scenario({ future: -100 })).toThrow('FUTURE_PG_BUY_INVALID');
  });
});

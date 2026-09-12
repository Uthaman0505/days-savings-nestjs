import { addCalendarDays } from './gold-price-analytics';
import type { GoldPriceObservation } from './gold-price-analytics';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';
import type { GoldProfitGoalRecord } from './gold-profit-goal';
import { floorGramsFromCentsAtUnitPrice } from './gold-math';
import {
  GOLD_GOAL_DECISION_RULE_ORDER,
  classifyGoldTargetImpact,
  computeGoldGoalDecision,
  deploymentCentsForPercent,
  simulateGoldBuyScenario,
} from './gold-goal-decision';

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
    purchaseDate: '2026-08-01',
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

function obs(
  partial: Partial<GoldPriceObservation> & { id: string; priceDate: string },
): GoldPriceObservation {
  return {
    capturedPriceAt: new Date(`${partial.priceDate}T02:00:00.000Z`),
    createdAt: new Date(`${partial.priceDate}T02:00:00.000Z`),
    pgBuyPricePerGramCents: 65000,
    pgSellPricePerGramCents: 67000,
    source: 'SCREENSHOT',
    ...partial,
  };
}

function dailySeries(input: {
  days: number;
  startSell: number;
  endSell: number;
  spread: number;
  extraHigh?: { date: string; sell: number };
  extraLow?: { date: string; sell: number };
}): GoldPriceObservation[] {
  const rows: GoldPriceObservation[] = [];
  const last = input.days - 1;
  for (let i = 0; i < input.days; i += 1) {
    const date = addCalendarDays(TODAY, i - last);
    const sell =
      last === 0
        ? input.endSell
        : Math.round(
            input.startSell + ((input.endSell - input.startSell) * i) / last,
          );
    rows.push(
      obs({
        id: `d${i}`,
        priceDate: date,
        pgSellPricePerGramCents: sell,
        pgBuyPricePerGramCents: sell - input.spread,
      }),
    );
  }
  if (input.extraHigh) {
    rows.push(
      obs({
        id: 'high',
        priceDate: input.extraHigh.date,
        pgSellPricePerGramCents: input.extraHigh.sell,
        pgBuyPricePerGramCents: input.extraHigh.sell - input.spread,
      }),
    );
  }
  if (input.extraLow) {
    rows.push(
      obs({
        id: 'low',
        priceDate: input.extraLow.date,
        pgSellPricePerGramCents: input.extraLow.sell,
        pgBuyPricePerGramCents: input.extraLow.sell - input.spread,
      }),
    );
  }
  return rows;
}

function latestFrom(rows: GoldPriceObservation[]) {
  const newest = rows.reduce((best, row) =>
    row.priceDate > best.priceDate ? row : best,
  );
  return {
    pgBuyPricePerGramCents: newest.pgBuyPricePerGramCents,
    pgSellPricePerGramCents: newest.pgSellPricePerGramCents,
    priceDate: newest.priceDate,
  };
}

describe('gold-goal-decision', () => {
  it('documents deterministic rule order', () => {
    expect(GOLD_GOAL_DECISION_RULE_ORDER).toEqual([
      'MISSING_CURRENT_PRICE',
      'NO_ACTIVE_GOAL',
      'GOAL_REACHED',
      'MISSING_BUDGET',
      'INSUFFICIENT_PRICE_HISTORY',
      'WAIT_WIDE_SPREAD_HIGH_PRICE',
      'WAIT_SHARP_SHORT_TERM_RISE',
      'BUY_PARTIAL_INITIAL_POSITION',
      'BUY_TARGET_IMPROVEMENT',
      'BUY_PARTIAL_TARGET_IMPROVEMENT',
      'HOLD_NO_COMPELLING_BUY',
    ]);
  });

  it('splits a MYR 400 budget into 25/50/75/100 scenarios', () => {
    expect(deploymentCentsForPercent(40000, 25)).toBe(10000);
    expect(deploymentCentsForPercent(40000, 50)).toBe(20000);
    expect(deploymentCentsForPercent(40000, 75)).toBe(30000);
    expect(deploymentCentsForPercent(40000, 100)).toBe(40000);
  });

  it('acquires grams at PG SELL, never PG BUY', () => {
    const pgSell = 67000;
    const pgBuy = 65000;
    const scenario = simulateGoldBuyScenario({
      deploymentPercent: 100,
      deploymentCents: 40000,
      currentGrams: '2.0000',
      protectedCapitalCents: 100000,
      targetProfitCents: 40000,
      currentRequiredPgBuyCents: 70000,
      pgBuyCents: pgBuy,
      pgSellCents: pgSell,
    });
    expect(scenario.acquisitionPgSellCents).toBe(pgSell);
    expect(scenario.estimatedNewGrams).toBe(
      floorGramsFromCentsAtUnitPrice(40000, pgSell),
    );
    expect(scenario.estimatedNewGrams).not.toBe(
      floorGramsFromCentsAtUnitPrice(40000, pgBuy),
    );
  });

  it('increases protected capital and recalculates required PG BUY after a buy', () => {
    const scenario = simulateGoldBuyScenario({
      deploymentPercent: 100,
      deploymentCents: 40000,
      currentGrams: '2.0000',
      protectedCapitalCents: 100000,
      targetProfitCents: 40000,
      currentRequiredPgBuyCents: 70000,
      pgBuyCents: 65000,
      pgSellCents: 67000,
    });
    expect(scenario.postBuyProtectedCapitalCents).toBe(140000);
    expect(scenario.postBuyRequiredPortfolioValueCents).toBe(180000);
    expect(scenario.postBuyTotalGrams).toBe('2.5970');
    expect(scenario.postBuyRequiredPgBuyCents).toBe(69311);
    expect(scenario.targetImpact).toBe('IMPROVES_TARGET');
    expect(scenario.requiredPgBuyChangeCents).toBe(69311 - 70000);
  });

  it('marks a purchase that raises required PG BUY as WORSENS_TARGET', () => {
    const impact = classifyGoldTargetImpact(70000, 72000);
    expect(impact.targetImpact).toBe('WORSENS_TARGET');
    const scenario = simulateGoldBuyScenario({
      deploymentPercent: 100,
      deploymentCents: 40000,
      currentGrams: '2.0000',
      protectedCapitalCents: 100000,
      targetProfitCents: 40000,
      currentRequiredPgBuyCents: 70000,
      pgBuyCents: 65000,
      pgSellCents: 80000,
    });
    expect(scenario.targetImpact).toBe('WORSENS_TARGET');
    expect(scenario.postBuyRequiredPgBuyCents).toBeGreaterThan(70000);
  });

  it('treats a tiny required PG BUY change as NEUTRAL', () => {
    expect(classifyGoldTargetImpact(70000, 70100).targetImpact).toBe('NEUTRAL');
    expect(classifyGoldTargetImpact(70000, 70000).targetImpact).toBe('NEUTRAL');
  });

  it('computes immediate spread cost from PG SELL acquisition vs PG BUY valuation', () => {
    const scenario = simulateGoldBuyScenario({
      deploymentPercent: 25,
      deploymentCents: 10000,
      currentGrams: '2.0000',
      protectedCapitalCents: 100000,
      targetProfitCents: 40000,
      currentRequiredPgBuyCents: 70000,
      pgBuyCents: 57300,
      pgSellCents: 62500,
    });
    expect(scenario.estimatedNewGrams).toBe('0.1600');
    expect(scenario.immediateSpreadCostCents).toBe(832);
  });

  it('returns HOLD when current price is missing', () => {
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices: [],
      latestPrice: null,
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('HOLD');
    expect(decision.ruleCode).toBe('MISSING_CURRENT_PRICE');
    expect(decision.hasCurrentPrice).toBe(false);
  });

  it('returns WAIT when there is no active profit goal', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 72000,
      endSell: 66000,
      spread: 2000,
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: null,
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: latestFrom(prices),
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('WAIT');
    expect(decision.ruleCode).toBe('NO_ACTIVE_GOAL');
  });

  it('returns HOLD when monthly budget is missing', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 72000,
      endSell: 66000,
      spread: 2000,
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: null,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: latestFrom(prices),
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('HOLD');
    expect(decision.ruleCode).toBe('MISSING_BUDGET');
    expect(decision.hasMonthlyBudget).toBe(false);
  });

  it('returns WAIT with a data-quality reason when history is insufficient', () => {
    const prices = [
      obs({
        id: 'only',
        priceDate: TODAY,
        pgBuyPricePerGramCents: 65000,
        pgSellPricePerGramCents: 67000,
      }),
    ];
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: latestFrom(prices),
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('WAIT');
    expect(decision.ruleCode).toBe('INSUFFICIENT_PRICE_HISTORY');
    expect(decision.primaryReason).toContain('not enough recent price history');
    expect(decision.dataQuality.hasSufficientHistory).toBe(false);
  });

  it('returns GOAL_REACHED even when buy conditions would otherwise look favorable', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 72000,
      endSell: 66000,
      spread: 2000,
    });
    const latest = latestFrom(prices);
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: {
        ...latest,
        pgBuyPricePerGramCents: 70000,
        pgSellPricePerGramCents: 72000,
      },
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('GOAL_REACHED');
    expect(decision.ruleCode).toBe('GOAL_REACHED');
    expect(decision.recommendedDeploymentCents).toBeNull();
    expect(decision.primaryReason).toContain('protected-profit target');
  });

  it('returns WAIT when PG SELL is near the recent high and the spread is wide', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 64000,
      endSell: 76000,
      spread: 1500,
    });
    const latest = prices.find((row) => row.priceDate === TODAY)!;
    latest.pgSellPricePerGramCents = 76000;
    latest.pgBuyPricePerGramCents = 62000;
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: {
        pgBuyPricePerGramCents: 62000,
        pgSellPricePerGramCents: 76000,
        priceDate: TODAY,
      },
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('WAIT');
    expect(decision.ruleCode).toBe('WAIT_WIDE_SPREAD_HIGH_PRICE');
    expect(decision.spreadQuality).toBe('WIDE');
    expect(decision.recentPricePositionPercent).toBeGreaterThanOrEqual(70);
  });

  it('returns BUY when a full-budget purchase improves the target at a favorable price', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 72000,
      endSell: 66000,
      spread: 2000,
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: latestFrom(prices),
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.trend).toBe('FALLING');
    expect(decision.spreadQuality).toMatch(/NARROW|NORMAL/);
    expect(decision.recentPricePositionPercent).toBeLessThanOrEqual(50);
    expect(decision.scenarios).toHaveLength(4);
    expect(decision.scenarios.map((row) => row.deploymentPercent)).toEqual([
      25, 50, 75, 100,
    ]);
    const full = decision.scenarios[3];
    expect(full.targetImpact).toBe('IMPROVES_TARGET');
    expect(full.acquisitionPgSellCents).toBe(decision.currentPgSellCents);
    expect(decision.signal).toBe('BUY');
    expect(decision.ruleCode).toBe('BUY_TARGET_IMPROVEMENT');
    expect(decision.recommendedDeploymentCents).toBe(40000);
    expect(decision.recommendedDeploymentCents).toBeLessThanOrEqual(40000);
    expect(decision.headline).not.toMatch(/Buy now immediately/i);
    expect(decision.headline).not.toMatch(/Gold will/i);
  });

  it('returns BUY_PARTIAL when improvement is real but not strong enough for a full BUY', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 68000,
      endSell: 69000,
      spread: 2000,
      extraLow: { date: '2026-08-20', sell: 62000 },
      extraHigh: { date: '2026-08-22', sell: 75000 },
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: {
        pgBuyPricePerGramCents: 67000,
        pgSellPricePerGramCents: 69000,
        priceDate: TODAY,
      },
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.recentPricePositionPercent).toBeGreaterThan(50);
    expect(decision.recentPricePositionPercent).toBeLessThanOrEqual(60);
    expect(decision.signal).toBe('BUY_PARTIAL');
    expect(decision.ruleCode).toBe('BUY_PARTIAL_TARGET_IMPROVEMENT');
    expect([2500, 10000, 20000, 30000]).toContain(
      decision.recommendedDeploymentCents,
    );
    expect(decision.recommendedDeploymentCents).toBeLessThan(40000);
    expect(decision.primaryReason).toContain('partial purchase');
  });

  it('returns HOLD when buying would not materially help the goal', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 69000,
      endSell: 70500,
      spread: 2000,
      extraLow: { date: '2026-08-20', sell: 64000 },
      extraHigh: { date: '2026-08-22', sell: 76000 },
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: {
        pgBuyPricePerGramCents: 68500,
        pgSellPricePerGramCents: 70500,
        priceDate: TODAY,
      },
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.signal).toBe('HOLD');
    expect(decision.ruleCode).toBe('HOLD_NO_COMPELLING_BUY');
    expect(decision.primaryReason).toContain(
      'current position can be maintained',
    );
  });

  it('returns WAIT_NO_HOLDINGS when there is no position and conditions are not a first-buy', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 68000,
      endSell: 69500,
      spread: 2000,
      extraLow: { date: '2026-08-20', sell: 62000 },
      extraHigh: { date: '2026-08-22', sell: 75000 },
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [],
      prices,
      latestPrice: {
        pgBuyPricePerGramCents: 67500,
        pgSellPricePerGramCents: 69500,
        priceDate: TODAY,
      },
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.hasHoldings).toBe(false);
    expect(decision.signal).toBe('WAIT');
    expect(decision.ruleCode).toBe('WAIT_NO_HOLDINGS');
  });

  it('never recommends spending above the monthly budget', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 72000,
      endSell: 66000,
      spread: 2000,
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: latestFrom(prices),
      now: NOW,
      todayPriceDate: TODAY,
    });
    for (const scenario of decision.scenarios) {
      expect(scenario.deploymentCents).toBeLessThanOrEqual(40000);
    }
    if (decision.recommendedDeploymentCents != null) {
      expect(decision.recommendedDeploymentCents).toBeLessThanOrEqual(40000);
    }
  });

  it('classifies D30 price position, trend, and spread quality from recorded history', () => {
    const prices = dailySeries({
      days: 12,
      startSell: 72000,
      endSell: 66000,
      spread: 2000,
    });
    const decision = computeGoldGoalDecision({
      monthlyBudgetCents: 40000,
      goal: goal(),
      purchases: [purchase({ id: 'p1' })],
      prices,
      latestPrice: latestFrom(prices),
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(decision.recentPricePositionPercent).toBe(0);
    expect(decision.trend).toBe('FALLING');
    expect(decision.spreadQuality).toMatch(/NARROW|NORMAL/);
    expect(decision.currentPgSellCents).toBe(66000);
    expect(decision.currentPgBuyCents).toBe(64000);
  });
});

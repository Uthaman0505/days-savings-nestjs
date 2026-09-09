import {
  derivePricePerGramCents,
  ratioPercent,
  signedPercentChange,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';
import { evaluateGoldProfitGoal } from './gold-profit-goal';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';

const NOW = new Date('2026-09-05T02:00:00.000Z');

function goal(targetProfitCents: number) {
  return {
    id: 'goal-1',
    targetProfitCents,
    status: 'ACTIVE' as const,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    achievedAt: null,
  };
}

function purchase(
  partial: Partial<GoldPurchaseObservation> & { id: string },
): GoldPurchaseObservation {
  return {
    purchaseDate: '2026-08-30',
    weightGrams: '1.0000',
    amountPaidCents: 50000,
    pricePerGramCents: 50000,
    source: 'MANUAL',
    referenceNumber: null,
    createdAt: NOW,
    isActive: true,
    ...partial,
  };
}

describe('evaluateGoldProfitGoal', () => {
  it('treats protected capital as the sum of active invested amounts', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 50000, weightGrams: '1.0000' }),
        purchase({
          id: 'b',
          amountPaidCents: 30000,
          weightGrams: '0.5000',
          source: 'IMPORT',
        }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.protectedCapitalCents).toBe(80000);
    expect(result.requiredPortfolioValueCents).toBe(120000);
  });

  it('excludes inactive purchases from protected capital', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 50000 }),
        purchase({
          id: 'b',
          amountPaidCents: 30000,
          weightGrams: '0.5000',
          isActive: false,
          source: 'IMPORT',
        }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.protectedCapitalCents).toBe(50000);
    expect(result.totalGrams).toBe('1.0000');
  });

  it('includes a restored (active again) purchase in protected capital', () => {
    const restored = purchase({
      id: 'imported',
      amountPaidCents: 37900,
      weightGrams: '0.3215',
      source: 'IMPORT',
      isActive: true,
    });
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({
          id: 'manual',
          amountPaidCents: 50000,
          weightGrams: '1.0000',
        }),
        restored,
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.protectedCapitalCents).toBe(87900);
    expect(result.totalGrams).toBe('1.3215');
  });

  it('values current portfolio with PG BUY, never PG SELL', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.currentValueCents).toBe(
      valueCentsFromGramsAndUnitPrice('2.0000', 57300),
    );
    expect(result.currentValueCents).not.toBe(
      valueCentsFromGramsAndUnitPrice('2.0000', 62500),
    );
    expect(result.currentPgBuyPerGramCents).toBe(57300);
  });

  it('computes available profit only above protected capital', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 62500 },
    });
    expect(result.currentValueCents).toBe(125000);
    expect(result.availableProfitCents).toBe(25000);
    expect(result.remainingProfitCents).toBe(15000);
    expect(result.progressPercent).toBe(62.5);
    expect(result.isTargetReached).toBe(false);
  });

  it('never returns negative available profit when current value is below capital', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 45000 },
    });
    expect(result.currentValueCents).toBe(90000);
    expect(result.availableProfitCents).toBe(0);
    expect(result.remainingProfitCents).toBe(40000);
    expect(result.progressPercent).toBe(0);
    expect(result.isTargetReached).toBe(false);
  });

  it('computes required portfolio value as protected capital plus target', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.requiredPortfolioValueCents).toBe(140000);
  });

  it('computes required PG BUY from required value / active grams', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.requiredPgBuyPerGramCents).toBe(
      derivePricePerGramCents(140000, '2.0000'),
    );
    expect(result.requiredPgBuyPerGramCents).toBe(70000);
    expect(result.distanceToRequiredPgBuyCents).toBe(12700);
    expect(result.distanceToRequiredPgBuyPercent).toBe(
      signedPercentChange(57300, 70000),
    );
  });

  it('clamps display progress at 100% and exposes excess separately', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 80000 },
    });
    expect(result.availableProfitCents).toBe(60000);
    expect(result.remainingProfitCents).toBe(0);
    expect(result.progressPercent).toBe(100);
    expect(result.excessProfitCents).toBe(20000);
    expect(result.isTargetReached).toBe(true);
    expect(result.goal.status).toBe('ACTIVE');
  });

  it('marks the target reached only with price, holdings, and enough available profit', () => {
    const reached = evaluateGoldProfitGoal({
      goal: goal(25000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 62500 },
    });
    expect(reached.availableProfitCents).toBe(25000);
    expect(reached.isTargetReached).toBe(true);
    expect(reached.goal.status).toBe('ACTIVE');
  });

  it('does not fake progress or current value when PG BUY is missing', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: null,
    });
    expect(result.hasCurrentPrice).toBe(false);
    expect(result.protectedCapitalCents).toBe(100000);
    expect(result.totalGrams).toBe('2.0000');
    expect(result.currentValueCents).toBeNull();
    expect(result.availableProfitCents).toBeNull();
    expect(result.remainingProfitCents).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.isTargetReached).toBe(false);
    expect(result.requiredPgBuyPerGramCents).toBe(
      derivePricePerGramCents(140000, '2.0000'),
    );
  });

  it('does not divide by zero when there are no active holdings', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 50000, isActive: false }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.protectedCapitalCents).toBe(0);
    expect(result.hasHoldings).toBe(false);
    expect(result.requiredPgBuyPerGramCents).toBeNull();
    expect(result.currentValueCents).toBeNull();
    expect(result.availableProfitCents).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.isTargetReached).toBe(false);
    expect(result.requiredPortfolioValueCents).toBe(40000);
  });

  it('recomputes after a new purchase increases protected capital', () => {
    const before = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 87900, weightGrams: '1.3215' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    const after = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 87900, weightGrams: '1.3215' }),
        purchase({
          id: 'new',
          amountPaidCents: 10000,
          weightGrams: '0.1745',
          purchaseDate: '2026-09-08',
        }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(before.protectedCapitalCents).toBe(87900);
    expect(after.protectedCapitalCents).toBe(97900);
    expect(after.requiredPortfolioValueCents).toBe(137900);
  });

  it('recomputes current value and progress after a new PG BUY', () => {
    const purchases = [
      purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
    ];
    const before = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases,
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    const after = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases,
      latestPrice: { pgBuyPricePerGramCents: 70000 },
    });
    expect(before.availableProfitCents).toBe(14600);
    expect(after.currentValueCents).toBe(140000);
    expect(after.availableProfitCents).toBe(40000);
    expect(after.isTargetReached).toBe(true);
    expect(after.progressPercent).toBe(100);
  });

  it('matches the signed-off Phase 4B / Phase 5A QA snapshot', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'live', amountPaidCents: 87900, weightGrams: '1.3215' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
    });
    expect(result.totalGrams).toBe('1.3215');
    expect(result.protectedCapitalCents).toBe(87900);
    expect(result.currentPgBuyPerGramCents).toBe(57300);
    expect(result.currentValueCents).toBe(
      valueCentsFromGramsAndUnitPrice('1.3215', 57300),
    );
    expect(result.currentValueCents).toBe(75722);
    expect(result.availableProfitCents).toBe(0);
    expect(result.remainingProfitCents).toBe(40000);
    expect(result.requiredPortfolioValueCents).toBe(127900);
    expect(result.requiredPgBuyPerGramCents).toBe(
      derivePricePerGramCents(127900, '1.3215'),
    );
    expect(result.progressPercent).toBe(0);
    expect(result.isTargetReached).toBe(false);
  });

  it('uses ratioPercent for progress and does not exceed 100 for display', () => {
    const result = evaluateGoldProfitGoal({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 62500 },
    });
    expect(result.progressPercent).toBe(ratioPercent(25000, 40000));
  });
});

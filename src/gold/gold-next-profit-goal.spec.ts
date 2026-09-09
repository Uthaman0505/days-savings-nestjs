import {
  evaluateNextProfitGoalPreview,
  goalHistoryDurationDays,
  proposeNextTargetCents,
} from './gold-next-profit-goal';
import { evaluateGoldProfitGoal } from './gold-profit-goal';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';

const NOW = new Date('2026-09-09T02:00:00.000Z');

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

describe('proposeNextTargetCents', () => {
  it('keeps the previous target for SAME', () => {
    expect(
      proposeNextTargetCents({
        previousTargetCents: 40000,
        rule: 'SAME',
      }),
    ).toBe(40000);
  });

  it('adds a fixed RM increase in integer cents', () => {
    expect(
      proposeNextTargetCents({
        previousTargetCents: 40000,
        rule: 'FIXED_RM_INCREASE',
        fixedIncreaseCents: 10000,
      }),
    ).toBe(50000);
  });

  it('applies a percentage increase with half-up cents rounding', () => {
    expect(
      proposeNextTargetCents({
        previousTargetCents: 40000,
        rule: 'PERCENT_INCREASE',
        percentage: 20,
      }),
    ).toBe(48000);
    expect(
      proposeNextTargetCents({
        previousTargetCents: 33333,
        rule: 'PERCENT_INCREASE',
        percentage: 20,
      }),
    ).toBe(40000);
  });

  it('rejects non-positive previous targets, increases, and percentages over 100', () => {
    expect(() =>
      proposeNextTargetCents({ previousTargetCents: 0, rule: 'SAME' }),
    ).toThrow('INVALID_PREVIOUS_TARGET');
    expect(() =>
      proposeNextTargetCents({
        previousTargetCents: 40000,
        rule: 'FIXED_RM_INCREASE',
        fixedIncreaseCents: 0,
      }),
    ).toThrow('INVALID_FIXED_INCREASE');
    expect(() =>
      proposeNextTargetCents({
        previousTargetCents: 40000,
        rule: 'PERCENT_INCREASE',
        percentage: 0,
      }),
    ).toThrow('INVALID_PERCENTAGE');
    expect(() =>
      proposeNextTargetCents({
        previousTargetCents: 40000,
        rule: 'PERCENT_INCREASE',
        percentage: 100.01,
      }),
    ).toThrow('INVALID_PERCENTAGE');
  });
});

describe('evaluateNextProfitGoalPreview', () => {
  const holdings = {
    purchases: [purchase({ id: 'a' })],
    latestPrice: { pgBuyPricePerGramCents: 70000 },
  };

  it('computes required portfolio value and required PG BUY from current holdings', () => {
    const preview = evaluateNextProfitGoalPreview({
      previousGoalId: 'goal-1',
      previousTargetCents: 40000,
      ...holdings,
      rule: 'PERCENT_INCREASE',
      percentage: 20,
    });
    expect(preview.proposedTargetCents).toBe(48000);
    expect(preview.protectedCapitalCents).toBe(100000);
    expect(preview.requiredPortfolioValueCents).toBe(148000);
    expect(preview.requiredPgBuyPerGramCents).toBe(74000);
    expect(preview.currentPgBuyPerGramCents).toBe(70000);
    expect(preview.distanceToRequiredPgBuyCents).toBe(4000);
    expect(preview.totalGrams).toBe('2.0000');
    expect(preview.rule).toBe('PERCENT_INCREASE');
    expect(preview.percentage).toBe(20);
  });

  it('matches Phase 5A required-value math for the proposed target', () => {
    const preview = evaluateNextProfitGoalPreview({
      previousGoalId: 'goal-1',
      previousTargetCents: 40000,
      ...holdings,
      rule: 'SAME',
    });
    const phase5a = evaluateGoldProfitGoal({
      goal: {
        id: 'goal-1',
        targetProfitCents: 40000,
        status: 'ACTIVE',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        achievedAt: null,
      },
      purchases: holdings.purchases,
      latestPrice: holdings.latestPrice,
    });
    expect(preview.requiredPortfolioValueCents).toBe(
      phase5a.requiredPortfolioValueCents,
    );
    expect(preview.requiredPgBuyPerGramCents).toBe(
      phase5a.requiredPgBuyPerGramCents,
    );
    expect(preview.protectedCapitalCents).toBe(phase5a.protectedCapitalCents);
  });
});

describe('goalHistoryDurationDays', () => {
  it('counts whole days from created_at to achieved_at', () => {
    expect(
      goalHistoryDurationDays(
        new Date('2026-09-09T00:00:00.000Z'),
        new Date('2026-10-20T00:00:00.000Z'),
        new Date('2026-10-20T00:00:00.000Z'),
      ),
    ).toBe(41);
  });
});

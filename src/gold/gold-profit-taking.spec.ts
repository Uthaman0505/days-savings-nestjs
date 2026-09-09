/**
 * Phase 5B planner tests.
 *
 * grams_to_sell = desired_cash / PG BUY
 * NOT (desired_cash / (PG BUY − weighted average cost)).
 */
import {
  valueCentsFromGramsAndUnitPrice,
  valueCentsFromGramsAndUnitPriceAllowZero,
} from './gold-math';
import { evaluateGoldProfitTakingPreview } from './gold-profit-taking';
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
const PG_BUY_700 = { pgBuyPricePerGramCents: 70000 };

describe('evaluateGoldProfitTakingPreview', () => {
  it('computes the mandatory 2g / MYR1000 / PG BUY700 / target400 fixture', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(preview.protectedCapitalCents).toBe(100000);
    expect(preview.currentPortfolioValueCents).toBe(140000);
    expect(preview.availableProfitCents).toBe(40000);
    expect(preview.isFullTargetAchievable).toBe(true);
    expect(preview.isPreviewAllowed).toBe(true);
    expect(preview.theoreticalGramsToSell).toBe('0.5714285714');
    expect(preview.executableGramsToSell).toBe('0.5714');
    expect(preview.estimatedSaleProceedsCents).toBe(
      valueCentsFromGramsAndUnitPrice('0.5714', 70000),
    );
    expect(preview.estimatedSaleProceedsCents).toBe(39998);
    expect(preview.profitRoundingDifferenceCents).toBe(2);
    expect(preview.remainingGrams).toBe('1.4286');
    expect(preview.remainingPortfolioValueCents).toBe(
      valueCentsFromGramsAndUnitPriceAllowZero('1.4286', 70000),
    );
    expect(preview.remainingPortfolioValueCents).toBe(100002);
    expect(preview.capitalBufferCents).toBe(2);
    expect(preview.capitalBufferCents).toBeGreaterThanOrEqual(0);
    expect(preview.isCapitalPreserved).toBe(true);
    expect(preview.blockingReason).toBeNull();
  });

  it('does not use realised accounting profit (PG BUY − WAC) for grams to sell', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    const accountingGrams = '2.0000';
    expect(preview.executableGramsToSell).not.toBe(accountingGrams);
    expect(preview.executableGramsToSell).toBe('0.5714');
  });

  it('previews partial profit with conservative 4dp rounding', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'PARTIAL',
      requestedProfitCents: 20000,
    });
    expect(preview.isPreviewAllowed).toBe(true);
    expect(preview.theoreticalGramsToSell).toBe('0.2857142857');
    expect(preview.executableGramsToSell).toBe('0.2857');
    expect(preview.estimatedSaleProceedsCents).toBe(19999);
    expect(preview.remainingGrams).toBe('1.7143');
    expect(preview.remainingPortfolioValueCents).toBe(120001);
    expect(preview.capitalBufferCents).toBe(20001);
    expect(preview.isCapitalPreserved).toBe(true);
  });

  it('does not silently downgrade TARGET to available profit when the target is not reached', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(15000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 54000 },
      mode: 'TARGET',
      requestedProfitCents: 8000,
    });
    expect(preview.availableProfitCents).toBe(8000);
    expect(preview.requestedProfitCents).toBe(15000);
    expect(preview.isFullTargetAchievable).toBe(false);
    expect(preview.isPreviewAllowed).toBe(false);
    expect(preview.executableGramsToSell).toBeNull();
    expect(preview.theoreticalGramsToSell).toBeNull();
    expect(preview.blockingReason).toBe('TARGET_NOT_REACHED');
  });

  it('allows an explicit partial preview when the full target is not reached', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(15000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 54000 },
      mode: 'PARTIAL',
      requestedProfitCents: 5000,
    });
    expect(preview.availableProfitCents).toBe(8000);
    expect(preview.isPreviewAllowed).toBe(true);
    expect(preview.requestedProfitCents).toBe(5000);
    expect(preview.executableGramsToSell).not.toBeNull();
  });

  it('blocks TARGET grams when there is no available protected profit', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 87900, weightGrams: '1.3215' }),
      ],
      latestPrice: { pgBuyPricePerGramCents: 57300 },
      mode: 'TARGET',
    });
    expect(preview.availableProfitCents).toBe(0);
    expect(preview.isPreviewAllowed).toBe(false);
    expect(preview.executableGramsToSell).toBeNull();
    expect(preview.blockingReason).toBe('NO_AVAILABLE_PROFIT');
  });

  it('rejects partial requests above available protected profit', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'PARTIAL',
      requestedProfitCents: 50000,
    });
    expect(preview.isPreviewAllowed).toBe(false);
    expect(preview.executableGramsToSell).toBeNull();
    expect(preview.blockingReason).toBe('REQUEST_EXCEEDS_AVAILABLE_PROFIT');
  });

  it('rejects invalid partial requested profit', () => {
    expect(
      evaluateGoldProfitTakingPreview({
        goal: goal(40000),
        purchases: FIXTURE_PURCHASES,
        latestPrice: PG_BUY_700,
        mode: 'PARTIAL',
        requestedProfitCents: 0,
      }).blockingReason,
    ).toBe('INVALID_REQUESTED_PROFIT');
    expect(
      evaluateGoldProfitTakingPreview({
        goal: goal(40000),
        purchases: FIXTURE_PURCHASES,
        latestPrice: PG_BUY_700,
        mode: 'PARTIAL',
        requestedProfitCents: null,
      }).blockingReason,
    ).toBe('INVALID_REQUESTED_PROFIT');
  });

  it('does not calculate a preview without a confirmed PG BUY', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: null,
      mode: 'TARGET',
    });
    expect(preview.blockingReason).toBe('NO_CURRENT_PG_BUY');
    expect(preview.executableGramsToSell).toBeNull();
    expect(preview.isPreviewAllowed).toBe(false);
  });

  it('blocks when there are no active holdings', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: [purchase({ id: 'a', isActive: false })],
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(preview.blockingReason).toBe('NO_HOLDINGS');
    expect(preview.protectedCapitalCents).toBe(0);
  });

  it('returns NO_ACTIVE_GOAL without writing a sale', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: null,
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(preview.blockingReason).toBe('NO_ACTIVE_GOAL');
    expect(preview.isPreviewAllowed).toBe(false);
  });

  it('TARGET mode ignores an arbitrary requested amount', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
      requestedProfitCents: 1,
    });
    expect(preview.requestedProfitCents).toBe(40000);
    expect(preview.executableGramsToSell).toBe('0.5714');
  });

  it('excludes inactive purchases and includes restored ones', () => {
    const withInactive = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
        purchase({
          id: 'imported',
          amountPaidCents: 50000,
          weightGrams: '1.0000',
          isActive: false,
          source: 'IMPORT',
        }),
      ],
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(withInactive.protectedCapitalCents).toBe(100000);
    expect(withInactive.totalGrams).toBe('2.0000');

    const restored = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
        purchase({
          id: 'imported',
          amountPaidCents: 50000,
          weightGrams: '1.0000',
          isActive: true,
          source: 'IMPORT',
        }),
      ],
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(restored.protectedCapitalCents).toBe(150000);
    expect(restored.totalGrams).toBe('3.0000');
    expect(restored.currentPortfolioValueCents).toBe(210000);
    expect(restored.availableProfitCents).toBe(60000);
  });

  it('recomputes after a PG BUY refresh', () => {
    const before = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: { pgBuyPricePerGramCents: 50000 },
      mode: 'TARGET',
    });
    const after = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(before.blockingReason).toBe('NO_AVAILABLE_PROFIT');
    expect(after.isPreviewAllowed).toBe(true);
    expect(after.availableProfitCents).toBe(40000);
  });

  it('returns max executable withdrawal from conservative 4dp grams', () => {
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal(40000),
      purchases: FIXTURE_PURCHASES,
      latestPrice: PG_BUY_700,
      mode: 'TARGET',
    });
    expect(preview.maxWithdrawableProfitCents).toBe(40000);
    expect(preview.maxExecutableGramsToSell).toBe('0.5714');
    expect(preview.maxExecutableProceedsCents).toBe(39998);
  });
});

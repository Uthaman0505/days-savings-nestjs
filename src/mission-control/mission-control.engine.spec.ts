import {
  computeHealthScore,
  healthBandForScore,
  progressPercent,
  projectDebtPayoff,
  sortDebtsByMethod,
} from './mission-control.engine';

describe('mission-control.engine', () => {
  it('sorts snowball by lowest balance', () => {
    const sorted = sortDebtsByMethod(
      [
        {
          id: 'a',
          outstandingCents: 500_000,
          interestRate: 18,
          minimumPaymentCents: 10_000,
          currentPaymentCents: 10_000,
          priorityRank: 1,
          status: 'QUEUED',
        },
        {
          id: 'b',
          outstandingCents: 100_000,
          interestRate: 12,
          minimumPaymentCents: 5_000,
          currentPaymentCents: 5_000,
          priorityRank: 2,
          status: 'QUEUED',
        },
      ],
      'SNOWBALL',
    );
    expect(sorted[0].id).toBe('b');
  });

  it('sorts avalanche by highest interest', () => {
    const sorted = sortDebtsByMethod(
      [
        {
          id: 'a',
          outstandingCents: 500_000,
          interestRate: 8,
          minimumPaymentCents: 10_000,
          currentPaymentCents: 10_000,
          priorityRank: 1,
          status: 'QUEUED',
        },
        {
          id: 'b',
          outstandingCents: 400_000,
          interestRate: 20,
          minimumPaymentCents: 5_000,
          currentPaymentCents: 5_000,
          priorityRank: 2,
          status: 'QUEUED',
        },
      ],
      'AVALANCHE',
    );
    expect(sorted[0].id).toBe('b');
  });

  it('computes progress and health bands', () => {
    expect(progressPercent(1000, 200)).toBe(80);
    expect(healthBandForScore(90)).toBe('EXCELLENT');
    expect(healthBandForScore(40)).toBe('NEEDS_ATTENTION');
  });

  it('computes a health score between 0 and 100', () => {
    const score = computeHealthScore({
      cashAvailableCents: 300_000,
      monthlyExpensesCents: 100_000,
      totalDebtCents: 500_000,
      monthlyIncomeCents: 500_000,
      savingsCents: 100_000,
      onTimePaymentRatio: 1,
      budgetPerformanceRatio: 0.8,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('projects debt free date with extra payments', () => {
    const result = projectDebtPayoff(
      [
        {
          outstandingCents: 120_000,
          interestRate: 12,
          minimumPaymentCents: 10_000,
          currentPaymentCents: 10_000,
        },
      ],
      20_000,
      'AVALANCHE',
    );
    expect(result.monthsRemaining).toBeGreaterThan(0);
    expect(result.debtFreeDate).toBeTruthy();
    expect(result.months.length).toBeGreaterThan(0);
    expect(result.months[result.months.length - 1].debtRemainingCents).toBe(0);
  });
});

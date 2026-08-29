import type { DebtPriority } from './debt-priority.entity';
import type { DebtPriorityMethod } from './mission-control.enums';

export type DebtLike = {
  id: string;
  outstandingCents: number;
  interestRate: number;
  minimumPaymentCents: number;
  currentPaymentCents: number;
  priorityRank: number;
  status: string;
};

export function sortDebtsByMethod(
  debts: DebtLike[],
  method: DebtPriorityMethod,
): DebtLike[] {
  const active = debts.filter(
    (d) => d.outstandingCents > 0 && d.status !== 'ARCHIVED',
  );
  const copy = [...active];
  switch (method) {
    case 'SNOWBALL':
      return copy.sort(
        (a, b) =>
          a.outstandingCents - b.outstandingCents ||
          a.priorityRank - b.priorityRank,
      );
    case 'AVALANCHE':
      return copy.sort(
        (a, b) =>
          b.interestRate - a.interestRate ||
          a.outstandingCents - b.outstandingCents,
      );
    case 'CUSTOM':
    default:
      return copy.sort((a, b) => a.priorityRank - b.priorityRank);
  }
}

export function progressPercent(
  originalCents: number,
  outstandingCents: number,
): number {
  if (originalCents <= 0) {
    return outstandingCents <= 0 ? 100 : 0;
  }
  const paid = Math.max(0, originalCents - outstandingCents);
  return Math.min(100, Math.max(0, Math.round((paid / originalCents) * 100)));
}

export function healthBandForScore(score: number): string {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  return 'NEEDS_ATTENTION';
}

/**
 * Composite financial health score (0–100).
 * Weights: cash buffer 25, debt ratio 30, savings 20, on-time bills 15, budget 10.
 */
export function computeHealthScore(input: {
  cashAvailableCents: number;
  monthlyExpensesCents: number;
  totalDebtCents: number;
  monthlyIncomeCents: number;
  savingsCents: number;
  onTimePaymentRatio: number; // 0–1
  budgetPerformanceRatio: number; // 0–1 (spent within plan)
}): number {
  const expense = Math.max(1, input.monthlyExpensesCents);
  const cashMonths = input.cashAvailableCents / expense;
  const cashScore = Math.min(100, (cashMonths / 3) * 100);

  const income = Math.max(1, input.monthlyIncomeCents);
  const debtRatio = input.totalDebtCents / (income * 12);
  const debtScore = Math.max(0, 100 - debtRatio * 100);

  const savingsRatio = input.savingsCents / income;
  const savingsScore = Math.min(100, savingsRatio * 100 * 2);

  const onTimeScore = Math.min(
    100,
    Math.max(0, input.onTimePaymentRatio * 100),
  );
  const budgetScore = Math.min(
    100,
    Math.max(0, input.budgetPerformanceRatio * 100),
  );

  const score =
    cashScore * 0.25 +
    debtScore * 0.3 +
    savingsScore * 0.2 +
    onTimeScore * 0.15 +
    budgetScore * 0.1;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export type ProjectionPoint = {
  monthKey: string;
  debtRemainingCents: number;
  paymentCents: number;
  interestCents: number;
  cashFlowCents: number;
};

export type ProjectionResult = {
  debtFreeDate: string | null;
  monthsRemaining: number;
  interestSavedCents: number;
  totalInterestCents: number;
  totalDebtCents: number;
  months: ProjectionPoint[];
};

function addMonthKey(base: Date, months: number): string {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Simulates month-by-month payoff using minimums + one shared extra payment
 * applied to the current target debt (by method order).
 */
export function projectDebtPayoff(
  debts: Array<{
    outstandingCents: number;
    interestRate: number;
    minimumPaymentCents: number;
    currentPaymentCents: number;
  }>,
  monthlyExtraCents: number,
  method: DebtPriorityMethod,
  maxMonths = 360,
): ProjectionResult {
  const working = debts
    .filter((d) => d.outstandingCents > 0)
    .map((d, index) => ({
      outstandingCents: d.outstandingCents,
      interestRate: d.interestRate,
      minimumPaymentCents: Math.max(0, d.minimumPaymentCents),
      currentPaymentCents: Math.max(
        d.minimumPaymentCents,
        d.currentPaymentCents,
      ),
      priorityRank: index + 1,
      status: 'QUEUED',
      id: String(index),
    }));

  const totalDebtStart = working.reduce((s, d) => s + d.outstandingCents, 0);
  if (totalDebtStart <= 0) {
    return {
      debtFreeDate: new Date().toISOString().slice(0, 10),
      monthsRemaining: 0,
      interestSavedCents: 0,
      totalInterestCents: 0,
      totalDebtCents: 0,
      months: [],
    };
  }

  // Baseline: minimums only (for interest-saved comparison).
  const baseline = simulate(working, 0, method, maxMonths);
  const withExtra = simulate(working, monthlyExtraCents, method, maxMonths);

  return {
    debtFreeDate: withExtra.debtFreeDate,
    monthsRemaining: withExtra.monthsRemaining,
    interestSavedCents: Math.max(
      0,
      baseline.totalInterestCents - withExtra.totalInterestCents,
    ),
    totalInterestCents: withExtra.totalInterestCents,
    totalDebtCents: totalDebtStart,
    months: withExtra.months,
  };
}

function simulate(
  seed: DebtLike[],
  monthlyExtraCents: number,
  method: DebtPriorityMethod,
  maxMonths: number,
): ProjectionResult {
  const debts = seed.map((d) => ({ ...d }));
  const months: ProjectionPoint[] = [];
  const now = new Date();
  let totalInterest = 0;
  let month = 0;

  while (month < maxMonths) {
    const active = debts.filter((d) => d.outstandingCents > 0);
    if (active.length === 0) break;

    month += 1;
    let monthInterest = 0;
    let monthPayment = 0;

    for (const d of active) {
      const interest = Math.round(
        d.outstandingCents * (d.interestRate / 100 / 12),
      );
      d.outstandingCents += interest;
      monthInterest += interest;
      totalInterest += interest;
    }

    const ordered = sortDebtsByMethod(debts, method).filter(
      (d) => d.outstandingCents > 0,
    );
    let extraLeft = monthlyExtraCents;

    for (const d of ordered) {
      const minPay = Math.min(
        d.outstandingCents,
        Math.max(d.minimumPaymentCents, d.currentPaymentCents),
      );
      d.outstandingCents -= minPay;
      monthPayment += minPay;
    }

    // Apply extra to first target still owing.
    for (const d of ordered) {
      if (extraLeft <= 0) break;
      if (d.outstandingCents <= 0) continue;
      const pay = Math.min(d.outstandingCents, extraLeft);
      d.outstandingCents -= pay;
      extraLeft -= pay;
      monthPayment += pay;
    }

    const remaining = debts.reduce(
      (s, d) => s + Math.max(0, d.outstandingCents),
      0,
    );
    months.push({
      monthKey: addMonthKey(now, month - 1),
      debtRemainingCents: remaining,
      paymentCents: monthPayment,
      interestCents: monthInterest,
      cashFlowCents: -monthPayment,
    });
  }

  const free = debts.every((d) => d.outstandingCents <= 0);
  return {
    debtFreeDate: free
      ? `${addMonthKey(now, Math.max(0, month - 1))}-01`
      : null,
    monthsRemaining: month,
    interestSavedCents: 0,
    totalInterestCents: totalInterest,
    totalDebtCents: seed.reduce((s, d) => s + d.outstandingCents, 0),
    months,
  };
}

export function toDebtLike(row: DebtPriority): DebtLike {
  return {
    id: row.id,
    outstandingCents: row.outstandingCents,
    interestRate: Number(row.interestRate) || 0,
    minimumPaymentCents: row.minimumPaymentCents,
    currentPaymentCents: row.currentPaymentCents,
    priorityRank: row.priorityRank,
    status: row.status,
  };
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

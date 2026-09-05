/**
 * Phase 4B portfolio analytics — computed from active gold_purchases + gold_prices.
 *
 * Purchase date: a lot contributes to every Malaysia-calendar observation on/after
 * its purchase_date (YYYY-MM-DD). Observation days use Phase 4A MYT helpers.
 *
 * History V1 uses currently active purchases only projected onto historical PG BUY
 * (not a full delete/restore timeline). Daily chart points use the last observation
 * of each Malaysia day (closing PG BUY); raw `history` keeps intraday samples.
 *
 * Valuation always uses PG BUY, never PG SELL.
 */
import {
  assertValidAnalyticsInput,
  goldAnalyticsHasSufficientHistory,
  goldAnalyticsRangeWindow,
  malaysiaCalendarDateForRow,
  malaysiaCalendarDateFromInstant,
  observationSortMs,
  type GoldPriceHistoryRange,
  type GoldPriceObservation,
} from './gold-price-analytics';
import {
  averageCostPerGramCents,
  formatGramUnits,
  normalizeStoredWeightGrams,
  parseGramsToUnits,
  signedPercentChange,
  sumGramsStrings,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';

export type GoldPurchaseObservation = {
  id: string;
  purchaseDate: string;
  weightGrams: string | number;
  amountPaidCents: number;
  pricePerGramCents: number;
  source: string;
  referenceNumber: string | null;
  createdAt: Date | string;
  isActive: boolean;
};

export type GoldHoldingsSummary = {
  totalGrams: string;
  totalInvestedCents: number;
  averageCostPerGramCents: number;
  purchaseCount: number;
  hasGrams: boolean;
  hasPrice: boolean;
  currentPgBuyCents: number | null;
  currentPgSellCents: number | null;
  currentValueCents: number | null;
  unrealizedPlCents: number | null;
  unrealizedPlPercent: number | null;
  unrealizedExcessCents: number | null;
  priceAsOf: string | null;
};

export type GoldPurchasePerformance = {
  id: string;
  purchaseDate: string;
  weightGrams: string;
  investedCents: number;
  acquisitionPricePerGramCents: number;
  currentValueCents: number | null;
  unrealizedPlCents: number | null;
  unrealizedPlPercent: number | null;
  pgBuyVsAcquisitionCents: number | null;
  source: string;
  referenceNumber: string | null;
};

export type GoldBreakEven = {
  breakEvenPgBuyCents: number;
  currentPgBuyCents: number | null;
  distanceToBreakEvenCents: number | null;
  distanceToBreakEvenPercent: number | null;
  isAboveBreakEven: boolean | null;
};

export type GoldPortfolioHistoryPoint = {
  observedAt: Date;
  malaysiaDate: string;
  priceId: string;
  holdingsGrams: string;
  investedCents: number;
  pgBuyCents: number;
  portfolioValueCents: number;
  unrealizedPlCents: number;
};

export type GoldPortfolioDailyPoint = {
  malaysiaDate: string;
  holdingsGrams: string;
  investedCents: number;
  pgBuyCents: number;
  portfolioValueCents: number;
  unrealizedPlCents: number;
  sampleCount: number;
};

export type GoldGrowthPoint = {
  date: string;
  holdingsGrams: string;
  investedCents: number;
};

export type GoldPortfolioDataQuality = {
  priceSampleCount: number;
  purchaseCount: number;
  firstPortfolioDate: string | null;
  latestPriceAt: Date | null;
  daysWithPriceData: number;
  hasCurrentPrice: boolean;
  hasSufficientHistory: boolean;
  requestedRange: GoldPriceHistoryRange;
  fromDate: string | null;
  toDate: string | null;
  historyNote: string;
};

export type GoldPortfolioAnalyticsResult = {
  summary: GoldHoldingsSummary;
  breakEven: GoldBreakEven | null;
  purchasePerformance: GoldPurchasePerformance[];
  highestReturnPurchase: GoldPurchasePerformance | null;
  lowestReturnPurchase: GoldPurchasePerformance | null;
  history: GoldPortfolioHistoryPoint[];
  daily: GoldPortfolioDailyPoint[];
  holdingsGrowth: GoldGrowthPoint[];
  investedGrowth: GoldGrowthPoint[];
  dataQuality: GoldPortfolioDataQuality;
};

export const PORTFOLIO_HISTORY_NOTE =
  'Portfolio history reflects currently active holdings projected against historical prices.';

type LatestPriceRef = {
  pgBuyPricePerGramCents: number;
  pgSellPricePerGramCents: number;
  priceDate: string;
} | null;

function dateOnly(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function createdMs(value: Date | string): number {
  return new Date(value).getTime();
}

export function activePurchases(
  rows: GoldPurchaseObservation[],
): GoldPurchaseObservation[] {
  return rows.filter((row) => row.isActive);
}

function comparePurchaseNewest(
  a: GoldPurchaseObservation,
  b: GoldPurchaseObservation,
): number {
  const byDate = dateOnly(b.purchaseDate).localeCompare(
    dateOnly(a.purchaseDate),
  );
  if (byDate !== 0) {
    return byDate;
  }
  const byCreated = createdMs(b.createdAt) - createdMs(a.createdAt);
  if (byCreated !== 0) {
    return byCreated;
  }
  return b.id.localeCompare(a.id);
}

function comparePurchaseOldest(
  a: GoldPurchaseObservation,
  b: GoldPurchaseObservation,
): number {
  return -comparePurchaseNewest(a, b);
}

function comparePriceChrono(
  a: GoldPriceObservation,
  b: GoldPriceObservation,
): number {
  const byTime = observationSortMs(a) - observationSortMs(b);
  if (byTime !== 0) {
    return byTime;
  }
  const byCreated = createdMs(a.createdAt) - createdMs(b.createdAt);
  if (byCreated !== 0) {
    return byCreated;
  }
  return a.id.localeCompare(b.id);
}

function holdingsAtDate(
  purchases: GoldPurchaseObservation[],
  malaysiaDate: string,
): { grams: string; investedCents: number } {
  const held = purchases.filter(
    (row) => dateOnly(row.purchaseDate) <= malaysiaDate,
  );
  if (held.length === 0) {
    return { grams: '0.0000', investedCents: 0 };
  }
  return {
    grams: sumGramsStrings(
      held.map((row) => normalizeStoredWeightGrams(row.weightGrams)),
    ),
    investedCents: held.reduce((sum, row) => sum + row.amountPaidCents, 0),
  };
}

/**
 * Shared dashboard + analytics snapshot.
 * Valuation always uses PG BUY. Missing price → null value/P/L (not fake -100%).
 */
export function computeGoldHoldingsSummary(
  purchases: GoldPurchaseObservation[],
  latestPrice: LatestPriceRef,
): GoldHoldingsSummary {
  const active = activePurchases(purchases);
  const totalInvestedCents = active.reduce(
    (sum, row) => sum + row.amountPaidCents,
    0,
  );
  const totalGrams =
    active.length === 0
      ? '0.0000'
      : sumGramsStrings(
          active.map((row) => normalizeStoredWeightGrams(row.weightGrams)),
        );
  const hasGrams = active.length > 0 && totalGrams !== '0.0000';
  const averageCost = hasGrams
    ? averageCostPerGramCents(totalInvestedCents, totalGrams)
    : 0;
  const hasPrice = latestPrice != null;
  let currentValueCents: number | null = null;
  let unrealizedPlCents: number | null = null;
  let unrealizedPlPercent: number | null = null;
  let unrealizedExcessCents: number | null = null;

  if (hasPrice && hasGrams) {
    currentValueCents = valueCentsFromGramsAndUnitPrice(
      totalGrams,
      latestPrice.pgBuyPricePerGramCents,
    );
    unrealizedPlCents = currentValueCents - totalInvestedCents;
    unrealizedPlPercent =
      totalInvestedCents > 0
        ? signedPercentChange(totalInvestedCents, currentValueCents)
        : null;
    unrealizedExcessCents = Math.max(0, unrealizedPlCents);
  }

  return {
    totalGrams,
    totalInvestedCents,
    averageCostPerGramCents: averageCost,
    purchaseCount: active.length,
    hasGrams,
    hasPrice,
    currentPgBuyCents: hasPrice ? latestPrice.pgBuyPricePerGramCents : null,
    currentPgSellCents: hasPrice ? latestPrice.pgSellPricePerGramCents : null,
    currentValueCents,
    unrealizedPlCents,
    unrealizedPlPercent,
    unrealizedExcessCents,
    priceAsOf: hasPrice ? dateOnly(latestPrice.priceDate) : null,
  };
}

export function computeBreakEven(
  summary: GoldHoldingsSummary,
): GoldBreakEven | null {
  if (!summary.hasGrams) {
    return null;
  }
  const breakEvenPgBuyCents = summary.averageCostPerGramCents;
  const current = summary.currentPgBuyCents;
  if (current == null) {
    return {
      breakEvenPgBuyCents,
      currentPgBuyCents: null,
      distanceToBreakEvenCents: null,
      distanceToBreakEvenPercent: null,
      isAboveBreakEven: null,
    };
  }
  return {
    breakEvenPgBuyCents,
    currentPgBuyCents: current,
    distanceToBreakEvenCents: current - breakEvenPgBuyCents,
    distanceToBreakEvenPercent: signedPercentChange(
      breakEvenPgBuyCents,
      current,
    ),
    isAboveBreakEven: current > breakEvenPgBuyCents,
  };
}

export function computePurchasePerformance(
  purchases: GoldPurchaseObservation[],
  latestPgBuy: number | null,
): GoldPurchasePerformance[] {
  return activePurchases(purchases)
    .slice()
    .sort(comparePurchaseNewest)
    .map((row) => {
      const weightGrams = normalizeStoredWeightGrams(row.weightGrams);
      let currentValueCents: number | null = null;
      let unrealizedPlCents: number | null = null;
      let unrealizedPlPercent: number | null = null;
      let pgBuyVsAcquisitionCents: number | null = null;
      if (latestPgBuy != null) {
        currentValueCents = valueCentsFromGramsAndUnitPrice(
          weightGrams,
          latestPgBuy,
        );
        unrealizedPlCents = currentValueCents - row.amountPaidCents;
        unrealizedPlPercent = signedPercentChange(
          row.amountPaidCents,
          currentValueCents,
        );
        pgBuyVsAcquisitionCents = latestPgBuy - row.pricePerGramCents;
      }
      return {
        id: row.id,
        purchaseDate: dateOnly(row.purchaseDate),
        weightGrams,
        investedCents: row.amountPaidCents,
        acquisitionPricePerGramCents: row.pricePerGramCents,
        currentValueCents,
        unrealizedPlCents,
        unrealizedPlPercent,
        pgBuyVsAcquisitionCents,
        source: row.source,
        referenceNumber: row.referenceNumber,
      };
    });
}

function compareReturn(
  a: GoldPurchasePerformance,
  b: GoldPurchasePerformance,
): number {
  const aPct = a.unrealizedPlPercent;
  const bPct = b.unrealizedPlPercent;
  if (aPct == null && bPct == null) {
    return 0;
  }
  if (aPct == null) {
    return 1;
  }
  if (bPct == null) {
    return -1;
  }
  if (aPct !== bPct) {
    return bPct - aPct;
  }
  const byDate = a.purchaseDate.localeCompare(b.purchaseDate);
  if (byDate !== 0) {
    return byDate;
  }
  return a.id.localeCompare(b.id);
}

export function pickHighestAndLowestReturn(rows: GoldPurchasePerformance[]): {
  highest: GoldPurchasePerformance | null;
  lowest: GoldPurchasePerformance | null;
} {
  const ranked = rows.filter(
    (row) => row.investedCents > 0 && row.unrealizedPlPercent != null,
  );
  if (ranked.length === 0) {
    return { highest: null, lowest: null };
  }
  const sorted = [...ranked].sort(compareReturn);
  return {
    highest: sorted[0],
    lowest: sorted[sorted.length - 1],
  };
}

function inDateRange(
  day: string,
  fromDate: string | null,
  toDate: string | null,
): boolean {
  if (fromDate && day < fromDate) {
    return false;
  }
  if (toDate && day > toDate) {
    return false;
  }
  return true;
}

function valueAtPrice(
  grams: string,
  investedCents: number,
  pgBuyCents: number,
): { portfolioValueCents: number; unrealizedPlCents: number } {
  if (grams === '0.0000') {
    return { portfolioValueCents: 0, unrealizedPlCents: -investedCents };
  }
  const portfolioValueCents = valueCentsFromGramsAndUnitPrice(
    grams,
    pgBuyCents,
  );
  return {
    portfolioValueCents,
    unrealizedPlCents: portfolioValueCents - investedCents,
  };
}

export function computeGoldPortfolioAnalytics(
  purchases: GoldPurchaseObservation[],
  prices: GoldPriceObservation[],
  input: {
    range: GoldPriceHistoryRange;
    from?: string;
    to?: string;
    now?: Date;
    todayPriceDate?: string;
    latestPrice?: LatestPriceRef;
  },
): GoldPortfolioAnalyticsResult {
  const now = input.now ?? new Date();
  const todayMyt = malaysiaCalendarDateFromInstant(now);
  const range = input.range;
  const { fromDate, toDate } = goldAnalyticsRangeWindow(
    range,
    todayMyt,
    input.from,
    input.to,
  );

  const active = activePurchases(purchases);
  const summary = computeGoldHoldingsSummary(active, input.latestPrice ?? null);
  const breakEven = computeBreakEven(summary);
  const purchasePerformance = computePurchasePerformance(
    active,
    summary.currentPgBuyCents,
  );
  const { highest, lowest } = pickHighestAndLowestReturn(purchasePerformance);

  const firstPurchaseDate =
    active.length === 0
      ? null
      : [...active].sort(comparePurchaseOldest)[0].purchaseDate;

  const chronoPrices = [...prices].sort(comparePriceChrono);
  const rawHistory: GoldPortfolioHistoryPoint[] = [];
  for (const price of chronoPrices) {
    const malaysiaDate = malaysiaCalendarDateForRow(price);
    if (firstPurchaseDate && malaysiaDate < dateOnly(firstPurchaseDate)) {
      continue;
    }
    const held = holdingsAtDate(active, malaysiaDate);
    if (held.grams === '0.0000') {
      continue;
    }
    const valued = valueAtPrice(
      held.grams,
      held.investedCents,
      price.pgBuyPricePerGramCents,
    );
    rawHistory.push({
      observedAt: new Date(observationSortMs(price)),
      malaysiaDate,
      priceId: price.id,
      holdingsGrams: held.grams,
      investedCents: held.investedCents,
      pgBuyCents: price.pgBuyPricePerGramCents,
      portfolioValueCents: valued.portfolioValueCents,
      unrealizedPlCents: valued.unrealizedPlCents,
    });
  }

  const history = rawHistory.filter((point) =>
    inDateRange(point.malaysiaDate, fromDate, toDate),
  );

  const byDay = new Map<string, GoldPortfolioHistoryPoint[]>();
  for (const point of history) {
    const list = byDay.get(point.malaysiaDate) ?? [];
    list.push(point);
    byDay.set(point.malaysiaDate, list);
  }
  const daily: GoldPortfolioDailyPoint[] = [...byDay.keys()]
    .sort()
    .map((day) => {
      const list = byDay.get(day) ?? [];
      const closing = list[list.length - 1];
      return {
        malaysiaDate: day,
        holdingsGrams: closing.holdingsGrams,
        investedCents: closing.investedCents,
        pgBuyCents: closing.pgBuyCents,
        portfolioValueCents: closing.portfolioValueCents,
        unrealizedPlCents: closing.unrealizedPlCents,
        sampleCount: list.length,
      };
    });

  const growthAll: GoldGrowthPoint[] = [];
  const oldestFirst = [...active].sort(comparePurchaseOldest);
  let runningGrams = 0n;
  let runningInvested = 0;
  for (const row of oldestFirst) {
    runningGrams += parseGramsToUnits(
      normalizeStoredWeightGrams(row.weightGrams),
    );
    runningInvested += row.amountPaidCents;
    const date = dateOnly(row.purchaseDate);
    const last = growthAll[growthAll.length - 1];
    if (last && last.date === date) {
      last.holdingsGrams = formatGramUnits(runningGrams);
      last.investedCents = runningInvested;
    } else {
      growthAll.push({
        date,
        holdingsGrams: formatGramUnits(runningGrams),
        investedCents: runningInvested,
      });
    }
  }

  let holdingsGrowth = growthAll.filter((point) =>
    inDateRange(point.date, fromDate, toDate),
  );
  if (holdingsGrowth.length === 0 && growthAll.length > 0 && fromDate) {
    const prior = [...growthAll]
      .reverse()
      .find((point) => point.date < fromDate);
    if (prior) {
      holdingsGrowth = [{ ...prior, date: fromDate }];
    }
  }
  const investedGrowth = holdingsGrowth.map((point) => ({ ...point }));

  return {
    summary,
    breakEven,
    purchasePerformance,
    highestReturnPurchase: highest,
    lowestReturnPurchase: lowest,
    history,
    daily,
    holdingsGrowth,
    investedGrowth,
    dataQuality: {
      priceSampleCount: history.length,
      purchaseCount: active.length,
      firstPortfolioDate: firstPurchaseDate
        ? dateOnly(firstPurchaseDate)
        : null,
      latestPriceAt: history[history.length - 1]?.observedAt ?? null,
      daysWithPriceData: daily.length,
      hasCurrentPrice: summary.hasPrice,
      hasSufficientHistory: goldAnalyticsHasSufficientHistory(
        range,
        history.length,
        daily.length,
      ),
      requestedRange: range,
      fromDate,
      toDate,
      historyNote: PORTFOLIO_HISTORY_NOTE,
    },
  };
}

export function assertValidPortfolioAnalyticsInput(input: {
  range: string;
  from?: string;
  to?: string;
}): GoldPriceHistoryRange {
  return assertValidAnalyticsInput(input);
}

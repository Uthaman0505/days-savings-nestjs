import { toPublicGoldSourceMinuteKey } from './extraction/public-gold-price-screenshot.parser';
import {
  averageIntsHalfUp,
  ratioPercent,
  signedPercentChange,
} from './gold-math';

export const GOLD_PRICE_HISTORY_RANGES = [
  'D7',
  'D30',
  'D90',
  'ALL',
  'CUSTOM',
] as const;

export type GoldPriceHistoryRange = (typeof GOLD_PRICE_HISTORY_RANGES)[number];

export type GoldPriceObservation = {
  id: string;
  priceDate: string;
  capturedPriceAt: Date | string | null;
  createdAt: Date | string;
  pgBuyPricePerGramCents: number;
  pgSellPricePerGramCents: number;
  source: string;
};

export type GoldPriceAnalyticsInput = {
  range: GoldPriceHistoryRange;
  from?: string;
  to?: string;
  now?: Date;
  /** Same calendar cutoff as `latestGoldPrice` / `findLatestPriceEntity`. */
  todayPriceDate?: string;
};

export type GoldPriceHistoryPoint = {
  id: string;
  priceDate: string;
  capturedPriceAt: Date | null;
  observedAt: Date;
  malaysiaDate: string;
  pgBuyPricePerGramCents: number;
  pgSellPricePerGramCents: number;
  spreadCents: number;
  spreadPercent: number | null;
  source: string;
};

export type GoldPriceChange = {
  fromCents: number;
  toCents: number;
  changeCents: number;
  changePercent: number | null;
};

export type GoldPriceExtremum = {
  priceCents: number;
  observedAt: Date;
  priceId: string;
};

export type GoldPriceSideStats = {
  startCents: number;
  latestCents: number;
  change: GoldPriceChange | null;
  high: GoldPriceExtremum;
  low: GoldPriceExtremum;
  averageCents: number;
};

export type GoldPriceDailyBar = {
  malaysiaDate: string;
  openingPgBuyCents: number;
  closingPgBuyCents: number;
  highPgBuyCents: number;
  lowPgBuyCents: number;
  openingPgSellCents: number;
  closingPgSellCents: number;
  highPgSellCents: number;
  lowPgSellCents: number;
  sampleCount: number;
};

export type GoldPriceDataQuality = {
  sampleCount: number;
  firstSampleAt: Date | null;
  latestSampleAt: Date | null;
  daysWithData: number;
  requestedRange: GoldPriceHistoryRange;
  fromDate: string | null;
  toDate: string | null;
  hasSufficientHistory: boolean;
};

export type GoldPriceAnalyticsResult = {
  latest: GoldPriceHistoryPoint | null;
  previous: GoldPriceHistoryPoint | null;
  spreadCents: number | null;
  spreadPercent: number | null;
  vsPreviousBuy: GoldPriceChange | null;
  vsPreviousSell: GoldPriceChange | null;
  pgBuy: GoldPriceSideStats | null;
  pgSell: GoldPriceSideStats | null;
  averageSpreadCents: number | null;
  dataQuality: GoldPriceDataQuality;
  history: GoldPriceHistoryPoint[];
  daily: GoldPriceDailyBar[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isGoldPriceHistoryRange(
  value: string,
): value is GoldPriceHistoryRange {
  return (GOLD_PRICE_HISTORY_RANGES as readonly string[]).includes(value);
}

export function malaysiaCalendarDateFromInstant(value: Date | string): string {
  const key = toPublicGoldSourceMinuteKey(value);
  if (!key) {
    throw new Error('INVALID_TIMESTAMP');
  }
  return key.slice(0, 10);
}

export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Sort instant aligned with latestGoldPrice:
 * COALESCE(captured_price_at, CAST(price_date AS timestamptz)) — midnight UTC.
 */
export function observationSortMs(row: GoldPriceObservation): number {
  if (row.capturedPriceAt) {
    return new Date(row.capturedPriceAt).getTime();
  }
  return Date.parse(`${String(row.priceDate).slice(0, 10)}T00:00:00.000Z`);
}

export function observationCreatedMs(row: GoldPriceObservation): number {
  return new Date(row.createdAt).getTime();
}

export function malaysiaCalendarDateForRow(row: GoldPriceObservation): string {
  if (row.capturedPriceAt) {
    return malaysiaCalendarDateFromInstant(row.capturedPriceAt);
  }
  return String(row.priceDate).slice(0, 10);
}

function compareChrono(
  a: GoldPriceObservation,
  b: GoldPriceObservation,
): number {
  const byTime = observationSortMs(a) - observationSortMs(b);
  if (byTime !== 0) {
    return byTime;
  }
  const byCreated = observationCreatedMs(a) - observationCreatedMs(b);
  if (byCreated !== 0) {
    return byCreated;
  }
  return a.id.localeCompare(b.id);
}

function compareLatest(
  a: GoldPriceObservation,
  b: GoldPriceObservation,
): number {
  return compareChrono(b, a);
}

function toPoint(row: GoldPriceObservation): GoldPriceHistoryPoint {
  const capturedPriceAt = row.capturedPriceAt
    ? new Date(row.capturedPriceAt)
    : null;
  const observedAt = new Date(observationSortMs(row));
  const spreadCents = row.pgSellPricePerGramCents - row.pgBuyPricePerGramCents;
  return {
    id: row.id,
    priceDate: String(row.priceDate).slice(0, 10),
    capturedPriceAt,
    observedAt,
    malaysiaDate: malaysiaCalendarDateForRow(row),
    pgBuyPricePerGramCents: row.pgBuyPricePerGramCents,
    pgSellPricePerGramCents: row.pgSellPricePerGramCents,
    spreadCents,
    spreadPercent: ratioPercent(spreadCents, row.pgSellPricePerGramCents),
    source: row.source,
  };
}

function toChange(fromCents: number, toCents: number): GoldPriceChange {
  return {
    fromCents,
    toCents,
    changeCents: toCents - fromCents,
    changePercent: signedPercentChange(fromCents, toCents),
  };
}

export function goldAnalyticsRangeWindow(
  range: GoldPriceHistoryRange,
  todayMyt: string,
  from?: string,
  to?: string,
): { fromDate: string | null; toDate: string | null } {
  if (range === 'ALL') {
    return { fromDate: null, toDate: null };
  }
  if (range === 'CUSTOM') {
    return { fromDate: from ?? null, toDate: to ?? null };
  }
  const lookback = range === 'D7' ? 6 : range === 'D30' ? 29 : 89;
  return {
    fromDate: addCalendarDays(todayMyt, -lookback),
    toDate: todayMyt,
  };
}

export function goldAnalyticsHasSufficientHistory(
  range: GoldPriceHistoryRange,
  sampleCount: number,
  daysWithData: number,
): boolean {
  if (sampleCount < 2) {
    return false;
  }
  if (range === 'D30' && daysWithData < 8) {
    return false;
  }
  if (range === 'D90' && daysWithData < 15) {
    return false;
  }
  return true;
}

function emptyQuality(
  range: GoldPriceHistoryRange,
  fromDate: string | null,
  toDate: string | null,
): GoldPriceDataQuality {
  return {
    sampleCount: 0,
    firstSampleAt: null,
    latestSampleAt: null,
    daysWithData: 0,
    requestedRange: range,
    fromDate,
    toDate,
    hasSufficientHistory: false,
  };
}

function sideStats(rows: GoldPriceObservation[]): GoldPriceSideStats | null {
  if (rows.length === 0) {
    return null;
  }
  const chrono = [...rows].sort(compareChrono);
  const start = chrono[0];
  const latest = chrono[chrono.length - 1];

  let high = chrono[0];
  let low = chrono[0];
  const buyValues: number[] = [];
  for (const row of chrono) {
    buyValues.push(row.pgBuyPricePerGramCents);
    if (row.pgBuyPricePerGramCents > high.pgBuyPricePerGramCents) {
      high = row;
    } else if (
      row.pgBuyPricePerGramCents === high.pgBuyPricePerGramCents &&
      compareChrono(row, high) < 0
    ) {
      high = row;
    }
    if (row.pgBuyPricePerGramCents < low.pgBuyPricePerGramCents) {
      low = row;
    } else if (
      row.pgBuyPricePerGramCents === low.pgBuyPricePerGramCents &&
      compareChrono(row, low) < 0
    ) {
      low = row;
    }
  }

  return {
    startCents: start.pgBuyPricePerGramCents,
    latestCents: latest.pgBuyPricePerGramCents,
    change:
      chrono.length >= 2
        ? toChange(start.pgBuyPricePerGramCents, latest.pgBuyPricePerGramCents)
        : null,
    high: {
      priceCents: high.pgBuyPricePerGramCents,
      observedAt: new Date(observationSortMs(high)),
      priceId: high.id,
    },
    low: {
      priceCents: low.pgBuyPricePerGramCents,
      observedAt: new Date(observationSortMs(low)),
      priceId: low.id,
    },
    averageCents: averageIntsHalfUp(buyValues) as number,
  };
}

function sellStats(rows: GoldPriceObservation[]): GoldPriceSideStats | null {
  if (rows.length === 0) {
    return null;
  }
  const chrono = [...rows].sort(compareChrono);
  const start = chrono[0];
  const latest = chrono[chrono.length - 1];

  let high = chrono[0];
  let low = chrono[0];
  const sellValues: number[] = [];
  for (const row of chrono) {
    sellValues.push(row.pgSellPricePerGramCents);
    if (row.pgSellPricePerGramCents > high.pgSellPricePerGramCents) {
      high = row;
    } else if (
      row.pgSellPricePerGramCents === high.pgSellPricePerGramCents &&
      compareChrono(row, high) < 0
    ) {
      high = row;
    }
    if (row.pgSellPricePerGramCents < low.pgSellPricePerGramCents) {
      low = row;
    } else if (
      row.pgSellPricePerGramCents === low.pgSellPricePerGramCents &&
      compareChrono(row, low) < 0
    ) {
      low = row;
    }
  }

  return {
    startCents: start.pgSellPricePerGramCents,
    latestCents: latest.pgSellPricePerGramCents,
    change:
      chrono.length >= 2
        ? toChange(
            start.pgSellPricePerGramCents,
            latest.pgSellPricePerGramCents,
          )
        : null,
    high: {
      priceCents: high.pgSellPricePerGramCents,
      observedAt: new Date(observationSortMs(high)),
      priceId: high.id,
    },
    low: {
      priceCents: low.pgSellPricePerGramCents,
      observedAt: new Date(observationSortMs(low)),
      priceId: low.id,
    },
    averageCents: averageIntsHalfUp(sellValues) as number,
  };
}

function dailyBars(rows: GoldPriceObservation[]): GoldPriceDailyBar[] {
  const chrono = [...rows].sort(compareChrono);
  const byDay = new Map<string, GoldPriceObservation[]>();
  for (const row of chrono) {
    const day = malaysiaCalendarDateForRow(row);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort();
  return days.map((malaysiaDate) => {
    const list = byDay.get(malaysiaDate) ?? [];
    const opening = list[0];
    const closing = list[list.length - 1];
    let highBuy = opening.pgBuyPricePerGramCents;
    let lowBuy = opening.pgBuyPricePerGramCents;
    let highSell = opening.pgSellPricePerGramCents;
    let lowSell = opening.pgSellPricePerGramCents;
    for (const row of list) {
      highBuy = Math.max(highBuy, row.pgBuyPricePerGramCents);
      lowBuy = Math.min(lowBuy, row.pgBuyPricePerGramCents);
      highSell = Math.max(highSell, row.pgSellPricePerGramCents);
      lowSell = Math.min(lowSell, row.pgSellPricePerGramCents);
    }
    return {
      malaysiaDate,
      openingPgBuyCents: opening.pgBuyPricePerGramCents,
      closingPgBuyCents: closing.pgBuyPricePerGramCents,
      highPgBuyCents: highBuy,
      lowPgBuyCents: lowBuy,
      openingPgSellCents: opening.pgSellPricePerGramCents,
      closingPgSellCents: closing.pgSellPricePerGramCents,
      highPgSellCents: highSell,
      lowPgSellCents: lowSell,
      sampleCount: list.length,
    };
  });
}

export function computeGoldPriceAnalytics(
  rows: GoldPriceObservation[],
  input: GoldPriceAnalyticsInput,
): GoldPriceAnalyticsResult {
  const now = input.now ?? new Date();
  const todayMyt = malaysiaCalendarDateFromInstant(now);
  const todayPriceDate = input.todayPriceDate ?? todayMyt;
  const range = input.range;
  const { fromDate, toDate } = goldAnalyticsRangeWindow(
    range,
    todayMyt,
    input.from,
    input.to,
  );

  const eligibleLatest = rows
    .filter((row) => String(row.priceDate).slice(0, 10) <= todayPriceDate)
    .sort(compareLatest);
  const latestRow = eligibleLatest[0] ?? null;
  const previousRow = eligibleLatest[1] ?? null;
  const latest = latestRow ? toPoint(latestRow) : null;
  const previous = previousRow ? toPoint(previousRow) : null;

  const inRange = [...rows]
    .filter((row) => {
      const day = malaysiaCalendarDateForRow(row);
      if (fromDate && day < fromDate) {
        return false;
      }
      if (toDate && day > toDate) {
        return false;
      }
      return true;
    })
    .sort(compareChrono);

  const history = inRange.map(toPoint);
  const quality: GoldPriceDataQuality = {
    sampleCount: inRange.length,
    firstSampleAt: history[0]?.observedAt ?? null,
    latestSampleAt: history[history.length - 1]?.observedAt ?? null,
    daysWithData: new Set(history.map((row) => row.malaysiaDate)).size,
    requestedRange: range,
    fromDate,
    toDate,
    hasSufficientHistory: false,
  };
  quality.hasSufficientHistory = goldAnalyticsHasSufficientHistory(
    range,
    quality.sampleCount,
    quality.daysWithData,
  );

  if (inRange.length === 0) {
    return {
      latest,
      previous,
      spreadCents: latest?.spreadCents ?? null,
      spreadPercent: latest?.spreadPercent ?? null,
      vsPreviousBuy:
        latest && previous
          ? toChange(
              previous.pgBuyPricePerGramCents,
              latest.pgBuyPricePerGramCents,
            )
          : null,
      vsPreviousSell:
        latest && previous
          ? toChange(
              previous.pgSellPricePerGramCents,
              latest.pgSellPricePerGramCents,
            )
          : null,
      pgBuy: null,
      pgSell: null,
      averageSpreadCents: null,
      dataQuality: emptyQuality(range, fromDate, toDate),
      history: [],
      daily: [],
    };
  }

  return {
    latest,
    previous,
    spreadCents: latest?.spreadCents ?? null,
    spreadPercent: latest?.spreadPercent ?? null,
    vsPreviousBuy:
      latest && previous
        ? toChange(
            previous.pgBuyPricePerGramCents,
            latest.pgBuyPricePerGramCents,
          )
        : null,
    vsPreviousSell:
      latest && previous
        ? toChange(
            previous.pgSellPricePerGramCents,
            latest.pgSellPricePerGramCents,
          )
        : null,
    pgBuy: sideStats(inRange),
    pgSell: sellStats(inRange),
    averageSpreadCents: averageIntsHalfUp(
      inRange.map(
        (row) => row.pgSellPricePerGramCents - row.pgBuyPricePerGramCents,
      ),
    ),
    dataQuality: quality,
    history,
    daily: dailyBars(inRange),
  };
}

export function assertValidAnalyticsInput(input: {
  range: string;
  from?: string;
  to?: string;
}): GoldPriceHistoryRange {
  if (!isGoldPriceHistoryRange(input.range)) {
    throw new Error('INVALID_RANGE');
  }
  if (input.range === 'CUSTOM') {
    if (
      !input.from ||
      !input.to ||
      !DATE_RE.test(input.from) ||
      !DATE_RE.test(input.to)
    ) {
      throw new Error('INVALID_CUSTOM_RANGE');
    }
    if (input.from > input.to) {
      throw new Error('INVALID_CUSTOM_RANGE');
    }
  }
  return input.range;
}

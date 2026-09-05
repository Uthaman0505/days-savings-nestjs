import type {
  GoldPriceAnalyticsResult,
  GoldPriceHistoryPoint,
  GoldPriceHistoryRange,
  GoldPriceSideStats,
} from '../gold-price-analytics';
import {
  PORTFOLIO_HISTORY_NOTE,
  type GoldPortfolioAnalyticsResult,
  type GoldPurchasePerformance,
} from '../gold-portfolio-analytics';
import {
  formatChangeLine,
  formatReportDate,
  formatReportDateTime,
  formatReportGrams,
  formatReportMoney,
  formatReportPerGram,
  formatReportPercent,
  goldSnapshotFileName,
  goldStrategyFileName,
} from './gold-report-format';
import {
  LIMITED_PRICE_HISTORY,
  NO_ACTIVE_HOLDINGS,
  NO_PRICE_HISTORY,
  PG_BUY_LABEL,
  PG_SELL_LABEL,
  PORTFOLIO_HISTORY_ASSUMPTION,
  PRICE_ANALYTICS_ASSUMPTION,
  SNAPSHOT_IMPORTANT_NOTE,
  STRATEGY_PRICE_HISTORY_LIMIT,
  VALUATION_UNAVAILABLE,
  type GoldSnapshotReportData,
  type GoldStrategyReportData,
  type ReportKv,
  type ReportLineChart,
  type ReportPeriodStats,
  type ReportPriceRow,
  type ReportPurchaseRow,
} from './gold-report.types';

function kv(label: string, value: string): ReportKv {
  return { label, value };
}

function performanceCallout(
  row: GoldPurchasePerformance | null,
): ReportKv[] | null {
  if (!row) {
    return null;
  }
  return [
    kv('Date', formatReportDate(row.purchaseDate)),
    kv('Weight', formatReportGrams(row.weightGrams)),
    kv('Invested', formatReportMoney(row.investedCents)),
    kv('Current value', formatReportMoney(row.currentValueCents)),
    kv(
      'Unrealized P/L',
      `${formatReportMoney(row.unrealizedPlCents, { signed: true })}  ${formatReportPercent(row.unrealizedPlPercent)}`,
    ),
    kv('Source', row.source),
  ];
}

function compactDateLabel(ymd: string): string {
  return formatReportDate(ymd).replace(/ \d{4}$/, '');
}

function currentPortfolioRows(
  portfolio: GoldPortfolioAnalyticsResult,
): ReportKv[] {
  const summary = portfolio.summary;
  const rows: ReportKv[] = [
    kv('Total Gold', formatReportGrams(summary.totalGrams)),
    kv('Active purchases', String(summary.purchaseCount)),
    kv('Invested capital', formatReportMoney(summary.totalInvestedCents)),
    kv(
      'Weighted average cost/g',
      summary.hasGrams
        ? formatReportPerGram(summary.averageCostPerGramCents)
        : 'Unavailable',
    ),
  ];
  if (!summary.hasGrams) {
    rows.push(kv('Status', NO_ACTIVE_HOLDINGS));
    return rows;
  }
  if (!summary.hasPrice) {
    rows.push(kv('Current value', VALUATION_UNAVAILABLE));
    rows.push(kv('Unrealized P/L', 'Unavailable'));
    return rows;
  }
  rows.push(
    kv('Current PG BUY', formatReportPerGram(summary.currentPgBuyCents)),
  );
  rows.push(
    kv('Current PG SELL', formatReportPerGram(summary.currentPgSellCents)),
  );
  rows.push(
    kv('Current portfolio value', formatReportMoney(summary.currentValueCents)),
  );
  rows.push(
    kv(
      'Unrealized P/L',
      `${formatReportMoney(summary.unrealizedPlCents, { signed: true })}  ${formatReportPercent(summary.unrealizedPlPercent)}`,
    ),
  );
  rows.push(
    kv(
      'Break-even PG BUY',
      formatReportPerGram(portfolio.breakEven?.breakEvenPgBuyCents ?? null),
    ),
  );
  return rows;
}

function currentPriceRows(price: GoldPriceAnalyticsResult): ReportKv[] {
  const latest = price.latest;
  if (!latest) {
    return [kv('Status', 'Current valuation unavailable.')];
  }
  return [
    kv(PG_BUY_LABEL, formatReportPerGram(latest.pgBuyPricePerGramCents)),
    kv(PG_SELL_LABEL, formatReportPerGram(latest.pgSellPricePerGramCents)),
    kv('Spread', formatReportPerGram(latest.spreadCents)),
    kv('Spread %', formatReportPercent(latest.spreadPercent)),
    kv('Source', latest.source),
    kv(
      'Latest Public Gold source timestamp',
      formatReportDateTime(latest.observedAt),
    ),
  ];
}

function extremum(
  side: GoldPriceSideStats | null,
  kind: 'high' | 'low',
): string {
  if (!side) {
    return 'Unavailable';
  }
  const point = kind === 'high' ? side.high : side.low;
  return `${formatReportPerGram(point.priceCents)} (${formatReportDateTime(point.observedAt)})`;
}

function priceAnalyticsRows(price: GoldPriceAnalyticsResult): ReportKv[] {
  if (!price.latest) {
    return [kv('Status', NO_PRICE_HISTORY)];
  }
  return [
    kv(
      '7D PG BUY change',
      formatChangeLine(price.pgBuy?.change ?? price.vsPreviousBuy),
    ),
    kv(
      '7D PG SELL change',
      formatChangeLine(price.pgSell?.change ?? price.vsPreviousSell),
    ),
    kv('PG BUY high', extremum(price.pgBuy, 'high')),
    kv('PG BUY low', extremum(price.pgBuy, 'low')),
    kv(
      'Average PG BUY',
      formatReportPerGram(price.pgBuy?.averageCents ?? null),
    ),
    kv('PG SELL high', extremum(price.pgSell, 'high')),
    kv('PG SELL low', extremum(price.pgSell, 'low')),
    kv(
      'Average PG SELL',
      formatReportPerGram(price.pgSell?.averageCents ?? null),
    ),
    kv('Sample count', String(price.dataQuality.sampleCount)),
    kv(
      'Available history',
      price.dataQuality.firstSampleAt && price.dataQuality.latestSampleAt
        ? `${formatReportDateTime(price.dataQuality.firstSampleAt)} to ${formatReportDateTime(price.dataQuality.latestSampleAt)}`
        : 'Unavailable',
    ),
  ];
}

function toPeriodStats(
  range: GoldPriceHistoryRange,
  price: GoldPriceAnalyticsResult,
): ReportPeriodStats {
  return {
    range,
    sampleCount: price.dataQuality.sampleCount,
    daysWithData: price.dataQuality.daysWithData,
    fromDate: price.dataQuality.fromDate,
    toDate: price.dataQuality.toDate,
    buyChange: formatChangeLine(price.pgBuy?.change ?? price.vsPreviousBuy),
    sellChange: formatChangeLine(price.pgSell?.change ?? price.vsPreviousSell),
    buyHigh: extremum(price.pgBuy, 'high'),
    buyLow: extremum(price.pgBuy, 'low'),
    buyAverage: formatReportPerGram(price.pgBuy?.averageCents ?? null),
    sellHigh: extremum(price.pgSell, 'high'),
    sellLow: extremum(price.pgSell, 'low'),
    sellAverage: formatReportPerGram(price.pgSell?.averageCents ?? null),
    hasSufficientHistory: price.dataQuality.hasSufficientHistory,
  };
}

function overlapNote(all: GoldPriceAnalyticsResult): string | null {
  const days = all.dataQuality.daysWithData;
  if (days <= 0) {
    return null;
  }
  if (days <= 7) {
    return `Only ${days} day${days === 1 ? '' : 's'} of captured price history are currently available; longer-period analytics therefore use the same available observations.`;
  }
  return null;
}

function priceTrendChart(
  price: GoldPriceAnalyticsResult,
): ReportLineChart | null {
  if (price.daily.length < 2) {
    return null;
  }
  return {
    title: 'PG BUY / PG SELL trend (daily closing)',
    xLabels: price.daily.map((row) => compactDateLabel(row.malaysiaDate)),
    series: [
      {
        name: 'PG BUY',
        values: price.daily.map((row) => row.closingPgBuyCents / 100),
      },
      {
        name: 'PG SELL',
        values: price.daily.map((row) => row.closingPgSellCents / 100),
      },
    ],
    yKind: 'money',
  };
}

function portfolioValueChart(
  portfolio: GoldPortfolioAnalyticsResult,
): ReportLineChart | null {
  if (portfolio.daily.length < 2) {
    return null;
  }
  return {
    title: 'Invested capital vs portfolio value',
    xLabels: portfolio.daily.map((row) => compactDateLabel(row.malaysiaDate)),
    series: [
      {
        name: 'Invested capital',
        values: portfolio.daily.map((row) => row.investedCents / 100),
      },
      {
        name: 'Portfolio value',
        values: portfolio.daily.map((row) => row.portfolioValueCents / 100),
      },
    ],
    yKind: 'money',
  };
}

function holdingsChart(
  portfolio: GoldPortfolioAnalyticsResult,
): ReportLineChart | null {
  if (portfolio.holdingsGrowth.length < 2) {
    return null;
  }
  return {
    title: 'Holdings growth',
    xLabels: portfolio.holdingsGrowth.map((row) => compactDateLabel(row.date)),
    series: [
      {
        name: 'Gold grams',
        values: portfolio.holdingsGrowth.map((row) =>
          Number(row.holdingsGrams),
        ),
      },
    ],
    yKind: 'grams',
  };
}

function purchaseRows(rows: GoldPurchasePerformance[]): ReportPurchaseRow[] {
  return rows.map((row) => ({
    purchaseDate: formatReportDate(row.purchaseDate),
    weightGrams: formatReportGrams(row.weightGrams),
    invested: formatReportMoney(row.investedCents),
    buyPricePerGram: formatReportPerGram(row.acquisitionPricePerGramCents),
    currentValue: formatReportMoney(row.currentValueCents),
    plRm: formatReportMoney(row.unrealizedPlCents, { signed: true }),
    plPercent: formatReportPercent(row.unrealizedPlPercent),
    source: row.source,
    referenceNumber: row.referenceNumber,
  }));
}

function priceHistoryRows(history: GoldPriceHistoryPoint[]): {
  rows: ReportPriceRow[];
  truncationNote: string | null;
} {
  const newestFirst = [...history].reverse();
  const truncated = newestFirst.length > STRATEGY_PRICE_HISTORY_LIMIT;
  const sliced = truncated
    ? newestFirst.slice(0, STRATEGY_PRICE_HISTORY_LIMIT)
    : newestFirst;
  return {
    rows: sliced.map((row) => ({
      when: formatReportDateTime(row.observedAt),
      pgSell: formatReportPerGram(row.pgSellPricePerGramCents),
      pgBuy: formatReportPerGram(row.pgBuyPricePerGramCents),
      spread: formatReportPerGram(row.spreadCents),
      source: row.source,
    })),
    truncationNote: truncated
      ? `Showing the most recent ${STRATEGY_PRICE_HISTORY_LIMIT} of ${history.length} confirmed observations.`
      : null,
  };
}

export function buildGoldSnapshotReportData(input: {
  generatedAt: Date;
  portfolio: GoldPortfolioAnalyticsResult;
  priceD7: GoldPriceAnalyticsResult;
}): GoldSnapshotReportData {
  const { generatedAt, portfolio, priceD7 } = input;
  const summary = portfolio.summary;
  const limited =
    !priceD7.dataQuality.hasSufficientHistory ||
    priceD7.dataQuality.sampleCount < 2
      ? LIMITED_PRICE_HISTORY
      : null;

  return {
    kind: 'SNAPSHOT',
    title: 'Gold Investment Snapshot',
    filename: goldSnapshotFileName(generatedAt),
    generatedAtLabel: formatReportDateTime(generatedAt),
    portfolioAsOfLabel: generatedAtLabelSafe(generatedAt),
    latestPriceAtLabel: priceD7.latest
      ? formatReportDateTime(priceD7.latest.observedAt)
      : 'Unavailable',
    hasHoldings: summary.hasGrams,
    hasCurrentPrice: summary.hasPrice,
    currentPortfolio: currentPortfolioRows(portfolio),
    currentPrice: currentPriceRows(priceD7),
    priceAnalytics: priceAnalyticsRows(priceD7),
    priceAnalyticsNote: limited,
    portfolioAnalytics: [
      kv(
        'Highest return purchase',
        portfolio.highestReturnPurchase
          ? `${formatReportDate(portfolio.highestReturnPurchase.purchaseDate)}  ${formatReportPercent(portfolio.highestReturnPurchase.unrealizedPlPercent)}`
          : 'Unavailable',
      ),
      kv(
        'Lowest return purchase',
        portfolio.lowestReturnPurchase
          ? `${formatReportDate(portfolio.lowestReturnPurchase.purchaseDate)}  ${formatReportPercent(portfolio.lowestReturnPurchase.unrealizedPlPercent)}`
          : 'Unavailable',
      ),
      kv('Total holdings', formatReportGrams(summary.totalGrams)),
      kv('Invested capital', formatReportMoney(summary.totalInvestedCents)),
      kv(
        'Current value',
        summary.hasPrice
          ? formatReportMoney(summary.currentValueCents)
          : VALUATION_UNAVAILABLE,
      ),
      kv(
        'Current P/L',
        summary.hasPrice
          ? `${formatReportMoney(summary.unrealizedPlCents, { signed: true })}  ${formatReportPercent(summary.unrealizedPlPercent)}`
          : 'Unavailable',
      ),
    ],
    importantNote: SNAPSHOT_IMPORTANT_NOTE,
    pgBuyCents: summary.currentPgBuyCents,
    pgSellCents: summary.currentPgSellCents,
    currentValueCents: summary.currentValueCents,
    totalInvestedCents: summary.totalInvestedCents,
    totalGrams: summary.totalGrams,
  };
}

function generatedAtLabelSafe(generatedAt: Date): string {
  return formatReportDateTime(generatedAt);
}

export function buildGoldStrategyReportData(input: {
  generatedAt: Date;
  requestedRange: GoldPriceHistoryRange;
  portfolio: GoldPortfolioAnalyticsResult;
  priceD7: GoldPriceAnalyticsResult;
  priceD30: GoldPriceAnalyticsResult;
  priceD90: GoldPriceAnalyticsResult;
  priceAll: GoldPriceAnalyticsResult;
}): GoldStrategyReportData {
  const {
    generatedAt,
    requestedRange,
    portfolio,
    priceD7,
    priceD30,
    priceD90,
    priceAll,
  } = input;
  const summary = portfolio.summary;
  const latest = priceAll.latest ?? priceD7.latest;
  const history = priceHistoryRows(priceAll.history);
  const oneHoldings = portfolio.holdingsGrowth.length === 1;

  return {
    kind: 'STRATEGY',
    title: 'Gold Strategy Report',
    filename: goldStrategyFileName(generatedAt),
    requestedRange,
    generatedAtLabel: formatReportDateTime(generatedAt),
    latestPriceAtLabel: latest
      ? formatReportDateTime(latest.observedAt)
      : 'Unavailable',
    hasHoldings: summary.hasGrams,
    hasCurrentPrice: summary.hasPrice,
    hasPriceHistory: priceAll.history.length > 0,
    overlapNote: overlapNote(priceAll),
    executiveSummary: [
      kv('Total gold', formatReportGrams(summary.totalGrams)),
      kv('Invested capital', formatReportMoney(summary.totalInvestedCents)),
      kv(
        'Current value',
        summary.hasPrice
          ? formatReportMoney(summary.currentValueCents)
          : VALUATION_UNAVAILABLE,
      ),
      kv(
        'Unrealized P/L',
        summary.hasPrice
          ? `${formatReportMoney(summary.unrealizedPlCents, { signed: true })}  ${formatReportPercent(summary.unrealizedPlPercent)}`
          : 'Unavailable',
      ),
      kv(
        'Weighted average cost',
        summary.hasGrams
          ? formatReportPerGram(summary.averageCostPerGramCents)
          : 'Unavailable',
      ),
      kv('Current PG BUY', formatReportPerGram(summary.currentPgBuyCents)),
      kv('Current PG SELL', formatReportPerGram(summary.currentPgSellCents)),
      kv(
        'Break-even',
        formatReportPerGram(portfolio.breakEven?.breakEvenPgBuyCents ?? null),
      ),
      kv('Price observations', String(priceAll.dataQuality.sampleCount)),
      kv(
        'Latest confirmed price',
        latest ? formatReportDateTime(latest.observedAt) : 'Unavailable',
      ),
    ],
    currentPortfolio: currentPortfolioRows(portfolio),
    valuationNote:
      summary.hasGrams && !summary.hasPrice ? VALUATION_UNAVAILABLE : null,
    costBasis: [
      kv(
        'Weighted average cost/g',
        summary.hasGrams
          ? formatReportPerGram(summary.averageCostPerGramCents)
          : 'Unavailable',
      ),
      kv('Current PG BUY/g', formatReportPerGram(summary.currentPgBuyCents)),
      kv(
        'Break-even PG BUY/g',
        formatReportPerGram(portfolio.breakEven?.breakEvenPgBuyCents ?? null),
      ),
      kv(
        'Distance to break-even',
        formatReportPerGram(
          portfolio.breakEven?.distanceToBreakEvenCents ?? null,
        ),
      ),
    ],
    breakEvenState:
      portfolio.breakEven?.isAboveBreakEven == null
        ? null
        : portfolio.breakEven.isAboveBreakEven
          ? 'Above break-even'
          : 'Below break-even',
    periodStats: [
      toPeriodStats('D7', priceD7),
      toPeriodStats('D30', priceD30),
      toPeriodStats('D90', priceD90),
      toPeriodStats('ALL', priceAll),
    ],
    priceTrendChart: priceTrendChart(priceAll),
    priceTrendTable:
      priceAll.daily.length === 1 && latest
        ? [
            kv('Date', formatReportDate(priceAll.daily[0].malaysiaDate)),
            kv('PG BUY', formatReportPerGram(latest.pgBuyPricePerGramCents)),
            kv('PG SELL', formatReportPerGram(latest.pgSellPricePerGramCents)),
          ]
        : priceAll.daily.length === 0
          ? [kv('Status', NO_PRICE_HISTORY)]
          : null,
    portfolioValueChart: portfolioValueChart(portfolio),
    holdingsChart: holdingsChart(portfolio),
    holdingsSummary: oneHoldings
      ? [
          kv('Date', formatReportDate(portfolio.holdingsGrowth[0].date)),
          kv(
            'Total gold',
            formatReportGrams(portfolio.holdingsGrowth[0].holdingsGrams),
          ),
        ]
      : null,
    purchases: purchaseRows(portfolio.purchasePerformance),
    highestReturn: performanceCallout(portfolio.highestReturnPurchase),
    lowestReturn: performanceCallout(portfolio.lowestReturnPurchase),
    priceHistory: history.rows,
    priceHistoryTruncationNote: history.truncationNote,
    dataQuality: [
      kv('generated_at', formatReportDateTime(generatedAt)),
      kv(
        'latest_price_at',
        latest ? formatReportDateTime(latest.observedAt) : 'Unavailable',
      ),
      kv(
        'first price sample',
        priceAll.dataQuality.firstSampleAt
          ? formatReportDateTime(priceAll.dataQuality.firstSampleAt)
          : 'Unavailable',
      ),
      kv(
        'latest price sample',
        priceAll.dataQuality.latestSampleAt
          ? formatReportDateTime(priceAll.dataQuality.latestSampleAt)
          : 'Unavailable',
      ),
      kv('price sample count', String(priceAll.dataQuality.sampleCount)),
      kv('days with price data', String(priceAll.dataQuality.daysWithData)),
      kv('active purchase count', String(summary.purchaseCount)),
      kv('valuation method', 'PG BUY'),
      kv(
        'weighted-average acquisition cost method',
        'total invested amount / total active grams',
      ),
      kv('price-history source types', 'MANUAL / SCREENSHOT'),
      kv('historical portfolio method', PORTFOLIO_HISTORY_NOTE),
    ],
    assumptions: [
      PRICE_ANALYTICS_ASSUMPTION,
      PORTFOLIO_HISTORY_ASSUMPTION,
      SNAPSHOT_IMPORTANT_NOTE,
    ],
    pgBuyCents: summary.currentPgBuyCents,
    pgSellCents: summary.currentPgSellCents,
    currentValueCents: summary.currentValueCents,
    totalInvestedCents: summary.totalInvestedCents,
    totalGrams: summary.totalGrams,
  };
}

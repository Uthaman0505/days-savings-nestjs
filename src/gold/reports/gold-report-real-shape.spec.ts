import { computeGoldPortfolioAnalytics } from '../gold-portfolio-analytics';
import { computeGoldPriceAnalytics } from '../gold-price-analytics';
import {
  buildGoldSnapshotReportData,
  buildGoldStrategyReportData,
} from './gold-report-data';
import { layoutLineChart } from './gold-report-charts';
import { renderGoldReportPdf } from './gold-report-pdf';
import { reportPrice, reportPurchase } from './gold-report-test.fixtures';

function pdfHexText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  return [...raw.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((match) => {
      const bytes = match[1];
      let text = '';
      for (let i = 0; i < bytes.length; i += 2) {
        text += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
      }
      return text;
    })
    .join('');
}

/** Sanitized copy of the current development account shape (no PII). */
export const REAL_SHAPE_NOW = new Date('2026-09-06T01:00:00.000Z');

export const REAL_SHAPE_PURCHASES = [
  reportPurchase({
    id: 'lot-1',
    purchaseDate: '2025-10-12',
    weightGrams: '0.1686',
    amountPaidCents: 10000,
    pricePerGramCents: 59300,
    source: 'IMPORT',
    referenceNumber: 'REF00001',
    createdAt: new Date('2026-08-30T09:50:03.179Z'),
  }),
  reportPurchase({
    id: 'lot-2',
    purchaseDate: '2026-02-05',
    weightGrams: '1.0000',
    amountPaidCents: 67900,
    pricePerGramCents: 67900,
    source: 'IMPORT',
    referenceNumber: 'REF00002',
    createdAt: new Date('2026-08-30T06:31:10.605Z'),
  }),
  reportPurchase({
    id: 'lot-3',
    purchaseDate: '2026-08-26',
    weightGrams: '0.1529',
    amountPaidCents: 10000,
    pricePerGramCents: 65400,
    source: 'IMPORT',
    referenceNumber: 'REF00003',
    createdAt: new Date('2026-08-30T04:37:44.703Z'),
  }),
];

export const REAL_SHAPE_PRICES = [
  reportPrice({
    id: 'px-1',
    priceDate: '2026-08-30',
    capturedPriceAt: null,
    createdAt: new Date('2026-08-30T02:25:10.140Z'),
    pgBuyPricePerGramCents: 57300,
    pgSellPricePerGramCents: 62500,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-2',
    priceDate: '2026-08-31',
    capturedPriceAt: null,
    createdAt: new Date('2026-08-31T03:15:31.591Z'),
    pgBuyPricePerGramCents: 57100,
    pgSellPricePerGramCents: 62300,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-3',
    priceDate: '2026-09-01',
    capturedPriceAt: null,
    createdAt: new Date('2026-08-31T23:42:53.123Z'),
    pgBuyPricePerGramCents: 56300,
    pgSellPricePerGramCents: 61400,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-4',
    priceDate: '2026-09-02',
    capturedPriceAt: null,
    createdAt: new Date('2026-09-02T03:26:25.332Z'),
    pgBuyPricePerGramCents: 55500,
    pgSellPricePerGramCents: 60500,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-5',
    priceDate: '2026-09-03',
    capturedPriceAt: null,
    createdAt: new Date('2026-09-03T04:27:07.049Z'),
    pgBuyPricePerGramCents: 57700,
    pgSellPricePerGramCents: 63000,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-6',
    priceDate: '2026-09-04',
    capturedPriceAt: null,
    createdAt: new Date('2026-09-03T23:54:57.219Z'),
    pgBuyPricePerGramCents: 57800,
    pgSellPricePerGramCents: 63100,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-7',
    priceDate: '2026-09-04',
    capturedPriceAt: new Date('2026-09-04T15:32:00.000Z'),
    createdAt: new Date('2026-09-04T15:33:09.602Z'),
    pgBuyPricePerGramCents: 56800,
    pgSellPricePerGramCents: 62000,
    source: 'SCREENSHOT',
  }),
  reportPrice({
    id: 'px-8',
    priceDate: '2026-09-05',
    capturedPriceAt: null,
    createdAt: new Date('2026-09-05T00:19:17.071Z'),
    pgBuyPricePerGramCents: 57300,
    pgSellPricePerGramCents: 62500,
    source: 'MANUAL',
  }),
  reportPrice({
    id: 'px-9',
    priceDate: '2026-09-05',
    capturedPriceAt: new Date('2026-09-05T02:40:00.000Z'),
    createdAt: new Date('2026-09-05T02:41:18.713Z'),
    pgBuyPricePerGramCents: 57300,
    pgSellPricePerGramCents: 62500,
    source: 'SCREENSHOT',
  }),
];

export const REAL_SHAPE_LATEST = {
  pgBuyPricePerGramCents: 57300,
  pgSellPricePerGramCents: 62500,
  priceDate: '2026-09-05',
};

function analytics() {
  const input = {
    now: REAL_SHAPE_NOW,
    todayPriceDate: '2026-09-05',
  };
  const portfolio = computeGoldPortfolioAnalytics(
    REAL_SHAPE_PURCHASES,
    REAL_SHAPE_PRICES,
    {
      range: 'ALL',
      ...input,
      latestPrice: REAL_SHAPE_LATEST,
    },
  );
  return {
    portfolio,
    priceD7: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
      range: 'D7',
      ...input,
    }),
    priceD30: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
      range: 'D30',
      ...input,
    }),
    priceD90: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
      range: 'D90',
      ...input,
    }),
    priceAll: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
      range: 'ALL',
      ...input,
    }),
  };
}

describe('gold report real account shape', () => {
  it('renders Snapshot and Strategy PDFs for the current account shape', async () => {
    const { portfolio, priceD7, priceD30, priceD90, priceAll } = analytics();
    expect(portfolio.holdingsGrowth.length).toBe(3);
    expect(portfolio.daily.length).toBe(7);
    expect(new Set(portfolio.daily.map((row) => row.investedCents)).size).toBe(
      1,
    );
    expect(priceAll.daily.length).toBe(7);
    expect(priceAll.history.some((row) => row.capturedPriceAt == null)).toBe(
      true,
    );
    expect(priceAll.history.some((row) => row.source === 'SCREENSHOT')).toBe(
      true,
    );

    const snapshotData = buildGoldSnapshotReportData({
      generatedAt: REAL_SHAPE_NOW,
      portfolio,
      priceD7,
    });
    const strategyData = buildGoldStrategyReportData({
      generatedAt: REAL_SHAPE_NOW,
      requestedRange: 'ALL',
      portfolio,
      priceD7,
      priceD30,
      priceD90,
      priceAll,
    });

    expect(strategyData.priceTrendChart).not.toBeNull();
    expect(strategyData.portfolioValueChart).not.toBeNull();
    expect(strategyData.holdingsChart).not.toBeNull();

    for (const chart of [
      strategyData.priceTrendChart,
      strategyData.portfolioValueChart,
      strategyData.holdingsChart,
    ]) {
      const layout = layoutLineChart({
        x: 48,
        y: 48,
        width: 500,
        height: 168,
        xLabels: chart!.xLabels,
        series: chart!.series,
        yKind: chart!.yKind,
      });
      expect(layout).not.toBeNull();
      for (const series of layout!.series) {
        for (const point of series.points) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
      }
    }

    const snapshot = await renderGoldReportPdf(snapshotData);
    const strategy = await renderGoldReportPdf(strategyData);
    expect(snapshot.subarray(0, 4).toString()).toBe('%PDF');
    expect(strategy.subarray(0, 4).toString()).toBe('%PDF');
    expect(strategy.length).toBeGreaterThan(snapshot.length);
    const strategyPages = (
      strategy.toString('latin1').match(/\/Type \/Page\b/g) ?? []
    ).length;
    expect(strategyPages).toBeGreaterThanOrEqual(2);
    for (const title of [
      '1. Executive Summary',
      '5. Portfolio Value History',
      '7. Purchase Performance',
      '8. Price History',
      '9. Data Quality',
    ]) {
      expect(pdfHexText(strategy)).toContain(title);
    }
  });

  it('uses a card instead of a line for one holdings-growth point', async () => {
    const d7Portfolio = computeGoldPortfolioAnalytics(
      REAL_SHAPE_PURCHASES,
      REAL_SHAPE_PRICES,
      {
        range: 'D7',
        now: REAL_SHAPE_NOW,
        todayPriceDate: '2026-09-06',
        latestPrice: REAL_SHAPE_LATEST,
      },
    );
    expect(d7Portfolio.holdingsGrowth.length).toBe(1);
    const data = buildGoldStrategyReportData({
      generatedAt: REAL_SHAPE_NOW,
      requestedRange: 'D7',
      portfolio: d7Portfolio,
      priceD7: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
        range: 'D7',
        now: REAL_SHAPE_NOW,
        todayPriceDate: '2026-09-06',
      }),
      priceD30: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
        range: 'D30',
        now: REAL_SHAPE_NOW,
        todayPriceDate: '2026-09-06',
      }),
      priceD90: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
        range: 'D90',
        now: REAL_SHAPE_NOW,
        todayPriceDate: '2026-09-06',
      }),
      priceAll: computeGoldPriceAnalytics(REAL_SHAPE_PRICES, {
        range: 'ALL',
        now: REAL_SHAPE_NOW,
        todayPriceDate: '2026-09-06',
      }),
    });
    expect(data.holdingsChart).toBeNull();
    expect(data.holdingsSummary).not.toBeNull();
    const pdf = await renderGoldReportPdf(data);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('tolerates null optional fields and mixed manual/screenshot history', async () => {
    const purchases = [
      reportPurchase({
        id: 'null-opt',
        purchaseDate: '2026-01-15',
        weightGrams: '0.5000',
        amountPaidCents: 30000,
        pricePerGramCents: 60000,
        source: 'MANUAL',
        referenceNumber: null,
      }),
    ];
    const prices = [
      reportPrice({
        id: 'manual-null-ts',
        priceDate: '2026-09-04',
        capturedPriceAt: null,
        source: 'MANUAL',
        pgBuyPricePerGramCents: 57000,
        pgSellPricePerGramCents: 62000,
      }),
      reportPrice({
        id: 'shot',
        priceDate: '2026-09-05',
        capturedPriceAt: new Date('2026-09-05T02:40:00.000Z'),
        source: 'SCREENSHOT',
        pgBuyPricePerGramCents: 57300,
        pgSellPricePerGramCents: 62500,
      }),
    ];
    const pdf = await renderGoldReportPdf(
      buildGoldStrategyReportData({
        generatedAt: REAL_SHAPE_NOW,
        requestedRange: 'ALL',
        portfolio: computeGoldPortfolioAnalytics(purchases, prices, {
          range: 'ALL',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
          latestPrice: REAL_SHAPE_LATEST,
        }),
        priceD7: computeGoldPriceAnalytics(prices, {
          range: 'D7',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceD30: computeGoldPriceAnalytics(prices, {
          range: 'D30',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceD90: computeGoldPriceAnalytics(prices, {
          range: 'D90',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceAll: computeGoldPriceAnalytics(prices, {
          range: 'ALL',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
      }),
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders long purchase and price tables without hanging', async () => {
    const purchases = Array.from({ length: 24 }, (_, i) =>
      reportPurchase({
        id: `lot-${i}`,
        purchaseDate: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
        weightGrams: '0.1000',
        amountPaidCents: 5500,
        pricePerGramCents: 55000,
        source: i % 2 === 0 ? 'IMPORT' : 'MANUAL',
        referenceNumber:
          i % 5 === 0 ? null : `REF${String(i).padStart(5, '0')}`,
      }),
    );
    const prices = Array.from({ length: 40 }, (_, i) =>
      reportPrice({
        id: `hist-${i}`,
        priceDate: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
        capturedPriceAt:
          i % 3 === 0
            ? null
            : new Date(
                `2026-08-${String((i % 28) + 1).padStart(2, '0')}T03:00:00.000Z`,
              ),
        source: i % 3 === 0 ? 'MANUAL' : 'SCREENSHOT',
        pgBuyPricePerGramCents: 55000 + i * 20,
        pgSellPricePerGramCents: 60000 + i * 20,
      }),
    );
    const pdf = await renderGoldReportPdf(
      buildGoldStrategyReportData({
        generatedAt: REAL_SHAPE_NOW,
        requestedRange: 'ALL',
        portfolio: computeGoldPortfolioAnalytics(purchases, prices, {
          range: 'ALL',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
          latestPrice: REAL_SHAPE_LATEST,
        }),
        priceD7: computeGoldPriceAnalytics(prices, {
          range: 'D7',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceD30: computeGoldPriceAnalytics(prices, {
          range: 'D30',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceD90: computeGoldPriceAnalytics(prices, {
          range: 'D90',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceAll: computeGoldPriceAnalytics(prices, {
          range: 'ALL',
          now: REAL_SHAPE_NOW,
          todayPriceDate: '2026-09-05',
        }),
      }),
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(5000);
  });
});

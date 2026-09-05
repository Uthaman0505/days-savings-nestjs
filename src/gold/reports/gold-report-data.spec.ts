import {
  buildGoldSnapshotReportData,
  buildGoldStrategyReportData,
} from './gold-report-data';
import { renderGoldReportPdf } from './gold-report-pdf';
import {
  NO_ACTIVE_HOLDINGS,
  PHASE_5_6_FORBIDDEN,
  PG_BUY_LABEL,
  PG_SELL_LABEL,
  PORTFOLIO_HISTORY_ASSUMPTION,
  SNAPSHOT_SECTION_TITLES,
  STRATEGY_SECTION_TITLES,
  VALUATION_UNAVAILABLE,
} from './gold-report.types';
import {
  REPORT_NOW,
  SAMPLE_LATEST,
  reportPrice,
  reportPurchase,
  samplePortfolio,
  samplePrice,
} from './gold-report-test.fixtures';
import { computeGoldPortfolioAnalytics } from '../gold-portfolio-analytics';
import { computeGoldPriceAnalytics } from '../gold-price-analytics';

function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const hex = [...raw.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((match) => {
      const bytes = match[1];
      let text = '';
      for (let i = 0; i < bytes.length; i += 2) {
        text += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
      }
      return text;
    })
    .join('');
  return hex;
}

describe('gold report data model', () => {
  it('builds snapshot values from Phase 4A/4B analytics and uses PG BUY for valuation', () => {
    const snapshot = buildGoldSnapshotReportData({
      generatedAt: REPORT_NOW,
      portfolio: samplePortfolio(),
      priceD7: samplePrice('D7'),
    });
    expect(snapshot.filename).toBe('Gold-Snapshot-2026-09-05.pdf');
    expect(snapshot.totalGrams).toBe('1.5000');
    expect(snapshot.totalInvestedCents).toBe(80000);
    expect(snapshot.pgBuyCents).toBe(57300);
    expect(snapshot.pgSellCents).toBe(62500);
    expect(snapshot.currentValueCents).toBe(85950);
    expect(snapshot.currentValueCents).not.toBe(93750);
    expect(
      snapshot.currentPortfolio.some((row) => row.value.includes('1.5000')),
    ).toBe(true);
    expect(
      snapshot.currentPrice.some((row) => row.label === PG_BUY_LABEL),
    ).toBe(true);
    expect(
      snapshot.currentPrice.some((row) => row.label === PG_SELL_LABEL),
    ).toBe(true);
  });

  it('marks valuation unavailable when there is no current PG BUY', () => {
    const portfolio = computeGoldPortfolioAnalytics(
      [reportPurchase({ id: 'a' })],
      [],
      {
        range: 'ALL',
        now: REPORT_NOW,
        latestPrice: null,
      },
    );
    const snapshot = buildGoldSnapshotReportData({
      generatedAt: REPORT_NOW,
      portfolio,
      priceD7: samplePrice('D7'),
    });
    expect(snapshot.hasCurrentPrice).toBe(false);
    expect(snapshot.currentValueCents).toBeNull();
    expect(
      snapshot.currentPortfolio.some(
        (row) => row.value === VALUATION_UNAVAILABLE,
      ),
    ).toBe(true);
  });

  it('states there are no active holdings', () => {
    const portfolio = computeGoldPortfolioAnalytics([], [], {
      range: 'ALL',
      now: REPORT_NOW,
      latestPrice: SAMPLE_LATEST,
    });
    const snapshot = buildGoldSnapshotReportData({
      generatedAt: REPORT_NOW,
      portfolio,
      priceD7: computeGoldPriceAnalytics([], {
        range: 'D7',
        now: REPORT_NOW,
      }),
    });
    expect(snapshot.hasHoldings).toBe(false);
    expect(
      snapshot.currentPortfolio.some((row) => row.value === NO_ACTIVE_HOLDINGS),
    ).toBe(true);
  });

  it('includes strategy sections, highest/lowest return, and overlap note for sparse history', () => {
    const strategy = buildGoldStrategyReportData({
      generatedAt: REPORT_NOW,
      requestedRange: 'ALL',
      portfolio: samplePortfolio(),
      priceD7: samplePrice('D7'),
      priceD30: samplePrice('D30'),
      priceD90: samplePrice('D90'),
      priceAll: samplePrice('ALL'),
    });
    expect(strategy.filename).toBe('Gold-Strategy-2026-09-05.pdf');
    expect(strategy.purchases).toHaveLength(2);
    expect(strategy.highestReturn).not.toBeNull();
    expect(strategy.lowestReturn).not.toBeNull();
    expect(strategy.overlapNote).toMatch(
      /Only 2 days of captured price history/,
    );
    expect(strategy.assumptions.join(' ')).toContain(
      PORTFOLIO_HISTORY_ASSUMPTION,
    );
    expect(strategy.priceTrendChart).not.toBeNull();
  });

  it('uses a compact table instead of a line chart when only one price point exists', () => {
    const prices = [reportPrice({ id: 'only' })];
    const price = computeGoldPriceAnalytics(prices, {
      range: 'ALL',
      now: REPORT_NOW,
      todayPriceDate: '2026-09-05',
    });
    const portfolio = computeGoldPortfolioAnalytics(
      [reportPurchase({ id: 'a' })],
      prices,
      {
        range: 'ALL',
        now: REPORT_NOW,
        latestPrice: SAMPLE_LATEST,
      },
    );
    const strategy = buildGoldStrategyReportData({
      generatedAt: REPORT_NOW,
      requestedRange: 'ALL',
      portfolio,
      priceD7: price,
      priceD30: price,
      priceD90: price,
      priceAll: price,
    });
    expect(strategy.priceTrendChart).toBeNull();
    expect(strategy.priceTrendTable).not.toBeNull();
  });
});

describe('gold report PDF renderer', () => {
  it('renders a non-empty snapshot PDF with current values and without Phase 5/6 content', async () => {
    const data = buildGoldSnapshotReportData({
      generatedAt: REPORT_NOW,
      portfolio: samplePortfolio(),
      priceD7: samplePrice('D7'),
    });
    const buffer = await renderGoldReportPdf(data);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(500);
    const text = pdfText(buffer);
    for (const title of SNAPSHOT_SECTION_TITLES) {
      expect(text).toContain(title);
    }
    expect(text).toContain('1.5000 g');
    expect(text).toContain('MYR 800.00');
    expect(text).toContain('MYR 859.50');
    expect(text).toContain('Highest return purchase');
    expect(text).toContain('Lowest return purchase');
    expect(text).toContain('Page 1 of');
    for (const phrase of PHASE_5_6_FORBIDDEN) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
    expect(text).not.toContain('1. Executive Summary');
    expect(text).not.toContain('Profit Goal');
  });

  it('renders strategy sections, charts, and a long purchase table', async () => {
    const many = Array.from({ length: 24 }, (_, i) =>
      reportPurchase({
        id: `lot-${i}`,
        purchaseDate: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
        createdAt: new Date(
          `2026-08-${String((i % 28) + 1).padStart(2, '0')}T02:00:00.000Z`,
        ),
      }),
    );
    const prices = [
      reportPrice({
        id: 'a',
        priceDate: '2026-09-03',
        capturedPriceAt: new Date('2026-09-03T02:00:00.000Z'),
        pgBuyPricePerGramCents: 56000,
      }),
      reportPrice({
        id: 'b',
        priceDate: '2026-09-04',
        capturedPriceAt: new Date('2026-09-04T03:20:00.000Z'),
        pgBuyPricePerGramCents: 56800,
      }),
      reportPrice({ id: 'c' }),
    ];
    const priceAll = computeGoldPriceAnalytics(prices, {
      range: 'ALL',
      now: REPORT_NOW,
      todayPriceDate: '2026-09-05',
    });
    const data = buildGoldStrategyReportData({
      generatedAt: REPORT_NOW,
      requestedRange: 'ALL',
      portfolio: computeGoldPortfolioAnalytics(many, prices, {
        range: 'ALL',
        now: REPORT_NOW,
        latestPrice: SAMPLE_LATEST,
      }),
      priceD7: priceAll,
      priceD30: priceAll,
      priceD90: priceAll,
      priceAll,
    });
    expect(data.purchases.length).toBe(24);
    const buffer = await renderGoldReportPdf(data);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    const text = pdfText(buffer);
    for (const title of STRATEGY_SECTION_TITLES) {
      expect(text).toContain(title);
    }
    expect(text).toContain('Highest return purchase');
    expect(text).toContain('Lowest return purchase');
    expect(text).toContain(PORTFOLIO_HISTORY_ASSUMPTION);
    expect(text).toContain('PG BUY / PG SELL trend');
    expect(text).toMatch(/Page \d+ of \d+/);
  });

  it('still generates PDFs when holdings or history are empty', async () => {
    const emptyPortfolio = computeGoldPortfolioAnalytics([], [], {
      range: 'ALL',
      now: REPORT_NOW,
      latestPrice: null,
    });
    const emptyPrice = computeGoldPriceAnalytics([], {
      range: 'ALL',
      now: REPORT_NOW,
    });
    const snapshot = await renderGoldReportPdf(
      buildGoldSnapshotReportData({
        generatedAt: REPORT_NOW,
        portfolio: emptyPortfolio,
        priceD7: emptyPrice,
      }),
    );
    const strategy = await renderGoldReportPdf(
      buildGoldStrategyReportData({
        generatedAt: REPORT_NOW,
        requestedRange: 'ALL',
        portfolio: emptyPortfolio,
        priceD7: emptyPrice,
        priceD30: emptyPrice,
        priceD90: emptyPrice,
        priceAll: emptyPrice,
      }),
    );
    expect(snapshot.subarray(0, 4).toString()).toBe('%PDF');
    expect(strategy.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdfText(snapshot)).toContain(NO_ACTIVE_HOLDINGS);
    expect(pdfText(strategy)).toContain(
      'No confirmed price history available.',
    );
  });
});

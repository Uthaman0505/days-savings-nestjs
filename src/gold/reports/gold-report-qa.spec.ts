import * as fs from 'fs';
import * as path from 'path';
import { computeGoldPortfolioAnalytics } from '../gold-portfolio-analytics';
import { computeGoldPriceAnalytics } from '../gold-price-analytics';
import {
  buildGoldSnapshotReportData,
  buildGoldStrategyReportData,
} from './gold-report-data';
import { renderGoldReportPdf } from './gold-report-pdf';
import {
  REPORT_NOW,
  SAMPLE_LATEST,
  reportPrice,
  reportPurchase,
  samplePortfolio,
  samplePrice,
} from './gold-report-test.fixtures';

function pageCount(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches?.length ?? 0;
}

describe('gold report visual QA artifacts', () => {
  const dir = path.join(process.cwd(), '.tmp', 'gold-report-qa');

  it('writes snapshot and strategy PDFs for page inspection', async () => {
    fs.mkdirSync(dir, { recursive: true });
    const snapshot = await renderGoldReportPdf(
      buildGoldSnapshotReportData({
        generatedAt: REPORT_NOW,
        portfolio: samplePortfolio(),
        priceD7: samplePrice('D7'),
      }),
    );

    const extraPurchases = Array.from({ length: 18 }, (_, i) =>
      reportPurchase({
        id: `lot-${i}`,
        purchaseDate: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
        weightGrams: '0.1000',
        amountPaidCents: 5500,
        pricePerGramCents: 55000,
        createdAt: new Date(
          `2026-08-${String((i % 28) + 1).padStart(2, '0')}T02:00:00.000Z`,
        ),
      }),
    );
    const purchases = [
      reportPurchase({ id: 'a' }),
      reportPurchase({
        id: 'b',
        purchaseDate: '2026-08-20',
        weightGrams: '0.5000',
        amountPaidCents: 28000,
        pricePerGramCents: 56000,
        source: 'IMPORT',
        createdAt: new Date('2026-08-20T02:00:00.000Z'),
      }),
      reportPurchase({
        id: 'c',
        purchaseDate: '2026-09-05',
        weightGrams: '0.2500',
        amountPaidCents: 15000,
        pricePerGramCents: 60000,
        source: 'MANUAL',
        createdAt: new Date('2026-09-05T03:00:00.000Z'),
      }),
      ...extraPurchases,
    ];
    const prices = Array.from({ length: 14 }, (_, i) => {
      const day = 23 + i;
      const month = day > 31 ? 9 : 8;
      const d = day > 31 ? day - 31 : day;
      const ymd = `2026-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return reportPrice({
        id: `p-${i}`,
        priceDate: ymd,
        capturedPriceAt: new Date(`${ymd}T03:20:00.000Z`),
        pgBuyPricePerGramCents: 55000 + i * 150,
        pgSellPricePerGramCents: 60000 + i * 160,
        source: i % 2 === 0 ? 'MANUAL' : 'SCREENSHOT',
      });
    });
    const priceAll = computeGoldPriceAnalytics(prices, {
      range: 'ALL',
      now: REPORT_NOW,
      todayPriceDate: '2026-09-05',
    });
    const strategy = await renderGoldReportPdf(
      buildGoldStrategyReportData({
        generatedAt: REPORT_NOW,
        requestedRange: 'ALL',
        portfolio: computeGoldPortfolioAnalytics(purchases, prices, {
          range: 'ALL',
          now: REPORT_NOW,
          todayPriceDate: '2026-09-05',
          latestPrice: SAMPLE_LATEST,
        }),
        priceD7: computeGoldPriceAnalytics(prices, {
          range: 'D7',
          now: REPORT_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceD30: computeGoldPriceAnalytics(prices, {
          range: 'D30',
          now: REPORT_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceD90: computeGoldPriceAnalytics(prices, {
          range: 'D90',
          now: REPORT_NOW,
          todayPriceDate: '2026-09-05',
        }),
        priceAll,
      }),
    );

    const snapshotPath = path.join(dir, 'Gold-Snapshot-2026-09-05.pdf');
    const strategyPath = path.join(dir, 'Gold-Strategy-2026-09-05.pdf');
    fs.writeFileSync(snapshotPath, snapshot);
    fs.writeFileSync(strategyPath, strategy);

    expect(snapshot.subarray(0, 4).toString()).toBe('%PDF');
    expect(strategy.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(snapshot)).toBeGreaterThanOrEqual(1);
    expect(pageCount(strategy)).toBeGreaterThanOrEqual(2);
    expect(fs.statSync(snapshotPath).size).toBe(snapshot.length);
    expect(fs.statSync(strategyPath).size).toBe(strategy.length);
  });
});

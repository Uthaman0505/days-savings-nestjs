import {
  averageCostPerGramCents,
  signedPercentChange,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';
import {
  PORTFOLIO_HISTORY_NOTE,
  computeGoldHoldingsSummary,
  computeGoldPortfolioAnalytics,
  type GoldPurchaseObservation,
} from './gold-portfolio-analytics';
import type { GoldPriceObservation } from './gold-price-analytics';

const NOW = new Date('2026-09-05T02:00:00.000Z'); // 10:00 AM MYT 5 Sep 2026

function purchase(
  partial: Partial<GoldPurchaseObservation> & { id: string },
): GoldPurchaseObservation {
  return {
    purchaseDate: '2026-08-30',
    weightGrams: '1.0000',
    amountPaidCents: 50000,
    pricePerGramCents: 50000,
    source: 'MANUAL',
    referenceNumber: null,
    createdAt: new Date('2026-08-30T02:00:00.000Z'),
    isActive: true,
    ...partial,
  };
}

function price(
  partial: Partial<GoldPriceObservation> & { id: string },
): GoldPriceObservation {
  return {
    priceDate: '2026-09-05',
    capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
    createdAt: new Date('2026-09-05T01:00:00.000Z'),
    pgBuyPricePerGramCents: 57300,
    pgSellPricePerGramCents: 62500,
    source: 'SCREENSHOT',
    ...partial,
  };
}

const LATEST = {
  pgBuyPricePerGramCents: 57300,
  pgSellPricePerGramCents: 62500,
  priceDate: '2026-09-05',
};

describe('gold-portfolio-analytics', () => {
  it('computes weighted average cost from total invested / total grams, not an arithmetic mean', () => {
    const rows = [
      purchase({
        id: 'a',
        weightGrams: '1.0000',
        amountPaidCents: 50000,
        pricePerGramCents: 50000,
      }),
      purchase({
        id: 'b',
        purchaseDate: '2026-09-05',
        weightGrams: '0.5000',
        amountPaidCents: 30000,
        pricePerGramCents: 60000,
        createdAt: new Date('2026-09-05T02:00:00.000Z'),
      }),
    ];
    const summary = computeGoldHoldingsSummary(rows, LATEST);
    expect(summary.totalGrams).toBe('1.5000');
    expect(summary.totalInvestedCents).toBe(80000);
    expect(summary.averageCostPerGramCents).toBe(
      averageCostPerGramCents(80000, '1.5000'),
    );
    expect(summary.averageCostPerGramCents).toBe(53333);
    expect(summary.averageCostPerGramCents).not.toBe(55000);
  });

  it('values the current portfolio with PG BUY, not PG SELL', () => {
    const rows = [
      purchase({
        id: 'a',
        weightGrams: '15.0000',
        amountPaidCents: 740000,
      }),
    ];
    const summary = computeGoldHoldingsSummary(rows, {
      pgBuyPricePerGramCents: 52000,
      pgSellPricePerGramCents: 54000,
      priceDate: '2026-09-05',
    });
    expect(summary.currentValueCents).toBe(780000);
    expect(summary.currentValueCents).not.toBe(810000);
    expect(summary.unrealizedPlCents).toBe(40000);
    expect(summary.unrealizedPlPercent).toBe(
      signedPercentChange(740000, 780000),
    );
    expect(summary.unrealizedExcessCents).toBe(40000);
  });

  it('returns a negative unrealized P/L when PG BUY is below cost', () => {
    const rows = [
      purchase({
        id: 'a',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
      }),
    ];
    const summary = computeGoldHoldingsSummary(rows, LATEST);
    const currentValue = valueCentsFromGramsAndUnitPrice('0.1529', 57300);
    expect(summary.currentValueCents).toBe(currentValue);
    expect(summary.unrealizedPlCents).toBe(currentValue - 10000);
    expect(summary.unrealizedPlCents).toBeLessThan(0);
    expect(summary.unrealizedExcessCents).toBe(0);
  });

  it('sets break-even to weighted average cost and reports distance vs PG BUY', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'a',
          weightGrams: '1.0000',
          amountPaidCents: 50000,
        }),
        purchase({
          id: 'b',
          purchaseDate: '2026-09-05',
          weightGrams: '0.5000',
          amountPaidCents: 30000,
          pricePerGramCents: 60000,
        }),
      ],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.breakEven?.breakEvenPgBuyCents).toBe(53333);
    expect(result.breakEven?.currentPgBuyCents).toBe(57300);
    expect(result.breakEven?.distanceToBreakEvenCents).toBe(57300 - 53333);
    expect(result.breakEven?.isAboveBreakEven).toBe(true);
  });

  it('marks the portfolio below break-even when PG BUY is lower than average cost', () => {
    const latest = {
      pgBuyPricePerGramCents: 50000,
      pgSellPricePerGramCents: 56000,
      priceDate: '2026-09-05',
    };
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'a',
          amountPaidCents: 60000,
          pricePerGramCents: 60000,
        }),
      ],
      [price({ id: 'p1', pgBuyPricePerGramCents: 50000 })],
      { range: 'ALL', now: NOW, latestPrice: latest },
    );
    expect(result.breakEven?.isAboveBreakEven).toBe(false);
    expect(result.breakEven?.distanceToBreakEvenCents).toBe(-10000);
  });

  it('does not invent -100% P/L when the current PG BUY is missing', () => {
    const summary = computeGoldHoldingsSummary([purchase({ id: 'a' })], null);
    expect(summary.hasGrams).toBe(true);
    expect(summary.hasPrice).toBe(false);
    expect(summary.currentValueCents).toBeNull();
    expect(summary.unrealizedPlCents).toBeNull();
    expect(summary.unrealizedPlPercent).toBeNull();
    expect(summary.unrealizedExcessCents).toBeNull();
  });

  it('returns an empty holdings snapshot when there are no purchases', () => {
    const result = computeGoldPortfolioAnalytics([], [price({ id: 'p1' })], {
      range: 'ALL',
      now: NOW,
      latestPrice: LATEST,
    });
    expect(result.summary.totalGrams).toBe('0.0000');
    expect(result.summary.totalInvestedCents).toBe(0);
    expect(result.summary.currentValueCents).toBeNull();
    expect(result.summary.unrealizedPlPercent).toBeNull();
    expect(result.breakEven).toBeNull();
    expect(result.purchasePerformance).toEqual([]);
    expect(result.highestReturnPurchase).toBeNull();
    expect(result.lowestReturnPurchase).toBeNull();
  });

  it('calculates individual purchase performance from the latest PG BUY', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'lot',
          weightGrams: '0.1529',
          amountPaidCents: 10000,
          pricePerGramCents: 65402,
          source: 'IMPORT',
          referenceNumber: 'PG-A001',
        }),
      ],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    const row = result.purchasePerformance[0];
    const currentValue = valueCentsFromGramsAndUnitPrice('0.1529', 57300);
    expect(row.id).toBe('lot');
    expect(row.weightGrams).toBe('0.1529');
    expect(row.investedCents).toBe(10000);
    expect(row.currentValueCents).toBe(currentValue);
    expect(row.unrealizedPlCents).toBe(currentValue - 10000);
    expect(row.unrealizedPlPercent).toBe(
      signedPercentChange(10000, currentValue),
    );
    expect(row.pgBuyVsAcquisitionCents).toBe(57300 - 65402);
    expect(row.source).toBe('IMPORT');
    expect(row.referenceNumber).toBe('PG-A001');
  });

  it('ranks highest and lowest return by P/L percent with earlier-date then id ties', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'low',
          purchaseDate: '2026-08-30',
          amountPaidCents: 60000,
          pricePerGramCents: 60000,
        }),
        purchase({
          id: 'high',
          purchaseDate: '2026-09-01',
          amountPaidCents: 40000,
          pricePerGramCents: 40000,
          createdAt: new Date('2026-09-01T02:00:00.000Z'),
        }),
        purchase({
          id: 'tie-a',
          purchaseDate: '2026-09-02',
          weightGrams: '0.5000',
          amountPaidCents: 25000,
          pricePerGramCents: 50000,
          createdAt: new Date('2026-09-02T02:00:00.000Z'),
        }),
        purchase({
          id: 'tie-b',
          purchaseDate: '2026-09-02',
          weightGrams: '0.5000',
          amountPaidCents: 25000,
          pricePerGramCents: 50000,
          createdAt: new Date('2026-09-02T03:00:00.000Z'),
        }),
      ],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.highestReturnPurchase?.id).toBe('high');
    expect(result.lowestReturnPurchase?.id).toBe('low');
    expect(result.highestReturnPurchase?.unrealizedPlPercent).toBeGreaterThan(
      0,
    );
    expect(result.lowestReturnPurchase?.unrealizedPlPercent).toBeLessThan(0);
  });

  it('breaks equal P/L percent ties by earlier purchase date then id', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'later-id',
          purchaseDate: '2026-08-30',
          amountPaidCents: 50000,
        }),
        purchase({
          id: 'earlier-id',
          purchaseDate: '2026-08-30',
          amountPaidCents: 50000,
          createdAt: new Date('2026-08-30T01:00:00.000Z'),
        }),
      ],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.highestReturnPurchase?.id).toBe('earlier-id');
    expect(result.lowestReturnPurchase?.id).toBe('later-id');
  });

  it('includes a purchase from its purchase date and excludes future purchases from earlier points', () => {
    const rows = [
      purchase({
        id: 'first',
        purchaseDate: '2026-08-30',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
      }),
      purchase({
        id: 'later',
        purchaseDate: '2026-09-05',
        weightGrams: '0.1500',
        amountPaidCents: 10000,
        createdAt: new Date('2026-09-05T03:00:00.000Z'),
      }),
    ];
    const prices = [
      price({
        id: 'aug30',
        priceDate: '2026-08-30',
        capturedPriceAt: new Date('2026-08-30T02:00:00.000Z'),
        pgBuyPricePerGramCents: 56000,
        pgSellPricePerGramCents: 61000,
      }),
      price({
        id: 'sep04',
        priceDate: '2026-09-04',
        capturedPriceAt: new Date('2026-09-04T03:20:00.000Z'),
        pgBuyPricePerGramCents: 56800,
        pgSellPricePerGramCents: 62000,
      }),
      price({ id: 'sep05', pgBuyPricePerGramCents: 57300 }),
    ];
    const result = computeGoldPortfolioAnalytics(rows, prices, {
      range: 'ALL',
      now: NOW,
      latestPrice: LATEST,
    });
    const aug30 = result.history.find((point) => point.priceId === 'aug30');
    const sep04 = result.history.find((point) => point.priceId === 'sep04');
    const sep05 = result.history.find((point) => point.priceId === 'sep05');
    expect(aug30?.holdingsGrams).toBe('0.1529');
    expect(aug30?.investedCents).toBe(10000);
    expect(aug30?.portfolioValueCents).toBe(
      valueCentsFromGramsAndUnitPrice('0.1529', 56000),
    );
    expect(sep04?.holdingsGrams).toBe('0.1529');
    expect(sep05?.holdingsGrams).toBe('0.3029');
    expect(sep05?.investedCents).toBe(20000);
  });

  it('values historical points with that observation PG BUY, never PG SELL', () => {
    const result = computeGoldPortfolioAnalytics(
      [purchase({ id: 'a', weightGrams: '1.0000', amountPaidCents: 50000 })],
      [
        price({
          id: 'hist',
          priceDate: '2026-09-04',
          capturedPriceAt: new Date('2026-09-04T03:20:00.000Z'),
          pgBuyPricePerGramCents: 56800,
          pgSellPricePerGramCents: 62000,
        }),
      ],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.history[0].pgBuyCents).toBe(56800);
    expect(result.history[0].portfolioValueCents).toBe(56800);
    expect(result.history[0].portfolioValueCents).not.toBe(62000);
  });

  it('returns holdings and invested growth over purchase dates', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'a',
          purchaseDate: '2026-08-30',
          weightGrams: '0.1529',
          amountPaidCents: 10000,
        }),
        purchase({
          id: 'b',
          purchaseDate: '2026-09-05',
          weightGrams: '0.1500',
          amountPaidCents: 10000,
          createdAt: new Date('2026-09-05T03:00:00.000Z'),
        }),
        purchase({
          id: 'c',
          purchaseDate: '2026-09-10',
          weightGrams: '0.2000',
          amountPaidCents: 15000,
          createdAt: new Date('2026-09-10T03:00:00.000Z'),
        }),
      ],
      [],
      {
        range: 'ALL',
        now: new Date('2026-09-10T02:00:00.000Z'),
        latestPrice: null,
      },
    );
    expect(result.holdingsGrowth).toEqual([
      { date: '2026-08-30', holdingsGrams: '0.1529', investedCents: 10000 },
      { date: '2026-09-05', holdingsGrams: '0.3029', investedCents: 20000 },
      { date: '2026-09-10', holdingsGrams: '0.5029', investedCents: 35000 },
    ]);
    expect(result.investedGrowth.map((row) => row.investedCents)).toEqual([
      10000, 20000, 35000,
    ]);
  });

  it('keeps same-day intraday observations in history and uses Malaysia-day closing PG BUY for daily', () => {
    const result = computeGoldPortfolioAnalytics(
      [purchase({ id: 'a' })],
      [
        price({
          id: 'morning',
          capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
          createdAt: new Date('2026-09-05T00:20:00.000Z'),
          pgBuyPricePerGramCents: 57000,
        }),
        price({
          id: 'afternoon',
          capturedPriceAt: new Date('2026-09-05T06:40:00.000Z'),
          createdAt: new Date('2026-09-05T06:45:00.000Z'),
          pgBuyPricePerGramCents: 57300,
        }),
      ],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.history.map((row) => row.priceId)).toEqual([
      'morning',
      'afternoon',
    ]);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].malaysiaDate).toBe('2026-09-05');
    expect(result.daily[0].pgBuyCents).toBe(57300);
    expect(result.daily[0].sampleCount).toBe(2);
  });

  it('groups a late-UTC capture onto the Malaysia calendar day', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'a',
          purchaseDate: '2026-09-05',
        }),
      ],
      [
        price({
          id: 'myt-next-day',
          priceDate: '2026-09-04',
          capturedPriceAt: new Date('2026-09-04T16:30:00.000Z'), // 00:30 MYT 5 Sep
          pgBuyPricePerGramCents: 57100,
        }),
      ],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.history[0].malaysiaDate).toBe('2026-09-05');
    expect(result.history[0].holdingsGrams).toBe('1.0000');
  });

  it('filters history by 7D / 30D / 90D / ALL without changing the current summary', () => {
    const rows = [
      purchase({
        id: 'old',
        purchaseDate: '2026-06-01',
        createdAt: new Date('2026-06-01T02:00:00.000Z'),
      }),
    ];
    const prices = [
      price({
        id: 'jun',
        priceDate: '2026-06-15',
        capturedPriceAt: new Date('2026-06-15T02:00:00.000Z'),
        pgBuyPricePerGramCents: 50000,
      }),
      price({
        id: 'aug',
        priceDate: '2026-08-10',
        capturedPriceAt: new Date('2026-08-10T02:00:00.000Z'),
        pgBuyPricePerGramCents: 54000,
      }),
      price({
        id: 'sep',
        priceDate: '2026-09-05',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        pgBuyPricePerGramCents: 57300,
      }),
    ];
    const all = computeGoldPortfolioAnalytics(rows, prices, {
      range: 'ALL',
      now: NOW,
      latestPrice: LATEST,
    });
    const d7 = computeGoldPortfolioAnalytics(rows, prices, {
      range: 'D7',
      now: NOW,
      latestPrice: LATEST,
    });
    const d30 = computeGoldPortfolioAnalytics(rows, prices, {
      range: 'D30',
      now: NOW,
      latestPrice: LATEST,
    });
    const d90 = computeGoldPortfolioAnalytics(rows, prices, {
      range: 'D90',
      now: NOW,
      latestPrice: LATEST,
    });
    expect(all.history.map((row) => row.priceId)).toEqual([
      'jun',
      'aug',
      'sep',
    ]);
    expect(d7.history.map((row) => row.priceId)).toEqual(['sep']);
    expect(d30.history.map((row) => row.priceId)).toEqual(['aug', 'sep']);
    expect(d90.history.map((row) => row.priceId)).toEqual([
      'jun',
      'aug',
      'sep',
    ]);
    expect(d7.summary.totalGrams).toBe(all.summary.totalGrams);
    expect(d7.summary.currentValueCents).toBe(all.summary.currentValueCents);
    expect(d7.holdingsGrowth[0]?.date).toBe('2026-08-30');
  });

  it('excludes inactive purchases and includes them again after restore', () => {
    const active = purchase({ id: 'keep', amountPaidCents: 50000 });
    const dropped = purchase({
      id: 'gone',
      purchaseDate: '2026-09-01',
      amountPaidCents: 30000,
      isActive: false,
    });
    const without = computeGoldPortfolioAnalytics(
      [active, dropped],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(without.summary.purchaseCount).toBe(1);
    expect(without.summary.totalInvestedCents).toBe(50000);
    expect(without.purchasePerformance.map((row) => row.id)).toEqual(['keep']);
    expect(without.history[0].investedCents).toBe(50000);

    const restored = computeGoldPortfolioAnalytics(
      [active, { ...dropped, isActive: true }],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(restored.summary.purchaseCount).toBe(2);
    expect(restored.summary.totalInvestedCents).toBe(80000);
    expect(restored.purchasePerformance.map((row) => row.id).sort()).toEqual([
      'gone',
      'keep',
    ]);
  });

  it('treats MANUAL, IMPORT and OCR purchases the same financially', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({
          id: 'manual',
          source: 'MANUAL',
          amountPaidCents: 10000,
          weightGrams: '0.1529',
        }),
        purchase({
          id: 'import',
          source: 'IMPORT',
          amountPaidCents: 10000,
          weightGrams: '0.1529',
          purchaseDate: '2026-09-01',
        }),
        purchase({
          id: 'ocr',
          source: 'OCR',
          amountPaidCents: 10000,
          weightGrams: '0.1529',
          purchaseDate: '2026-09-02',
        }),
      ],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    const values = result.purchasePerformance.map(
      (row) => row.unrealizedPlCents,
    );
    expect(new Set(values).size).toBe(1);
    expect(result.summary.totalGrams).toBe('0.4587');
  });

  it('documents that history is currently active holdings projected on historical prices', () => {
    const result = computeGoldPortfolioAnalytics(
      [purchase({ id: 'a' })],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.dataQuality.historyNote).toBe(PORTFOLIO_HISTORY_NOTE);
  });

  it('sorts purchase performance newest first', () => {
    const result = computeGoldPortfolioAnalytics(
      [
        purchase({ id: 'old', purchaseDate: '2026-08-30' }),
        purchase({
          id: 'new',
          purchaseDate: '2026-09-05',
          createdAt: new Date('2026-09-05T03:00:00.000Z'),
        }),
      ],
      [price({ id: 'p1' })],
      { range: 'ALL', now: NOW, latestPrice: LATEST },
    );
    expect(result.purchasePerformance.map((row) => row.id)).toEqual([
      'new',
      'old',
    ]);
  });
});

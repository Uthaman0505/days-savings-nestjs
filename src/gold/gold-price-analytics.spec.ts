import {
  computeGoldPriceAnalytics,
  type GoldPriceObservation,
} from './gold-price-analytics';

function obs(
  partial: Partial<GoldPriceObservation> & { id: string },
): GoldPriceObservation {
  return {
    priceDate: '2026-09-05',
    capturedPriceAt: null,
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    pgBuyPricePerGramCents: 57300,
    pgSellPricePerGramCents: 62500,
    source: 'SCREENSHOT',
    ...partial,
  };
}

const NOW = new Date('2026-09-05T02:00:00.000Z'); // 10:00 AM MYT 5 Sep 2026
const TODAY = '2026-09-05';

describe('gold-price-analytics', () => {
  it('orders history chronologically and selects latest/previous', () => {
    const rows = [
      obs({
        id: 'later',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        createdAt: new Date('2026-09-05T01:00:00.000Z'),
        pgBuyPricePerGramCents: 57300,
        pgSellPricePerGramCents: 62500,
      }),
      obs({
        id: 'earlier',
        priceDate: '2026-09-04',
        capturedPriceAt: new Date('2026-09-04T03:20:00.000Z'),
        createdAt: new Date('2026-09-04T04:00:00.000Z'),
        pgBuyPricePerGramCents: 56800,
        pgSellPricePerGramCents: 62000,
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'ALL',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.history.map((row) => row.id)).toEqual(['earlier', 'later']);
    expect(result.latest?.id).toBe('later');
    expect(result.previous?.id).toBe('earlier');
  });

  it('calculates PG BUY/SELL change, percentage, spread and spread percent', () => {
    const rows = [
      obs({
        id: 'prev',
        priceDate: '2026-09-04',
        capturedPriceAt: new Date('2026-09-04T03:20:00.000Z'),
        pgBuyPricePerGramCents: 56800,
        pgSellPricePerGramCents: 62000,
      }),
      obs({
        id: 'latest',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        pgBuyPricePerGramCents: 57300,
        pgSellPricePerGramCents: 62500,
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'ALL',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.spreadCents).toBe(5200);
    expect(result.spreadPercent).toBe(8.32);
    expect(result.vsPreviousBuy).toEqual({
      fromCents: 56800,
      toCents: 57300,
      changeCents: 500,
      changePercent: 0.88,
    });
    expect(result.vsPreviousSell?.changeCents).toBe(500);
    expect(result.latest?.source).toBe('SCREENSHOT');
  });

  it('filters 7D / 30D / 90D / ALL by Malaysia calendar day', () => {
    const rows = [
      obs({
        id: 'aug-1',
        priceDate: '2026-08-01',
        capturedPriceAt: new Date('2026-07-31T16:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        pgBuyPricePerGramCents: 50000,
        pgSellPricePerGramCents: 55000,
      }),
      obs({
        id: 'aug-10',
        priceDate: '2026-08-10',
        capturedPriceAt: new Date('2026-08-10T00:18:00.000Z'),
        createdAt: new Date('2026-08-10T01:00:00.000Z'),
        pgBuyPricePerGramCents: 54000,
        pgSellPricePerGramCents: 59000,
      }),
      obs({
        id: 'sep-1',
        priceDate: '2026-09-01',
        capturedPriceAt: new Date('2026-09-01T00:18:00.000Z'),
        createdAt: new Date('2026-09-01T01:00:00.000Z'),
        pgBuyPricePerGramCents: 56000,
        pgSellPricePerGramCents: 61000,
      }),
      obs({
        id: 'sep-5',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        pgBuyPricePerGramCents: 57300,
        pgSellPricePerGramCents: 62500,
      }),
    ];
    const opts = { now: NOW, todayPriceDate: TODAY };
    expect(
      computeGoldPriceAnalytics(rows, { range: 'D7', ...opts }).history.map(
        (row) => row.id,
      ),
    ).toEqual(['sep-1', 'sep-5']);
    expect(
      computeGoldPriceAnalytics(rows, { range: 'D30', ...opts }).history.map(
        (row) => row.id,
      ),
    ).toEqual(['aug-10', 'sep-1', 'sep-5']);
    expect(
      computeGoldPriceAnalytics(rows, { range: 'D90', ...opts }).history.map(
        (row) => row.id,
      ),
    ).toEqual(['aug-1', 'aug-10', 'sep-1', 'sep-5']);
    expect(
      computeGoldPriceAnalytics(rows, { range: 'ALL', ...opts }).history,
    ).toHaveLength(4);
  });

  it('computes high/low/averages and sample count from confirmed observations', () => {
    const rows = [
      obs({
        id: 'a',
        priceDate: '2026-09-03',
        capturedPriceAt: new Date('2026-09-03T00:18:00.000Z'),
        pgBuyPricePerGramCents: 56000,
        pgSellPricePerGramCents: 61000,
      }),
      obs({
        id: 'b',
        priceDate: '2026-09-04',
        capturedPriceAt: new Date('2026-09-04T00:18:00.000Z'),
        pgBuyPricePerGramCents: 58000,
        pgSellPricePerGramCents: 64000,
      }),
      obs({
        id: 'c',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        pgBuyPricePerGramCents: 57300,
        pgSellPricePerGramCents: 62500,
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'D7',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.pgBuy?.high.priceCents).toBe(58000);
    expect(result.pgBuy?.high.priceId).toBe('b');
    expect(result.pgBuy?.low.priceCents).toBe(56000);
    expect(result.pgSell?.high.priceCents).toBe(64000);
    expect(result.pgBuy?.averageCents).toBe(57100);
    expect(result.pgSell?.averageCents).toBe(62500);
    expect(result.averageSpreadCents).toBe(5400);
    expect(result.dataQuality.sampleCount).toBe(3);
    expect(result.dataQuality.daysWithData).toBe(3);
    expect(result.pgBuy?.change?.changeCents).toBe(1300);
  });

  it('keeps all intraday records and groups Malaysia calendar days', () => {
    const rows = [
      obs({
        id: 'morning',
        capturedPriceAt: new Date('2026-09-04T17:00:00.000Z'),
        createdAt: new Date('2026-09-04T17:05:00.000Z'),
        pgBuyPricePerGramCents: 57000,
        pgSellPricePerGramCents: 62200,
      }),
      obs({
        id: 'late',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        createdAt: new Date('2026-09-05T00:20:00.000Z'),
        pgBuyPricePerGramCents: 57300,
        pgSellPricePerGramCents: 62500,
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'D7',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.history).toHaveLength(2);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].malaysiaDate).toBe('2026-09-05');
    expect(result.daily[0].openingPgBuyCents).toBe(57000);
    expect(result.daily[0].closingPgBuyCents).toBe(57300);
    expect(result.daily[0].highPgBuyCents).toBe(57300);
    expect(result.daily[0].lowPgBuyCents).toBe(57000);
    expect(result.daily[0].sampleCount).toBe(2);
  });

  it('includes manual and screenshot sources', () => {
    const rows = [
      obs({
        id: 'manual',
        priceDate: '2026-09-04',
        capturedPriceAt: null,
        source: 'MANUAL',
        pgBuyPricePerGramCents: 56800,
        pgSellPricePerGramCents: 62000,
      }),
      obs({
        id: 'shot',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        source: 'SCREENSHOT',
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'ALL',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.history.map((row) => row.source)).toEqual([
      'MANUAL',
      'SCREENSHOT',
    ]);
    expect(result.history[0].malaysiaDate).toBe('2026-09-04');
  });

  it('returns empty history without fake 0% changes', () => {
    const result = computeGoldPriceAnalytics([], {
      range: 'D7',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.history).toEqual([]);
    expect(result.latest).toBeNull();
    expect(result.vsPreviousBuy).toBeNull();
    expect(result.dataQuality.sampleCount).toBe(0);
    expect(result.dataQuality.hasSufficientHistory).toBe(false);
  });

  it('shows one-record history without period change', () => {
    const result = computeGoldPriceAnalytics(
      [
        obs({
          id: 'only',
          capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
        }),
      ],
      { range: 'D7', now: NOW, todayPriceDate: TODAY },
    );
    expect(result.latest?.id).toBe('only');
    expect(result.previous).toBeNull();
    expect(result.vsPreviousBuy).toBeNull();
    expect(result.pgBuy?.change).toBeNull();
    expect(result.dataQuality.sampleCount).toBe(1);
    expect(result.dataQuality.hasSufficientHistory).toBe(false);
  });

  it('marks 30D history insufficient when samples are sparse', () => {
    const rows = [
      obs({
        id: 'a',
        priceDate: '2026-09-01',
        capturedPriceAt: new Date('2026-09-01T00:18:00.000Z'),
      }),
      obs({
        id: 'b',
        capturedPriceAt: new Date('2026-09-05T00:18:00.000Z'),
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'D30',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.dataQuality.sampleCount).toBe(2);
    expect(result.dataQuality.hasSufficientHistory).toBe(false);
    expect(result.pgBuy?.change).not.toBeNull();
  });

  it('uses earliest timestamp when high/low prices tie', () => {
    const rows = [
      obs({
        id: 'first-high',
        priceDate: '2026-09-03',
        capturedPriceAt: new Date('2026-09-03T00:18:00.000Z'),
        pgBuyPricePerGramCents: 58000,
        pgSellPricePerGramCents: 63000,
      }),
      obs({
        id: 'second-high',
        priceDate: '2026-09-04',
        capturedPriceAt: new Date('2026-09-04T00:18:00.000Z'),
        pgBuyPricePerGramCents: 58000,
        pgSellPricePerGramCents: 63000,
      }),
    ];
    const result = computeGoldPriceAnalytics(rows, {
      range: 'ALL',
      now: NOW,
      todayPriceDate: TODAY,
    });
    expect(result.pgBuy?.high.priceId).toBe('first-high');
    expect(result.pgBuy?.low.priceId).toBe('first-high');
  });
});

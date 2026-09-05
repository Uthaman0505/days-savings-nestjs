import {
  computeGoldPriceAnalytics,
  type GoldPriceObservation,
} from '../gold-price-analytics';
import {
  computeGoldPortfolioAnalytics,
  type GoldPurchaseObservation,
} from '../gold-portfolio-analytics';

export const REPORT_NOW = new Date('2026-09-05T02:00:00.000Z');

export function reportPurchase(
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

export function reportPrice(
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

export const SAMPLE_PURCHASES: GoldPurchaseObservation[] = [
  reportPurchase({ id: 'a' }),
  reportPurchase({
    id: 'b',
    purchaseDate: '2026-09-05',
    weightGrams: '0.5000',
    amountPaidCents: 30000,
    pricePerGramCents: 60000,
    source: 'IMPORT',
    createdAt: new Date('2026-09-05T03:00:00.000Z'),
  }),
];

export const SAMPLE_PRICES: GoldPriceObservation[] = [
  reportPrice({
    id: 'p-prev',
    priceDate: '2026-09-04',
    capturedPriceAt: new Date('2026-09-04T03:20:00.000Z'),
    pgBuyPricePerGramCents: 56800,
    pgSellPricePerGramCents: 62000,
    source: 'MANUAL',
  }),
  reportPrice({ id: 'p-latest' }),
];

export const SAMPLE_LATEST = {
  pgBuyPricePerGramCents: 57300,
  pgSellPricePerGramCents: 62500,
  priceDate: '2026-09-05',
};

export function samplePortfolio(range: 'D7' | 'D30' | 'D90' | 'ALL' = 'ALL') {
  return computeGoldPortfolioAnalytics(SAMPLE_PURCHASES, SAMPLE_PRICES, {
    range,
    now: REPORT_NOW,
    todayPriceDate: '2026-09-05',
    latestPrice: SAMPLE_LATEST,
  });
}

export function samplePrice(range: 'D7' | 'D30' | 'D90' | 'ALL' = 'ALL') {
  return computeGoldPriceAnalytics(SAMPLE_PRICES, {
    range,
    now: REPORT_NOW,
    todayPriceDate: '2026-09-05',
  });
}

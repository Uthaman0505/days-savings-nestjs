import {
  BUY_GAP_NOISY_OCR_TEXT,
  BUY_GAP_SCREENSHOT_OCR_TEXT,
  BUY_GAP_TWO_COLUMN_OCR_TEXT,
  SELL_GAP_SCREENSHOT_OCR_TEXT,
  SELL_GAP_TWO_COLUMN_OCR_TEXT,
} from './fixtures/public-gold-price-screenshot.fixture';
import {
  compareScreenshotTimestamps,
  detectScreenType,
  extractGoldPerGramCents,
  extractUpdatedTimestamp,
  parsePublicGoldPriceScreenshot,
  toPublicGoldSourceMinuteKey,
  validatePriceSpread,
} from './public-gold-price-screenshot.parser';

describe('PublicGoldPriceScreenshotParser', () => {
  it('detects Buy GAP screen type from title', () => {
    expect(detectScreenType(BUY_GAP_SCREENSHOT_OCR_TEXT)).toBe('BUY_GAP');
  });

  it('detects Sell GAP screen type from title', () => {
    expect(detectScreenType(SELL_GAP_SCREENSHOT_OCR_TEXT)).toBe('SELL_GAP');
  });

  it('maps Buy GAP RM625/g to PG SELL 62500 cents', () => {
    const result = parsePublicGoldPriceScreenshot(BUY_GAP_SCREENSHOT_OCR_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.screenType).toBe('BUY_GAP');
    expect(result.priceRole).toBe('PG_SELL');
    expect(result.pgPricePerGramCents).toBe(62500);
  });

  it('maps Sell GAP RM573/g to PG BUY 57300 cents', () => {
    const result = parsePublicGoldPriceScreenshot(SELL_GAP_SCREENSHOT_OCR_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.screenType).toBe('SELL_GAP');
    expect(result.priceRole).toBe('PG_BUY');
    expect(result.pgPricePerGramCents).toBe(57300);
  });

  it('ignores Silver /100g prices and extracts Gold /g only', () => {
    expect(extractGoldPerGramCents(BUY_GAP_SCREENSHOT_OCR_TEXT)).toBe(62500);
    expect(extractGoldPerGramCents(SELL_GAP_SCREENSHOT_OCR_TEXT)).toBe(57300);
    expect(extractGoldPerGramCents(BUY_GAP_SCREENSHOT_OCR_TEXT)).not.toBe(
      105900,
    );
    expect(extractGoldPerGramCents(SELL_GAP_SCREENSHOT_OCR_TEXT)).not.toBe(
      96300,
    );
  });

  it('extracts timestamp 30-Aug-2026 2:37 PM', () => {
    const ts = extractUpdatedTimestamp(BUY_GAP_SCREENSHOT_OCR_TEXT);
    expect(ts).not.toBeNull();
    expect(ts?.priceDate).toBe('2026-08-30');
    expect(ts?.updatedAt.toISOString()).toBe('2026-08-30T06:37:00.000Z');
  });

  it('parses Public Gold OCR timestamp variants without inventing values', () => {
    const expectedIso = '2026-09-05T00:18:00.000Z';
    const variants = [
      'Prices last updated on 05-Sep-2026 8:18 AM',
      'Prices last updated on 05-Sep-2026 08:18 AM',
      'Prices last updated on 05 Sep 2026 8:18 AM',
      'Prices last updated on 05-Sep-2026 8:18AM',
      'Prices last updated on 05-Sep-2026 8.18 AM',
      'Prices last updated on 05-Sep-2026 8:18:37 AM',
    ];
    for (const text of variants) {
      const ts = extractUpdatedTimestamp(text);
      expect(ts?.updatedAt.toISOString()).toBe(expectedIso);
      expect(toPublicGoldSourceMinuteKey(ts!.updatedAt)).toBe(
        '2026-09-05T08:18',
      );
    }
    expect(
      extractUpdatedTimestamp('Prices last updated on yesterday'),
    ).toBeNull();
    expect(
      extractUpdatedTimestamp('Prices last updated on 05-Sep-2026'),
    ).toBeNull();
  });

  it('keeps the gold price when the source timestamp is missing', () => {
    const text = BUY_GAP_SCREENSHOT_OCR_TEXT.replace(
      /Prices last updated on[^\n]+/,
      '',
    );
    const result = parsePublicGoldPriceScreenshot(text);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.pgPricePerGramCents).toBe(62500);
    expect(result.updatedAt).toBeNull();
    expect(result.warnings).toContain('PRICE_TIMESTAMP_NOT_FOUND');
  });

  it('accepts matching timestamps from both screenshots', () => {
    const buyTs = extractUpdatedTimestamp(BUY_GAP_SCREENSHOT_OCR_TEXT);
    const sellTs = extractUpdatedTimestamp(SELL_GAP_SCREENSHOT_OCR_TEXT);
    const check = compareScreenshotTimestamps(
      buyTs?.updatedAt ?? null,
      sellTs?.updatedAt ?? null,
    );
    expect(check.match).toBe(true);
    expect(check.warning).toBeNull();
  });

  it('warns when timestamps differ', () => {
    const buyTs = extractUpdatedTimestamp(BUY_GAP_SCREENSHOT_OCR_TEXT);
    const sellText = SELL_GAP_SCREENSHOT_OCR_TEXT.replace('2:37 PM', '3:05 PM');
    const sellTs = extractUpdatedTimestamp(sellText);
    const check = compareScreenshotTimestamps(
      buyTs?.updatedAt ?? null,
      sellTs?.updatedAt ?? null,
    );
    expect(check.match).toBe(false);
    expect(check.warning).toBe('PRICE_TIMESTAMPS_DIFFER');
  });

  it('matches the same exact Malaysia source minute', () => {
    const buy = new Date('2026-09-05T00:18:00.000Z');
    const sell = new Date('2026-09-05T00:18:00.000Z');
    const check = compareScreenshotTimestamps(buy, sell);
    expect(check.match).toBe(true);
    expect(check.warning).toBeNull();
    expect(check.buyMinute).toBe('2026-09-05T08:18');
  });

  it('matches the same minute when seconds differ', () => {
    const buy = new Date('2026-09-05T00:18:00.000Z');
    const sell = new Date('2026-09-05T00:18:49.123Z');
    const check = compareScreenshotTimestamps(buy, sell);
    expect(check.match).toBe(true);
    expect(check.warning).toBeNull();
  });

  it('fails when the source minute differs', () => {
    const buy = new Date('2026-09-05T00:18:00.000Z');
    const sell = new Date('2026-09-05T00:19:00.000Z');
    const check = compareScreenshotTimestamps(buy, sell);
    expect(check.match).toBe(false);
    expect(check.warning).toBe('PRICE_TIMESTAMPS_DIFFER');
  });

  it('fails when the source date differs', () => {
    const buy = new Date('2026-09-05T00:18:00.000Z');
    const sell = new Date('2026-09-06T00:18:00.000Z');
    const check = compareScreenshotTimestamps(buy, sell);
    expect(check.match).toBe(false);
    expect(check.warning).toBe('PRICE_TIMESTAMPS_DIFFER');
  });

  it('treats equivalent Malaysia source minutes as equal after timezone normalization', () => {
    const fromParser = extractUpdatedTimestamp(
      'Prices last updated on 05-Sep-2026 8:18 AM',
    );
    const storedUtc = new Date('2026-09-05T00:18:00.000Z');
    const storedWithMs = new Date('2026-09-05T00:18:37.500Z');
    expect(toPublicGoldSourceMinuteKey(fromParser!.updatedAt)).toBe(
      '2026-09-05T08:18',
    );
    expect(toPublicGoldSourceMinuteKey(storedUtc)).toBe('2026-09-05T08:18');
    expect(
      compareScreenshotTimestamps(fromParser!.updatedAt, storedWithMs).match,
    ).toBe(true);
  });

  it('uses TIMESTAMP_NOT_FOUND when the BUY source timestamp is missing', () => {
    const sell = new Date('2026-09-05T00:18:00.000Z');
    const check = compareScreenshotTimestamps(null, sell);
    expect(check.match).toBe(false);
    expect(check.warning).toBe('PRICE_TIMESTAMP_NOT_FOUND');
  });

  it('uses TIMESTAMP_NOT_FOUND when the SELL source timestamp is missing', () => {
    const buy = new Date('2026-09-05T00:18:00.000Z');
    const check = compareScreenshotTimestamps(buy, null);
    expect(check.match).toBe(false);
    expect(check.warning).toBe('PRICE_TIMESTAMP_NOT_FOUND');
  });

  it('validates PG SELL >= PG BUY spread for real sample', () => {
    const spread = validatePriceSpread(62500, 57300);
    expect(spread.valid).toBe(true);
  });

  it('rejects invalid spread', () => {
    const spread = validatePriceSpread(56000, 58000);
    expect(spread.valid).toBe(false);
    expect(spread.warning).toBe('INVALID_PRICE_SPREAD');
  });

  it('extracts the yellow-box gold /g price from two-column OCR without using silver /100g', () => {
    expect(extractGoldPerGramCents(BUY_GAP_TWO_COLUMN_OCR_TEXT)).toBe(62500);
    expect(extractGoldPerGramCents(SELL_GAP_TWO_COLUMN_OCR_TEXT)).toBe(57300);
    const buy = parsePublicGoldPriceScreenshot(BUY_GAP_TWO_COLUMN_OCR_TEXT);
    const sell = parsePublicGoldPriceScreenshot(SELL_GAP_TWO_COLUMN_OCR_TEXT);
    expect(
      buy.ok &&
        buy.priceRole === 'PG_SELL' &&
        buy.pgPricePerGramCents === 62500,
    ).toBe(true);
    expect(
      sell.ok &&
        sell.priceRole === 'PG_BUY' &&
        sell.pgPricePerGramCents === 57300,
    ).toBe(true);
  });

  it('recovers yellow-box price when Tesseract reads Au 999.9 as 999 9 and /g as /9', () => {
    const result = parsePublicGoldPriceScreenshot(BUY_GAP_NOISY_OCR_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.pgPricePerGramCents).toBe(62500);
    expect(result.priceRole).toBe('PG_SELL');
  });

  it('does not treat RM 0.00 totals as the gold price', () => {
    expect(extractGoldPerGramCents(BUY_GAP_SCREENSHOT_OCR_TEXT)).toBe(62500);
    expect(extractGoldPerGramCents(BUY_GAP_SCREENSHOT_OCR_TEXT)).not.toBe(0);
  });
});

import {
  BUY_GAP_NOISY_OCR_TEXT,
  BUY_GAP_ONE_GRAM_COMPACT_OCR_TEXT,
  BUY_GAP_ONE_GRAM_NOISY_SPACING_OCR_TEXT,
  BUY_GAP_ONE_GRAM_OCR_TEXT,
  BUY_GAP_ONE_GRAM_SPLIT_OCR_TEXT,
  BUY_GAP_SCREENSHOT_OCR_TEXT,
  BUY_GAP_TESSERACT_RAW_OCR_TEXT,
  BUY_GAP_TESSERACT_RECOVERED_OCR_TEXT,
  BUY_GAP_TWO_COLUMN_OCR_TEXT,
  SELL_GAP_ONE_GRAM_OCR_TEXT,
  SELL_GAP_SCREENSHOT_OCR_TEXT,
  SELL_GAP_SILVER_ONLY_OCR_TEXT,
  SELL_GAP_SLIVER_OCR_TEXT,
  SELL_GAP_TESSERACT_RECOVERED_OCR_TEXT,
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

  it('maps Buy GAP RM 592 = 1.0000 gram to PG SELL 59200 cents', () => {
    const result = parsePublicGoldPriceScreenshot(BUY_GAP_ONE_GRAM_OCR_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.screenType).toBe('BUY_GAP');
    expect(result.priceRole).toBe('PG_SELL');
    expect(result.pgPricePerGramCents).toBe(59200);
    expect(result.priceDate).toBe('2026-10-18');
    expect(result.updatedAt?.toISOString()).toBe('2026-10-18T02:03:00.000Z');
    expect(result.diagnostics).toEqual([]);
    expect(result.pgPricePerGramCents).not.toBe(10000);
  });

  it('maps Sell GAP RM 542 = 1.0000 gram to PG BUY 54200 cents', () => {
    const result = parsePublicGoldPriceScreenshot(SELL_GAP_ONE_GRAM_OCR_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.screenType).toBe('SELL_GAP');
    expect(result.priceRole).toBe('PG_BUY');
    expect(result.pgPricePerGramCents).toBe(54200);
    expect(result.updatedAt?.toISOString()).toBe('2026-10-18T02:03:00.000Z');
    expect(result.pgPricePerGramCents).not.toBe(844);
  });

  it('ignores the RM 100 bundle row and every silver row', () => {
    expect(extractGoldPerGramCents(BUY_GAP_ONE_GRAM_OCR_TEXT)).toBe(59200);
    expect(extractGoldPerGramCents(BUY_GAP_ONE_GRAM_OCR_TEXT)).not.toBe(10000);
    expect(extractGoldPerGramCents(BUY_GAP_ONE_GRAM_OCR_TEXT)).not.toBe(92900);
    expect(extractGoldPerGramCents(SELL_GAP_ONE_GRAM_OCR_TEXT)).toBe(54200);
    expect(extractGoldPerGramCents(SELL_GAP_ONE_GRAM_OCR_TEXT)).not.toBe(844);
  });

  it('reads compact, split-line, and noisy spacing 1g gold rows', () => {
    for (const text of [
      BUY_GAP_ONE_GRAM_COMPACT_OCR_TEXT,
      BUY_GAP_ONE_GRAM_SPLIT_OCR_TEXT,
      BUY_GAP_ONE_GRAM_NOISY_SPACING_OCR_TEXT,
      BUY_GAP_ONE_GRAM_OCR_TEXT.replace('1.0000 gram', '1.000 gram'),
      BUY_GAP_ONE_GRAM_OCR_TEXT.replace('1.0000 gram', '1.0000 g'),
      BUY_GAP_ONE_GRAM_OCR_TEXT.replace('RM 592 = 1.0000 gram', 'RM592=1 gram'),
    ]) {
      expect(extractGoldPerGramCents(text)).toBe(59200);
    }
  });

  it('parses DD/MM/YYYY Last update timestamps and ignores seconds', () => {
    const expectedIso = '2026-10-18T02:03:00.000Z';
    const variants = [
      'Last update: 18/10/2026 10:03:09 AM',
      'Last update : 18/10/2026 10:03:09 AM',
      'Last update 18/10/2026 10:03:09 AM',
      'Last updated: 18/10/2026 10:03:09 AM',
      'Last Update: 18/10/2026 10:03:15 AM',
      'last update: 18/10/2026 10:03:09AM',
      'Last update: 18/10/2026 10:03 AM',
      'Last update:\n18/10/2026 10:03:09 AM',
    ];
    for (const text of variants) {
      const ts = extractUpdatedTimestamp(text);
      expect(ts?.priceDate).toBe('2026-10-18');
      expect(ts?.updatedAt.toISOString()).toBe(expectedIso);
      expect(toPublicGoldSourceMinuteKey(ts!.updatedAt)).toBe(
        '2026-10-18T10:03',
      );
    }
  });

  it('treats 10:03:09 AM and 10:03:15 AM as the same Malaysia source minute', () => {
    const buy = extractUpdatedTimestamp(BUY_GAP_ONE_GRAM_OCR_TEXT);
    const sell = extractUpdatedTimestamp(SELL_GAP_ONE_GRAM_OCR_TEXT);
    const check = compareScreenshotTimestamps(
      buy?.updatedAt ?? null,
      sell?.updatedAt ?? null,
    );
    expect(check.match).toBe(true);
    expect(check.warning).toBeNull();
    expect(check.buyMinute).toBe('2026-10-18T10:03');
    expect(check.sellMinute).toBe('2026-10-18T10:03');
  });

  it('does not select silver when the gold card is missing from OCR', () => {
    expect(extractGoldPerGramCents(SELL_GAP_SILVER_ONLY_OCR_TEXT)).toBeNull();
    const result = parsePublicGoldPriceScreenshot(
      SELL_GAP_SILVER_ONLY_OCR_TEXT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errorCode).toBe('GOLD_PRICE_NOT_FOUND');
    expect(result.diagnostics).toContain('GOLD_SECTION_NOT_FOUND');
    expect(result.diagnostics).not.toContain('UPDATE_TIME_NOT_FOUND');
    expect(result.warnings).not.toContain('GOLD_SECTION_NOT_FOUND');
    expect(result.warnings).not.toContain('AMBIGUOUS_GOLD_PRICE');
  });

  it('stops the gold block at a misread Sliver header', () => {
    const result = parsePublicGoldPriceScreenshot(SELL_GAP_SLIVER_OCR_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.priceRole).toBe('PG_BUY');
    expect(result.pgPricePerGramCents).toBe(54200);
  });

  it('reports an ambiguous gold 1g row instead of picking one', () => {
    const text = `
Buy GAP / SAP
Gold - GAP (Au 999.9)
RM 592 = 1.0000 gram
RM 600 = 1.0000 gram
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:09 AM
`;
    const result = parsePublicGoldPriceScreenshot(text);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errorCode).toBe('GOLD_PRICE_NOT_FOUND');
    expect(result.diagnostics).toContain('AMBIGUOUS_GOLD_PRICE');
    expect(result.warnings).not.toContain('AMBIGUOUS_GOLD_PRICE');
  });

  it('parses tesseract text recovered from the October 2026 screenshots', () => {
    const buy = parsePublicGoldPriceScreenshot(
      BUY_GAP_TESSERACT_RECOVERED_OCR_TEXT,
    );
    const sell = parsePublicGoldPriceScreenshot(
      SELL_GAP_TESSERACT_RECOVERED_OCR_TEXT,
    );
    expect(
      buy.ok &&
        buy.priceRole === 'PG_SELL' &&
        buy.pgPricePerGramCents === 59200,
    ).toBe(true);
    expect(
      sell.ok &&
        sell.priceRole === 'PG_BUY' &&
        sell.pgPricePerGramCents === 54200,
    ).toBe(true);
    if (!buy.ok || !sell.ok) {
      return;
    }
    expect(
      compareScreenshotTimestamps(buy.updatedAt, sell.updatedAt).match,
    ).toBe(true);
  });

  it('does not invent a gold price from raw OCR that only read the silver card', () => {
    const buy = parsePublicGoldPriceScreenshot(BUY_GAP_TESSERACT_RAW_OCR_TEXT);
    const sell = parsePublicGoldPriceScreenshot(SELL_GAP_SILVER_ONLY_OCR_TEXT);
    expect(buy.ok).toBe(false);
    expect(sell.ok).toBe(false);
    if (buy.ok || sell.ok) {
      return;
    }
    expect(buy.errorCode).toBe('GOLD_PRICE_NOT_FOUND');
    expect(sell.errorCode).toBe('GOLD_PRICE_NOT_FOUND');
    expect(buy.diagnostics).toContain('GOLD_SECTION_NOT_FOUND');
    expect(sell.diagnostics).toContain('GOLD_SECTION_NOT_FOUND');
    expect(extractGoldPerGramCents(BUY_GAP_TESSERACT_RAW_OCR_TEXT)).toBeNull();
    expect(extractGoldPerGramCents(SELL_GAP_SILVER_ONLY_OCR_TEXT)).not.toBe(
      844,
    );
  });

  it('reports a missing 1g row when the gold card only has the RM 100 bundle', () => {
    const text = `
Buy GAP / SAP
Gold - GAP (Au 999.9)
RM 100 = 0.1689 gram
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:09 AM
`;
    const result = parsePublicGoldPriceScreenshot(text);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errorCode).toBe('GOLD_PRICE_NOT_FOUND');
    expect(result.diagnostics).toEqual(['GOLD_ONE_GRAM_PRICE_NOT_FOUND']);
    expect(extractGoldPerGramCents(text)).toBeNull();
  });
});

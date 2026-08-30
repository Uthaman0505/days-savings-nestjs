import {
  BUY_GAP_SCREENSHOT_OCR_TEXT,
  SELL_GAP_SCREENSHOT_OCR_TEXT,
} from './fixtures/public-gold-price-screenshot.fixture';
import {
  compareScreenshotTimestamps,
  detectScreenType,
  extractGoldPerGramCents,
  extractUpdatedTimestamp,
  parsePublicGoldPriceScreenshot,
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

  it('validates PG SELL >= PG BUY spread for real sample', () => {
    const spread = validatePriceSpread(62500, 57300);
    expect(spread.valid).toBe(true);
  });

  it('rejects invalid spread', () => {
    const spread = validatePriceSpread(56000, 58000);
    expect(spread.valid).toBe(false);
    expect(spread.warning).toBe('INVALID_PRICE_SPREAD');
  });
});

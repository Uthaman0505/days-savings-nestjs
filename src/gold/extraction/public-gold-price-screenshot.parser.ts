import { parseDecimalRmToCents } from './public-gold-money';

export type PriceScreenshotScreenType = 'BUY_GAP' | 'SELL_GAP' | 'UNKNOWN';

export type PriceScreenshotPriceRole = 'PG_SELL' | 'PG_BUY';

export type ParsedPriceScreenshot = {
  ok: true;
  screenType: PriceScreenshotScreenType;
  priceRole: PriceScreenshotPriceRole;
  pgPricePerGramCents: number;
  priceDate: string;
  updatedAt: Date;
  warnings: string[];
};

export type PriceScreenshotParseFailure = {
  ok: false;
  errorCode: string;
  warnings: string[];
};

export type PriceScreenshotParseResult =
  | ParsedPriceScreenshot
  | PriceScreenshotParseFailure;

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const BUY_TITLE_RE = /\bBuy\s+GAP\s*(?:\/\s*SAP)?\b/i;
const SELL_TITLE_RE = /\bSell\s+GAP\s*(?:\/\s*SAP)?\b/i;
const GOLD_MARKER_RE = /Gold\s*\(\s*Au\s*999\.9\s*\)/i;
const SILVER_MARKER_RE = /Silver\s*\(\s*Si\s*999\s*\)/i;
const UPDATED_RE =
  /Prices\s+last\s+updated\s+on\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;

/** Per-gram gold price only — rejects /100g silver-style units. */
const GOLD_PER_GRAM_RE = /RM\s*([\d,]+(?:\.\d{1,2})?)\s*\/\s*g\b/i;

export function parsePublicGoldPriceScreenshot(
  rawText: string,
): PriceScreenshotParseResult {
  const warnings: string[] = [];
  const text = rawText.replace(/\r\n/g, '\n');

  const screenType = detectScreenType(text);
  if (screenType === 'UNKNOWN') {
    return {
      ok: false,
      errorCode: 'SCREEN_TYPE_UNCERTAIN',
      warnings: ['SCREEN_TYPE_UNCERTAIN'],
    };
  }

  const priceRole: PriceScreenshotPriceRole =
    screenType === 'BUY_GAP' ? 'PG_SELL' : 'PG_BUY';

  const goldPrice = extractGoldPerGramCents(text);
  if (goldPrice == null) {
    return {
      ok: false,
      errorCode: 'GOLD_PRICE_NOT_FOUND',
      warnings,
    };
  }

  const timestamp = extractUpdatedTimestamp(text);
  if (!timestamp) {
    return {
      ok: false,
      errorCode: 'PRICE_TIMESTAMP_NOT_FOUND',
      warnings,
    };
  }

  return {
    ok: true,
    screenType,
    priceRole,
    pgPricePerGramCents: goldPrice,
    priceDate: timestamp.priceDate,
    updatedAt: timestamp.updatedAt,
    warnings,
  };
}

export function detectScreenType(text: string): PriceScreenshotScreenType {
  const hasBuy = BUY_TITLE_RE.test(text);
  const hasSell = SELL_TITLE_RE.test(text);
  if (hasBuy && !hasSell) {
    return 'BUY_GAP';
  }
  if (hasSell && !hasBuy) {
    return 'SELL_GAP';
  }
  return 'UNKNOWN';
}

export function extractGoldPerGramCents(text: string): number | null {
  const goldIdx = text.search(GOLD_MARKER_RE);
  if (goldIdx < 0) {
    return null;
  }

  const silverIdx = text.search(SILVER_MARKER_RE);
  const goldSection =
    silverIdx > goldIdx
      ? text.slice(goldIdx, silverIdx)
      : text.slice(goldIdx, goldIdx + 400);

  const match = goldSection.match(GOLD_PER_GRAM_RE);
  if (!match) {
    return null;
  }

  return parseDecimalRmToCents(match[1]);
}

export function extractUpdatedTimestamp(text: string): {
  priceDate: string;
  updatedAt: Date;
} | null {
  const match = text.match(UPDATED_RE);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = MONTH_MAP[match[2].toLowerCase()];
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const ampm = match[6].toUpperCase();

  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }

  if (ampm === 'PM' && hour < 12) {
    hour += 12;
  }
  if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }

  const priceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Public Gold timestamps are Malaysia local (UTC+8).
  const updatedAt = new Date(
    Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0),
  );

  return { priceDate, updatedAt };
}

export function compareScreenshotTimestamps(
  buyUpdatedAt: Date | null,
  sellUpdatedAt: Date | null,
): { match: boolean; warning: string | null } {
  if (!buyUpdatedAt || !sellUpdatedAt) {
    return { match: true, warning: null };
  }
  if (buyUpdatedAt.getTime() !== sellUpdatedAt.getTime()) {
    return { match: false, warning: 'PRICE_TIMESTAMPS_DIFFER' };
  }
  return { match: true, warning: null };
}

export function validatePriceSpread(
  pgSellCents: number,
  pgBuyCents: number,
): { valid: boolean; warning: string | null } {
  if (pgSellCents < pgBuyCents) {
    return { valid: false, warning: 'INVALID_PRICE_SPREAD' };
  }
  return { valid: true, warning: null };
}

import { parseDecimalRmToCents } from './public-gold-money';

export type PriceScreenshotScreenType = 'BUY_GAP' | 'SELL_GAP' | 'UNKNOWN';

export type PriceScreenshotPriceRole = 'PG_SELL' | 'PG_BUY';

export type ParsedPriceScreenshot = {
  ok: true;
  screenType: PriceScreenshotScreenType;
  priceRole: PriceScreenshotPriceRole;
  pgPricePerGramCents: number;
  priceDate: string | null;
  updatedAt: Date | null;
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
/** Yellow card: Gold (Au 999.9). Allows "Gold Silver\\n(Au 999.9)" two-column OCR. */
const GOLD_MARKER_RE = /Gold[\s\S]{0,40}?\(\s*Au\s*999(?:[.\s,]?9)?\s*\)/i;
const UPDATED_RE =
  /Prices\s+last\s+updated\s+on\s+(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})\s+(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)/i;

/**
 * Gold yellow-box unit is /g. Tesseract often reads /g as /9.
 * /100g (silver) is captured as a separate unit so it can be skipped.
 */
const RM_UNIT_PRICE_SOURCE =
  'RM\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*\\/\\s*(100\\s*g|g|9)\\b';

export function normalizePriceScreenshotOcr(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
  text = text.replace(/\b(Au|Ag|Si)\s*9999\b/gi, '$1 999.9');
  text = text.replace(/\b(Au|Ag|Si)\s*999[\s,]9\b/gi, '$1 999.9');
  return text;
}

/** Compact OCR for logs — never include image bytes or tokens. */
export function compactOcrSnippet(raw: string, max = 240): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function parsePublicGoldPriceScreenshot(
  rawText: string,
): PriceScreenshotParseResult {
  const warnings: string[] = [];
  const text = normalizePriceScreenshotOcr(rawText);

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
      ok: true,
      screenType,
      priceRole,
      pgPricePerGramCents: goldPrice,
      priceDate: null,
      updatedAt: null,
      warnings: ['PRICE_TIMESTAMP_NOT_FOUND'],
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
  const normalized = normalizePriceScreenshotOcr(text);
  const hasBuy = BUY_TITLE_RE.test(normalized);
  const hasSell = SELL_TITLE_RE.test(normalized);
  if (hasBuy && !hasSell) {
    return 'BUY_GAP';
  }
  if (hasSell && !hasBuy) {
    return 'SELL_GAP';
  }
  return 'UNKNOWN';
}

/**
 * Yellow-box gold per-gram price. Must not use silver /100g or RM 0.00 totals.
 * Does not truncate at "Silver": two-column OCR often emits Silver before RM 625/g.
 */
export function extractGoldPerGramCents(text: string): number | null {
  const normalized = normalizePriceScreenshotOcr(text);
  const goldIdx = normalized.search(GOLD_MARKER_RE);
  const searchFrom = goldIdx >= 0 ? goldIdx : 0;
  const window = normalized.slice(searchFrom);
  const priceRe = new RegExp(RM_UNIT_PRICE_SOURCE, 'gi');

  for (const match of window.matchAll(priceRe)) {
    const unit = match[2].replace(/\s+/g, '').toLowerCase();
    if (unit.startsWith('100')) {
      continue;
    }
    const cents = parseDecimalRmToCents(match[1]);
    if (cents != null) {
      return cents;
    }
  }

  return null;
}

export function extractUpdatedTimestamp(text: string): {
  priceDate: string;
  updatedAt: Date;
} | null {
  const match = normalizePriceScreenshotOcr(text).match(UPDATED_RE);
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

  if (
    day < 1 ||
    day > 31 ||
    minute < 0 ||
    minute > 59 ||
    hour < 1 ||
    hour > 12
  ) {
    return null;
  }

  if (ampm === 'PM' && hour < 12) {
    hour += 12;
  }
  if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }

  const priceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Public Gold wall time is Malaysia (UTC+8, no DST). Store UTC instant for that minute.
  const updatedAt = new Date(
    Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0),
  );

  return { priceDate, updatedAt };
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Malaysia source minute `YYYY-MM-DDTHH:mm`. Ignores seconds/ms and host TZ. */
export function toPublicGoldSourceMinuteKey(
  value: Date | string,
): string | null {
  const date = toDateOrNull(value);
  if (!date) {
    return null;
  }
  const myt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = myt.getUTCFullYear();
  const m = String(myt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(myt.getUTCDate()).padStart(2, '0');
  const h = String(myt.getUTCHours()).padStart(2, '0');
  const min = String(myt.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function compareScreenshotTimestamps(
  buyUpdatedAt: Date | string | null | undefined,
  sellUpdatedAt: Date | string | null | undefined,
): {
  match: boolean;
  warning: string | null;
  buyMinute: string | null;
  sellMinute: string | null;
} {
  const buyDate = toDateOrNull(buyUpdatedAt);
  const sellDate = toDateOrNull(sellUpdatedAt);
  const buyMinute = buyDate ? toPublicGoldSourceMinuteKey(buyDate) : null;
  const sellMinute = sellDate ? toPublicGoldSourceMinuteKey(sellDate) : null;

  if (!buyMinute && !sellMinute) {
    return {
      match: false,
      warning: 'PRICE_TIMESTAMP_NOT_FOUND',
      buyMinute,
      sellMinute,
    };
  }
  if (!buyMinute || !sellMinute) {
    return {
      match: false,
      warning: 'PRICE_TIMESTAMP_NOT_FOUND',
      buyMinute,
      sellMinute,
    };
  }
  if (buyMinute !== sellMinute) {
    return {
      match: false,
      warning: 'PRICE_TIMESTAMPS_DIFFER',
      buyMinute,
      sellMinute,
    };
  }
  return { match: true, warning: null, buyMinute, sellMinute };
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

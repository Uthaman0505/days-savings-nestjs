import { parseDecimalRmToCents } from './public-gold-money';

export type PriceScreenshotScreenType = 'BUY_GAP' | 'SELL_GAP' | 'UNKNOWN';

export type PriceScreenshotPriceRole = 'PG_SELL' | 'PG_BUY';

/** Developer-log diagnostics. Not copied onto user-facing screenshot warnings. */
export const PRICE_PARSER_DIAGNOSTICS = {
  GOLD_SECTION_NOT_FOUND: 'GOLD_SECTION_NOT_FOUND',
  GOLD_ONE_GRAM_PRICE_NOT_FOUND: 'GOLD_ONE_GRAM_PRICE_NOT_FOUND',
  UPDATE_TIME_NOT_FOUND: 'UPDATE_TIME_NOT_FOUND',
  AMBIGUOUS_GOLD_PRICE: 'AMBIGUOUS_GOLD_PRICE',
} as const;

export type PriceParserDiagnostic =
  (typeof PRICE_PARSER_DIAGNOSTICS)[keyof typeof PRICE_PARSER_DIAGNOSTICS];

export type ParsedPriceScreenshot = {
  ok: true;
  screenType: PriceScreenshotScreenType;
  priceRole: PriceScreenshotPriceRole;
  pgPricePerGramCents: number;
  priceDate: string | null;
  updatedAt: Date | null;
  warnings: string[];
  diagnostics: PriceParserDiagnostic[];
};

export type PriceScreenshotParseFailure = {
  ok: false;
  errorCode: string;
  warnings: string[];
  diagnostics: PriceParserDiagnostic[];
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

/** Quantities within this of 1g are the per-gram price row, not RM 100 bundles. */
const ONE_GRAM_TOLERANCE = 0.02;

const BUY_TITLE_RE = /\bBuy\s+GAP\s*(?:\/\s*SAP)?\b/i;
const SELL_TITLE_RE = /\bSell\s+GAP\s*(?:\/\s*SAP)?\b/i;
/** Yellow card: Gold (Au 999.9). Allows "Gold Silver\\n(Au 999.9)" two-column OCR. */
const GOLD_MARKER_RE = /Gold[\s\S]{0,40}?\(\s*Au\s*999(?:[.\s,]?9)?\s*\)/i;
/**
 * New Buy/Sell GAP cards: "Gold - GAP (Au 999.9)".
 * Old single-column cards: "Gold (Au 999.9)".
 * Two-column OCR ("Gold Silver (Au") must NOT match, or the silver cut would drop RM 625/g.
 */
const GOLD_SECTION_HEADER_RE = /Gold\s*[-–—]?\s*GAP\b|Gold\s*\(\s*Au\s*999/i;
const SILVER_SECTION_HEADER_RE =
  /\b(?:Silver|Sliver)\s*[-–—]?\s*SAP\b|\b(?:Silver|Sliver)\s*\(\s*Ag\b/i;
const UPDATED_NAMED_MONTH_RE =
  /(?:\bprices\s+)?\blast\s+updated\s+on\s+(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(AM|PM)\b/i;
const UPDATED_NUMERIC_RE =
  /\blast\s+update(?:d)?(?:\s+on)?\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(AM|PM)\b/i;

/**
 * Gold yellow-box unit is /g. Tesseract often reads /g as /9.
 * /100g (silver) is captured as a separate unit so it can be skipped.
 */
const RM_UNIT_PRICE_SOURCE =
  'RM\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*\\/\\s*(100\\s*g|g|9)\\b';

const ONE_GRAM_ROW_SOURCE =
  '\\bRM\\s*(\\d{1,6}(?:,\\d{3})*(?:\\.\\d{1,2})?)\\s*=\\s*(\\d+(?:\\s*[.,]\\s*\\d+)?)\\s*(?:grams?|g)\\b';

export function normalizePriceScreenshotOcr(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
  text = text.replace(/[‐‑‒–—]/g, '-');
  text = text.replace(/＝/g, '=');
  text = text.replace(/\bR\s*\.?\s*M\b/gi, 'RM');
  text = text.replace(/\bRM\s*[.:]\s*(?=\d)/gi, 'RM ');
  text = text.replace(/[^\S\n]+/g, ' ');
  text = text.replace(/\b(Au|Ag|Si)\s*9999\b/gi, '$1 999.9');
  text = text.replace(/\b(Au|Ag|Si)\s*999[\s,]9\b/gi, '$1 999.9');
  return text;
}

function collapseOcrWhitespace(text: string): string {
  return normalizePriceScreenshotOcr(text).replace(/\s+/g, ' ').trim();
}

/** Compact OCR for logs — never include image bytes or tokens. */
export function compactOcrSnippet(raw: string, max = 240): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function parsePublicGoldPriceScreenshot(
  rawText: string,
): PriceScreenshotParseResult {
  const text = normalizePriceScreenshotOcr(rawText);

  const screenType = detectScreenType(text);
  if (screenType === 'UNKNOWN') {
    return {
      ok: false,
      errorCode: 'SCREEN_TYPE_UNCERTAIN',
      warnings: ['SCREEN_TYPE_UNCERTAIN'],
      diagnostics: [],
    };
  }

  const priceRole: PriceScreenshotPriceRole =
    screenType === 'BUY_GAP' ? 'PG_SELL' : 'PG_BUY';

  const price = inspectGoldPerGramPrice(text);
  const timestamp = extractUpdatedTimestamp(text);
  const diagnostics = [...price.diagnostics];
  if (!timestamp) {
    diagnostics.push(PRICE_PARSER_DIAGNOSTICS.UPDATE_TIME_NOT_FOUND);
  }

  if (price.cents == null) {
    return {
      ok: false,
      errorCode: 'GOLD_PRICE_NOT_FOUND',
      warnings: [],
      diagnostics,
    };
  }

  if (!timestamp) {
    return {
      ok: true,
      screenType,
      priceRole,
      pgPricePerGramCents: price.cents,
      priceDate: null,
      updatedAt: null,
      warnings: ['PRICE_TIMESTAMP_NOT_FOUND'],
      diagnostics,
    };
  }

  return {
    ok: true,
    screenType,
    priceRole,
    pgPricePerGramCents: price.cents,
    priceDate: timestamp.priceDate,
    updatedAt: timestamp.updatedAt,
    warnings: [],
    diagnostics: [],
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

type GoldPriceInspection = {
  cents: number | null;
  diagnostics: PriceParserDiagnostic[];
};

/**
 * Prefer the Gold-section row whose quantity is about 1 gram (`RM 592 = 1.0000 gram`).
 * Fall back to the legacy yellow-box `RM 625/g` form when that row is absent.
 * An ambiguous 1g row is never replaced with another RM amount.
 */
function inspectGoldPerGramPrice(text: string): GoldPriceInspection {
  const collapsed = collapseOcrWhitespace(text);
  const section = findGoldSectionBlock(collapsed);

  if (!section) {
    const legacy = extractLegacySlashPerGramCents(text);
    if (legacy != null) {
      return { cents: legacy, diagnostics: [] };
    }
    return {
      cents: null,
      diagnostics: [PRICE_PARSER_DIAGNOSTICS.GOLD_SECTION_NOT_FOUND],
    };
  }

  const oneGramPrices = uniqueCents(oneGramPricesIn(section));
  if (oneGramPrices.length === 1) {
    return { cents: oneGramPrices[0], diagnostics: [] };
  }
  if (oneGramPrices.length > 1) {
    return {
      cents: null,
      diagnostics: [PRICE_PARSER_DIAGNOSTICS.AMBIGUOUS_GOLD_PRICE],
    };
  }

  const legacy = extractLegacySlashPerGramCents(text);
  if (legacy != null) {
    return { cents: legacy, diagnostics: [] };
  }
  return {
    cents: null,
    diagnostics: [PRICE_PARSER_DIAGNOSTICS.GOLD_ONE_GRAM_PRICE_NOT_FOUND],
  };
}

/**
 * Yellow-box gold per-gram price. Must not use silver /100g or RM 0.00 totals.
 * Does not truncate at "Silver": two-column OCR often emits Silver before RM 625/g.
 */
export function extractGoldPerGramCents(text: string): number | null {
  return inspectGoldPerGramPrice(text).cents;
}

/**
 * Gold block runs from the Gold GAP / Au header up to the next Silver header.
 * "Sliver" is included because Tesseract misreads Silver that way.
 */
function findGoldSectionBlock(collapsed: string): string | null {
  const header = GOLD_SECTION_HEADER_RE.exec(collapsed);
  if (!header) {
    return null;
  }
  const afterHeader = header.index + header[0].length;
  const silverAt = collapsed
    .slice(afterHeader)
    .search(SILVER_SECTION_HEADER_RE);
  const end = silverAt >= 0 ? afterHeader + silverAt : collapsed.length;
  return collapsed.slice(header.index, end);
}

function oneGramPricesIn(block: string): number[] {
  const priceRe = new RegExp(ONE_GRAM_ROW_SOURCE, 'gi');
  const cents: number[] = [];
  for (const match of block.matchAll(priceRe)) {
    const quantity = parseGramQuantity(match[2]);
    if (quantity == null || Math.abs(quantity - 1) > ONE_GRAM_TOLERANCE) {
      continue;
    }
    const priceCents = parseDecimalRmToCents(match[1]);
    if (priceCents != null) {
      cents.push(priceCents);
    }
  }
  return cents;
}

function parseGramQuantity(raw: string): number | null {
  const compact = raw.replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(compact)) {
    return null;
  }
  const value = Number(compact);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function uniqueCents(values: number[]): number[] {
  return [...new Set(values)];
}

function extractLegacySlashPerGramCents(text: string): number | null {
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
  const collapsed = collapseOcrWhitespace(text);
  const named = collapsed.match(UPDATED_NAMED_MONTH_RE);
  if (named) {
    const month = MONTH_MAP[named[2].toLowerCase()];
    if (!month) {
      return null;
    }
    return malaysiaWallTime({
      day: Number(named[1]),
      month,
      year: Number(named[3]),
      hour: Number(named[4]),
      minute: Number(named[5]),
      ampm: named[6],
    });
  }

  const numeric = collapsed.match(UPDATED_NUMERIC_RE);
  if (!numeric) {
    return null;
  }

  return malaysiaWallTime({
    day: Number(numeric[1]),
    month: Number(numeric[2]),
    year: Number(numeric[3]),
    hour: Number(numeric[4]),
    minute: Number(numeric[5]),
    ampm: numeric[6],
  });
}

function malaysiaWallTime(parts: {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
  ampm: string;
}): { priceDate: string; updatedAt: Date } | null {
  const { day, month, year, minute } = parts;
  let hour = parts.hour;
  const ampm = parts.ampm.toUpperCase();

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(year) ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isInteger(hour) ||
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

  // Public Gold wall time is Malaysia (UTC+8, no DST). Store the UTC instant
  // for that minute; seconds in the source text are ignored.
  const updatedAt = new Date(
    Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0),
  );
  const myt = new Date(updatedAt.getTime() + 8 * 60 * 60 * 1000);
  if (
    myt.getUTCFullYear() !== year ||
    myt.getUTCMonth() !== month - 1 ||
    myt.getUTCDate() !== day ||
    myt.getUTCHours() !== hour ||
    myt.getUTCMinutes() !== minute
  ) {
    return null;
  }

  const priceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

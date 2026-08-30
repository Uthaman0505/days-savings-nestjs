/**
 * Normalizes and validates stub/OCR candidate fields for GoldExtractionItem rows.
 * Does not create GoldPurchase records.
 */

import {
  derivePricePerGramCents,
  normalizeStoredWeightGrams,
  parseGramsToUnits,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';

export type ExtractionWarningCode =
  | 'MISSING_DATE'
  | 'MISSING_WEIGHT'
  | 'MISSING_AMOUNT'
  | 'GRAMS_OVER_4DP'
  | 'INVALID_WEIGHT'
  | 'INVALID_AMOUNT'
  | 'INVALID_DATE'
  | 'INVALID_PRICE_PER_GRAM'
  | 'MISSING_REFERENCE'
  | 'POSSIBLE_DUPLICATE'
  | 'PURCHASE_DATE_FROM_INVOICE_DATE'
  | 'AMOUNT_PRICE_WEIGHT_MISMATCH'
  | 'AMOUNT_TOTAL_MISMATCH';

export type RawExtractionCandidate = {
  purchaseDate?: string | null;
  weightGrams?: string | null;
  amountPaidCents?: number | null;
  pricePerGramCents?: number | null;
  referenceNumber?: string | null;
  rawFields?: Record<string, unknown> | null;
  confidence?: string | number | null;
};

export type NormalizedExtractionCandidate = {
  purchaseDate: string | null;
  weightGrams: string | null;
  amountPaidCents: number | null;
  pricePerGramCents: number | null;
  referenceNumber: string | null;
  confidence: string | null;
  rawFields: Record<string, unknown> | null;
  validationWarnings: ExtractionWarningCode[];
  status: 'DETECTED' | 'NEEDS_REVIEW';
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DD_MM_YYYY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const OVER_4DP_RE = /^\d+\.\d{5,}$/;

export function normalizeExtractionCandidate(
  raw: RawExtractionCandidate,
  extraWarnings: ExtractionWarningCode[] = [],
): NormalizedExtractionCandidate {
  const warnings: ExtractionWarningCode[] = [...extraWarnings];
  const rawFields = raw.rawFields ?? null;

  const purchaseDate = normalizePurchaseDate(
    raw.purchaseDate ?? extractRawText(rawFields, 'dateText'),
    warnings,
  );

  const weightGrams = normalizeWeightGrams(
    raw.weightGrams ?? extractRawText(rawFields, 'weightText'),
    warnings,
  );

  const amountPaidCents = normalizeAmountCents(
    raw.amountPaidCents ?? extractRawAmountCents(rawFields, 'amountText'),
    warnings,
  );

  let pricePerGramCents = normalizePricePerGramCents(
    raw.pricePerGramCents,
    warnings,
  );

  if (
    pricePerGramCents == null &&
    amountPaidCents != null &&
    weightGrams != null
  ) {
    try {
      pricePerGramCents = derivePricePerGramCents(amountPaidCents, weightGrams);
    } catch {
      warnings.push('INVALID_PRICE_PER_GRAM');
    }
  }

  const referenceNumber = normalizeReference(
    raw.referenceNumber ?? extractRawText(rawFields, 'referenceText'),
    warnings,
  );

  const integrityWarning = checkAmountWeightPriceMismatch(
    weightGrams,
    pricePerGramCents,
    amountPaidCents,
  );
  if (integrityWarning) {
    warnings.push(integrityWarning);
  }

  const confidence = normalizeConfidence(raw.confidence);

  const uniqueWarnings = [...new Set(warnings)];

  return {
    purchaseDate,
    weightGrams,
    amountPaidCents,
    pricePerGramCents,
    referenceNumber,
    confidence,
    rawFields,
    validationWarnings: uniqueWarnings,
    status: uniqueWarnings.length > 0 ? 'NEEDS_REVIEW' : 'DETECTED',
  };
}

function normalizePurchaseDate(
  raw: string | null | undefined,
  warnings: ExtractionWarningCode[],
): string | null {
  if (raw == null || !String(raw).trim()) {
    warnings.push('MISSING_DATE');
    return null;
  }

  const trimmed = String(raw).trim();

  if (DATE_RE.test(trimmed)) {
    if (!isValidCalendarDate(trimmed)) {
      warnings.push('INVALID_DATE');
      return null;
    }
    return trimmed;
  }

  const ddmmyyyy = trimmed.match(DD_MM_YYYY_RE);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    const iso = `${year}-${month}-${day}`;
    if (!isValidCalendarDate(iso)) {
      warnings.push('INVALID_DATE');
      return null;
    }
    return iso;
  }

  warnings.push('INVALID_DATE');
  return null;
}

function normalizeWeightGrams(
  raw: string | null | undefined,
  warnings: ExtractionWarningCode[],
): string | null {
  if (raw == null || !String(raw).trim()) {
    warnings.push('MISSING_WEIGHT');
    return null;
  }

  const trimmed = String(raw)
    .trim()
    .replace(/\s*g(rams?)?\s*$/i, '');

  if (OVER_4DP_RE.test(trimmed)) {
    warnings.push('GRAMS_OVER_4DP');
    return null;
  }

  try {
    parseGramsToUnits(trimmed);
    return normalizeStoredWeightGrams(trimmed);
  } catch {
    warnings.push('INVALID_WEIGHT');
    return null;
  }
}

function normalizeAmountCents(
  raw: number | string | null | undefined,
  warnings: ExtractionWarningCode[],
): number | null {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    warnings.push('MISSING_AMOUNT');
    return null;
  }

  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw <= 0) {
      warnings.push('INVALID_AMOUNT');
      return null;
    }
    return raw;
  }

  const trimmed = raw.trim();
  const rmMatch = trimmed.match(/^RM\s*([\d,]+(?:\.\d{1,2})?)$/i);
  const numeric = rmMatch
    ? rmMatch[1].replace(/,/g, '')
    : trimmed.replace(/,/g, '');

  if (!/^\d+(\.\d{1,2})?$/.test(numeric)) {
    warnings.push('INVALID_AMOUNT');
    return null;
  }

  const [whole, frac = ''] = numeric.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isInteger(cents) || cents <= 0) {
    warnings.push('INVALID_AMOUNT');
    return null;
  }
  return cents;
}

function normalizePricePerGramCents(
  raw: number | null | undefined,
  warnings: ExtractionWarningCode[],
): number | null {
  if (raw == null) {
    return null;
  }
  if (!Number.isInteger(raw) || raw <= 0) {
    warnings.push('INVALID_PRICE_PER_GRAM');
    return null;
  }
  return raw;
}

function normalizeReference(
  raw: string | null | undefined,
  warnings: ExtractionWarningCode[],
): string | null {
  if (raw == null || !String(raw).trim()) {
    warnings.push('MISSING_REFERENCE');
    return null;
  }
  return String(raw).trim().slice(0, 100);
}

function normalizeConfidence(
  raw: string | number | null | undefined,
): string | null {
  if (raw == null || raw === '') {
    return null;
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return null;
  }
  return n.toFixed(4);
}

function extractRawText(
  rawFields: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = rawFields?.[key];
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function extractRawAmountCents(
  rawFields: Record<string, unknown> | null,
  key: string,
): number | string | null {
  const value = rawFields?.[key];
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function isValidCalendarDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Compare weight × price/g to amount paid; allow 1 cent rounding tolerance. */
function checkAmountWeightPriceMismatch(
  weightGrams: string | null,
  pricePerGramCents: number | null,
  amountPaidCents: number | null,
): ExtractionWarningCode | null {
  if (
    weightGrams == null ||
    pricePerGramCents == null ||
    amountPaidCents == null
  ) {
    return null;
  }
  try {
    const expected = valueCentsFromGramsAndUnitPrice(
      weightGrams,
      pricePerGramCents,
    );
    if (Math.abs(expected - amountPaidCents) > 1) {
      return 'AMOUNT_PRICE_WEIGHT_MISMATCH';
    }
  } catch {
    return null;
  }
  return null;
}

export function toExtractionWarningCodes(
  codes: string[],
): ExtractionWarningCode[] {
  const allowed = new Set<string>([
    'MISSING_DATE',
    'MISSING_WEIGHT',
    'MISSING_AMOUNT',
    'GRAMS_OVER_4DP',
    'INVALID_WEIGHT',
    'INVALID_AMOUNT',
    'INVALID_DATE',
    'INVALID_PRICE_PER_GRAM',
    'MISSING_REFERENCE',
    'POSSIBLE_DUPLICATE',
    'PURCHASE_DATE_FROM_INVOICE_DATE',
    'AMOUNT_PRICE_WEIGHT_MISMATCH',
    'AMOUNT_TOTAL_MISMATCH',
  ]);
  return codes.filter((code): code is ExtractionWarningCode =>
    allowed.has(code),
  );
}

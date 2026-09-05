/**
 * Decimal-safe helpers for gold weight (grams) × money (integer cents).
 * Uses 0.0001g integer units (BigInt) + half-up rounding — no IEEE float money math.
 */

/** 1 gram = 10_000 units (0.0001 g resolution). */
export const GRAM_SCALE = 10000n;

const WEIGHT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

/** Parse grams string to 0.0001g integer units. "1.1686" → 11686n */
export function parseGramsToUnits(weightGrams: string): bigint {
  const trimmed = weightGrams.trim();
  if (!WEIGHT_RE.test(trimmed)) {
    throw new Error('INVALID_WEIGHT_FORMAT');
  }
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '0000').slice(0, 4);
  const units = BigInt(whole) * GRAM_SCALE + BigInt(fracPadded);
  if (units <= 0n) {
    throw new Error('INVALID_WEIGHT_POSITIVE');
  }
  return units;
}

/** Format integer units as numeric(12,4) string. 11686n → "1.1686" */
export function formatGramUnits(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / GRAM_SCALE;
  const frac = abs % GRAM_SCALE;
  const s = `${whole.toString()}.${frac.toString().padStart(4, '0')}`;
  return neg ? `-${s}` : s;
}

/**
 * Normalize weight from DB/API (string or driver number) to canonical 4dp string.
 * Handles legacy 3dp values and float artifacts from numeric drivers.
 */
export function normalizeStoredWeightGrams(raw: string | number): string {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new Error('INVALID_WEIGHT_FORMAT');
    }
    return formatGramUnits(parseGramsToUnits(raw.toFixed(4)));
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    throw new Error('INVALID_WEIGHT_FORMAT');
  }
  return formatGramUnits(parseGramsToUnits(trimmed));
}

/** Half-up division for non-negative BigInts. */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('INVALID_DIVISOR');
  }
  if (numerator < 0n) {
    throw new Error('INVALID_NUMERATOR');
  }
  return (numerator + denominator / 2n) / denominator;
}

/** price_per_gram_cents = round(amount_cents / weight_grams) */
export function derivePricePerGramCents(
  amountPaidCents: number,
  weightGrams: string,
): number {
  const units = parseGramsToUnits(weightGrams);
  return Number(roundHalfUpDiv(BigInt(amountPaidCents) * GRAM_SCALE, units));
}

/** value_cents = round(weight_grams × price_per_gram_cents) */
export function valueCentsFromGramsAndUnitPrice(
  weightGrams: string,
  pricePerGramCents: number,
): number {
  const units = parseGramsToUnits(weightGrams);
  return Number(roundHalfUpDiv(units * BigInt(pricePerGramCents), GRAM_SCALE));
}

export function sumGramsStrings(weights: string[]): string {
  let totalUnits = 0n;
  for (const w of weights) {
    totalUnits += parseGramsToUnits(w);
  }
  return formatGramUnits(totalUnits);
}

/** average cost cents/g = round(total_invested / total_grams) */
export function averageCostPerGramCents(
  totalInvestedCents: number,
  totalGrams: string,
): number {
  if (totalInvestedCents <= 0) {
    return 0;
  }
  let units: bigint;
  try {
    units = parseGramsToUnits(totalGrams);
  } catch {
    return 0;
  }
  if (units === 0n) {
    return 0;
  }
  return Number(roundHalfUpDiv(BigInt(totalInvestedCents) * GRAM_SCALE, units));
}

/** Integer-cent average with half-up rounding. */
export function averageIntsHalfUp(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  let sum = 0n;
  for (const value of values) {
    sum += BigInt(value);
  }
  return Number(roundHalfUpDiv(sum, BigInt(values.length)));
}

/**
 * Percent with 2 decimal places: round((part / whole) × 10000) / 100.
 * Example: 5200 / 62500 → 8.32
 */
export function ratioPercent(part: number, whole: number): number | null {
  if (whole <= 0) {
    return null;
  }
  const negative = part < 0;
  const absPart = negative ? -part : part;
  const hundredths = Number(
    roundHalfUpDiv(BigInt(absPart) * 10000n, BigInt(whole)),
  );
  return (negative ? -hundredths : hundredths) / 100;
}

/**
 * Signed percent change with 2 decimal places.
 * Example: 56800 → 57300 = +0.88
 */
export function signedPercentChange(
  fromCents: number,
  toCents: number,
): number | null {
  if (fromCents <= 0) {
    return null;
  }
  return ratioPercent(toCents - fromCents, fromCents);
}

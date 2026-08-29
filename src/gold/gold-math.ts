/**
 * Decimal-safe helpers for gold weight (grams) × money (integer cents).
 * Uses milligram integers + BigInt half-up rounding — no IEEE float money math.
 */

const WEIGHT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

/** Parse grams string to milligrams (integer). "10.000" → 10000 */
export function gramsToMilligrams(weightGrams: string): bigint {
  const trimmed = weightGrams.trim();
  if (!WEIGHT_RE.test(trimmed)) {
    throw new Error('INVALID_WEIGHT_FORMAT');
  }
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '000').slice(0, 3);
  const mg = BigInt(whole) * 1000n + BigInt(fracPadded);
  if (mg <= 0n) {
    throw new Error('INVALID_WEIGHT_POSITIVE');
  }
  return mg;
}

/** Format milligrams as numeric(12,3) string. 15000 → "15.000" */
export function milligramsToGramsString(mg: bigint): string {
  const neg = mg < 0n;
  const abs = neg ? -mg : mg;
  const whole = abs / 1000n;
  const frac = abs % 1000n;
  const s = `${whole.toString()}.${frac.toString().padStart(3, '0')}`;
  return neg ? `-${s}` : s;
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
  const mg = gramsToMilligrams(weightGrams);
  // amount / (mg/1000) = amount * 1000 / mg
  return Number(roundHalfUpDiv(BigInt(amountPaidCents) * 1000n, mg));
}

/** value_cents = round(weight_grams × price_per_gram_cents) */
export function valueCentsFromGramsAndUnitPrice(
  weightGrams: string,
  pricePerGramCents: number,
): number {
  const mg = gramsToMilligrams(weightGrams);
  // (mg/1000) * price = mg * price / 1000
  return Number(roundHalfUpDiv(mg * BigInt(pricePerGramCents), 1000n));
}

export function sumGramsStrings(weights: string[]): string {
  let totalMg = 0n;
  for (const w of weights) {
    totalMg += gramsToMilligrams(w);
  }
  return milligramsToGramsString(totalMg);
}

/** average cost cents/g = round(total_invested / total_grams) */
export function averageCostPerGramCents(
  totalInvestedCents: number,
  totalGrams: string,
): number {
  if (totalInvestedCents <= 0) {
    return 0;
  }
  let mg: bigint;
  try {
    mg = gramsToMilligrams(totalGrams);
  } catch {
    return 0;
  }
  if (mg === 0n) {
    return 0;
  }
  return Number(roundHalfUpDiv(BigInt(totalInvestedCents) * 1000n, mg));
}

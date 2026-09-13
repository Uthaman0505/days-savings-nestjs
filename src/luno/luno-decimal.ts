const DECIMAL_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Canonical decimal string without IEEE float arithmetic.
 * Accepts Luno JSON strings or (as a fallback) finite JSON numbers.
 */
export function asDecimalString(value: unknown, fallback = '0'): string {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (DECIMAL_RE.test(trimmed)) {
      return trimmed;
    }
    throw new Error('INVALID_DECIMAL');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('INVALID_DECIMAL');
    }
    return stringifyFiniteNumber(value);
  }
  throw new Error('INVALID_DECIMAL');
}

function stringifyFiniteNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const asString = value.toString();
  if (asString.includes('e') || asString.includes('E')) {
    throw new Error('INVALID_DECIMAL');
  }
  return asString;
}

export function parseDecimalOrNull(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  try {
    return asDecimalString(value);
  } catch {
    return null;
  }
}

type SignedDecimal = { negative: boolean; whole: string; frac: string };

function splitSigned(value: string): SignedDecimal {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, frac = ''] = unsigned.split('.');
  return { negative, whole, frac };
}

function toScaled(parts: SignedDecimal, scale: number): bigint {
  const fracPadded = (parts.frac + '0'.repeat(scale)).slice(0, scale);
  const units =
    BigInt(parts.whole || '0') * 10n ** BigInt(scale) +
    BigInt(fracPadded || '0');
  return parts.negative ? -units : units;
}

function fromScaled(units: bigint, scale: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  if (scale === 0) {
    return `${negative ? '-' : ''}${abs.toString()}`;
  }
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const frac = abs % base;
  const fracText = frac.toString().padStart(scale, '0').replace(/0+$/, '');
  const body = fracText.length
    ? `${whole.toString()}.${fracText}`
    : whole.toString();
  return negative ? `-${body}` : body;
}

/** Add two canonical decimal strings with BigInt — never IEEE float. */
export function addDecimalStrings(left: string, right: string): string {
  const a = splitSigned(asDecimalString(left));
  const b = splitSigned(asDecimalString(right));
  const scale = Math.max(a.frac.length, b.frac.length);
  return fromScaled(toScaled(a, scale) + toScaled(b, scale), scale);
}

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

export function subtractDecimalStrings(left: string, right: string): string {
  return addDecimalStrings(left, negateDecimal(right));
}

export function negateDecimal(value: string): string {
  const canonical = asDecimalString(value);
  if (canonical === '0') {
    return '0';
  }
  return canonical.startsWith('-') ? canonical.slice(1) : `-${canonical}`;
}

export function absDecimal(value: string): string {
  const canonical = asDecimalString(value);
  return canonical.startsWith('-') ? canonical.slice(1) : canonical;
}

export function compareDecimal(left: string, right: string): number {
  const a = splitSigned(asDecimalString(left));
  const b = splitSigned(asDecimalString(right));
  const scale = Math.max(a.frac.length, b.frac.length);
  const diff = toScaled(a, scale) - toScaled(b, scale);
  if (diff < 0n) {
    return -1;
  }
  if (diff > 0n) {
    return 1;
  }
  return 0;
}

export function isZeroDecimal(value: string): boolean {
  return compareDecimal(value, '0') === 0;
}

export function minDecimal(left: string, right: string): string {
  return compareDecimal(left, right) <= 0 ? asDecimalString(left) : asDecimalString(right);
}

export function multiplyDecimalStrings(left: string, right: string): string {
  const a = splitSigned(asDecimalString(left));
  const b = splitSigned(asDecimalString(right));
  const scale = a.frac.length + b.frac.length;
  const product = toScaled(a, a.frac.length) * toScaled(b, b.frac.length);
  return fromScaled(product, scale);
}

/**
 * Divide with half-up rounding to `scale` fractional digits.
 * Returns null when the divisor is zero.
 */
export function divideDecimalStrings(
  numerator: string,
  denominator: string,
  scale = 18,
): string | null {
  const n = splitSigned(asDecimalString(numerator));
  const d = splitSigned(asDecimalString(denominator));
  const common = Math.max(n.frac.length, d.frac.length);
  const nUnits = toScaled(n, common);
  const dUnits = toScaled(d, common);
  if (dUnits === 0n) {
    return null;
  }
  const negative = nUnits < 0n !== dUnits < 0n;
  const nAbs = nUnits < 0n ? -nUnits : nUnits;
  const dAbs = dUnits < 0n ? -dUnits : dUnits;
  const factor = 10n ** BigInt(scale);
  const scaled = nAbs * factor;
  let quot = scaled / dAbs;
  const rem = scaled % dAbs;
  if (rem * 2n >= dAbs) {
    quot += 1n;
  }
  return fromScaled(negative ? -quot : quot, scale);
}

export function roundDecimal(value: string, places: number): string {
  const rounded = divideDecimalStrings(value, '1', places);
  return rounded ?? '0';
}

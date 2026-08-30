/**
 * Deterministic MYR/decimal → integer cents parsing for Public Gold documents.
 */

/** Parse "654.00" or "654" → 65400 cents. */
export function parseDecimalRmToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  const rmMatch = trimmed.match(/^(?:MYR\s*)?(\d+(?:\.\d{1,2})?)$/i);
  const numeric = rmMatch ? rmMatch[1] : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(numeric)) {
    return null;
  }
  const [whole, frac = ''] = numeric.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isInteger(cents) || cents <= 0) {
    return null;
  }
  return cents;
}

/** Parse gram weight text such as "0.1529" preserving up to 4dp. */
export function parseWeightText(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s*g(rams?)?\s*$/i, '');
  if (!/^\d+(?:\.\d{1,4})?$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Parse ISO calendar date prefix from "2026-08-26 13:30:31". */
export function parseIsoDatePrefix(raw: string): string | null {
  const match = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

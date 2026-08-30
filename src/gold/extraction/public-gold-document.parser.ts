import type { RawExtractionCandidate } from '../gold-extraction-normalize';
import {
  parseDecimalRmToCents,
  parseIsoDatePrefix,
  parseWeightText,
} from './public-gold-money';

export type PublicGoldDocumentType = 'PUBLIC_GOLD_PROFORMA_INVOICE';

export type PublicGoldParseErrorCode =
  | 'UNSUPPORTED_DOCUMENT_FORMAT'
  | 'NO_PURCHASE_ROWS_FOUND';

export type PublicGoldParsedCandidate = RawExtractionCandidate & {
  parserWarnings: string[];
};

export type PublicGoldParseSuccess = {
  ok: true;
  documentType: PublicGoldDocumentType;
  candidates: PublicGoldParsedCandidate[];
};

export type PublicGoldParseFailure = {
  ok: false;
  errorCode: PublicGoldParseErrorCode;
  candidates: [];
};

export type PublicGoldParseResult =
  | PublicGoldParseSuccess
  | PublicGoldParseFailure;

const DOC_NO_RE = /Doc\s*No\s*:\s*(\d+)/i;
const PURCHASE_DATE_RE =
  /Purchase\s*Date\s*:\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/i;
const INVOICE_DATE_RE =
  /Invoice\s*Date\s*:\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/i;
const PAYMENT_BY_RE = /Payment\s*By\s*:\s*(\S+)/i;
const TOTAL_PAYABLE_RE =
  /TOTAL\s+PAYABLE\s+INCL\s+SST\s*:\s*MYR\s*([\d,]+\.\d{2})/i;
const PRODUCT_ROW_RE =
  /(\d+\.\d{2})\s+(\d+\.\d{1,4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/;

export function isPublicGoldDocument(text: string): boolean {
  const upper = text.toUpperCase();
  let score = 0;
  if (upper.includes('PUBLIC GOLD')) {
    score += 1;
  }
  if (upper.includes('PROFORMA INVOICE')) {
    score += 1;
  }
  if (
    upper.includes('GOLD ACCUMULATION PROGRAM') ||
    upper.includes('GOLD / SILVER ACCUMULATION PROGRAM')
  ) {
    score += 1;
  }
  if (upper.includes('TOTAL PAYABLE INCL SST')) {
    score += 1;
  }
  return score >= 2;
}

/**
 * Parse Public Gold digital PDF text into zero or more purchase candidates.
 * Returns an array to preserve multi-row history support in later formats.
 */
export function parsePublicGoldDocument(text: string): PublicGoldParseResult {
  if (!isPublicGoldDocument(text)) {
    return {
      ok: false,
      errorCode: 'UNSUPPORTED_DOCUMENT_FORMAT',
      candidates: [],
    };
  }

  const docNo = text.match(DOC_NO_RE)?.[1] ?? null;
  const purchaseDateText = text.match(PURCHASE_DATE_RE)?.[1] ?? null;
  const invoiceDateText = text.match(INVOICE_DATE_RE)?.[1] ?? null;
  const paymentBy = text.match(PAYMENT_BY_RE)?.[1] ?? null;
  const totalPayableText = text.match(TOTAL_PAYABLE_RE)?.[1] ?? null;

  const parserWarnings: string[] = [];
  let purchaseDate = purchaseDateText
    ? parseIsoDatePrefix(purchaseDateText)
    : null;

  if (!purchaseDate && invoiceDateText) {
    purchaseDate = parseIsoDatePrefix(invoiceDateText);
    if (purchaseDate) {
      parserWarnings.push('PURCHASE_DATE_FROM_INVOICE_DATE');
    }
  }

  const productMatch = text.match(PRODUCT_ROW_RE);
  if (!productMatch) {
    return { ok: false, errorCode: 'NO_PURCHASE_ROWS_FOUND', candidates: [] };
  }

  const pricePerGramText = productMatch[1];
  const weightText = productMatch[2];
  const totalExclSstText = productMatch[3];
  const totalInclSstText = productMatch[5];

  const pricePerGramCents = parseDecimalRmToCents(pricePerGramText);
  const weightGrams = parseWeightText(weightText);
  const tableInclSstCents = parseDecimalRmToCents(totalInclSstText);
  const totalPayableCents = totalPayableText
    ? parseDecimalRmToCents(totalPayableText.replace(/,/g, ''))
    : tableInclSstCents;

  if (
    tableInclSstCents != null &&
    totalPayableCents != null &&
    tableInclSstCents !== totalPayableCents
  ) {
    parserWarnings.push('AMOUNT_TOTAL_MISMATCH');
  }

  const productLine =
    text
      .split('\n')
      .find((line) => /GOLD ACCUMULATION PROGRAM/i.test(line))
      ?.trim() ?? null;

  const rawFields: Record<string, unknown> = {
    documentType: 'PUBLIC_GOLD_PROFORMA_INVOICE',
    extractionSource: 'IMPORT',
    docNo,
    invoiceDateText: invoiceDateText ?? null,
    purchaseDateText: purchaseDateText ?? null,
    paymentBy,
    description: productLine,
    pricePerGramText,
    weightText,
    totalExclSstText,
    totalInclSstText,
    totalPayableText: totalPayableText ? `MYR ${totalPayableText}` : null,
  };

  const candidate: PublicGoldParsedCandidate = {
    purchaseDate,
    weightGrams,
    amountPaidCents: totalPayableCents,
    pricePerGramCents,
    referenceNumber: docNo,
    rawFields,
    parserWarnings,
  };

  return {
    ok: true,
    documentType: 'PUBLIC_GOLD_PROFORMA_INVOICE',
    candidates: [candidate],
  };
}

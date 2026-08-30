import { normalizeExtractionCandidate } from '../gold-extraction-normalize';
import {
  PUBLIC_GOLD_INVOICE_DATE_ONLY,
  PUBLIC_GOLD_MISMATCH_AMOUNT,
  PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE,
  PUBLIC_GOLD_PROFORMA_SPACING_VARIANT,
  UNSUPPORTED_PDF_TEXT,
} from './fixtures/public-gold-proforma.fixture';
import { parsePublicGoldDocument } from './public-gold-document.parser';
import { parseDecimalRmToCents } from './public-gold-money';

describe('public-gold-document.parser', () => {
  it('extracts expected fields from standard Proforma Invoice fixture', () => {
    const result = parsePublicGoldDocument(
      PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.documentType).toBe('PUBLIC_GOLD_PROFORMA_INVOICE');
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    expect(candidate.referenceNumber).toBe('21727607');
    expect(candidate.purchaseDate).toBe('2026-08-26');
    expect(candidate.weightGrams).toBe('0.1529');
    expect(candidate.pricePerGramCents).toBe(65400);
    expect(candidate.amountPaidCents).toBe(10000);

    const normalized = normalizeExtractionCandidate(
      candidate,
      candidate.parserWarnings as never[],
    );
    expect(normalized.validationWarnings).not.toContain(
      'AMOUNT_PRICE_WEIGHT_MISMATCH',
    );
  });

  it('handles spacing variations in labels', () => {
    const result = parsePublicGoldDocument(
      PUBLIC_GOLD_PROFORMA_SPACING_VARIANT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.candidates[0].referenceNumber).toBe('21727607');
  });

  it('prefers Purchase Date over Invoice Date when both exist', () => {
    const text = PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE.replace(
      'Purchase Date : 2026-08-26 13:30:31',
      'Purchase Date : 2026-06-02 13:30:31',
    );
    const result = parsePublicGoldDocument(text);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.candidates[0].purchaseDate).toBe('2026-06-02');
    expect(result.candidates[0].parserWarnings).not.toContain(
      'PURCHASE_DATE_FROM_INVOICE_DATE',
    );
  });

  it('falls back to Invoice Date with warning when Purchase Date missing', () => {
    const result = parsePublicGoldDocument(PUBLIC_GOLD_INVOICE_DATE_ONLY);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.candidates[0].purchaseDate).toBe('2026-07-01');
    expect(result.candidates[0].parserWarnings).toContain(
      'PURCHASE_DATE_FROM_INVOICE_DATE',
    );
  });

  it('preserves 4dp grams exactly', () => {
    const result = parsePublicGoldDocument(
      PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.candidates[0].weightGrams).toBe('0.1529');
  });

  it('parses MYR amount and price to integer cents', () => {
    expect(parseDecimalRmToCents('654.00')).toBe(65400);
    expect(parseDecimalRmToCents('MYR 100.00')).toBe(10000);
  });

  it('flags deliberate amount mismatch via integrity normalization', () => {
    const result = parsePublicGoldDocument(PUBLIC_GOLD_MISMATCH_AMOUNT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const normalized = normalizeExtractionCandidate(
      result.candidates[0],
      result.candidates[0].parserWarnings as never[],
    );
    expect(normalized.amountPaidCents).toBe(12000);
    expect(normalized.validationWarnings).toContain('AMOUNT_TOTAL_MISMATCH');
    expect(normalized.validationWarnings).toContain(
      'AMOUNT_PRICE_WEIGHT_MISMATCH',
    );
  });

  it('returns unsupported error for unrelated PDF text', () => {
    const result = parsePublicGoldDocument(UNSUPPORTED_PDF_TEXT);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errorCode).toBe('UNSUPPORTED_DOCUMENT_FORMAT');
    expect(result.candidates).toHaveLength(0);
  });

  it('returns multiple candidates when parser receives an array contract', () => {
    const first = parsePublicGoldDocument(PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE);
    const second = parsePublicGoldDocument(
      PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE.replace('21727607', '21727608'),
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const combined = [...first.candidates, ...second.candidates];
    expect(combined).toHaveLength(2);
  });
});

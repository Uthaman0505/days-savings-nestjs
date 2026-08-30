import { normalizeExtractionCandidate } from './gold-extraction-normalize';

describe('gold-extraction-normalize', () => {
  it('normalizes a valid 4dp candidate without warnings', () => {
    const result = normalizeExtractionCandidate({
      purchaseDate: '2026-08-26',
      weightGrams: '1.1686',
      amountPaidCents: 65000,
      referenceNumber: 'PG123456',
    });

    expect(result.weightGrams).toBe('1.1686');
    expect(result.purchaseDate).toBe('2026-08-26');
    expect(result.amountPaidCents).toBe(65000);
    expect(result.validationWarnings).toEqual([]);
    expect(result.status).toBe('DETECTED');
  });

  it('flags grams over 4 decimal places without silent rounding', () => {
    const result = normalizeExtractionCandidate({
      purchaseDate: '2026-08-26',
      weightGrams: '1.16861',
      amountPaidCents: 65000,
      referenceNumber: 'PG123456',
    });

    expect(result.weightGrams).toBeNull();
    expect(result.validationWarnings).toContain('GRAMS_OVER_4DP');
    expect(result.status).toBe('NEEDS_REVIEW');
  });

  it('accepts 0.0001 grams', () => {
    const result = normalizeExtractionCandidate({
      purchaseDate: '2026-08-26',
      weightGrams: '0.0001',
      amountPaidCents: 100,
      referenceNumber: 'PG1',
    });

    expect(result.weightGrams).toBe('0.0001');
  });

  it('warns on missing reference but continues extraction', () => {
    const result = normalizeExtractionCandidate({
      purchaseDate: '2026-08-26',
      weightGrams: '0.5000',
      amountPaidCents: 28000,
    });

    expect(result.referenceNumber).toBeNull();
    expect(result.validationWarnings).toContain('MISSING_REFERENCE');
    expect(result.weightGrams).toBe('0.5000');
  });

  it('warns on missing amount', () => {
    const result = normalizeExtractionCandidate({
      purchaseDate: '2026-08-26',
      weightGrams: '0.5000',
      referenceNumber: 'PG-A001',
    });

    expect(result.amountPaidCents).toBeNull();
    expect(result.validationWarnings).toContain('MISSING_AMOUNT');
  });

  it('parses DD/MM/YYYY date text from raw_fields', () => {
    const result = normalizeExtractionCandidate({
      rawFields: {
        dateText: '26/08/2026',
        weightText: '0.3686 G',
        amountText: 'RM210.00',
        referenceText: 'PG-A003',
      },
    });

    expect(result.purchaseDate).toBe('2026-08-26');
    expect(result.weightGrams).toBe('0.3686');
    expect(result.amountPaidCents).toBe(21000);
    expect(result.referenceNumber).toBe('PG-A003');
  });

  it('derives price per gram when amount and weight are valid', () => {
    const result = normalizeExtractionCandidate({
      purchaseDate: '2026-06-02',
      weightGrams: '0.5000',
      amountPaidCents: 28000,
      referenceNumber: 'PG-A001',
    });

    expect(result.pricePerGramCents).toBe(56000);
  });
});

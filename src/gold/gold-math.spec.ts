import {
  averageCostPerGramCents,
  averageIntsHalfUp,
  derivePricePerGramCents,
  formatGramUnits,
  normalizeStoredWeightGrams,
  parseGramsToUnits,
  ratioPercent,
  signedPercentChange,
  sumGramsStrings,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';

describe('gold-math', () => {
  describe('parseGramsToUnits', () => {
    it('parses valid gram strings to integer units', () => {
      expect(parseGramsToUnits('10.0000')).toBe(100000n);
      expect(parseGramsToUnits('5.5')).toBe(55000n);
      expect(parseGramsToUnits('0.0001')).toBe(1n);
      expect(parseGramsToUnits('1.1686')).toBe(11686n);
    });

    it('rejects more than 4 decimal places', () => {
      expect(() => parseGramsToUnits('1.16861')).toThrow(
        'INVALID_WEIGHT_FORMAT',
      );
      expect(() => parseGramsToUnits('0.00001')).toThrow(
        'INVALID_WEIGHT_FORMAT',
      );
    });
  });

  it('derives price per gram with half-up rounding', () => {
    expect(derivePricePerGramCents(500000, '10.000')).toBe(50000);
    expect(derivePricePerGramCents(740000, '15.000')).toBe(49333);
  });

  it('values holdings with unit price (PG BUY path)', () => {
    expect(valueCentsFromGramsAndUnitPrice('15.000', 52000)).toBe(780000);
    expect(valueCentsFromGramsAndUnitPrice('15.000', 54000)).toBe(810000);
    expect(valueCentsFromGramsAndUnitPrice('1.1686', 50000)).toBe(58430);
  });

  it('sums grams with four-decimal precision', () => {
    expect(sumGramsStrings(['10.000', '5.000'])).toBe('15.0000');
    expect(sumGramsStrings(['1.1686', '0.5004'])).toBe('1.6690');
  });

  it('formats gram units back to string', () => {
    expect(formatGramUnits(11686n)).toBe('1.1686');
    expect(formatGramUnits(1n)).toBe('0.0001');
  });

  it('normalizes legacy 3dp stored weights', () => {
    expect(normalizeStoredWeightGrams('10.000')).toBe('10.0000');
    expect(normalizeStoredWeightGrams('1.1686')).toBe('1.1686');
  });

  it('computes average cost', () => {
    expect(averageCostPerGramCents(740000, '15.000')).toBe(49333);
    expect(averageCostPerGramCents(0, '0.0000')).toBe(0);
  });

  it('computes integer averages and signed percent changes without float money math', () => {
    expect(averageIntsHalfUp([56000, 58000, 57300])).toBe(57100);
    expect(ratioPercent(5200, 62500)).toBe(8.32);
    expect(signedPercentChange(56800, 57300)).toBe(0.88);
    expect(signedPercentChange(57300, 56800)).toBe(-0.87);
    expect(signedPercentChange(0, 100)).toBeNull();
  });
});

import {
  averageCostPerGramCents,
  derivePricePerGramCents,
  gramsToMilligrams,
  sumGramsStrings,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';

describe('gold-math', () => {
  it('parses grams to milligrams', () => {
    expect(gramsToMilligrams('10.000')).toBe(10000n);
    expect(gramsToMilligrams('5.5')).toBe(5500n);
    expect(gramsToMilligrams('0.001')).toBe(1n);
  });

  it('derives price per gram with half-up rounding', () => {
    expect(derivePricePerGramCents(500000, '10.000')).toBe(50000);
    expect(derivePricePerGramCents(740000, '15.000')).toBe(49333);
  });

  it('values holdings with unit price (PG BUY path)', () => {
    expect(valueCentsFromGramsAndUnitPrice('15.000', 52000)).toBe(780000);
    expect(valueCentsFromGramsAndUnitPrice('15.000', 54000)).toBe(810000);
  });

  it('sums grams', () => {
    expect(sumGramsStrings(['10.000', '5.000'])).toBe('15.000');
  });

  it('computes average cost', () => {
    expect(averageCostPerGramCents(740000, '15.000')).toBe(49333);
    expect(averageCostPerGramCents(0, '0.000')).toBe(0);
  });
});

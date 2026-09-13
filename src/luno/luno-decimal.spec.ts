import {
  asDecimalString,
  addDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  roundDecimal,
} from './luno-decimal';

describe('luno-decimal', () => {
  it('keeps canonical decimal strings without float rounding', () => {
    expect(asDecimalString('0.00000001')).toBe('0.00000001');
    expect(asDecimalString('123.45')).toBe('123.45');
    expect(asDecimalString(100)).toBe('100');
  });

  it('adds MYR cents and BTC satoshi-scale amounts with BigInt', () => {
    expect(addDecimalStrings('10.10', '0.05')).toBe('10.15');
    expect(addDecimalStrings('0.12345678', '0.00000001')).toBe('0.12345679');
    expect(addDecimalStrings('1.50', '2.50')).toBe('4');
  });

  it('multiplies and divides without IEEE float', () => {
    expect(multiplyDecimalStrings('0.00000504', '315451')).toBe('1.58987304');
    expect(divideDecimalStrings('125', '0.0005', 2)).toBe('250000');
    expect(divideDecimalStrings('1', '0', 2)).toBeNull();
    expect(roundDecimal('1.595', 2)).toBe('1.6');
  });

  it('rejects scientific notation and NaN', () => {
    expect(() => asDecimalString('1e-8')).toThrow('INVALID_DECIMAL');
    expect(() => asDecimalString(Number.NaN)).toThrow('INVALID_DECIMAL');
  });
});

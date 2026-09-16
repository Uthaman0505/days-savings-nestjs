import { BadRequestException } from '@nestjs/common';
import {
  budgetStatus,
  isStrategyMoneyReady,
  maxAllowedNewBtcSpendMyr,
  parseBudgetConfig,
  remainingBudgetMyr,
} from './luno-btc-budget';

describe('Luno BTC budget formulas', () => {
  it('computes remaining and max allowed spend from RM100 − RM50', () => {
    expect(remainingBudgetMyr('100', '50')).toBe('50');
    expect(maxAllowedNewBtcSpendMyr('100.00', '50.00')).toBe('50');
  });

  it('returns WITHIN_BUDGET, LIMIT_REACHED, OVER_BUDGET, NOT_CONFIGURED', () => {
    expect(budgetStatus('100', '50')).toBe('WITHIN_BUDGET');
    expect(budgetStatus('100', '100')).toBe('LIMIT_REACHED');
    expect(budgetStatus('40', '50')).toBe('OVER_BUDGET');
    expect(budgetStatus(null, '50')).toBe('NOT_CONFIGURED');
  });

  it('caps remaining at zero when used exceeds budget', () => {
    expect(remainingBudgetMyr('40', '50')).toBe('0');
    expect(maxAllowedNewBtcSpendMyr('40', '50')).toBe('0');
    expect(maxAllowedNewBtcSpendMyr(null, '50')).toBe('0');
  });

  it('rejects allocations that exceed the monthly budget', () => {
    expect(() =>
      parseBudgetConfig({
        monthlyBudgetMyr: '100',
        normalBuyAllocationMyr: '60',
        dipReserveAllocationMyr: '50',
      }),
    ).toThrow(BadRequestException);
    expect(
      parseBudgetConfig({
        monthlyBudgetMyr: '100',
        normalBuyAllocationMyr: '50',
        dipReserveAllocationMyr: '50',
      }),
    ).toEqual({
      monthlyBudgetMyr: '100',
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '50',
    });
  });

  it('does not infer a split when only the monthly budget is set', () => {
    expect(parseBudgetConfig({ monthlyBudgetMyr: '100' })).toEqual({
      monthlyBudgetMyr: '100',
      normalBuyAllocationMyr: null,
      dipReserveAllocationMyr: null,
    });
  });

  it('preserves decimal strings without IEEE float', () => {
    expect(remainingBudgetMyr('100.10', '50.03')).toBe('50.07');
  });

  it('requires accounting READY and remaining spend for strategy money readiness', () => {
    expect(
      isStrategyMoneyReady({
        accountingStatus: 'READY',
        monthlyRemainingMyr: '50',
      }),
    ).toBe(true);
    expect(
      isStrategyMoneyReady({
        accountingStatus: 'PARTIAL',
        monthlyRemainingMyr: '50',
      }),
    ).toBe(false);
    expect(
      isStrategyMoneyReady({
        accountingStatus: 'READY',
        monthlyRemainingMyr: '0',
      }),
    ).toBe(false);
    expect(
      isStrategyMoneyReady({
        accountingStatus: 'READY',
        monthlyRemainingMyr: null,
      }),
    ).toBe(false);
  });
});

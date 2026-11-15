import { BadRequestException } from '@nestjs/common';
import {
  budgetDisplayState,
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

  it('accepts RM0 and the staged budget examples', () => {
    for (const amount of ['0', '0.00', '20', '50', '100', '200']) {
      expect(
        parseBudgetConfig({ monthlyBudgetMyr: amount }).monthlyBudgetMyr,
      ).toBe(amount);
    }
  });

  it('rejects negative, invalid, and non-finite budget amounts', () => {
    expect(() => parseBudgetConfig({ monthlyBudgetMyr: '-1' })).toThrow(
      BadRequestException,
    );
    expect(() => parseBudgetConfig({ monthlyBudgetMyr: 'Infinity' })).toThrow(
      BadRequestException,
    );
    expect(() => parseBudgetConfig({ monthlyBudgetMyr: 'NaN' })).toThrow(
      BadRequestException,
    );
    expect(() => parseBudgetConfig({ monthlyBudgetMyr: '1e2' })).toThrow(
      BadRequestException,
    );
  });

  it('distinguishes confirmation, RM0, and an exhausted budget', () => {
    expect(budgetDisplayState(null, '0').state).toBe('NOT_CONFIRMED');
    expect(budgetDisplayState('0', '0').state).toBe('RM0_STOP');
    expect(budgetDisplayState('0', '20').state).toBe('RM0_STOP');
    expect(budgetDisplayState('100', '100').state).toBe('EXHAUSTED');
    expect(budgetDisplayState('40', '50').state).toBe('EXHAUSTED');
    expect(budgetDisplayState('100', '50').state).toBe('CONFIRMED');
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

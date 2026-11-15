import { BadRequestException } from '@nestjs/common';
import {
  addDecimalStrings,
  asDecimalString,
  compareDecimal,
  maxDecimal,
  subtractDecimalStrings,
} from '../luno-decimal';

export type LunoBtcBudgetStatus =
  | 'WITHIN_BUDGET'
  | 'LIMIT_REACHED'
  | 'OVER_BUDGET'
  | 'NOT_CONFIGURED';

export type LunoBtcBudgetDisplayState =
  | 'NOT_CONFIRMED'
  | 'CONFIRMED'
  | 'RM0_STOP'
  | 'EXHAUSTED';

export type LunoBtcBudgetConfig = {
  monthlyBudgetMyr: string;
  normalBuyAllocationMyr: string | null;
  dipReserveAllocationMyr: string | null;
};

/**
 * remaining = max(budget − used, 0)
 * Display rounding happens in the service, not here.
 */
export function remainingBudgetMyr(
  monthlyBudgetMyr: string,
  monthlyUsedMyr: string,
): string {
  return maxDecimal(
    subtractDecimalStrings(monthlyBudgetMyr, monthlyUsedMyr),
    '0',
  );
}

export function maxAllowedNewBtcSpendMyr(
  monthlyBudgetMyr: string | null,
  monthlyUsedMyr: string,
): string {
  if (monthlyBudgetMyr == null) {
    return '0';
  }
  return remainingBudgetMyr(monthlyBudgetMyr, monthlyUsedMyr);
}

export function budgetStatus(
  monthlyBudgetMyr: string | null,
  monthlyUsedMyr: string,
): LunoBtcBudgetStatus {
  if (monthlyBudgetMyr == null) {
    return 'NOT_CONFIGURED';
  }
  const cmp = compareDecimal(monthlyUsedMyr, monthlyBudgetMyr);
  if (cmp < 0) {
    return 'WITHIN_BUDGET';
  }
  if (cmp === 0) {
    return 'LIMIT_REACHED';
  }
  return 'OVER_BUDGET';
}

export function budgetDisplayState(
  monthlyBudgetMyr: string | null,
  monthlyUsedMyr: string,
): { state: LunoBtcBudgetDisplayState; label: string } {
  if (monthlyBudgetMyr == null) {
    return { state: 'NOT_CONFIRMED', label: 'Not confirmed' };
  }
  if (compareDecimal(monthlyBudgetMyr, '0') === 0) {
    return { state: 'RM0_STOP', label: 'RM0 STOP' };
  }
  if (
    compareDecimal(remainingBudgetMyr(monthlyBudgetMyr, monthlyUsedMyr), '0') <=
    0
  ) {
    return { state: 'EXHAUSTED', label: 'Monthly budget exhausted' };
  }
  return { state: 'CONFIRMED', label: 'Confirmed' };
}

export function budgetStatusLabel(status: LunoBtcBudgetStatus): string {
  switch (status) {
    case 'WITHIN_BUDGET':
      return 'Within budget';
    case 'LIMIT_REACHED':
      return 'Monthly limit reached';
    case 'OVER_BUDGET':
      return 'Over monthly budget';
    case 'NOT_CONFIGURED':
      return 'Set your monthly BTC budget';
  }
}

export function isStrategyMoneyReady(input: {
  accountingStatus: string;
  monthlyRemainingMyr: string | null;
}): boolean {
  if (input.accountingStatus !== 'READY') {
    return false;
  }
  if (input.monthlyRemainingMyr == null) {
    return false;
  }
  return compareDecimal(input.monthlyRemainingMyr, '0') > 0;
}

export function parseBudgetConfig(input: {
  monthlyBudgetMyr: string;
  normalBuyAllocationMyr?: string | null;
  dipReserveAllocationMyr?: string | null;
}): LunoBtcBudgetConfig {
  const monthlyBudgetMyr = parseBudgetAmount(
    input.monthlyBudgetMyr,
    'Monthly budget',
  );
  if (compareDecimal(monthlyBudgetMyr, '0') < 0) {
    throw new BadRequestException('Monthly budget cannot be negative.');
  }
  const normal =
    input.normalBuyAllocationMyr == null || input.normalBuyAllocationMyr === ''
      ? null
      : parseBudgetAmount(input.normalBuyAllocationMyr, 'Normal buying');
  const dip =
    input.dipReserveAllocationMyr == null ||
    input.dipReserveAllocationMyr === ''
      ? null
      : parseBudgetAmount(input.dipReserveAllocationMyr, 'Dip reserve');
  if (normal != null && compareDecimal(normal, '0') < 0) {
    throw new BadRequestException('Normal buying cannot be negative.');
  }
  if (dip != null && compareDecimal(dip, '0') < 0) {
    throw new BadRequestException('Dip reserve cannot be negative.');
  }
  if (normal != null && compareDecimal(normal, monthlyBudgetMyr) > 0) {
    throw new BadRequestException(
      'Normal buying cannot be more than the monthly budget.',
    );
  }
  if (dip != null && compareDecimal(dip, monthlyBudgetMyr) > 0) {
    throw new BadRequestException(
      'Dip reserve cannot be more than the monthly budget.',
    );
  }
  if (
    normal != null &&
    dip != null &&
    compareDecimal(addDecimalStrings(normal, dip), monthlyBudgetMyr) > 0
  ) {
    throw new BadRequestException(
      'Normal buying plus dip reserve cannot be more than the monthly budget.',
    );
  }
  return {
    monthlyBudgetMyr,
    normalBuyAllocationMyr: normal,
    dipReserveAllocationMyr: dip,
  };
}

function parseBudgetAmount(value: string, label: string): string {
  try {
    return asDecimalString(value);
  } catch {
    throw new BadRequestException(`${label} must be a finite decimal amount.`);
  }
}

export function parsePositiveAmount(value: string): string {
  const amount = asDecimalString(value);
  if (compareDecimal(amount, '0') <= 0) {
    throw new BadRequestException('Amount must be greater than 0.');
  }
  return amount;
}

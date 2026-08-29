export const SALARY_ALLOCATION_CATEGORIES = [
  'HOUSE_LOAN',
  'INSURANCE',
  'UTILITIES',
  'INTERNET',
  'PHONE',
  'FOOD',
  'PETROL',
  'EMERGENCY_FUND',
  'DEBT_PAYMENT',
  'SAVINGS',
  'REMAINING_CASH',
] as const;

export type SalaryAllocationCategory =
  (typeof SALARY_ALLOCATION_CATEGORIES)[number];

/** Default percent shares of salary (sum = 100). Editable after create. */
export const DEFAULT_SALARY_ALLOCATION_PERCENTS: Record<
  SalaryAllocationCategory,
  number
> = {
  HOUSE_LOAN: 30,
  INSURANCE: 5,
  UTILITIES: 4,
  INTERNET: 2,
  PHONE: 2,
  FOOD: 15,
  PETROL: 8,
  EMERGENCY_FUND: 5,
  DEBT_PAYMENT: 15,
  SAVINGS: 10,
  REMAINING_CASH: 4,
};

export const DEBT_SOURCE_TYPES = [
  'CREDIT_CARD',
  'HOUSE_LOAN',
  'FAMILY_LOAN',
  'PAWN_LOAN',
] as const;

export type DebtSourceType = (typeof DEBT_SOURCE_TYPES)[number];

export const DEBT_PRIORITY_METHODS = [
  'SNOWBALL',
  'AVALANCHE',
  'CUSTOM',
] as const;

export type DebtPriorityMethod = (typeof DEBT_PRIORITY_METHODS)[number];

export const DEBT_PRIORITY_STATUSES = [
  'QUEUED',
  'CURRENT_TARGET',
  'PAID_OFF',
  'ARCHIVED',
] as const;

export type DebtPriorityStatus = (typeof DEBT_PRIORITY_STATUSES)[number];

export const FINANCIAL_MISSION_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED',
] as const;

export type FinancialMissionStatus =
  (typeof FINANCIAL_MISSION_STATUSES)[number];

export const FINANCIAL_MISSION_KINDS = [
  'DEBT_PAYOFF',
  'SALARY_ALLOCATION',
  'GOAL',
  'MONTHLY_REVIEW',
] as const;

export type FinancialMissionKind = (typeof FINANCIAL_MISSION_KINDS)[number];

export const BILL_KINDS = [
  'HOUSE_LOAN',
  'INSURANCE',
  'INTERNET',
  'PHONE',
  'UTILITIES',
  'ROAD_TAX',
  'VEHICLE_INSURANCE',
  'PTPTN',
  'SUBSCRIPTION',
  'CREDIT_CARD',
  'OTHER',
] as const;

export type BillKind = (typeof BILL_KINDS)[number];

export const HEALTH_SCORE_BANDS = [
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'NEEDS_ATTENTION',
] as const;

export type HealthScoreBand = (typeof HEALTH_SCORE_BANDS)[number];

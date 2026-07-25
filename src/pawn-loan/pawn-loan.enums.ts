export const PAWN_LOAN_STATUSES = [
  'CREATED',
  'ACTIVE',
  'MATURITY_DUE',
  'RENEWED',
  'GRACE_PERIOD',
  'REDEEMED',
  'FORFEITED',
  'CLOSED',
] as const;

export type PawnLoanStatus = (typeof PAWN_LOAN_STATUSES)[number];

export const PAWN_INTEREST_TYPES = ['FLAT', 'SIMPLE', 'MONTHLY'] as const;

export type PawnInterestType = (typeof PAWN_INTEREST_TYPES)[number];

export const PAWN_PAYMENT_TYPES = [
  'INTEREST_PAYMENT',
  'PRINCIPAL_PAYMENT',
  'INTEREST_AND_PRINCIPAL',
  'FULL_REDEMPTION',
] as const;

export type PawnPaymentType = (typeof PAWN_PAYMENT_TYPES)[number];

export const PAWN_PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'ONLINE_BANKING',
  'OTHER',
] as const;

export type PawnPaymentMethod = (typeof PAWN_PAYMENT_METHODS)[number];

export const PAWN_TRANSACTION_TYPES = [
  'CREATE',
  'INTEREST_PAYMENT',
  'PRINCIPAL_PAYMENT',
  'RENEWAL',
  'REDEMPTION',
  'FORFEIT',
  'STATUS_CHANGE',
  'NOTE',
] as const;

export type PawnTransactionType = (typeof PAWN_TRANSACTION_TYPES)[number];

export const PAWN_COLLATERAL_ITEM_TYPES = [
  'GOLD_CHAIN',
  'GOLD_RING',
  'BRACELET',
  'NECKLACE',
  'WATCH',
  'JEWELLERY',
  'OTHER',
] as const;

export type PawnCollateralItemType =
  (typeof PAWN_COLLATERAL_ITEM_TYPES)[number];

export const PAWN_COLLATERAL_STATUSES = [
  'HELD',
  'RETURNED',
  'FORFEITED',
] as const;

export type PawnCollateralStatus = (typeof PAWN_COLLATERAL_STATUSES)[number];

/** Terminal statuses — no further financial operations. */
export const PAWN_CLOSED_STATUSES: readonly PawnLoanStatus[] = [
  'REDEEMED',
  'FORFEITED',
  'CLOSED',
];

/**
 * Example seed payload for Pawn Loan module (development only).
 * Run via a temporary script or GraphQL createPawnLoan after login.
 */
export const pawnLoanSeedExample = {
  pawn_shop_name: 'Kedai Pajak Emas Maju',
  receipt_number: 'SEED-PR-001',
  principal_amount_cents: 500000,
  interest_rate: 2.0,
  interest_type: 'FLAT',
  loan_term_months: 6,
  grace_period_days: 14,
  loan_start_date: '2026-01-01',
  currency: 'MYR',
  remarks: 'Seed pawn loan — gold chain',
  collaterals: [
    {
      item_type: 'GOLD_CHAIN',
      description: '22K gold chain, 45cm',
      owner_name: 'Demo User',
      estimated_value_cents: 800000,
      weight: 20.5,
      quantity: 1,
    },
  ],
};

# GraphQL

## Queries

| Name | Args |
|------|------|
| `pawnLoans` | `filter` |
| `pawnLoan` | `id` |
| `pawnLoanHistory` | `pawnLoanId` |
| `pawnCollateral` | `pawnLoanId` |
| `pawnPayments` | `pawnLoanId` |
| `pawnRenewals` | `pawnLoanId` |

## Mutations

| Name | Input |
|------|-------|
| `createPawnLoan` | `CreatePawnLoanInput` |
| `updatePawnLoan` | `id`, `UpdatePawnLoanInput` |
| `addCollateral` | `AddCollateralInput` |
| `updateCollateral` | `id`, `UpdateCollateralInput` |
| `recordPayment` | `RecordPawnPaymentInput` |
| `renewPawnLoan` | `RenewPawnLoanInput` |
| `redeemPawnLoan` | `RedeemPawnLoanInput` |
| `forfeitPawnLoan` | `ForfeitPawnLoanInput` |
| `updateStatus` | `UpdatePawnLoanStatusInput` |
| `deletePawnLoan` | `DeletePawnLoanInput` |

Example:

```graphql
mutation {
  createPawnLoan(input: {
    pawn_shop_name: "Kedai Pajak Emas"
    receipt_number: "PR-100"
    principal_amount_cents: 500000
    interest_rate: 2
    loan_start_date: "2026-01-01"
    collaterals: [{
      item_type: "GOLD_CHAIN"
      description: "22k chain"
      owner_name: "Ali"
      estimated_value_cents: 800000
    }]
  }) { id status maturity_date outstanding_principal_cents }
}
```

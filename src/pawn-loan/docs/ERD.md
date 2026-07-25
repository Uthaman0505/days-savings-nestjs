# ERD

```
User 1──* PawnLoan
PawnLoan 1──* PawnCollateral
PawnLoan 1──* PawnPayment
PawnLoan 1──* PawnRenewal
PawnLoan 1──* PawnTransaction
```

| Table | Purpose |
|-------|---------|
| `pawn_loans` | Loan agreement + outstanding principal + dates/status |
| `pawn_collaterals` | Pledged items (`HELD` / `RETURNED` / `FORFEITED`) |
| `pawn_payments` | Interest / principal / redemption payments |
| `pawn_renewals` | Each renewal cycle |
| `pawn_transactions` | Immutable audit log |

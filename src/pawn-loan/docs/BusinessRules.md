# Business Rules

1. Principal > 0; interest rate ≥ 0; outstanding ≥ 0
2. Maturity date > loan start date
3. Grace period end ≥ maturity date
4. Receipt number unique per user
5. Cannot renew / pay / add collateral on `REDEEMED` / `FORFEITED` / `CLOSED`
6. Cannot forfeit a `REDEEMED` loan
7. Payment amounts cannot be negative; total paid > 0
8. Principal paid ≤ outstanding
9. Full redemption / zero outstanding → status `REDEEMED`, collateral `RETURNED`
10. Forfeit → collateral `FORFEITED`, status `CLOSED`
11. Renewal records interest (± principal reduction), extends maturity by term months, status returns to `ACTIVE`
12. Soft delete only (no hard delete of loan row)

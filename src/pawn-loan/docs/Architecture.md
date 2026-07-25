# Architecture

```
Resolver (JwtAuthGuard + RolesGuard)
  → PawnLoanService
    → TypeORM repositories (PawnLoan, Collateral, Payment, Renewal, Transaction)
```

- Matches existing Finance Nest modules (no separate repository class layer).
- Soft delete via `deletedAt` on `PawnLoan`.
- Audit trail in `PawnTransaction` (domain audit, not Account ledger).
- Ownership: every query/mutation scopes by `userId`.

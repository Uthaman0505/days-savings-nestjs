# Pawn Loan Module

Tracks external pawn-shop loans: collateral, interest/principal payments, renewals, redemption, and forfeiture.

## Quick start

1. Enable `TYPEORM_SYNC=true` (dev) **or** run `migrations/001_create_pawn_loan_tables.sql`
2. Authenticate with JWT (`USER` / `MANAGER` / `ADMIN`)
3. Call `createPawnLoan` with optional collaterals

## Money units

All amounts are **integer cents** (e.g. RM5,000 → `500000`).

## Lifecycle

`CREATED` → `ACTIVE` → `MATURITY_DUE` / `GRACE_PERIOD` → renew / redeem / forfeit → `CLOSED`

See [BusinessRules.md](./docs/BusinessRules.md) and [GraphQL.md](./docs/GraphQL.md).

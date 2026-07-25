# Test Cases

## Service (`pawn-loan.service.spec.ts`)

- Create with auto maturity + grace + collateral
- Reject zero principal
- Reject maturity before start
- Principal payment reduces outstanding
- Redeem returns collateral
- Renew extends maturity and reduces principal
- Reject renew when closed
- Forfeit marks collateral forfeited + CLOSED
- Reject forfeit when redeemed
- Soft delete
- Ownership forbidden / not found

## Resolver (`pawn-loan.resolver.spec.ts`)

- Thin delegation to service for queries/mutations

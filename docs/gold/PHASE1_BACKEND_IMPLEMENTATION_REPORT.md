# Phase 1 Backend — Gold Module Implementation Report

**Date:** 2026-08-29  
**Scope:** NestJS backend only (no React Native)

---

## Files Created

| Path | Purpose |
|------|---------|
| `src/gold/gold-purchase.entity.ts` | `gold_purchases` entity |
| `src/gold/gold-price.entity.ts` | `gold_prices` entity (PG BUY / PG SELL) |
| `src/gold/gold-math.ts` | Decimal-safe grams ↔ cents helpers (BigInt milligrams) |
| `src/gold/gold-math.spec.ts` | Math unit tests |
| `src/gold/gold.service.ts` | CRUD, price upsert, dashboard aggregates |
| `src/gold/gold.service.spec.ts` | Service unit tests (A–H) |
| `src/gold/gold.resolver.ts` | GraphQL queries/mutations + JWT |
| `src/gold/gold.module.ts` | Nest module |
| `src/gold/dto/create-gold-purchase.input.ts` | Create purchase input |
| `src/gold/dto/update-gold-purchase.input.ts` | Update purchase input |
| `src/gold/dto/gold-purchase-filter.input.ts` | List filter |
| `src/gold/dto/set-gold-price.input.ts` | Set PG BUY/SELL input |
| `src/gold/dto/delete-gold-purchase.input.ts` | Soft-delete input |
| `src/gold/models/gold.model.ts` | GraphQL ObjectTypes |
| `src/gold/migrations/001_gold_tables.sql` | Manual PostgreSQL migration |

---

## Files Modified

| Path | Why |
|------|-----|
| `src/app.module.ts` | Import `GoldModule` |
| `src/entities/entities.ts` | Register `GoldPurchase`, `GoldPrice` |

**Not modified:** `src/auth/**` (only imported existing `JwtAuthGuard` / `@CurrentUser()`).

---

## Database Migration

- **Created:** `src/gold/migrations/001_gold_tables.sql`
- **Executed:** **No** (manual apply when `TYPEORM_SYNC=false`)
- Dev with `TYPEORM_SYNC=true` can rely on TypeORM synchronize for local schema

---

## GraphQL Operations

| Operation | Kind |
|-----------|------|
| `goldDashboard` | Query |
| `myGoldPurchases(filter?)` | Query |
| `goldPurchaseById(id)` | Query |
| `latestGoldPrice` | Query (nullable) |
| `createGoldPurchase(input)` | Mutation |
| `updateGoldPurchase(id, input)` | Mutation |
| `deleteGoldPurchase(input)` | Mutation (soft `is_active=false`) |
| `setGoldPrice(input)` | Mutation (MANUAL upsert) |

All require `JwtAuthGuard`.

---

## Public Gold Valuation Rule (confirmed)

| Term | Meaning | Field |
|------|---------|-------|
| **PG SELL** | Public Gold **sells to** customer (acquisition / pay price) | `pg_sell_price_per_gram_cents` |
| **PG BUY** | Public Gold **buys from** customer (liquidation / buyback) | `pg_buy_price_per_gram_cents` |

**Portfolio valuation uses PG BUY:**

`current_value_cents = round(total_grams × pg_buy_price_per_gram_cents)`

Validation: `pg_sell_price_per_gram_cents >= pg_buy_price_per_gram_cents`.

Missing price → `has_price=false`, value/P/L = **0** (not a false 100% loss).

---

## Tests

```bash
yarn test src/gold/gold-math.spec.ts src/gold/gold.service.spec.ts --no-coverage
```

**Result:** 2 suites, **19 passed**

Fixture (Test C):

- grams `15.000`, invested `740000`, avg `49333`
- PG BUY `52000`, PG SELL `54000`
- value **`780000`** (not `810000`)
- P/L `40000` ≈ **5.405405%**

---

## Build

```bash
yarn build
```

**Result:** success (`nest build` exit 0)

---

## Deviations from Prompt / Earlier Plan Doc

1. **Valuation side:** Earlier planning doc incorrectly used SELL for holdings. Implementation follows **this task’s PG terminology**: valuation = **PG BUY**.
2. **Date fields:** Used `String` `YYYY-MM-DD` (house-loan convention) rather than GraphQL `Date` scalars for calendar dates.
3. **Models:** Combined ObjectTypes in `models/gold.model.ts` (one file) instead of three separate files — same GraphQL surface.
4. **Precision:** No `decimal.js` in repo; used **milligram BigInt + half-up division** in `gold-math.ts`.
5. **Soft delete:** Mutation named `deleteGoldPurchase` returns `Boolean` (like `deleteIncome`), sets `is_active=false` (like savings archive behaviour).

---

## NEXT RECOMMENDED STEP

Implement **Phase 1 React Native Gold module**:

1. `src/modules/gold/` (api / hooks / screens / helpers)
2. Register `GoldHome` / Create / Details / Edit on `ProfileStack`
3. Profile menu entry + wire Dashboard gold asset to `goldDashboard.current_value_cents` (PG BUY value)

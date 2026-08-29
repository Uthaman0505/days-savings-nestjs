# Phase 1 — Gold Investment / Public Gold GAP Module

**Document type:** Implementation plan (analysis only — no code was written when this plan was authored)  
**Status:** Ready for implementation after decision confirmation (§14)  
**Audience:** Backend (Nest) + Frontend (React Native)  
**Date:** 2026-08-29

---

## Table of contents

1. [Executive Summary](#1-executive-summary)
2. [Existing Backend Architecture Findings](#2-existing-backend-architecture-findings)
3. [Existing Frontend Architecture Findings](#3-existing-frontend-architecture-findings)
4. [Recommended Phase 1 Architecture](#4-recommended-phase-1-architecture)
5. [Database Design](#5-database-design)
6. [GraphQL API Design](#6-graphql-api-design)
7. [Gold Calculation Rules](#7-gold-calculation-rules)
8. [Gold Price Design](#8-gold-price-design)
9. [Frontend Screen Design](#9-frontend-screen-design)
10. [Navigation Integration](#10-navigation-integration)
11. [File-by-File Change Plan](#11-file-by-file-change-plan)
12. [Implementation Sequence](#12-implementation-sequence)
13. [Test Strategy](#13-test-strategy)
14. [Risks / Decisions Needed](#14-risks--decisions-needed)
15. [Phase 1 Definition of Done](#15-phase-1-definition-of-done)
16. [Long-term vision (out of scope)](#16-long-term-vision-out-of-scope)
17. [Recommended next Cursor action](#17-recommended-next-cursor-action)

---

## 1. Executive Summary

Extend the Finance App with a **Gold Investment / Public Gold GAP** feature that follows existing Nest + React Native patterns (Income / Loans style). Do **not** invent a parallel architecture or change authentication.

### Phase 1 scope (Core Gold Portfolio)

| Capability | In Phase 1? |
|------------|-------------|
| Manual gold purchase create / list / detail / edit / soft-delete | Yes |
| Gold dashboard (grams, invested, avg cost, value, P/L) | Yes |
| Manual latest BUY + SELL price | Yes |
| Backend-calculated financial aggregates | Yes |
| Screenshot / PDF upload + OCR | **No** |
| Public Gold API scraping | **No** |
| Targets, notifications, AI buy/hold/sell signals | **No** |
| Persistent `GoldPortfolio` table | **No** (compute from purchases) |

### Core design decisions

| Decision | Recommendation |
|----------|----------------|
| Portfolio table | **Do not create** — derive from `gold_purchases` + latest `gold_prices` |
| Money | Integer **cents** (`*_cents`), same as Income / Accounts |
| Weight | `numeric(12,3)` as TypeScript `string`, same as pawn collateral grams |
| Mark-to-market price | **SELL** (what Public Gold pays you if you liquidate) |
| Cost basis | Historical `amount_paid_cents` (what the user spent) |
| Auth | Existing `JwtAuthGuard` + `@CurrentUser()` — **unchanged** |
| RN entry | **ProfileStack** + Profile menu; wire Dashboard gold asset bucket |
| Existing placeholder | Dashboard already has asset id `gold` hard-coded to `0` |

### Sample Phase 1 outcome

User can:

1. Set today’s Public Gold BUY/SELL (RM/g).
2. Record purchases (date, grams, amount paid).
3. See dashboard totals and unrealized P/L using **SELL × total grams**.

---

## 2. Existing Backend Architecture Findings

**Root:** `nest/src/`  
**Stack:** NestJS · TypeORM · Apollo GraphQL · PostgreSQL

### 2.1 Feature modules present

Examples: `auth`, `user`, `account`, `category`, `income`, `expense`, `transfer`, `transaction`, `credit-card`, `house-loan`, `family-loan`, `pawn-loan`, `goals`, `savings`, `mission-control`, `plans`, `wallet`, `grab-profit`, `profile-media`, `recurring-transaction`.

**No dedicated gold investment module exists.** Closest touchpoint: pawn collateral item types `GOLD_CHAIN` / `GOLD_RING` under `pawn-loan` — keep that domain separate from investment holdings.

### 2.2 Canonical module shape (Income)

```text
nest/src/income/
  income.module.ts
  income.entity.ts
  income.service.ts
  income.service.spec.ts
  income.resolver.ts
  dto/          # GraphQL @InputType + class-validator
  models/       # GraphQL @ObjectType (separate from TypeORM entity)
```

Gold should mirror this layout under `nest/src/gold/`.

### 2.3 Entity conventions

| Concern | Pattern | Reference |
|---------|---------|-----------|
| Primary key | UUID `@PrimaryGeneratedColumn('uuid')` | Income, Account |
| DB naming | Plural snake tables; snake columns via `name:` | `@Entity('incomes')` |
| TS naming | camelCase properties | `amountCents` |
| Money | `type: 'int'` cents | `amount_cents`, `opening_balance_cents` |
| Weight | `numeric(12,3)` → TS `string` | `pawn-collateral.entity.ts` |
| Event datetime | `timestamptz` → `Date` | `received_date` |
| Calendar date | `type: 'date'` → `string` | house-loan `start_date` |
| Ownership | `user_id` uuid + `@ManyToOne` CASCADE | All user-owned tables |
| Soft lifecycle | `is_archived` / `is_active` (pawn also uses `deleted_at`) | Accounts, loans |
| Audit | `created_at` / `updated_at` timestamptz | Universal |
| Indexes | Explicit `@Index('idx_…')` | e.g. `idx_incomes_user_received_date` |

### 2.4 Auth (must reuse, not change)

| Piece | Path |
|-------|------|
| Guard | `src/auth/jwt-auth.guard.ts` |
| Decorator | `src/auth/current-user.decorator.ts` |
| User type | `JwtUser` in `src/auth/jwt.strategy.ts` (`id`, `email`, …) |

Resolver pattern:

```ts
@UseGuards(JwtAuthGuard)
myIncome(@CurrentUser() user: JwtUser, ...): Promise<...> {
  return this.incomeService.findMyIncome(user.id, ...);
}
```

Services enforce ownership (`requireOwned*`) with `NotFoundException` / `ForbiddenException`.

### 2.5 GraphQL naming

| Kind | Convention | Examples |
|------|------------|----------|
| List mine | `myX` | `myIncome`, `myAccounts` |
| By id | `xById` | `incomeById` |
| Mutations | `createX` / `updateX` / `deleteX` | |
| Soft archive | `archiveX` where used | `archiveAccount` |

Money/FK GraphQL field names are typically **snake_case** (`amount_cents`, `account_id`).

### 2.6 Validation & errors

- Global `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `transform` (`main.ts`).
- Inputs: `@IsUUID()`, `@IsInt()`, `@Min(1)`, `@IsDate()`, `@IsOptional()`, `@MaxLength()`, `@IsIn([...])`.
- Domain errors: `BadRequestException`, `NotFoundException`, `ForbiddenException`.

### 2.7 Pagination / filters

Offset/limit (not cursor). Defaults: **limit 50**, **offset 0**.  
Filters often include `start_date`, `end_date`, `sort_order: 'NEWEST' | 'OLDEST'`.

### 2.8 Registration

1. Import module in `src/app.module.ts`.
2. Add entities to `src/entities/entities.ts`.
3. Optional manual SQL under `src/<module>/migrations/` when `TYPEORM_SYNC=false` (see pawn-loan / mission-control).

### 2.9 Money storage conclusion

**Canonical: integer cents.** Do not store purchase amounts as float/decimal money columns. Use `numeric` only for non-money precision (grams, rates).

---

## 3. Existing Frontend Architecture Findings

**Root:** `react-native/src/`

### 3.1 Module pattern (Income / Loans)

```text
src/modules/<feature>/
  api/<feature>.graphql.ts
  api/<feature>.types.ts
  api/<feature>Api.ts      # apolloClient.query / mutate + toApiError
  hooks/use*List.ts, use*Details.ts
  screens/*List|Details|Create|Edit*Screen.tsx
  components/
  utils/*Helpers.ts        # validate*Form, amountToCents
  constants/
  __tests__/
```

Gold → `src/modules/gold/`.

### 3.2 Navigation IA (shipped)

| Surface | Content |
|---------|---------|
| Tabs | Dashboard, Accounts, Transactions, Reports, Profile |
| ProfileStack | Income, Expense, Transfer, Loans, Credit cards, Categories |
| DashboardStack | Dashboard home + Mission Control |
| Dashboard quick actions | Deep-link into Profile create screens |

**Gold belongs on ProfileStack**, same as Loans/Income — not a new tab, not AccountsStack.

### 3.3 Shared UI / utilities

| Need | Location |
|------|----------|
| Apollo | `src/api/apolloClient.ts` |
| Errors | `src/api/errors.ts` (`ApiError`, `toApiError`) |
| Money display | `modules/dashboard/utils/money.ts` → `formatCents`, `rmToCents` |
| Dates | `utils/date.ts` + `components/DatePickerField.tsx` (UI `DD/MM/YYYY`, API `YYYY-MM-DD`) |
| Screen shell | `ScreenWrapper`, `ErrorView`, `LoadingView`, `EmptyState`, `AppCard` |
| Forms | Local state + helper validators (no Formik) |
| Icons | `react-native-feather` |
| Theme | `useAppTheme()` |

### 3.4 Dashboard gold placeholder

`modules/dashboard/utils/aggregateDashboard.ts` already defines asset bucket:

- `id: 'gold'`
- title `Gold`
- comment: no Nest gold entity yet — `balanceCents: 0`

Phase 1 should populate this from `goldDashboard.current_value_cents` (SELL-based).

---

## 4. Recommended Phase 1 Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ React Native                                                │
│  Profile → GoldHome / Create / Details / Edit               │
│  Dashboard asset "Gold" ← goldDashboard.current_value_cents │
└───────────────────────────┬─────────────────────────────────┘
                            │ GraphQL (JWT)
┌───────────────────────────▼─────────────────────────────────┐
│ Nest GoldModule                                             │
│  Resolver → Service                                         │
│    • CRUD gold_purchases (user-scoped)                      │
│    • set / latest gold_prices (BUY + SELL)                  │
│    • goldDashboard aggregates (SELL valuation)              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ PostgreSQL                                                  │
│  gold_purchases  (source of truth for holdings)             │
│  gold_prices     (manual BUY/SELL; history-ready)           │
└─────────────────────────────────────────────────────────────┘
```

### Boundaries

- **Do not** couple to `pawn-loan` collateral gold types in Phase 1.
- **Do not** create ledger `transaction` rows for gold buys unless product later requires cashflow linking.
- **Do not** modify `auth/**` implementation — only consume guards/decorators.

---

## 5. Database Design

### 5.1 Entity overview

| Entity | Table | Phase 1? | Role |
|--------|-------|----------|------|
| `GoldPurchase` | `gold_purchases` | **Yes** | Each buy |
| `GoldPrice` | `gold_prices` | **Yes** | BUY/SELL snapshot |
| `GoldPortfolio` | — | **No** | Computed |
| `GoldDocument` | — | Later | Uploads / OCR |
| `GoldTarget` | — | Later | Targets / alerts |

---

### 5.2 Table: `gold_purchases`

**Purpose:** Immutable-enough ledger of gold the user bought. Portfolio totals = aggregate of active rows.

| Column | DB type | Null | Default | Description |
|--------|---------|------|---------|-------------|
| `id` | uuid | NO | gen | PK |
| `user_id` | uuid | NO | — | FK → `users.id` ON DELETE CASCADE |
| `purchase_date` | date | NO | — | Calendar purchase day (Malaysia) |
| `weight_grams` | numeric(12,3) | NO | — | Grams purchased; must be > 0 |
| `amount_paid_cents` | int | NO | — | Total RM paid × 100; must be > 0 |
| `price_per_gram_cents` | int | NO | — | Historical cost/g; may be derived at create |
| `source` | varchar(32) | NO | `'MANUAL'` | Future: `IMPORT`, `OCR` |
| `reference_number` | varchar(100) | YES | — | Receipt / Public Gold ref |
| `notes` | text | YES | — | Free text |
| `is_active` | boolean | NO | `true` | Soft-delete / exclude from totals |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Relationships**

- `ManyToOne` User via `user_id`.

**Indexes**

- `idx_gold_purchases_user_purchase_date` on (`user_id`, `purchase_date` DESC)
- `idx_gold_purchases_user_active` on (`user_id`, `is_active`)

**Why these fields**

- `weight_grams` + `amount_paid_cents` are enough to compute cost basis.
- `price_per_gram_cents` preserves historical unit cost and enables per-lot P/L later.
- `source` avoids a migration when OCR/import arrives.
- Soft `is_active` matches archive-style finance UX better than hard delete for money history.

**Future columns (do not add in Phase 1):** `document_id`, `external_txn_id`, `dedupe_hash`.

---

### 5.3 Table: `gold_prices`

**Purpose:** Manual (Phase 1) Public Gold BUY/SELL quotes; foundation for daily history.

| Column | DB type | Null | Default | Description |
|--------|---------|------|---------|-------------|
| `id` | uuid | NO | gen | PK |
| `user_id` | uuid | NO | — | FK → users (per-user manual prices in Phase 1) |
| `price_date` | date | NO | — | Effective day |
| `buy_price_per_gram_cents` | int | NO | — | RM/g you pay to buy |
| `sell_price_per_gram_cents` | int | NO | — | RM/g Public Gold pays you |
| `source` | varchar(32) | NO | `'MANUAL'` | Future: `SCREENSHOT`, `API` |
| `notes` | text | YES | — | |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Constraints**

- `UNIQUE (user_id, price_date, source)` — one MANUAL quote per user per day; later allows other sources same day.

**Indexes**

- `idx_gold_prices_user_price_date` on (`user_id`, `price_date` DESC)

**Why both BUY and SELL in Phase 1**

- Valuation needs SELL.
- Purchase UX / education can show BUY.
- Avoids a breaking schema change when screenshot/API history lands.

**Why user-scoped now**

- No shared Public Gold feed yet.
- Later: optional system rows (`user_id` NULL) without changing purchase logic.

---

### 5.4 Example DDL sketch (illustrative)

```sql
-- Apply manually when TYPEORM_SYNC=false (same style as pawn-loan / mission-control migrations)

CREATE TABLE IF NOT EXISTS gold_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_date date NOT NULL,
  weight_grams numeric(12, 3) NOT NULL,
  amount_paid_cents int NOT NULL,
  price_per_gram_cents int NOT NULL,
  source varchar(32) NOT NULL DEFAULT 'MANUAL',
  reference_number varchar(100) NULL,
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gold_purchases_user_purchase_date
  ON gold_purchases (user_id, purchase_date DESC);
CREATE INDEX idx_gold_purchases_user_active
  ON gold_purchases (user_id, is_active);

CREATE TABLE IF NOT EXISTS gold_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_date date NOT NULL,
  buy_price_per_gram_cents int NOT NULL,
  sell_price_per_gram_cents int NOT NULL,
  source varchar(32) NOT NULL DEFAULT 'MANUAL',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, price_date, source)
);

CREATE INDEX idx_gold_prices_user_price_date
  ON gold_prices (user_id, price_date DESC);
```

---

## 6. GraphQL API Design

### 6.1 Operations summary

| Operation | Type | Auth |
|-----------|------|------|
| `goldDashboard` | Query | JWT |
| `myGoldPurchases` | Query | JWT |
| `goldPurchaseById` | Query | JWT |
| `latestGoldPrice` | Query | JWT |
| `createGoldPurchase` | Mutation | JWT |
| `updateGoldPurchase` | Mutation | JWT |
| `deleteGoldPurchase` | Mutation | JWT (soft-deactivate) |
| `setGoldPrice` | Mutation | JWT (upsert MANUAL for date) |

Optional later in Phase 1 if needed: `myGoldPrices`.

### 6.2 Outputs

#### `GoldDashboard`

| Field | Type | Notes |
|-------|------|-------|
| `total_grams` | `String!` | Prefer string for numeric(12,3) |
| `total_invested_cents` | `Int!` | |
| `average_cost_per_gram_cents` | `Int!` | `0` if no grams |
| `current_buy_price_per_gram_cents` | `Int` | null if no price |
| `current_sell_price_per_gram_cents` | `Int` | null if no price |
| `current_value_cents` | `Int!` | SELL × grams; `0` if no price/grams |
| `unrealized_pl_cents` | `Int!` | value − invested |
| `unrealized_pl_percent` | `Float!` | `0` if invested = 0 |
| `purchase_count` | `Int!` | active only |
| `price_as_of` | `String` | `YYYY-MM-DD` |
| `has_price` | `Boolean!` | |

#### `GoldPurchase`

Mirror entity fields in snake_case GraphQL names (`weight_grams`, `amount_paid_cents`, …). Optional computed:

- `current_value_cents`
- `unrealized_pl_cents`

#### `GoldPrice`

`price_date`, `buy_price_per_gram_cents`, `sell_price_per_gram_cents`, `source`, timestamps.

### 6.3 Inputs

#### `CreateGoldPurchaseInput`

| Field | Required | Validation |
|-------|----------|------------|
| `purchase_date` | Yes | Valid date |
| `weight_grams` | Yes | Decimal string > 0, ≤ 3 dp |
| `amount_paid_cents` | Yes | `@IsInt() @Min(1)` |
| `price_per_gram_cents` | No | If omitted, derive from amount/weight |
| `reference_number` | No | max length |
| `notes` | No | |

#### `UpdateGoldPurchaseInput`

Same fields optional; ownership required.

#### `GoldPurchaseFilterInput`

`start_date`, `end_date`, `sort_order`, `limit`, `offset` (Income-style).

#### `SetGoldPriceInput`

| Field | Required | Validation |
|-------|----------|------------|
| `price_date` | Yes | |
| `buy_price_per_gram_cents` | Yes | `@Min(1)` |
| `sell_price_per_gram_cents` | Yes | `@Min(1)` |
| — | — | Prefer reject if `buy < sell` |

### 6.4 Errors

| Case | Exception |
|------|-----------|
| Missing / other user’s purchase | `NotFoundException` or `ForbiddenException` (match Income) |
| Invalid weight/amount | `BadRequestException` |
| buy &lt; sell | `BadRequestException` |
| Empty portfolio | **Not an error** — zeroed dashboard |

### 6.5 Security

Every field resolver/service path must filter by `user.id`.  
User A must never read/update/delete User B’s purchases or prices.

---

## 7. Gold Calculation Rules

**Location of truth:** Nest `GoldService` (and SQL aggregates).  
**Client:** display only — do not reimplement P/L formulas.

### 7.1 BUY vs SELL (critical)

From the **customer’s** perspective with Public Gold:

| Price | Meaning |
|-------|---------|
| **BUY** | Price **you pay** Public Gold to **buy** gold |
| **SELL** | Price **Public Gold pays you** when you **sell** gold |

**Current portfolio value = total_grams × SELL.**  
That is the realistic liquidation / mark-to-market value. Using BUY overstates holdings by the spread.

**Cost basis** = sum of historical amounts paid — **not** current BUY × grams.

### 7.2 Formulas (active purchases only)

```text
total_grams              = Σ weight_grams
total_invested_cents     = Σ amount_paid_cents

average_cost_per_gram_cents =
  if total_grams == 0 then 0
  else round(total_invested_cents / total_grams)   # explicit decimal rounding to int cents

current_value_cents =
  if no sell price or total_grams == 0 then 0
  else round(total_grams × sell_price_per_gram_cents)

unrealized_pl_cents      = current_value_cents - total_invested_cents

unrealized_pl_percent =
  if total_invested_cents == 0 then 0
  else (unrealized_pl_cents / total_invested_cents) × 100
```

### 7.3 Precision rules

| Quantity | Storage | Calculation |
|----------|---------|-------------|
| Money | `int` cents | Prefer integer; round half-up when multiplying grams × RM/g |
| Weight | `numeric(12,3)` | Aggregate in SQL as numeric; avoid raw IEEE float money |
| Avg cost | `int` cents | Derive with controlled rounding |

### 7.4 Worked example (acceptance fixture)

| Purchase | Grams | Amount paid |
|----------|-------|-------------|
| A | 10.000 g | RM 5,000.00 → `500000` cents |
| B | 5.000 g | RM 2,400.00 → `240000` cents |

Derived:

| Metric | Value |
|--------|-------|
| `total_grams` | `15.000` |
| `total_invested_cents` | `740000` |
| `average_cost_per_gram_cents` | `round(740000/15) = 49333` (RM 493.33/g) |

If SELL = RM 520.00/g (`52000` cents/g):

| Metric | Value |
|--------|-------|
| `current_value_cents` | `round(15 × 52000) = 780000` |
| `unrealized_pl_cents` | `40000` (RM 400.00) |
| `unrealized_pl_percent` | ≈ `5.405405…` |

### 7.5 Optional per-purchase P/L (list rows)

```text
purchase_value_cents = round(weight_grams × current_sell_cents)
purchase_pl_cents    = purchase_value_cents - amount_paid_cents
```

---

## 8. Gold Price Design

### Phase 1

1. User calls `setGoldPrice` with BUY + SELL for a `price_date`.
2. Upsert on `(user_id, price_date, 'MANUAL')`.
3. `latestGoldPrice` = latest by `price_date` DESC, then `created_at` DESC.
4. If no price: `has_price = false`; value and P/L treat as `0` with clear UI CTA.

### Valuation

Always use **SELL** for holdings value (§7).

### Future (compatible)

| Enhancement | Approach |
|-------------|----------|
| Screenshot OCR | New `source = 'SCREENSHOT'` rows; same unique key |
| Public API | `source = 'API'` or global `user_id` NULL rows |
| Charts / signals | Query `gold_prices` history; still value with SELL |
| Duplicate day/source | Blocked by UNIQUE constraint |

---

## 9. Frontend Screen Design

### 9.1 Minimum screens

| Screen | Route | Role |
|--------|-------|------|
| Gold home / dashboard | `GoldHome` | Summary + recent purchases + CTAs |
| Add purchase | `GoldCreate` | Manual entry |
| Purchase detail | `GoldDetails` | View + navigate to edit / delete |
| Edit purchase | `GoldEdit` | Same form as create |
| Set price | Modal on `GoldHome` **or** `GoldPriceEdit` | BUY/SELL + date |

**Preferred IA:** Rich `GoldHome` (summary + list) like loans list + summary card; price as sheet/modal to limit stack depth.

### 9.2 GoldHome content

- Total grams  
- Current value (SELL)  
- Total invested  
- Average cost / g  
- Unrealized P/L RM + % (theme income/expense colors)  
- “No price set” banner when `has_price === false`  
- Primary: Add purchase  
- Secondary: Set price  
- List rows: date (`DD/MM/YYYY`), grams, amount, optional row P/L  

States: `LoadingView` → `ErrorView` (retry) → empty CTA → content.

### 9.3 Add / Edit purchase form

| Field | Control |
|-------|---------|
| Purchase date | `DatePickerField` |
| Weight (g) | `AppTextInput` decimal |
| Amount paid (RM) | `AppTextInput` → `amountToCents` |
| Price / g | Optional; auto-fill from amount/weight |
| Reference | Optional text |
| Notes | Optional text |

Validate with `validateGoldPurchaseForm` (Income-style helper). Submit via `goldApi`.

### 9.4 Set price form

- Price date (`DatePickerField`)  
- BUY RM/g  
- SELL RM/g  
- Validate BUY ≥ SELL  

---

## 10. Navigation Integration

| Item | Recommendation |
|------|----------------|
| Stack | `ProfileStack` |
| Param list | Extend `ProfileStackParamList` in `src/navigation/types.ts` |
| Register | `src/navigation/stacks/ProfileStack.tsx` |
| Profile menu | New `AppCard` row on `ProfileScreen.tsx` — e.g. “Gold investment” |
| Icon | Feather `Star` (already used for gold asset) or `TrendingUp` |
| Dashboard | Fill `aggregateDashboard` gold bucket; optional quick action → `GoldCreate` |
| Avoid | New bottom tab; AccountsStack; DashboardStack CRUD |

Suggested routes:

```text
GoldHome
GoldCreate
GoldDetails   { purchaseId: string }
GoldEdit      { purchaseId: string }
GoldPriceEdit (optional)
```

---

## 11. File-by-File Change Plan

### 11.1 Backend — create

| Path | Purpose |
|------|---------|
| `nest/src/gold/gold.module.ts` | Nest module |
| `nest/src/gold/gold-purchase.entity.ts` | Purchase entity |
| `nest/src/gold/gold-price.entity.ts` | Price entity |
| `nest/src/gold/gold.service.ts` | CRUD + aggregates |
| `nest/src/gold/gold.service.spec.ts` | Calculation & ownership tests |
| `nest/src/gold/gold.resolver.ts` | GraphQL API |
| `nest/src/gold/dto/create-gold-purchase.input.ts` | Create input |
| `nest/src/gold/dto/update-gold-purchase.input.ts` | Update input |
| `nest/src/gold/dto/gold-purchase-filter.input.ts` | List filter |
| `nest/src/gold/dto/delete-gold-purchase.input.ts` | Delete input (optional) |
| `nest/src/gold/dto/set-gold-price.input.ts` | Price upsert |
| `nest/src/gold/models/gold-purchase.model.ts` | GQL type |
| `nest/src/gold/models/gold-price.model.ts` | GQL type |
| `nest/src/gold/models/gold-dashboard.model.ts` | GQL dashboard |
| `nest/src/gold/migrations/001_gold_tables.sql` | Manual SQL |

### 11.2 Backend — modify

| Path | Reason |
|------|--------|
| `nest/src/app.module.ts` | `imports: [GoldModule]` |
| `nest/src/entities/entities.ts` | Register both entities |

### 11.3 Backend — do **not** modify

| Path / area | Reason |
|-------------|--------|
| `nest/src/auth/**` (strategy, JWT secrets, login/register) | Auth must remain unchanged |
| Unrelated finance services (income/expense/pawn business rules) | No coupling |
| Challenge `wallet` / `plans` flows | Out of scope |

*Using* `JwtAuthGuard` / `@CurrentUser()` inside the new gold resolver is expected and allowed.

### 11.4 Frontend — create

| Path | Purpose |
|------|---------|
| `react-native/src/modules/gold/api/gold.graphql.ts` | Documents |
| `react-native/src/modules/gold/api/gold.types.ts` | Types |
| `react-native/src/modules/gold/api/goldApi.ts` | Apollo wrappers |
| `react-native/src/modules/gold/hooks/useGoldDashboard.ts` | Home data |
| `react-native/src/modules/gold/hooks/useGoldPurchases.ts` | List |
| `react-native/src/modules/gold/hooks/useGoldPurchaseDetails.ts` | Detail |
| `react-native/src/modules/gold/screens/GoldHomeScreen.tsx` | Dashboard + list |
| `react-native/src/modules/gold/screens/GoldCreateScreen.tsx` | Create |
| `react-native/src/modules/gold/screens/GoldDetailsScreen.tsx` | Detail |
| `react-native/src/modules/gold/screens/GoldEditScreen.tsx` | Edit |
| `react-native/src/modules/gold/components/*` | Summary, card, form, empty, skeleton |
| `react-native/src/modules/gold/utils/goldHelpers.ts` | Form + cents helpers |
| `react-native/src/modules/gold/__tests__/goldHelpers.test.ts` | Unit tests |

### 11.5 Frontend — modify

| Path | Reason |
|------|--------|
| `src/navigation/types.ts` | Route params |
| `src/navigation/stacks/ProfileStack.tsx` | Register screens |
| `src/modules/profile/screens/ProfileScreen.tsx` | Menu entry |
| `src/modules/dashboard/utils/aggregateDashboard.ts` | Real gold cents |
| `src/modules/dashboard/screens/DashboardScreen.tsx` | Optional quick action / navigation |

### 11.6 Frontend — do **not** modify

| Area | Reason |
|------|--------|
| `src/auth/` session/token core | Unchanged |
| Unrelated module business logic | Stabilization boundary |
| Date/theme systems | Reuse existing |

---

## 12. Implementation Sequence

| Step | Work | Exit criteria |
|------|------|---------------|
| 1 | Entities + SQL migration | Tables sync / SQL applies |
| 2 | `GoldModule` + DTOs/models | Compiles; registered in app + entities |
| 3 | `GoldService` CRUD + ownership | Service specs green |
| 4 | Dashboard aggregates (SELL) | Sample fixture matches §7.4 |
| 5 | `GoldResolver` | GraphQL playground ops work with JWT |
| 6 | RN `gold` API layer | Types + queries/mutations |
| 7 | Navigation + Profile entry | Can open `GoldHome` |
| 8 | `GoldHome` UI states | Empty / loading / error / data |
| 9 | Set price flow | `latestGoldPrice` + dashboard refresh |
| 10 | Create purchase | Dashboard totals update |
| 11 | Details / edit / soft-delete | Isolation + refresh |
| 12 | Dashboard gold asset wiring | Asset card non-zero when data exists |
| 13 | Android manual QA | Definition of Done checklist |

---

## 13. Test Strategy

### 13.1 Backend

| Case | Expect |
|------|--------|
| Empty portfolio | Zeros; no throw |
| Purchases, no price | Grams/invested set; value/P/L 0; `has_price` false |
| §7.4 fixture + SELL | Exact cents / ≈ percent |
| Soft-deleted purchase | Excluded from sums |
| Negative / zero weight or amount | `BadRequestException` |
| buy &lt; sell | `BadRequestException` (if enforced) |
| Cross-user get/update/delete | Not found / forbidden |
| Unauthorized (no JWT) | Guard rejection |

### 13.2 Frontend

| Case | Expect |
|------|--------|
| First open empty | Empty state + Add / Set price CTAs |
| Set price | Banner clears; value may still be 0 until purchases |
| Add purchase validation | Field errors; no mutate |
| Success create | Navigate/back; list + summary refresh |
| Edit / delete | Correct ownership UX; confirmation dialog |
| Offline / API error | `ErrorView` retry |
| Dates | `DatePickerField` display `DD/MM/YYYY` |
| Money | `formatCents` / MYR |

### 13.3 Regression

- Existing auth login/refresh still works  
- Profile other menu entries unchanged  
- No new accidental GraphQL 400s from empty IDs (reuse detail-hook guards)  

---

## 14. Risks / Decisions Needed

Confirm before coding if you disagree:

| # | Topic | Default recommendation |
|---|--------|------------------------|
| 1 | Soft delete (`is_active`) vs hard delete | Soft delete |
| 2 | Prices per-user vs global | Per-user Phase 1 |
| 3 | Enforce `buy >= sell` | Hard `BadRequest` |
| 4 | Auto-derive `price_per_gram_cents` | Yes if omitted |
| 5 | Dashboard gold bucket metric | **Current value** (SELL), not invested |
| 6 | Module folder name | `gold` (not `gold-investment`) |
| 7 | `weight_grams` GraphQL type | `String!` |
| 8 | Link to Accounts / Transactions | **No** in Phase 1 |
| 9 | Separate `GoldPurchases` list route | Prefer list on `GoldHome` |

---

## 15. Phase 1 Definition of Done

Phase 1 is complete when all of the following are true:

1. Authenticated user can upsert BUY/SELL for a date.  
2. User can create, list, view, edit, and soft-delete **their own** purchases only.  
3. `goldDashboard` returns correct aggregates; **value uses SELL**.  
4. Empty portfolio and missing price are safe (no crashes, clear UI).  
5. RN Gold screens work on Android with existing theme, date, and money helpers.  
6. Profile entry works; Dashboard gold asset is no longer permanently `0` when API data exists.  
7. Unit tests cover the §7.4 sample math.  
8. Auth implementation files were not redesigned; no OCR/upload/scraping/targets shipped.

---

## 16. Long-term vision (out of scope)

Documented so Phase 1 schema stays compatible — **do not implement now:**

1. Public Gold GAP portfolio tracking (beyond Phase 1 core)  
2. Purchase history enhancements  
3. Per-purchase P/L analytics  
4. Daily BUY/SELL history charts  
5. Upload purchase PDFs/images + OCR extraction  
6. Duplicate-upload detection  
7. Screenshot price extraction  
8. Purchase / price targets  
9. Notifications / reminders  
10. Buy/hold/sell signals  

Phase 1 hooks: `source` columns, price unique `(user_id, price_date, source)`, no premature `GoldPortfolio` table.

---

## 17. Recommended next Cursor action

**Implement Nest Phase 1 foundation (backend only, no RN yet):**

1. Create `nest/src/gold/` with `GoldPurchase` + `GoldPrice` entities.  
2. Add `migrations/001_gold_tables.sql`.  
3. Register in `entities/entities.ts` and `app.module.ts`.  
4. Implement `GoldService` (CRUD + `setGoldPrice` + SELL-based `goldDashboard`) with `gold.service.spec.ts` using §7.4 numbers.  
5. Expose GraphQL via `GoldResolver`.

When that slice is green, start RN `src/modules/gold/` + ProfileStack registration.

---

## Appendix A — Reference file paths

### Backend patterns

- `nest/src/income/income.module.ts`
- `nest/src/income/income.entity.ts`
- `nest/src/income/income.resolver.ts`
- `nest/src/income/dto/create-income.input.ts`
- `nest/src/auth/jwt-auth.guard.ts`
- `nest/src/auth/current-user.decorator.ts`
- `nest/src/pawn-loan/pawn-collateral.entity.ts` (grams)
- `nest/src/entities/entities.ts`
- `nest/src/app.module.ts`

### Frontend patterns

- `react-native/src/modules/income/` (module template)
- `react-native/src/navigation/stacks/ProfileStack.tsx`
- `react-native/src/navigation/types.ts`
- `react-native/src/modules/profile/screens/ProfileScreen.tsx`
- `react-native/src/modules/dashboard/utils/aggregateDashboard.ts`
- `react-native/src/modules/dashboard/utils/money.ts`
- `react-native/src/utils/date.ts`
- `react-native/src/components/DatePickerField.tsx`

---

## Appendix B — Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-08-29 | Initial Phase 1 plan from full repo architecture inspection |

---

*End of report.*

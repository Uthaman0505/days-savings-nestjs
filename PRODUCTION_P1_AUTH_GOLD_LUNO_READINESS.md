# PRODUCTION P1 — AUTH + GOLD + LUNO READINESS

**Date:** 2026-09-19  
**Scope:** NestJS repository (`days-savings-nestjs`)  
**Mode:** Audit / design only. No Railway deploy. No live DB changes. No parked-code deletion. No TypeORM synchronize. No DEV data copy.

---

## 1. Executive Summary

Production V1 runtime wiring already matches the intended product scope: **Config, Database, GraphQL, Auth, User, Storage, ProfileMedia, Gold, Luno**. Parked Finance modules remain on disk but are **not imported** in `AppModule`. Gold and Luno have **no runtime imports** into parked Finance modules.

The empty-database question fails at the foundation:

- There is **no SQL (or TypeORM) migration that creates `users` or `refresh_tokens`**.
- Auth/User tables were created historically by **TypeORM synchronize** (`TYPEORM_SYNC=true` in development).
- Gold SQL files all `REFERENCES users(id)`. They cannot run against a blank database until the core schema exists.
- Luno budget/strategy SQL also `REFERENCES users(id)`.
- There is **no migration runner** (no TypeORM `data-source`, no `npm` migrate script, no `migrations` table). Gold/Luno `.sql` files are **manual apply** artifacts.

**Verdict: C. P1 BLOCKED — SCHEMA NOT YET REPRODUCIBLE.**

Gold and Luno SQL content itself is largely complete and ordered. P2 must add a controlled core migration, a runner, a production-only entity registry, and a blank-DB rehearsal. Do not enable `TYPEORM_SYNC` to close this gap.

---

## 2. Git / Branch Status

| Item | Value |
|------|--------|
| Nest expected DEV branch in the prompt | `feature/react-native-dev-build` — **does not exist in this repo** |
| Nest actual DEV branch (Gold + Luno tip) | `feature/account-module` |
| Tree vs `origin/development` | **Identical** (development is 39 merge-commit objects ahead; working tree matches) |
| Production-readiness branch | `release/production-readiness` (created from `feature/account-module`) |
| React Native repo | Separate git remote; currently on `feature/react-native-dev-build` (not used for this Nest audit) |
| Working tree at branch creation | Clean |
| `master` | Not checked out, not modified, not merged |
| Railway | Not deployed |

All P1 document work is on `release/production-readiness` only.

---

## 3. Production V1 Module Scope

Source of truth: `src/app.module.ts` registered `imports`, plus actual provider/entity injection.

### 3.1 Registered at runtime

| Module | Classification | Notes |
|--------|----------------|-------|
| `ConfigModule` | CORE_REQUIRED | Global `.env` / process env |
| `ScheduleModule` | CORE_REQUIRED | Required by Luno `@Cron` jobs (market + external risk) |
| `DatabaseModule` | CORE_REQUIRED | TypeORM Postgres |
| `StorageModule` | CORE_REQUIRED | Global S3 client; Gold documents/screenshots + profile avatars |
| `GraphQLModule` | CORE_REQUIRED | Auth + Gold GraphQL API |
| `AuthModule` | CORE_REQUIRED | Register / login / refresh / JWT |
| `UserModule` | CORE_REQUIRED | `users` persistence |
| `ProfileMediaModule` | CORE_REQUIRED | Avatar upload/stream; **no extra table**; writes `users.avatar_url` / `users.avatar_key` |
| `GoldModule` | GOLD_REQUIRED | GraphQL + REST document/screenshot/report |
| `LunoModule` | LUNO_REQUIRED | REST `/luno/*` sync, accounting, budget, trades, market, risk |

`AppResolver` (`hello`) is infrastructure, not a business module.

### 3.2 Parked (source present, **not** registered)

`PlansModule`, `WalletModule`, `GrabProfitModule`, `AccountModule`, `CategoryModule`, `TransactionModule`, `IncomeModule`, `ExpenseModule`, `TransferModule`, `CreditCardModule`, `CreditCardPaymentModule`, `HouseLoanModule`, `HouseLoanPaymentModule`, `InsuranceModule`, `InsurancePaymentModule`, `FamilyLoanModule`, `FamilyLoanPaymentModule`, `SavingsModule`, `GoalsModule`, `RecurringTransactionModule`, `PawnLoanModule`, `MissionControlModule`.

**KUTU:** no `src/kutu` module exists. Out of Production V1.

### 3.3 Gold / Luno → parked Finance

Traced imports in `src/gold` and `src/luno` (modules, services, controllers, resolvers, entities).

| From | Into parked Finance | Result |
|------|---------------------|--------|
| Gold | wallet / plans / account / transaction / income / expense / loans / etc. | **None** |
| Luno | same | **None** |

Gold and Luno **do** depend on CORE:

- Gold: `JwtAuthGuard`, `ObjectStorageService`, TypeORM `ManyToOne` → `User`
- Luno: `AuthGuard('jwt')`, TypeORM `ManyToOne` → `User` on budget / money-bucket / strategy-event tables

That is expected and allowed.

### 3.4 Production target vs current `AppModule`

Current registered set **is** the Production V1 module set, plus `ScheduleModule` (needed by Luno crons). No unexpected parked module is wired.

Residual production risk is **not** AppModule — it is the **global TypeORM entity registry** still listing parked entities (Section 9).

---

## 4. Auth / Core Table Manifest

### 4.1 Persistence path

```
AuthResolver
  RegisterUser / LoginUser / RefreshTokens / me
    → AuthService
        → UserService (users)
        → RefreshToken repository (refresh_tokens)
        → JwtService (JWT_SECRET / JWT_REFRESH_SECRET)
JwtStrategy.validate
    → UserService.findById
ProfileMediaService
    → UserService.updateAvatar (users.avatar_url, users.avatar_key)
    → ObjectStorageService (S3 object; not a table)
```

No separate profile-media table. Avatar bytes live in object storage; metadata lives on `users`.

### 4.2 Table: `users`

| Field | Value |
|-------|--------|
| Entity | `User` (`src/user/user.entity.ts`) |
| Table | `users` |
| Creating migration | **MISSING** |
| Later altering migrations | **NONE** |
| Purpose | Registration, login password hash, JWT identity, display name, avatar metadata, roles |

Columns (from entity; this is what synchronize created in DEV):

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid PK | `PrimaryGeneratedColumn('uuid')` |
| `email` | varchar | **UNIQUE**, required |
| `password_hash` | varchar | required |
| `display_name` | varchar | nullable |
| `avatar_url` | varchar | nullable |
| `avatar_key` | varchar | nullable |
| `roles` | jsonb | NOT NULL, default `{"roles":["USER"]}` |
| `created_at` | timestamptz | CreateDate |
| `updated_at` | timestamptz | UpdateDate |

READ: login, JWT validate, `me`, avatar stream.  
WRITE: register, avatar upload.

### 4.3 Table: `refresh_tokens`

| Field | Value |
|-------|--------|
| Entity | `RefreshToken` (`src/auth/entities/refresh-token.entity.ts`) |
| Table | `refresh_tokens` |
| Creating migration | **MISSING** |
| Later altering migrations | **NONE** |
| Purpose | Refresh-token rotation; one row per issued refresh JWT `jti` |

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid PK | |
| `user_id` | uuid | NOT NULL, **FK `users(id)` ON DELETE CASCADE** |
| `jti` | varchar | **UNIQUE** |
| `expires_at` | timestamptz | NOT NULL |
| `revoked_at` | timestamptz | nullable |
| `created_at` | timestamptz | |

Index: `idx_refresh_tokens_user_id` (`userId`).

READ/WRITE: every login/register/refresh issues a new row and revokes the previous `jti` on refresh.

### 4.4 Critical check — empty Postgres + `TYPEORM_SYNC=false`

**FAIL. PRODUCTION BLOCKER — MISSING CORE MIGRATION.**

Evidence:

- Repo-wide `CREATE TABLE` search: no `users`, no `refresh_tokens`.
- No TypeORM migration classes, no `data-source.ts`, no `package.json` migrate script.
- `src/plans/plans.service.ts` still documents the historical model: *“This backend does not use migrations, so synchronize must have created the table.”*
- Gold `001_gold_tables.sql` and later Gold/Luno user-scoped SQL `REFERENCES users(id)`.

An empty PostgreSQL database **cannot** grow Auth/User schema without synchronize or a new P2 migration.

---

## 5. Gold Table / Migration Manifest

Gold SQL lives in `src/gold/migrations/` and is labeled **“Apply manually when TYPEORM_SYNC=false.”** Content is complete relative to current Gold entities. Execution is **not** automated.

All Gold business tables are **per-user** and require `users` first.

### 5.1 Tables

| Entity | Table | Purpose | R/W | FKs | Creating SQL | Later SQL |
|--------|-------|---------|-----|-----|--------------|-----------|
| `GoldPurchase` | `gold_purchases` | Holdings / cost basis | R/W (`GoldService`; also created on extraction confirm) | `user_id → users` | `001_gold_tables.sql` | `002_gold_weight_4dp.sql` (ALTER `weight_grams` NUMERIC(12,4); redundant on a fresh 001 which already uses 4dp) |
| `GoldPrice` | `gold_prices` | PG buy/sell snapshots | R/W (`GoldService`, screenshot confirm) | `user_id → users` | `001_gold_tables.sql` | `007_gold_prices_captured_at.sql` (column + unique indexes) |
| `GoldDocument` | `gold_documents` | PDF/image uploads + extraction status | R/W (`GoldDocumentService`, extraction) | `user_id → users` | `003_gold_documents.sql` | `005_gold_documents_is_active.sql` |
| `GoldExtractionItem` | `gold_extraction_items` | Parsed purchase candidates | R/W (`GoldExtractionService`) | `gold_document_id → gold_documents` CASCADE; `user_id → users`; `gold_purchase_id → gold_purchases` SET NULL | `004_gold_extraction_items.sql` | none |
| `GoldPriceCapture` | `gold_price_captures` | Screenshot capture sessions | R/W (`GoldPriceCaptureService`) | `user_id → users`; `confirmed_gold_price_id → gold_prices` SET NULL | `006_gold_price_captures.sql` | none |
| `GoldPriceScreenshot` | `gold_price_screenshots` | BUY/SELL GAP images | R/W | `capture_id → gold_price_captures` CASCADE; `user_id → users` | `006_gold_price_captures.sql` | none |
| `GoldProfitGoal` | `gold_profit_goals` | Protected-capital profit goal | R/W (`GoldProfitGoalService`; read by planning) | `user_id → users` | `008_gold_profit_goals.sql` | none |
| `GoldPlanningSettings` | `gold_planning_settings` | Monthly buy budget | R/W (`GoldPlanningService`) | `user_id → users` | `009_gold_planning_settings.sql` | none |

Expected eight tables: **all present** in current source.

File blobs are **not** in Postgres. `storage_key` / S3 hold documents and screenshots.

### 5.2 Gold SQL execution order (after Auth/User)

1. `src/gold/migrations/001_gold_tables.sql` — READY, **ORDER_DEPENDENT** (`users`)
2. `src/gold/migrations/002_gold_weight_4dp.sql` — READY, **ORDER_DEPENDENT** (no-op type widen on fresh 001)
3. `src/gold/migrations/003_gold_documents.sql` — READY, **ORDER_DEPENDENT** (`users`)
4. `src/gold/migrations/004_gold_extraction_items.sql` — READY, **ORDER_DEPENDENT** (`gold_documents`, `gold_purchases`, `users`)
5. `src/gold/migrations/005_gold_documents_is_active.sql` — READY, **ORDER_DEPENDENT** (`gold_documents`)
6. `src/gold/migrations/006_gold_price_captures.sql` — READY, **ORDER_DEPENDENT** (`users`, `gold_prices`)
7. `src/gold/migrations/007_gold_prices_captured_at.sql` — READY, **ORDER_DEPENDENT** (drops `uq_gold_prices_user_date_source` created in 001, adds partial uniques)
8. `src/gold/migrations/008_gold_profit_goals.sql` — READY, **ORDER_DEPENDENT** (`users`)
9. `src/gold/migrations/009_gold_planning_settings.sql` — READY, **ORDER_DEPENDENT** (`users`)

Indexes/constraints of note (SQL is stricter than some entity `@Index` metadata):

- `gold_purchases`: positive CHECKs; indexes on user, (user, date), (user, active)
- `gold_prices`: after 007, partial uniques `uq_gold_prices_manual_user_date` and `uq_gold_prices_screenshot_user_captured` (entities do not declare these partial uniques)
- `gold_documents`: unique `(user_id, sha256_hash)`
- `gold_extraction_items`: unique `(document, row)`; **partial unique** on `gold_purchase_id` WHERE NOT NULL (SQL only)
- `gold_profit_goals`: one ACTIVE row per user (partial unique)

Fresh-DB note: Gold SQL **cannot** run until `users` exists. With that predecessor, the Gold chain is internally consistent.

---

## 6. Luno Table / Migration Manifest

Traced: `LunoModule` → `LunoController` + services → `TypeOrmModule.forFeature(LUNO_ENTITIES)` → `src/luno/migrations/*.sql`.

Luno is mixed:

- **Account-level** Phase 1/2/5/6 tables: one Luno API key, **no `user_id`**.
- **User-scoped** Phase 3/4: budget, money buckets, strategy events **FK to `users`**.

### 6.1 Tables required by current implementation

#### Phase 1 — read-only Luno sync (`001_luno_tables.sql`)

| Entity | Table | Purpose | R/W | FK | Later SQL |
|--------|-------|---------|-----|----|-----------|
| `LunoSyncRun` | `luno_sync_runs` | Sync run audit | W sync, R health | none | none |
| `LunoAccount` | `luno_accounts` | BTC/MYR account snapshot | W sync, R health + accounting | none (unique `luno_account_id`) | none |
| `LunoBalance` | `luno_balances` | Per-run balance snapshot | W sync | `sync_run_id → luno_sync_runs` CASCADE | none |
| `LunoTransactionRow` | `luno_transactions` | Ledger rows | W sync, R accounting | none (unique account+row_index) | none |
| `LunoOrderRow` | `luno_orders` | Exchange orders | W sync, R health + accounting | none | none |
| `LunoWithdrawalRow` | `luno_withdrawals` | Withdrawals | W sync, R health | none | none |
| `LunoTransferRow` | `luno_transfers` | On-chain/in-app transfers | W sync, R health | none | none |

#### Phase 2 — BTC FIFO accounting (`002_luno_btc_accounting.sql`)

| Entity | Table | Purpose | R/W | FK | Later SQL |
|--------|-------|---------|-----|----|-----------|
| `LunoBtcLot` | `luno_btc_lots` | Remaining lots | W rebuild, R accounting | `source_transaction_id` uuid **nullable, no FK** | none |
| `LunoBtcDisposal` | `luno_btc_disposals` | Sells/disposals | W rebuild | same | none |
| `LunoBtcDisposalLot` | `luno_btc_disposal_lots` | Lot consumption | W rebuild | `disposal_id`, `lot_id` CASCADE | none |
| `LunoBtcAccountingSnapshot` | `luno_btc_accounting_snapshots` | Portfolio snapshot JSON | W rebuild, R `GET /luno/btc/portfolio` and details | none | `003` widens `status` VARCHAR(16)→(32) |

Accounting is **rebuildable** from Phase 1 tables (`LunoBtcAccountingService.rebuildBtcAccounting`).

#### Phase 2B — user trades (`003_luno_user_trades.sql`)

| Entity | Table | Purpose | R/W | FK |
|--------|-------|---------|-----|----|
| `LunoUserTradeRow` | `luno_user_trades` | `GET /api/1/listtrades` source | W sync, R accounting | none; unique `(pair, sequence)` |

Current accounting/trades work **does** persist and read this table.

#### Phase 3 — budget / money buckets (`004_luno_btc_budget.sql`)

| Entity | Table | Purpose | R/W | FK |
|--------|-------|---------|-----|----|
| `LunoBtcMonthlyBudget` | `luno_btc_monthly_budgets` | Monthly MYR budget | R/W budget + decision | **`user_id → users` CASCADE**; unique (user, month) |
| `LunoBtcMoneyBucket` | `luno_btc_money_buckets` | Protected profit / reinvestment ledger | R/W | **`user_id → users` CASCADE** |

#### Phase 4 — advisory strategy events (`005_luno_btc_strategy_events.sql`)

| Entity | Table | Purpose | R/W | FK |
|--------|-------|---------|-----|----|
| `LunoBtcStrategyEvent` | `luno_btc_strategy_events` | BUY/HOLD/WAIT advice; **no Luno orders** | R/W decision | **`user_id → users` CASCADE** |

#### Phase 5 — market intelligence (`006_luno_btc_market_intelligence.sql`)

| Entity | Table | Purpose | R/W | FK |
|--------|-------|---------|-----|----|
| `LunoBtcMarketCandle` | `luno_btc_market_candles` | Read-only candles | R/W market; cron `20 */30 * * * *` | none |
| `LunoBtcMarketSnapshot` | `luno_btc_market_snapshots` | Derived market context | R/W | none |

#### Phase 6 — external news/economy risk (`007_luno_btc_external_risk.sql`)

| Entity | Table | Purpose | R/W | FK |
|--------|-------|---------|-----|----|
| `LunoBtcNewsEvent` | `luno_btc_news_events` | News items | R/W; cron `30 */45 * * * *` | none; unique (provider, external_id) |
| `LunoBtcEconomicEvent` | `luno_btc_economic_events` | Macro calendar | R/W; cron `10 20 */3 * * *` | none |
| `LunoBtcNewsRiskSnapshot` | `luno_btc_news_risk_snapshots` | Aggregated risk | R/W | none |

**20 Luno tables** are required. All have matching entities in `LUNO_ENTITIES` / `src/entities/entities.ts`.

Luno does not use parked Finance tables.

### 6.2 Luno SQL execution order (after Auth/User for 004–005)

1. `src/luno/migrations/001_luno_tables.sql` — READY
2. `src/luno/migrations/002_luno_btc_accounting.sql` — READY
3. `src/luno/migrations/003_luno_user_trades.sql` — READY, **ORDER_DEPENDENT** (ALTER snapshot `status`)
4. `src/luno/migrations/004_luno_btc_budget.sql` — READY, **ORDER_DEPENDENT** (`users`)
5. `src/luno/migrations/005_luno_btc_strategy_events.sql` — READY, **ORDER_DEPENDENT** (`users`)
6. `src/luno/migrations/006_luno_btc_market_intelligence.sql` — READY
7. `src/luno/migrations/007_luno_btc_external_risk.sql` — READY

001–003 and 006–007 could theoretically run before `users`. 004–005 cannot. Production order should still be CORE → GOLD → LUNO for a single rehearsal.

---

## 7. Complete Migration Execution Order

Intended chain:

```
EMPTY POSTGRES
    → CORE/AUTH (users, refresh_tokens)     ← MISSING
    → GOLD 001 … 009                        ← SQL READY, runner MISSING
    → LUNO 001 … 007                        ← SQL READY, runner MISSING
```

| # | Artifact | Class | Why |
|---|----------|-------|-----|
| — | TypeORM synchronize | **MUST_NOT_USE_IN_PRODUCTION** | Would also create parked Finance tables while they remain in `entities.ts` |
| 0 | **Core `users` + `refresh_tokens` SQL/TypeORM migration** | **MISSING** | Blocker |
| 1–9 | Gold `001`–`009` | READY + ORDER_DEPENDENT | Need `users`; apply in filename order |
| 10–16 | Luno `001`–`007` | READY + ORDER_DEPENDENT | `004`/`005` need `users`; `003` after `002` |
| — | `src/pawn-loan/migrations/001_create_pawn_loan_tables.sql` | **PARKED** | Do not run |
| — | `src/mission-control/migrations/001_mission_control.sql` | **PARKED** | Do not run |
| — | `src/database/sql/year-reset-backfill.sql` | **PARKED / DEV_ONLY** | Wallet yearly reset |
| — | TypeORM `migrations` table / runner | **MISSING** | No controlled apply, no checksum, no `npm run` entry |
| — | Nest `DatabaseModule` `synchronize` | Driven only by `TYPEORM_SYNC === 'true'` | Production must set `TYPEORM_SYNC=false` |

`DevelopmentConfigService` / `ProductionConfigService` are **not** used by `DatabaseModule` (dead alternate factories). Runtime config is the `useFactory` in `database.module.ts`.

**Can empty Postgres become Production V1 without TYPEORM_SYNC, without undocumented CREATE TABLE, without DEV DB, without parked SQL?**

**No.** Core tables have no migration. Gold/Luno SQL is documented but not executed by the application.

---

## 8. Missing / Incomplete Migrations

| Gap | Severity | Detail |
|-----|----------|--------|
| `users` CREATE | **BLOCKER** | No SQL; entity-only |
| `refresh_tokens` CREATE | **BLOCKER** | No SQL; entity-only |
| Migration runner | **BLOCKER** | Manual psql is not “controlled migrations only” |
| Production entity list | **P2 required** | Parked entities still registered (Section 9) |
| Gold/Luno SQL not copied to `dist/` | P2 | `nest-cli.json` has no assets; runner must read `src/.../migrations` or a dedicated folder |
| Entity vs SQL index drift | P2 hygiene | Partial uniques exist in Gold SQL 004/007 but not fully on entities; **SQL must remain source of truth** |
| `002_gold_weight_4dp.sql` | Non-blocking | Harmless ALTER on fresh 001 |

Do **not** “fix” this by turning synchronize on in production.

---

## 9. Production Entity Registry Recommendation

Current registry: `src/entities/entities.ts`, imported by `DatabaseModule` for **every** environment.

It registers:

- CORE: `User`, `RefreshToken`
- GOLD: 8 entities
- LUNO: 20 entities
- **PARKED Finance: 40+ entities** (plans, wallet, grab profit, accounts, categories, transactions, income, expense, transfer, credit cards, loans, insurance, savings, legacy goals, recurring, pawn, mission-control)

Comment in that file says parked rows stay listed so TypeORM still maps their tables. That is a **DEV preservation** policy. It is unsafe for Production V1:

- `TYPEORM_SYNC=true` would **create parked tables** on the empty production DB.
- Production runtime should not load Finance entity metadata it will never query.

### Recommendation

**Prefer A + environment selector (explicit lists, not inferred globs):**

```text
productionEntities = User, RefreshToken + 8 Gold + 20 Luno
parkedEntities     = remaining Finance entities (keep files)
entities           = NODE_ENV === 'production' ? productionEntities
                   : [...productionEntities, ...parkedEntities]
```

| Option | Fit |
|--------|-----|
| **A. Dedicated production entity list** | Required. Named, reviewed, small. |
| **B. Environment-aware registry** | Required so DEV can still map parked tables without deleting files. |
| C. Delete parked entities | **Rejected** for this phase (source must stay). |
| C. Separate Nest apps | Unnecessary for V1. |

Implement in P2 on `release/production-readiness` only. Do not remove parked files.

**ProfileMedia:** no entity to register.

---

## 10. Parked Modules / Tables Excluded

Gold and Luno do **not** require any of these tables.

| Module (parked) | Tables that MUST NOT be created in Production V1 |
|-----------------|---------------------------------------------------|
| Plans | `saving_plans`, `user_saving_plans` |
| Wallet | `global_wallets`, `challenge_wallets`, `wallet_transactions`, `daily_challenge_claims`, `completed_challenges`, `give_up_challenges`, `daily_transaction_leverages`, `yearly_challenge_resets` |
| Grab Profit | `grab_profit_entries` |
| Accounts | `accounts` |
| Categories | `categories` |
| Transactions | `transactions` |
| Income | `incomes` |
| Expense | `expenses` |
| Transfer | `transfers` |
| Credit cards | `credit_cards`, `credit_card_payments` |
| House loans | `house_loans`, `house_loan_payments` |
| Insurance | `insurances`, `insurance_payments` |
| Family loans | `family_loans`, `family_loan_payments` |
| Savings | `savings` |
| Legacy Goals | `goals`, `goal_contributions` |
| Recurring | `recurring_transactions` |
| Pawn loan | `pawn_loans`, `pawn_collaterals`, `pawn_payments`, `pawn_renewals`, `pawn_transactions` |
| Mission Control | `salary_plans`, `salary_allocations`, `debt_priorities`, `financial_missions`, `monthly_snapshots`, `projection_settings` |
| KUTU | none (module does not exist) |

Parked SQL that must **not** be applied:

- `src/pawn-loan/migrations/001_create_pawn_loan_tables.sql`
- `src/mission-control/migrations/001_mission_control.sql`
- `src/database/sql/year-reset-backfill.sql`

`AdminSecretGuard` exists under `auth` but is **unreferenced** while Wallet is parked. `ADMIN_RESET_SECRET` is not required for Production V1 Auth+Gold+Luno.

---

## 11. Production Environment Variable Inventory

Names only. No values.

Production must set:

```text
NODE_ENV=production
TYPEORM_SYNC=false
```

`DatabaseModule` enables synchronize **only** when `TYPEORM_SYNC` is the string `true`. Unset therefore means false, but production **must set `false` explicitly**.

Railway Postgres typically injects `DATABASE_URL`. The factory accepts `DB_PRODUCTION_URL` or `DATABASE_URL` when `NODE_ENV=production`.

| Variable | Group | Class | Notes |
|----------|-------|-------|-------|
| `NODE_ENV` | Nest/runtime | **REQUIRED** | Must be `production` |
| `PORT` | Nest/runtime | **REQUIRED** on Railway | `main.ts`: `process.env.PORT ?? APP_PORT ?? '5000'`, listen `0.0.0.0` |
| `APP_PORT` | Nest/runtime | OPTIONAL | Fallback if `PORT` absent |
| `TYPEORM_SYNC` | Nest/runtime | **REQUIRED** = `false` | **MUST_NOT_USE_IN_PRODUCTION** as `true` |
| `DATABASE_URL` | PostgreSQL | REQUIRED unless `DB_PRODUCTION_URL` | Railway default |
| `DB_PRODUCTION_URL` | PostgreSQL | OPTIONAL if `DATABASE_URL` set | Preferred explicit name |
| `DB_DEVELOPMENT_URL` | PostgreSQL | **DEV_ONLY** | **MUST_NOT_USE_IN_PRODUCTION** |
| `JWT_SECRET` | JWT/auth | **REQUIRED** | Access tokens; used via `process.env` in strategy/module |
| `JWT_REFRESH_SECRET` | JWT/auth | **REQUIRED** | `getOrThrow` in AuthService |
| `JWT_EXPIRES_IN` | JWT/auth | OPTIONAL | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | JWT/auth | OPTIONAL | Default `7d` |
| `PUBLIC_APP_URL` | Nest/runtime | OPTIONAL but recommended | Avatar + Gold document client URLs |
| `ADMIN_RESET_SECRET` | Auth leftover | **DEV_ONLY / unused in V1** | Guard not registered; do not rely on it |
| `STORAGE_ENDPOINT` | Storage/S3 | **REQUIRED** | Constructor `mustGet` — process will not boot without it |
| `STORAGE_REGION` | Storage/S3 | **REQUIRED** | |
| `STORAGE_ACCESS_KEY` | Storage/S3 | **REQUIRED** | |
| `STORAGE_SECRET_KEY` | Storage/S3 | **REQUIRED** | |
| `STORAGE_BUCKET` | Storage/S3 | **REQUIRED** | |
| `STORAGE_PUBLIC_BASE_URL` | Storage/S3 | **REQUIRED** | |
| `STORAGE_FORCE_PATH_STYLE` | Storage/S3 | OPTIONAL | Default `'true'` |
| `STORAGE_PUT_OBJECT_ACL` | Storage/S3 | OPTIONAL | |
| Gold-specific env | Gold | none | Gold uses Auth + Storage + DB only |
| `LUNO_ENABLED` | Luno | OPTIONAL | `false` disables even if keys present |
| `LUNO_API_KEY_ID` | Luno | REQUIRED if Luno sync enabled | Startup throws if enabled without keys |
| `LUNO_API_KEY_SECRET` | Luno | REQUIRED if Luno sync enabled | |
| `LUNO_API_BASE_URL` | Luno | OPTIONAL | Default `https://api.luno.com` |
| `NEWS_ENABLED` | Luno | OPTIONAL | Explicit `false` disables external risk |
| `NEWS_PROVIDER` | Luno | OPTIONAL | `FINNHUB` / `NONE` |
| `NEWS_API_KEY` | Luno | OPTIONAL | Enables news provider |
| `NEWS_API_BASE_URL` | Luno | OPTIONAL | Finnhub default |
| `ECONOMIC_PROVIDER` | Luno | OPTIONAL | |
| `ECONOMIC_API_KEY` | Luno | OPTIONAL | Falls back to `NEWS_API_KEY` |
| `EXTERNAL_RISK_LOOKAHEAD_HOURS` | Luno | OPTIONAL | Default 24, max 72 |

**MUST_NOT_USE_IN_PRODUCTION**

- `TYPEORM_SYNC=true`
- `NODE_ENV=development`
- `DB_DEVELOPMENT_URL` as the production connection
- Copying DEV JWT secrets or DEV storage keys as a convenience
- GraphQL playground is already disabled when `NODE_ENV=production`

`.env.example` is a **DEV sample** and currently contains live-looking credentials. Production config must use Railway secrets, not that file. Sanitize `.env.example` in a later hygiene pass so it lists **names only**.

---

## 12. Build / Startup Readiness

Verified on `release/production-readiness`:

| Check | Result |
|-------|--------|
| `npm run build` (`nest build`) | **Passed** (exit 0); emits `dist/main.js` |
| `package.json` `start:prod` | `node dist/main` |
| Dockerfile | Multi-stage; `ENV NODE_ENV=production`; `CMD ["node", "dist/main.js"]`; `EXPOSE 5000` |
| Listen address | `app.listen(port, '0.0.0.0', ...)` — Railway compatible |
| Port | `process.env.PORT ?? process.env.APP_PORT ?? '5000'` |

`npm run start:prod` was **not executed**. It would open a DB connection; this phase must not touch live data.

Compiled Nest does not need `nest start` / ts-node at runtime. Dockerfile installs production `node_modules` then copies `dist`.

Minor P2 notes (not schema blockers):

- Both `yarn.lock` and `package-lock.json` exist; Dockerfile uses **yarn**. Pin one installer for Railway.
- `GraphQLModule` `autoSchemaFile: true` writes a schema file at boot; needs a writable working directory (normal on Railway).
- Storage env vars are required at process start even before the first Gold/avatar request.

No Railway deployment was performed.

---

## 13. Production Blockers

1. **MISSING CORE MIGRATION** for `users` and `refresh_tokens`. Empty DB + `TYPEORM_SYNC=false` cannot create Auth.
2. **No controlled migration runner.** Gold/Luno SQL cannot be applied as a repeatable production step.
3. **Global entity registry includes parked Finance entities.** Accidental synchronize would create parked tables. Production V1 must not depend on them.
4. Gold/Luno user-scoped SQL is blocked on (1).

Non-blockers for schema design (still P2):

- Build/start scripts are ready.
- AppModule scope is already Gold+Luno.
- Gold/Luno SQL **content** is ordered and complete after `users`.

---

## 14. Required P2 Work

On `release/production-readiness` only. Do not merge to `master`. Do not deploy.

1. Author a **core SQL migration** (or TypeORM migration) that creates `users` and `refresh_tokens` with indexes/FKs matching the current entities. Do **not** use synchronize.
2. Introduce a **migration runner** (TypeORM migrations **or** versioned SQL runner with a `schema_migrations` table) that applies CORE → GOLD 001–009 → LUNO 001–007 and **skips parked SQL**.
3. Split **production vs parked entity lists**; production boot uses only CORE+GOLD+LUNO.
4. Rehearse against a **new empty Postgres** (local Docker or a throwaway Railway Postgres). Confirm tables created == Production V1 set, parked tables absent.
5. Set production env: `NODE_ENV=production`, `TYPEORM_SYNC=false`, JWT, `DATABASE_URL`/`DB_PRODUCTION_URL`, storage, Luno keys as required.
6. Smoke: `npm run build`, start compiled `dist/main`, `RegisterUser` / `LoginUser` / `RefreshTokens`, one Gold write, one Luno health/sync path (sync only if keys present).
7. Decide Luno enablement (`LUNO_ENABLED`) for first production boot.
8. Hygiene: example env names-only; ignore dual lockfiles; do not copy DEV rows.

**Data policy (P1 and first production):** schema only. Do not copy DEV users, Gold purchases, documents, screenshots, Luno accounting, or Finance records.

### Future controlled **data** migration (not P1)

| Data | Copy from DEV? | Later option |
|------|----------------|--------------|
| Auth users | No for V1 | Create production users via Register, or a later explicit user import |
| Gold purchases / prices / goals / planning | No for V1 | Only if real user holdings must move; then a dedicated, reviewed import |
| Gold documents / screenshots | No | Also needs S3 object copy, not just rows |
| Luno Phase 1 ledger | No | **Rebuildable** via `POST /luno/sync` against live Luno |
| Luno FIFO lots / snapshots | No | **Rebuildable** via accounting rebuild |
| Luno user-scoped budget / buckets / strategy history | No | Rebuild or re-enter in production unless a later import is approved |

---

## 15. Final Verdict

### C. P1 BLOCKED — SCHEMA NOT YET REPRODUCIBLE

Empty PostgreSQL **cannot** be built into Auth + Gold + Luno using controlled migrations and `TYPEORM_SYNC=false`.

Module scope is already correct. Gold and Luno SQL files are a strong P2 starting point. The missing `users` / `refresh_tokens` migrations and the missing runner are the production schema blockers.

---

## Git safety check (end of P1)

| Item | Status |
|------|--------|
| Current branch | `release/production-readiness` |
| Files changed this phase | `PRODUCTION_P1_AUTH_GOLD_LUNO_READINESS.md` |
| Changes on `master` | **None** |
| Merge to `master` | **None** |
| Railway deployment | **None** |
| Parked modules deleted | **No** |
| TYPEORM_SYNC enabled | **No** |
| DEV data copied | **No** |
| Secrets printed | **No** |
| Gold/Luno calculations changed | **No** |
| KUTU implemented | **No** |

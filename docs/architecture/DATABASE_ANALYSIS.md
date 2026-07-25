# Database Analysis

> Persistence architecture assessment.  
> **Correction:** Checklist mentioned Prisma — this codebase uses **TypeORM + PostgreSQL**, not Prisma.

---

## Technology stack

| Item | Actual |
|------|--------|
| ORM | TypeORM `^0.3.28` |
| Nest integration | `@nestjs/typeorm` |
| Database | PostgreSQL (`pg` driver) |
| Connection | URL string (`DB_*_URL` or `DATABASE_URL`) |
| Schema sync | `synchronize: TYPEORM_SYNC === 'true'` |
| Prisma schema / client | **Not present** |

---

## Connection configuration

Active path: `src/database/database.module.ts` via `TypeOrmModule.forRootAsync`.

| Setting | Behavior |
|---------|----------|
| Env selection | `NODE_ENV === 'production'` → `DB_PRODUCTION_URL` else `DB_DEVELOPMENT_URL`; fallback `DATABASE_URL` |
| Entities | Spread from `src/entities/entities.ts` |
| Logging | Enabled when not production |
| Synchronize | Controlled by `TYPEORM_SYNC` |
| Retry | `retryAttempts: 3`, `retryDelay: 2000`, `verboseRetryLog: true` |
| Connect timeout | `extra.connectionTimeoutMillis: 15000` |

### Unused legacy config classes

- `DevelopmentConfigService` (`TypeOrmOptionsFactory`)
- `ProductionConfigService` (`TypeOrmOptionsFactory`)

These are **not** referenced by `DatabaseModule`’s current factory. Treat as dead/legacy.

---

## Entity registry

Central list: `src/entities/entities.ts`

| Entity | Table | Owning feature folder |
|--------|-------|------------------------|
| `User` | `users` | `user/` |
| `RefreshToken` | `refresh_tokens` | `auth/entities/` |
| `SavingPlan` | `saving_plans` | `plans/` |
| `UserSavingPlan` | `user_saving_plans` | `plans/` |
| `GlobalWallet` | `global_wallets` | `wallet/` |
| `ChallengeWallet` | `challenge_wallets` | `wallet/` |
| `WalletTransaction` | `wallet_transactions` | `wallet/` |
| `DailyChallengeClaim` | `daily_challenge_claims` | `wallet/` |
| `CompletedChallenge` | `completed_challenges` | `wallet/` |
| `GiveUpChallenge` | `give_up_challenges` | `wallet/` |
| `DailyTransactionLeverage` | `daily_transaction_leverages` | `wallet/` |
| `YearlyChallengeReset` | `yearly_challenge_resets` | `wallet/` |
| `GrabProfitEntry` | `grab_profit_entries` | `grab-profit/` |

Any new Finance entity **must** be appended here or TypeORM synchronize / metadata discovery will miss it.

---

## “Client” equivalent

There is no Prisma Client.

Data access pattern:

```
Service
  └── @InjectRepository(Entity) → Repository<Entity>
        └── find / findOne / save / create / count / delete / Between / In / IsNull
```

Transactional access:

```
repository.manager.transaction(async (manager) => {
  manager.getRepository(SomeEntity)...
})
```

---

## Repository pattern

| Pattern | Status |
|---------|--------|
| Custom repository classes | **No** |
| Abstract base repository | **No** |
| Service-as-repository | **Yes** — services own TypeORM repository calls |

For new Finance modules, the established reuse path is: inject `Repository<T>` inside the feature service (same as `GrabProfitService`, `UserService`).

---

## Transactions

Used for multi-table money / lifecycle consistency, notably:

- New-year challenge rollover (plans + wallet services)
- `resetUserChallenges` bulk delete
- Claim / stop / give-up / admin-complete flows inside `WalletService` (transactional sections in service body)

Pattern: `*.manager.transaction(async (manager) => { ... })`.

---

## Soft delete

| Soft-delete feature | Status |
|---------------------|--------|
| `@DeleteDateColumn` | Not used |
| `deletedAt` columns | Not found |
| TypeORM softRemove | Not used |

Deletion is hard delete (e.g. admin reset deletes related rows) or logical flags like `isActive` / `revokedAt` where applicable.

Logical “inactive” patterns:

- `UserSavingPlan.isActive`
- `SavingPlan.isActive`
- `RefreshToken.revokedAt`

---

## Naming conventions

| Layer | Convention | Example |
|-------|------------|---------|
| Tables | plural snake_case | `wallet_transactions` |
| Columns | snake_case | `balance_cents`, `user_id` |
| TS entity props | camelCase | `balanceCents`, `userId` |
| Mapping | TypeORM `name: '...'` on columns | `@Column({ name: 'user_id' })` |
| Primary keys | UUID (`PrimaryGeneratedColumn('uuid')`) | — |
| Timestamps | `timestamptz` via Create/UpdateDateColumn | `created_at`, `updated_at` |
| Money | integer cents | `amount_cents`, `earning_cents` |
| Indexes | explicit `@Index` names | `idx_...`, `uq_...` |

---

## Database organization / domain model (logical)

```
users
  ├── refresh_tokens (1:N)
  ├── user_saving_plans (1:N)
  │     └── challenge_wallets (1:1)
  │     └── daily_challenge_claims (1:N)
  ├── global_wallets (1:1)
  ├── wallet_transactions (1:N)
  ├── completed_challenges (1:N, unique per user+total_days+year)
  ├── give_up_challenges (1:N)
  ├── yearly_challenge_resets (1:N)
  └── grab_profit_entries (1:N, unique per user+work_date)

saving_plans                 (catalog, seeded)
daily_transaction_leverages  (tier config, seeded)
```

### Money model

- Stored as **cents** (`int`)
- Exposed to GraphQL often as RM via `Math.floor(cents/100)` or `Number((cents/100).toFixed(2))`

### Timezone model

- Challenge claim dates and “current year” use **Malaysia UTC+8** helpers in services
- Manual SQL backfill uses `AT TIME ZONE 'Asia/Kuala_Lumpur'`

---

## Migrations / SQL scripts

| Mechanism | Status |
|-----------|--------|
| TypeORM migrations CLI workflow | Not established as primary |
| `synchronize` | Primary schema evolution path when `TYPEORM_SYNC=true` |
| Ad-hoc SQL | `src/database/sql/year-reset-backfill.sql` for year-reset rollout |

Comment in code explicitly notes migrations are not used and synchronize must create tables for seeding.

---

## Type unions used as enum substitutes

In `wallet-transaction.entity.ts`:

```ts
export type WalletType = 'GLOBAL' | 'CHALLENGE';
export type WalletTransactionType = 'CREDIT' | 'DEBIT';
```

Stored as `varchar` columns. Reference types are free-form strings (e.g. `NEW_YEAR_RESET`).

No TypeScript `enum` keyword usages found under `src/`.

---

## Guidance for new Finance modules

1. Add TypeORM `@Entity` in the feature folder.
2. Register in `entities/entities.ts`.
3. `TypeOrmModule.forFeature([YourEntity])` in the feature module.
4. Prefer cents + UUID PKs + snake_case DB names.
5. Use transactions for multi-row financial writes.
6. Do not introduce Prisma alongside TypeORM.
7. Prefer unique indexes for idempotent daily entries (see `grab_profit_entries` user+work_date uniqueness).

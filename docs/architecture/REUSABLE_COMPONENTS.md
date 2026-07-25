# Reusable Components

> Inventory of what exists today and can be reused for new Finance modules.  
> Many checklist items are **absent** — absence is documented so Finance work does not assume ghosts.

---

## Quick scorecard

| Component type | Present? | Location / notes |
|----------------|----------|------------------|
| Pagination helper | No | Hard-coded `take: 20` in wallet overview |
| Logger abstraction | Partial | Nest `Logger` used ad hoc in services |
| Shared helpers folder | No | Co-located helpers only |
| Shared validators | No | class-validator on DTOs |
| Response wrapper | No | GraphQL models returned directly |
| Shared constants module | No | Magic strings/roles inline |
| Base classes | No | — |
| Abstract services | No | — |
| Base repositories | No | — |
| CommonModule / SharedModule | No | Cross-cutting via `auth` + `user` exports |

---

## High-value reusable pieces

### Authentication & user context

| Component | Path | Purpose | Reuse how |
|-----------|------|---------|-----------|
| `JwtAuthGuard` | `src/auth/jwt-auth.guard.ts` | Protect GraphQL ops (GQL req extraction) | `@UseGuards(JwtAuthGuard)` |
| `JwtStrategy` / `JwtUser` | `src/auth/jwt.strategy.ts` | Validate Bearer access token; shape of current user | Type `JwtUser` for `@CurrentUser()` |
| `CurrentUser` | `src/auth/current-user.decorator.ts` | Param decorator for `req.user` | `@CurrentUser() user: JwtUser` |
| `Roles` | `src/auth/roles.decorator.ts` | Set required roles metadata | `@Roles('ADMIN')` |
| `RolesGuard` | `src/auth/roles.guard.ts` | Enforce role metadata | Pair with JwtAuthGuard |
| `AuthService` | `src/auth/auth.service.ts` | Register/login/refresh | Export available; usually not needed by Finance |
| `AdminSecretGuard` | `src/auth/admin-secret.guard.ts` | Header `x-admin-secret` check | Available but currently unused |

### User service

| Component | Path | Purpose |
|-----------|------|---------|
| `UserModule` / `UserService` | `src/user/` | `findById`, `findByEmail`, `create`, `updateAvatar` |

Import `UserModule` when Finance needs user lookups beyond `user.id` from JWT.

### Configuration

| Component | Path | Purpose |
|-----------|------|---------|
| Global `ConfigModule` | `app.module.ts` | Inject `ConfigService` anywhere |
| Env vars pattern | `.env.example` | Convention for secrets and URLs |

### Persistence conventions (reuse as patterns)

| Pattern | Example | Reuse |
|---------|---------|-------|
| Entity registry | `src/entities/entities.ts` | Append new entities |
| TypeORM feature registration | any `*.module.ts` | `TypeOrmModule.forFeature` |
| Transactions | `wallet.service.ts`, `plans.service.ts` | Multi-row financial writes |
| Cents money storage | wallet + grab-profit entities | Finance money fields |
| Upsert-by-natural-key | `GrabProfitService` (userId + workDate) | Daily finance entries |
| Idempotent seeding | plans/wallet `OnModuleInit` | Reference data |

### Media / URL helper

| Component | Path | Purpose |
|-----------|------|---------|
| `resolveClientAvatarUrl` | `src/profile-media/client-avatar-url.ts` | Map stored avatar to client URL / API proxy |
| `ProfileMediaService` | `src/profile-media/profile-media.service.ts` | S3 upload/stream patterns |

Reuse only if Finance needs object storage.

### GraphQL model style

Existing models demonstrate response shaping to reuse stylistically:

- `src/user/models/user.model.ts`
- `src/auth/models/auth-payload.model.ts`
- `src/plans/models/*`
- `src/wallet/models/*`
- `src/grab-profit/models/grab-profit-result.model.ts`

### Closest existing Finance module blueprint

**`src/grab-profit/`** is the best template for additional Finance features:

- Feature module
- Entity with cents columns + unique business key
- DTO InputType with validators
- Result ObjectType
- Jwt-protected mutation
- Service calculates, persists, aggregates period sums

---

## Guards (complete list)

| Guard | Purpose | Status |
|-------|---------|--------|
| `JwtAuthGuard` | Require valid access JWT; GraphQL context aware | Active, primary |
| `RolesGuard` | Require role from `@Roles` metadata | Active on admin wallet mutations |
| `AdminSecretGuard` | Require `x-admin-secret` header matching `ADMIN_RESET_SECRET` | Implemented, **unused** |

---

## Middleware (complete list)

**None.** No custom Nest middleware classes; no `MiddlewareConsumer` in modules.

---

## Interceptors (complete list)

| Interceptor | Purpose |
|-------------|---------|
| Nest `FileInterceptor` (multer) | Parse multipart `file` on `POST /profile/avatar` (10MB limit) |

No custom interceptor classes.

---

## Filters (complete list)

**None.** No custom exception filters.

---

## Decorators (custom)

| Decorator | Purpose |
|-----------|---------|
| `@CurrentUser()` | Inject authenticated `JwtUser` from request |
| `@Roles(...roles)` | Attach required roles metadata for `RolesGuard` |

---

## Enums

**No TypeScript `enum` declarations found.**

Closest substitutes:

| Name | Kind | Purpose |
|------|------|---------|
| `WalletType` | string union `'GLOBAL' \| 'CHALLENGE'` | Wallet bucket discriminator |
| `WalletTransactionType` | string union `'CREDIT' \| 'DEBIT'` | Ledger direction |
| Role strings | `'USER'`, `'ADMIN'` | Authorization |
| Reference type strings | e.g. `'NEW_YEAR_RESET'` | Ledger linkage |

---

## Interfaces / types

| Name | Path | Purpose |
|------|------|---------|
| `JwtUser` | `auth/jwt.strategy.ts` | Authenticated user projection |
| `CreateUserInput` | `user/user.service.ts` | Internal create payload |
| `UpdateUserAvatarInput` | `user/user.service.ts` | Avatar update payload |
| Inline upload file type | `profile-media.service.ts` | Multer-like file shape |

GraphQL models/inputs are classes, not interfaces.

---

## Utilities / helpers

| Helper | Path | Purpose |
|--------|------|---------|
| `resolveClientAvatarUrl` | `profile-media/client-avatar-url.ts` | Client-facing avatar URL |
| Malaysia date helpers | private in `wallet.service.ts` / `plans.service.ts` | UTC+8 date keys & year |
| `rmToCents` / `centsToRm` | private in `grab-profit.service.ts` | Money conversion |
| Plan math helpers | private in `plans.service.ts` | total amount / allowed hours formulas |

**Gap:** timezone and money helpers are duplicated/private — candidates for future shared utils (recommendation only).

---

## Constants (inline)

| Constant | Where | Purpose |
|----------|-------|---------|
| `DEFAULT_TOTAL_DAYS` | plans.service | Seed plan durations |
| `DEFAULT_DAILY_LEVERAGES` | wallet.service | Seed claim leverage tiers |
| `DEFAULT_MAINTENANCE_PER_KM_RM` | grab-profit.service | Default maintenance rate |
| `MALAYSIA_OFFSET_MS` | plans/wallet services | UTC+8 offset |
| `ALLOWED_MIME_TYPES` / `MAX_AVATAR_BYTES` | profile-media.service | Upload constraints |

No central `constants.ts`.

---

## What to reuse for a new Finance module (checklist)

1. Feature folder structure like `grab-profit/`
2. `JwtAuthGuard` + `@CurrentUser()`
3. `ConfigService` if env-driven rates/limits are needed
4. TypeORM entity + register in `entities.ts`
5. Money in cents
6. InputType + class-validator
7. ObjectType result model
8. Nest `Logger` for operational warnings
9. Transactions for multi-table money movement
10. Optional: `RolesGuard` for admin finance ops

## What you should not assume exists

- Pagination utility
- Shared response wrapper
- Soft-delete base entity
- Prisma client
- Global exception filter
- CommonModule providers
- Abstract repository base class

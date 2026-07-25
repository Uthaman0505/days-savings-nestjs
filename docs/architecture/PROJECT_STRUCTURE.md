# Project Structure

> Folder organization and conventions for adding new modules without redesigning the architecture.

---

## Root layout

```
nest/
├── src/                    # Application source (Nest sourceRoot)
├── test/                   # e2e tests + env loader helper
├── docs/architecture/      # This architecture assessment set
├── .env / .env.example     # Environment configuration
├── package.json            # Dependencies & scripts
├── nest-cli.json           # Nest CLI (sourceRoot: src)
├── tsconfig*.json          # TypeScript compiler options
├── eslint.config.mjs       # Lint
├── Dockerfile              # Container build
├── .github/workflows/      # CI / docker publish
└── README.md               # Default Nest starter README
```

---

## `src/` organization

```
src/
├── main.ts                 # Bootstrap
├── app.module.ts           # Root composition
├── app.service.ts
├── app.resolver.ts
├── app.resolver.spec.ts
├── auth/                   # Authentication & authorization
├── user/                   # User persistence/service
├── plans/                  # Saving plan catalog & subscription
├── wallet/                 # Wallets, claims, challenge lifecycle
├── grab-profit/            # Grab daily profit finance feature
├── profile-media/          # REST avatar media
├── database/               # TypeORM root config + SQL scripts
└── entities/               # Central entity array export
```

---

## Feature modules

| Module folder | Nest module | API style | Domain |
|---------------|-------------|-----------|--------|
| `auth/` | `AuthModule` | GraphQL | Register, login, refresh, `me` |
| `user/` | `UserModule` | Internal service (no resolver) | User CRUD-ish helpers |
| `plans/` | `PlansModule` | GraphQL | Plan list, subscribe, active/completed/gave-up |
| `wallet/` | `WalletModule` | GraphQL | Challenge room, claims, stop/give-up, admin |
| `grab-profit/` | `GrabProfitModule` | GraphQL | Calculate & persist Grab profit |
| `profile-media/` | `ProfileMediaModule` | REST | Avatar upload & stream |

---

## Shared / common / utilities / config

| Expected folder | Exists? | Actual approach |
|-----------------|---------|-----------------|
| `common/` | No | Cross-cutting pieces live inside `auth/` or feature folders |
| `shared/` | No | Shared via Nest `exports` (`UserService`, guards) |
| `utils/` / `helpers/` | No dedicated folder | Small helpers co-located (`client-avatar-url.ts`, private functions in services) |
| `config/` | No | `ConfigModule` + env + factories in modules |
| `filters/` | No | — |
| `middleware/` | No | — |
| `interceptors/` | No | Framework interceptor used inline |
| `repositories/` | No | TypeORM repos injected in services |

---

## Feature-internal conventions

### GraphQL feature (preferred pattern)

```
feature-name/
  feature-name.module.ts
  feature-name.service.ts
  feature-name.resolver.ts
  feature-name.service.spec.ts   # optional
  some.entity.ts
  dto/
    some.input.ts                # @InputType + class-validator
  models/
    some-result.model.ts         # @ObjectType GraphQL response
```

### Auth variant

```
auth/
  entities/refresh-token.entity.ts
  dto/
  models/
  *.guard.ts
  *.strategy.ts
  *.decorator.ts
```

### REST variant (exception)

```
profile-media/
  profile-media.controller.ts
  profile-media.service.ts
  profile-media.module.ts
  client-avatar-url.ts
```

---

## Database-related structure

```
database/
  database.module.ts                 # ACTIVE TypeORM root wiring
  development-config.service.ts      # Present but unused by AppModule path
  production-config.service.ts       # Present but unused by AppModule path
  sql/
    year-reset-backfill.sql          # Manual Postgres rollout script

entities/
  entities.ts                        # Single source of entity list for synchronize
```

---

## Where new Finance modules should be placed

**Place:** `src/<finance-feature-name>/` as a peer of `wallet/` and `grab-profit/`.

**Register:**

1. Add Nest module import in `app.module.ts`
2. Append new entities to `entities/entities.ts`
3. Use `TypeOrmModule.forFeature([...])` inside the feature module
4. Prefer GraphQL resolver + service + dto + models
5. Protect mutations/queries with existing `JwtAuthGuard` and `@CurrentUser()`

**Example naming aligned with current style:**

- Module: `ExpenseModule` in `src/expense/`
- Mutation names: camelCase GraphQL names (existing mix: `RegisterUser`, `subscribeToDays`, `calculateGrabProfit`)
- Money columns: `*_cents` integers
- GraphQL money fields: often RM number derived in service mapping

---

## Folders / areas that should rarely be modified

| Path | Guidance |
|------|----------|
| `src/auth/**` | Do not redesign; reuse guards/decorators/services |
| `src/main.ts` | Only if global bootstrap behavior must change |
| Existing wallet money movement logic | Financial integrity; extend carefully |
| `.env` | Secrets; never commit real credentials |

| Path | Expected to touch when adding features |
|------|----------------------------------------|
| `src/app.module.ts` | Import new module |
| `src/entities/entities.ts` | Register new entities |
| New `src/<feature>/` tree | Own feature code |

---

## Test structure

```
src/**/*.spec.ts     # Unit tests co-located (Jest rootDir: src)
test/
  app.e2e-spec.ts
  jest-e2e.json
  load-env.ts
```

---

## Naming conventions observed

| Layer | Convention |
|-------|------------|
| Folders | kebab-case (`grab-profit`, `profile-media`) |
| Nest modules/classes | PascalCase (`GrabProfitModule`) |
| DB tables | plural snake_case (`wallet_transactions`) |
| DB columns | snake_case mapped via TypeORM `name:` |
| TS properties | camelCase |
| GraphQL field aliases | often snake_case via `@Field({ name: '...' })` |
| GraphQL input properties | sometimes snake_case (`total_days`, `day_number`, `work_date`) |

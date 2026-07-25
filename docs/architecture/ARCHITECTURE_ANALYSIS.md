# Architecture Analysis

> Technical assessment of `days-savings-challange-backend` (NestJS).  
> **Read-only reverse engineering.** No code was modified.

**Assessment date:** 2026-07-22  
**Stack verdict:** NestJS 11 + GraphQL (Apollo) + TypeORM + PostgreSQL + Passport JWT  
**Important correction:** This project does **not** use Prisma. Persistence is **TypeORM** against PostgreSQL.

---

## 1. Executive summary

The backend is a **feature-module NestJS application** centered on GraphQL. Domain features (auth, users, plans, wallet, grab-profit, profile media) live as sibling folders under `src/`. Business logic sits in **services** that inject **TypeORM repositories** directly. There is no separate repository layer, no `common/` / `shared/` module, no Swagger, and no global exception filters or custom middleware.

The product domain is a **daily savings challenge system** (Malaysia UTC+8 calendar rules, wallets in cents, yearly challenge rollover) plus a newer **Grab profit calculator** finance-adjacent module.

---

## 2. High-level architecture

```
Client (React Native / browser)
        │
        ├── GraphQL HTTP  →  /graphql   (primary API)
        └── REST HTTP     →  /profile/* (avatar upload/stream only)
        │
        ▼
NestJS Application (Express)
        │
        ├── Global ValidationPipe
        ├── CORS (origin: true, credentials: true)
        ├── Apollo GraphQL (auto schema, req in context)
        └── Feature Modules
                │
                ├── Resolvers / Controllers  (API edge)
                ├── Services                 (domain + persistence orchestration)
                └── TypeORM Repositories     (injected via @InjectRepository)
                        │
                        ▼
                PostgreSQL (Railway / local)
```

**Dependency style:** GraphQL-first. Controllers exist only for binary/multipart profile media.

---

## 3. Project folder structure (`src/`)

| Path | Role |
|------|------|
| `src/main.ts` | Bootstrap: NestFactory, CORS, ValidationPipe, listen |
| `src/app.module.ts` | Root module: Config, Database, GraphQL, feature imports |
| `src/app.service.ts` / `src/app.resolver.ts` | Health-style `hello` GraphQL query |
| `src/auth/` | JWT auth, refresh tokens, guards, decorators |
| `src/user/` | User entity + UserService (exported for reuse) |
| `src/plans/` | Saving plans catalog + user subscriptions |
| `src/wallet/` | Challenge/global wallets, claims, admin ops |
| `src/grab-profit/` | Daily Grab earning/profit calculation (finance-adjacent) |
| `src/profile-media/` | REST avatar upload/stream via S3-compatible storage |
| `src/database/` | TypeORM root connection module + unused env-specific config classes + SQL scripts |
| `src/entities/entities.ts` | Central entity registry for TypeORM |

### Folder organization model

- **Feature modules** (vertical slices): `auth`, `user`, `plans`, `wallet`, `grab-profit`, `profile-media`
- **Infrastructure modules**: `database`, root `AppModule`
- **Shared / common modules**: **None** (no `common/`, `shared/`, `libs/`, `core/`)
- **Utilities**: Minimal; e.g. `profile-media/client-avatar-url.ts`, date helpers inlined in services
- **Config folders**: No dedicated `config/` folder. Config is `@nestjs/config` + `.env` + inline factories in `DatabaseModule` / `AuthModule` / services

### Typical feature folder shape

```
feature/
  feature.module.ts
  feature.service.ts
  feature.resolver.ts          # GraphQL edge (or *.controller.ts for REST)
  *.entity.ts                  # TypeORM entities co-located
  dto/*.input.ts               # GraphQL InputType + class-validator
  models/*.model.ts            # GraphQL ObjectType response shapes
  entities/                    # used only in auth for RefreshToken
```

---

## 4. Application bootstrap

See also: [BOOTSTRAP_ANALYSIS.md](./BOOTSTRAP_ANALYSIS.md)

| Concern | Present? | Notes |
|---------|----------|-------|
| Startup flow | Yes | `NestFactory.create` → CORS → ValidationPipe → listen `0.0.0.0` |
| Global middleware | No | No `MiddlewareConsumer`, no custom middleware files |
| Global validation | Yes | `ValidationPipe` whitelist + forbidNonWhitelisted + transform |
| Global exception filter | No | Nest/GraphQL defaults only |
| Global interceptors | No | Only route-level `FileInterceptor` on avatar upload |
| CORS | Yes | `origin: true`, `credentials: true` |
| Swagger | No | GraphQL Playground (non-production) instead |
| Configuration loading | Yes | Global `ConfigModule.forRoot({ envFilePath: '.env' })` |

Port resolution: `PORT` (Railway) → `APP_PORT` → `'5000'`.

---

## 5. Dependency injection

- Providers are Nest `@Injectable()` services, resolvers, strategies, and guards.
- Registration is per-module via `providers` / `exports`.
- Persistence: `TypeOrmModule.forFeature([...entities])` then `@InjectRepository(Entity)`.
- Cross-module reuse via Nest exports (e.g. `UserModule` exports `UserService`; `AuthModule` exports `AuthService`, `JwtAuthGuard`).
- Guards are sometimes registered as providers (`JwtAuthGuard`, `RolesGuard`) and applied with `@UseGuards`.

There is **no** custom DI container, no abstract base services, and no repository abstractions.

---

## 6. Configuration & secrets

See also: package/env details in [PACKAGE_ANALYSIS.md](./PACKAGE_ANALYSIS.md) and [BOOTSTRAP_ANALYSIS.md](./BOOTSTRAP_ANALYSIS.md).

| Mechanism | Usage |
|-----------|--------|
| `.env` / `.env.example` | Local and documented env vars |
| `ConfigModule` | Global; `ConfigService` injected where needed |
| Custom `ConfigurationService` | **Does not exist** |
| Secrets | JWT secrets, DB URLs, S3 keys, `ADMIN_RESET_SECRET` via env |

Env categories: runtime (`NODE_ENV`, `PORT`/`APP_PORT`), database URLs, JWT, TypeORM sync flag, object storage, public app URL, admin reset secret.

---

## 7. Authentication (analysis only — do not modify)

See auth section details below; **no implementation changes recommended in this document.**

| Piece | Implementation |
|-------|----------------|
| JWT | `@nestjs/jwt` + `passport-jwt`; access tokens with `typ: 'access'` |
| Passport | `PassportModule` default strategy `jwt`; `JwtStrategy` |
| Guards | `JwtAuthGuard` (GQL-aware), `RolesGuard`, unused `AdminSecretGuard` |
| Decorators | `@CurrentUser()`, `@Roles(...)` |
| User context | Passport attaches `req.user` as `JwtUser` |
| Refresh | Separate refresh JWT (`JWT_REFRESH_SECRET`) + `refresh_tokens` table with jti rotation |

---

## 8. Database

See: [DATABASE_ANALYSIS.md](./DATABASE_ANALYSIS.md)

| Expected (checklist) | Actual |
|----------------------|--------|
| Prisma | **Not used** |
| Schema | TypeORM entity classes + `synchronize` / ad-hoc SQL |
| Client | TypeORM `Repository` / `EntityManager` |
| Repositories | Nest TypeORM repositories only (no custom repo classes) |
| Transactions | `manager.transaction(...)` in wallet/plans flows |
| Soft delete | **Not implemented** |
| Naming | DB: `snake_case` tables/columns; TS: `camelCase` |

---

## 9. Coding standards (observed)

See: [CODING_STANDARD.md](./CODING_STANDARD.md)

- **API edge:** GraphQL Resolvers (primary), REST Controllers (exception)
- **Service pattern:** Fat services with domain rules + TypeORM access
- **Repository pattern:** Not used as a code layer
- **DTO pattern:** GraphQL `@InputType` + `class-validator`
- **Response format:** GraphQL `@ObjectType` models; money often exposed as RM integers/floats derived from cents
- **Errors:** Nest HTTP exceptions (`BadRequestException`, `UnauthorizedException`, etc.) → GraphQL/HTTP errors

---

## 10. Folder convention for new Finance modules

### Where to place new modules

Create a new sibling under `src/`, e.g.:

```
src/finance-xyz/
  finance-xyz.module.ts
  finance-xyz.service.ts
  finance-xyz.resolver.ts
  *.entity.ts
  dto/
  models/
```

Then:

1. Register entities in `src/entities/entities.ts`
2. Import the module in `src/app.module.ts`
3. Reuse `JwtAuthGuard` + `@CurrentUser()` from `auth/`
4. Reuse `UserModule` / `UserService` if user ownership is required
5. Store money in **cents** (`*_cents` int columns) to match wallet/grab-profit conventions

### Folders / files to treat carefully (prefer not to casually rewrite)

| Area | Why |
|------|-----|
| `src/auth/**` | Security-critical; user asked not to modify auth |
| `src/main.ts` | Global bootstrap behavior |
| `src/database/database.module.ts` | DB connectivity / sync policy |
| Existing wallet transaction semantics | Financial integrity |
| `.env` secrets | Credentials |

Infrastructure registry touch-points for new entities are **expected** when adding modules: `entities.ts` + `app.module.ts`.

---

## 11–19. Cross-cutting inventory

| Category | Finding |
|----------|---------|
| Reusable components | See [REUSABLE_COMPONENTS.md](./REUSABLE_COMPONENTS.md) |
| Shared / Common module | **Absent** |
| Middleware | **None custom** |
| Guards | `JwtAuthGuard`, `RolesGuard`, `AdminSecretGuard` (unused) |
| Interceptors | Nest `FileInterceptor` only |
| Filters | **None custom** |
| Decorators | `@CurrentUser`, `@Roles` |
| Enums | No TS `enum`; string union types for wallet |
| Interfaces | Small service input interfaces + `JwtUser` type |
| Utilities | Avatar URL helper; Malaysia date helpers inlined in services |

---

## 20. Architecture diagram (request path)

```
Request (GraphQL or REST)
        ↓
Resolver (GraphQL)  or  Controller (REST)
        ↓
Guard(s)  [JwtAuthGuard / RolesGuard]
        ↓
Service  (domain + orchestration)
        ↓
TypeORM Repository / EntityManager.transaction
        ↓
PostgreSQL
```

**Note vs checklist wording:** The checklist said “Controller → Service → Repository → Prisma”. In this codebase the dominant path is **Resolver → Service → TypeORM Repository → PostgreSQL**. Prisma is not present.

---

## 21. Module dependency relationships

See: [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md)

```
AppModule
  ├── ConfigModule (global)
  ├── DatabaseModule → TypeOrmModule.forRootAsync
  ├── GraphQLModule
  ├── AuthModule → UserModule, TypeOrm(RefreshToken), Jwt, Passport
  ├── PlansModule → TypeOrm(plans + wallet entities)
  ├── WalletModule → TypeOrm(wallet + UserSavingPlan), RolesGuard
  ├── UserModule → TypeOrm(User)
  ├── ProfileMediaModule → UserModule
  └── GrabProfitModule → TypeOrm(GrabProfitEntry)
```

---

## 22. Project health assessment

### Strengths

- Clear feature-module boundaries aligned with Nest conventions
- GraphQL schema auto-generated from decorators (`autoSchemaFile: true`)
- Consistent money storage in cents
- Refresh-token rotation with DB-backed jti revocation
- Role metadata + `RolesGuard` for admin mutations
- Transactional flows for wallet transfers / resets / new-year rollover
- Seed-on-boot for plans and daily leverage tables (idempotent)
- ValidationPipe + class-validator on GraphQL inputs
- S3-compatible profile media with private-bucket proxy option

### Weaknesses

- No dedicated repository / domain layer; services grow large (`wallet.service.ts`)
- Duplicated Malaysia timezone / new-year rollover logic in `PlansService` and `WalletService`
- No global exception filter / structured error envelope
- No pagination abstraction (hard-coded `take: 20` for recent txs)
- `TYPEORM_SYNC` used instead of formal migration pipeline (SQL scripts are ad-hoc)
- Unused / dead code: `AdminSecretGuard`, `DevelopmentConfigService`, `ProductionConfigService`
- `JwtAuthGuard` is GraphQL-context oriented but also applied to REST profile routes
- No shared constants module for roles, reference types, timezone offset
- `.env.example` appears to contain real-looking credentials (secret hygiene risk)

### Technical debt

- Fat services acting as repositories + use-cases
- Cross-feature entity imports (`plans` importing wallet entities) without a shared domain package
- Stringly-typed `referenceType` / roles rather than centralized enums
- Partial TypeScript strictness (`noImplicitAny: false`)
- Default Nest README still present; little project-specific ops docs (until this analysis set)

### Possible improvements (recommendations only — not implemented)

- Extract shared date/timezone and money helpers
- Introduce migrations; disable synchronize in production
- Add a thin repository or query service layer for wallet money movements
- Centralize error codes and a GraphQL error formatter
- Add pagination helper for list queries
- Remove or wire unused guards/config services
- Keep new Finance modules as `src/<feature>/` siblings following grab-profit / wallet patterns

---

## Deliverable map

| Document | Focus |
|----------|--------|
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | Folders & conventions |
| [BOOTSTRAP_ANALYSIS.md](./BOOTSTRAP_ANALYSIS.md) | Startup & globals |
| [PACKAGE_ANALYSIS.md](./PACKAGE_ANALYSIS.md) | Dependencies table |
| [DATABASE_ANALYSIS.md](./DATABASE_ANALYSIS.md) | TypeORM/Postgres |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | Module communication |
| [CODING_STANDARD.md](./CODING_STANDARD.md) | Patterns to reuse |
| [REUSABLE_COMPONENTS.md](./REUSABLE_COMPONENTS.md) | What exists to reuse |
| This file | Full assessment |

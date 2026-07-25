# Package Analysis

> Derived from `package.json`. No packages were added or removed.

**Project:** `days-savings-challange-backend` `@1.0.1`  
**Runtime scripts:** Nest CLI build/start, Jest unit/e2e, ESLint, Prettier

---

## Runtime dependencies

| Package | Purpose | Why used | Required? | Optional? | Can be reused? |
|---------|---------|----------|-----------|-----------|----------------|
| `@nestjs/common` | Nest core decorators, pipes, exceptions | Framework foundation | Yes | No | Yes — all modules |
| `@nestjs/core` | Nest DI container & lifecycle | Application runtime | Yes | No | Yes |
| `@nestjs/platform-express` | Express adapter | HTTP server for GraphQL + REST | Yes | No | Yes |
| `@nestjs/config` | Env configuration | Loads `.env`, `ConfigService` | Yes | No | Yes — new Finance modules |
| `@nestjs/graphql` | GraphQL integration | Resolvers, schema, GQL context | Yes | No | Yes — primary API style |
| `@nestjs/apollo` | Apollo driver for Nest GraphQL | Apollo Server wiring | Yes | No | Yes |
| `@apollo/server` | Apollo Server v5 | GraphQL execution engine | Yes | No | Yes (via Nest) |
| `@as-integrations/express5` | Apollo ↔ Express 5 integration | Required by Apollo 5 + Express | Yes | No | Yes (indirect) |
| `graphql` | GraphQL type system | Schema / execution dependency | Yes | No | Yes |
| `@nestjs/typeorm` | Nest ↔ TypeORM bridge | `forRootAsync` / `forFeature` | Yes | No | Yes — persistence pattern |
| `typeorm` | ORM | Entities, repositories, transactions | Yes | No | Yes |
| `pg` | PostgreSQL driver | TypeORM Postgres connectivity | Yes | No | Yes |
| `@nestjs/jwt` | JWT sign/verify helpers | Access & refresh token issuance | Yes | No | Yes — do not reinvent auth |
| `@nestjs/passport` | Passport Nest integration | Auth strategies/guards | Yes | No | Yes |
| `passport` | Auth middleware framework | Strategy host | Yes | No | Yes |
| `passport-jwt` | JWT Bearer extraction/validate | Access-token auth | Yes | No | Yes |
| `bcrypt` | Password hashing | Register/login | Yes | No | Yes (auth only) |
| `class-validator` | DTO validation | GraphQL input validation | Yes | No | Yes — all new inputs |
| `class-transformer` | Object transformation | Used with ValidationPipe `transform` | Yes | No | Yes |
| `@aws-sdk/client-s3` | S3 API client | Avatar upload/get/delete | Yes (for profile-media) | Optional for pure Finance GraphQL modules | Yes if media/storage needed |
| `reflect-metadata` | Decorator metadata | Required by Nest/TypeORM | Yes | No | Yes |
| `rxjs` | Observables | Nest internals / streams | Yes | No | Yes (framework) |

---

## Dev dependencies

| Package | Purpose | Why used | Required? | Optional? | Can be reused? |
|---------|---------|----------|-----------|-----------|----------------|
| `@nestjs/cli` | Build/generate Nest apps | `nest build`, schematics | Yes (dev) | No for prod image if prebuilt | Yes for scaffolding modules |
| `@nestjs/schematics` | Code generators | Nest CLI templates | Dev tooling | Yes | Yes |
| `@nestjs/testing` | Testing utilities | Unit tests | For tests | Yes in prod | Yes for new specs |
| `typescript` | Language compiler | Compile TS → JS | Yes (dev/build) | No | Yes |
| `ts-node` / `ts-loader` / `tsconfig-paths` | TS execution/load paths | Jest/debug/build helpers | Dev | Mostly yes | Yes |
| `jest` / `ts-jest` / `@types/jest` | Unit testing | `*.spec.ts` | Recommended | Yes | Yes |
| `supertest` / `@types/supertest` | HTTP e2e testing | `test/app.e2e-spec.ts` | Recommended | Yes | Yes |
| `eslint` + typescript-eslint + prettier plugins | Lint/format | Code quality | Recommended | Yes | Yes |
| `@types/node` | Node typings | TS types | Yes (dev) | No | Yes |
| `@types/express` | Express typings | Controllers/guards | Yes (dev) | No | Yes |
| `@types/bcrypt` | bcrypt typings | Auth service | Yes (dev) | No | Yes |
| `@types/passport-jwt` | passport-jwt typings | JwtStrategy | Yes (dev) | No | Yes |
| `source-map-support` | Better stack traces | Debugging | Optional | Yes | Optional |
| `@eslint/eslintrc` / `@eslint/js` / `globals` | ESLint flat config support | Lint setup | Dev | Yes | Yes |

---

## Notable absences (relevant to architecture checklist)

| Expected / common package | Status in this project |
|---------------------------|-------------------------|
| `@prisma/client` / `prisma` | **Not present** — TypeORM used instead |
| `@nestjs/swagger` | **Not present** — GraphQL Playground used |
| `helmet` | Not present |
| `morgan` / `pino` / `winston` | Not present — Nest `Logger` only |
| `nestjs-pino` | Not present |
| Pagination libraries | Not present |
| Migration runners (TypeORM DataSource CLI scripts) | Not packaged as first-class scripts |

---

## Environment variables (consumed by packages / code)

| Variable | Consumed by | Purpose |
|----------|-------------|---------|
| `NODE_ENV` | AppModule GraphQL playground, DatabaseModule logging, ProfileMedia error detail | Environment mode |
| `PORT` / `APP_PORT` | `main.ts` | Listen port |
| `DB_DEVELOPMENT_URL` / `DB_PRODUCTION_URL` / `DATABASE_URL` | DatabaseModule | Postgres connection string |
| `TYPEORM_SYNC` | DatabaseModule | Enable/disable schema synchronize |
| `JWT_SECRET` | AuthModule / JwtStrategy | Access token secret |
| `JWT_EXPIRES_IN` | AuthModule / AuthService | Access token TTL |
| `JWT_REFRESH_SECRET` | AuthService | Refresh token secret |
| `JWT_REFRESH_EXPIRES_IN` | AuthService | Refresh token TTL |
| `ADMIN_RESET_SECRET` | `AdminSecretGuard` (currently unused by resolvers) | Header-based admin secret |
| `STORAGE_*` | ProfileMediaService | S3-compatible object storage |
| `PUBLIC_APP_URL` | Auth/JwtStrategy/ProfileMedia | Avatar proxy base URL |
| `STORAGE_PUT_OBJECT_ACL` | ProfileMediaService (optional) | Object ACL if provider supports it |

---

## Reuse guidance for new Finance modules

**Must reuse:** Nest core, GraphQL, TypeORM, Config, class-validator/transformer, existing auth packages (via existing guards — do not reimplement).

**Reuse if needed:** `@aws-sdk/client-s3` only when Finance features need file storage.

**Do not introduce Prisma** unless intentionally migrating the entire persistence stack — that would be a redesign, not reuse.

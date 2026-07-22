# Bootstrap Analysis

> Analysis of application startup: `main.ts` + `AppModule`. No changes made.

---

## Startup flow

```
node / nest start
        ↓
main.ts → bootstrap()
        ↓
NestFactory.create<NestExpressApplication>(AppModule)
        ↓
AppModule imports initialize:
  1. ConfigModule.forRoot (global, .env)
  2. DatabaseModule → TypeOrmModule.forRootAsync (connect Postgres)
  3. GraphQLModule.forRoot (Apollo)
  4. Feature modules (Auth, Plans, Wallet, User, ProfileMedia, GrabProfit)
        ↓
Providers constructed; OnModuleInit hooks run
  - PlansService.seedDefaultPlans()
  - WalletService.seedDefaultDailyLeverages()
        ↓
main.ts enables CORS
        ↓
main.ts registers global ValidationPipe
        ↓
app.listen(PORT|APP_PORT|5000, '0.0.0.0')
        ↓
Log: http://localhost:<port>/graphql
```

On bootstrap failure: log error and `process.exit(1)`.

---

## `main.ts` responsibilities

| Concern | Implementation |
|---------|----------------|
| App factory | `NestFactory.create` with Express adapter typing |
| CORS | `enableCors({ origin: true, credentials: true })` |
| Global validation | `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` |
| Listen host | `0.0.0.0` (container/Railway friendly) |
| Port | `process.env.PORT ?? process.env.APP_PORT ?? '5000'` |
| Global middleware | **None** |
| Global filters | **None** |
| Global interceptors | **None** |
| Swagger | **None** |
| Helmet / compression | **None** |

---

## `AppModule` responsibilities

### Imports (order as declared)

1. **`ConfigModule.forRoot`**
   - `isGlobal: true`
   - `envFilePath: '.env'`
2. **`DatabaseModule`**
   - Async TypeORM root based on `NODE_ENV` and DB URL env vars
3. **`GraphQLModule.forRoot` (Apollo)**
   - `autoSchemaFile: true` (code-first schema)
   - `context: ({ req }) => ({ req })` — required for JWT guards / `@CurrentUser`
   - `playground: false` in production, else true
   - `csrfPrevention: false` (comment notes public API / browser sandbox)
4. **Feature modules:** `AuthModule`, `PlansModule`, `WalletModule`, `UserModule`, `ProfileMediaModule`, `GrabProfitModule`

### Root providers

- `AppService`
- `AppResolver` → exposes `hello` query

No root `controllers` array (REST controllers live in feature modules).

---

## Global validation

Configured once in `main.ts`:

| Option | Effect |
|--------|--------|
| `whitelist: true` | Strip undeclared DTO properties |
| `forbidNonWhitelisted: true` | Reject unknown properties |
| `transform: true` | Coerce payloads into DTO class instances |

Validation rules live on GraphQL `@InputType` classes via `class-validator` (`@IsEmail`, `@MinLength`, `@IsInt`, etc.).

---

## Global exception filter

**Not present.**

Errors use Nest built-ins thrown from services/guards:

- `BadRequestException`
- `UnauthorizedException`
- `ForbiddenException`
- `NotFoundException`
- `InternalServerErrorException`

GraphQL surfaces these through Nest/Apollo error handling defaults. There is no custom error envelope or filter class under `src/`.

---

## Interceptors

| Type | Present? | Detail |
|------|----------|--------|
| Global interceptor | No | — |
| Custom interceptor classes | No | — |
| Route interceptor | Yes | `FileInterceptor('file', { limits: { fileSize: 10MB } })` on `POST /profile/avatar` |

---

## CORS

Enabled for all origins (`origin: true`) with credentials. Suitable for mobile/web clients calling GraphQL with cookies/auth headers, but is permissive.

---

## Swagger / API docs

| Mechanism | Status |
|-----------|--------|
| `@nestjs/swagger` | Not installed / not configured |
| GraphQL Playground | Enabled when `NODE_ENV !== 'production'` |
| GraphQL endpoint | `/graphql` |

---

## Configuration loading

| Step | Detail |
|------|--------|
| Load | `ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })` |
| Access | `ConfigService` injection or occasional `process.env.*` |
| Custom ConfigurationService | **Does not exist** |
| DB config factory | Inline `useFactory` in `DatabaseModule` |
| JWT config factory | `JwtModule.registerAsync` in `AuthModule` |
| Storage config | Read in `ProfileMediaService` constructor (`mustGet`) |

### Secrets handling (observed)

Secrets are environment variables only (JWT, DB URLs, storage keys, admin secret). No vault/secrets-manager integration.  
**Note:** `.env.example` currently looks like it may contain real credential-shaped values — treat as a security hygiene issue for the team to review.

---

## GraphQL context & auth bootstrap coupling

`AppModule` GraphQL context injects Express `req` into every GraphQL operation.  
`JwtAuthGuard` reads `GqlExecutionContext` → `context.req` → Passport JWT.  
`@CurrentUser()` reads `req.user` populated by Passport after successful strategy validation.

Without the `context: ({ req }) => ({ req })` wiring, GraphQL JWT auth would break.

---

## Post-bootstrap seeding

| Service | Hook | Behavior |
|---------|------|----------|
| `PlansService` | `OnModuleInit` | Idempotent seed/update of default saving plans (15..210 days step 15) |
| `WalletService` | `OnModuleInit` | Idempotent seed/update of daily transaction leverage tiers |

Both fail soft (warn + continue) if tables are unavailable.

---

## Implications for new Finance modules

- No extra bootstrap changes needed for a standard GraphQL feature module beyond importing it in `AppModule`.
- Rely on existing ValidationPipe; put validators on new InputTypes.
- Do not assume a global response interceptor or error filter exists.
- If Finance needs startup seeding, follow `OnModuleInit` + fail-soft pattern used by plans/wallet.

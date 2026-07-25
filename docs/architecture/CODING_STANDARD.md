# Coding Standard

> Observed coding standards from the existing NestJS backend.  
> Use these as the reuse contract for new Finance modules.

---

## Architecture pattern (actual)

```
Resolver (GraphQL)  [primary]
   or Controller (REST)  [exception: profile-media]
        ↓
Service
        ↓
TypeORM Repository / Transaction
        ↓
PostgreSQL
```

This is **not** a classic Controller → Repository → Prisma stack.

---

## Controller pattern

| Aspect | Standard in this repo |
|--------|------------------------|
| Primary API edge | **GraphQL Resolvers**, not REST controllers |
| REST controllers | Only `ProfileMediaController` under `@Controller('profile')` |
| Controller responsibilities | Bind HTTP verb/path, guards, interceptors; delegate to service |
| Response shaping | Return service result objects directly |

**For Finance modules:** Prefer GraphQL resolvers unless binary/multipart requires REST.

---

## Resolver pattern

Observed conventions:

- `@Resolver()` class per feature
- Constructor injection of feature service
- `@Query` / `@Mutation` with explicit `name:` when GraphQL name differs
- Auth via `@UseGuards(JwtAuthGuard)` and `@CurrentUser() user: JwtUser`
- Admin via `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')`
- Args via `@Args('input') input: SomeInput` or scalar `@Args('...')`

Thin resolvers: almost no business logic in resolver methods.

---

## Service pattern

| Aspect | Observed |
|--------|----------|
| Annotation | `@Injectable()` |
| Scope | Request-default singleton providers |
| Responsibilities | Validation of business rules, persistence, mapping to GraphQL models |
| Size | Can be large (especially `WalletService`) |
| Lifecycle | `OnModuleInit` for seeding in plans/wallet |
| Logging | Nest `Logger` private field |
| Mapping | Private `toXModel` / `toGqlUser` helpers |

Services throw Nest HTTP exceptions for domain failures.

---

## Repository pattern

**Not implemented as a code layer.**

Standard equivalent:

```ts
constructor(
  @InjectRepository(Entity)
  private readonly repo: Repository<Entity>,
) {}
```

Do **not** invent a new repository abstraction for Finance unless the team later decides on a broader refactor (out of scope here).

---

## DTO / Input pattern

GraphQL inputs:

- File under `feature/dto/*.input.ts`
- `@InputType()` class
- `@Field(...)` for GraphQL
- `class-validator` decorators on the same properties
- Property names often snake_case to match client payload keys (`total_days`, `work_date`, `fuel_cost`)

Examples: `LoginInput`, `SelectDaysInput`, `ClaimChallengeDayInput`, `CalculateGrabProfitInput`.

Internal non-GraphQL interfaces exist sparingly (`CreateUserInput`, `UpdateUserAvatarInput` in `user.service.ts`).

---

## Validation

| Layer | Mechanism |
|-------|-----------|
| Global | `ValidationPipe` whitelist + forbidNonWhitelisted + transform |
| Field rules | class-validator on InputTypes |
| Business rules | Imperative checks in services → `BadRequestException` etc. |

There are no custom validator classes under a shared validators folder.

---

## Exception handling

| Pattern | Usage |
|---------|-------|
| Nest exceptions | Primary |
| Custom domain error classes | Not present |
| Global ExceptionFilter | Not present |
| Try/catch | Used for unique constraint mapping, S3 failures, seed fail-soft |

Common exceptions:

- `BadRequestException` — invalid plan selection, claim rules, upload validation
- `UnauthorizedException` — bad credentials / refresh
- `ForbiddenException` — roles / admin secret
- `NotFoundException` — missing user/avatar
- `InternalServerErrorException` — storage failures

---

## Response format

### GraphQL

- Dedicated `@ObjectType` models under `models/`
- Field renaming via `@Field({ name: 'snake_case' })` is common in wallet models
- Money often converted from cents to RM numbers in service before return
- Auth returns `AuthPayloadModel { accessToken, refreshToken, user }`

### REST

- Avatar upload returns a plain user-shaped object
- Avatar stream writes directly to Express `Response`

No global `{ success, data, error }` wrapper type exists.

---

## Error handling (client-visible)

- GraphQL errors from thrown Nest exceptions
- No centralized error code enum
- Some messages are user-facing product copy (challenge stop/give-up/reset)

---

## Entity / persistence standards

- UUID primary keys
- snake_case DB names
- cents for currency
- `@Index` for query/uniqueness constraints
- `CreateDateColumn` / `UpdateDateColumn` with `timestamptz`
- Relations via `@ManyToOne` + `@JoinColumn` where needed
- Register every entity in `entities/entities.ts`

---

## Auth coding standards (reuse, do not rewrite)

```ts
@UseGuards(JwtAuthGuard)
someOp(@CurrentUser() user: JwtUser, @Args('input') input: X): Promise<Y> {
  return this.service.method(user.id, input);
}
```

Admin:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
```

Roles stored on `users.roles` JSONB as `{ roles: string[] }`, default `USER`.

---

## Testing standards

- Jest with `rootDir: src`, `*.spec.ts`
- Specs exist for app resolver, auth service, user service, grab-profit service
- e2e under `test/`

New Finance modules should add `*.service.spec.ts` alongside the service when practical.

---

## Style / TypeScript

From `tsconfig.json` / tooling:

- Decorators + `emitDecoratorMetadata` enabled
- `strictNullChecks: true`
- `noImplicitAny: false` (looser than full strict)
- Prettier + ESLint available via scripts

---

## Do / Don’t for new Finance work

### Do

- Add a feature module sibling under `src/`
- Use resolver + service + dto + models + entity
- Reuse Jwt auth guards/decorators
- Store money in cents
- Validate inputs with class-validator
- Register entities centrally

### Don’t

- Introduce Prisma or a parallel ORM
- Create a global redesign of folders (`common/`, CQRS, etc.) unless planned separately
- Modify auth internals for ordinary Finance features
- Bypass ValidationPipe with untyped raw args when an InputType is appropriate
- Invent a different response wrapper that clients don’t already expect

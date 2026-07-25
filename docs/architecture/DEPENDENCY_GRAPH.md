# Dependency Graph

> How modules communicate. Analysis only.

---

## Root composition

```
AppModule
├── ConfigModule (global) ─────────────────────────── available everywhere
├── DatabaseModule
│   └── TypeOrmModule.forRootAsync ─────────────────── global connection
├── GraphQLModule (Apollo) ─────────────────────────── /graphql
├── AuthModule
├── PlansModule
├── WalletModule
├── UserModule
├── ProfileMediaModule
└── GrabProfitModule
```

`AppService` / `AppResolver` are root providers (no module boundary).

---

## Module → module communication

```
┌────────────┐
│ UserModule │  exports: UserService
└─────▲──────┘
      │ import
      │
┌─────┴──────┐     exports: AuthService, JwtAuthGuard
│ AuthModule │◄──── (Passport JwtStrategy uses UserService)
└────────────┘

┌──────────────────┐
│ ProfileMediaModule│──imports──► UserModule (avatar updates)
└──────────────────┘

┌────────────┐
│ PlansModule│── TypeORM entities from wallet/ (no WalletModule import)
└────────────┘

┌─────────────┐
│ WalletModule│── TypeORM UserSavingPlan from plans/ (no PlansModule import)
│             │── providers RolesGuard (local)
└─────────────┘

┌─────────────────┐
│ GrabProfitModule│── standalone (TypeORM GrabProfitEntry only)
└─────────────────┘
```

### Important observation

`PlansModule` and `WalletModule` share entities by **direct TypeORM `forFeature` registration**, not by importing each other’s Nest modules. Cross-domain coupling is at the **entity/table** level, not via exported services.

---

## Provider dependency graph (runtime)

### Auth

```
AuthResolver → AuthService
AuthService → UserService, JwtService, ConfigService, Repository<RefreshToken>
JwtStrategy → ConfigService, UserService
JwtAuthGuard → Passport AuthGuard('jwt')  [uses GraphQL req]
```

### User

```
UserService → Repository<User>
```

### Plans

```
PlansResolver → PlansService
PlansService → Repositories:
  SavingPlan, UserSavingPlan,
  GlobalWallet, ChallengeWallet,
  CompletedChallenge, GiveUpChallenge,
  WalletTransaction, YearlyChallengeReset
```

### Wallet

```
WalletResolver → WalletService
WalletResolver → JwtAuthGuard, RolesGuard (+ @Roles metadata)
WalletService → Repositories:
  GlobalWallet, ChallengeWallet, WalletTransaction,
  DailyChallengeClaim, CompletedChallenge,
  DailyTransactionLeverage, UserSavingPlan, YearlyChallengeReset
  (+ GiveUpChallenge via transactional manager)
```

### Profile media

```
ProfileMediaController → ProfileMediaService (+ JwtAuthGuard, FileInterceptor)
ProfileMediaService → ConfigService, UserService, AWS S3Client
```

### Grab profit

```
GrabProfitResolver → GrabProfitService (+ JwtAuthGuard, CurrentUser)
GrabProfitService → Repository<GrabProfitEntry>
```

---

## Auth reuse edges (how features get the current user)

```
Any Resolver/Controller
  @UseGuards(JwtAuthGuard)
  @CurrentUser() user: JwtUser
        │
        ▼
GraphQL context.req  (or Express req for REST)
        │
        ▼
Passport JWT strategy validate()
        │
        ▼
UserService.findById → JwtUser on req.user
```

Finance modules should attach to this same edge rather than inventing a new auth path.

---

## Data-store dependency edges

```
All feature TypeOrmModule.forFeature([...])
        │
        ▼
TypeOrmModule.forRootAsync (DatabaseModule)
        │
        ▼
PostgreSQL
```

Object storage edge (media only):

```
ProfileMediaService → S3-compatible API (STORAGE_* env)
```

---

## Guard / decorator dependency map

| Artifact | Defined in | Used by |
|----------|------------|---------|
| `JwtAuthGuard` | `auth/` | AuthResolver (`me`), PlansResolver, WalletResolver, GrabProfitResolver, ProfileMediaController |
| `RolesGuard` | `auth/` | WalletResolver admin mutations (provided in WalletModule) |
| `@Roles` | `auth/` | WalletResolver (`ADMIN`) |
| `@CurrentUser` | `auth/` | Auth/Plans/Wallet/GrabProfit resolvers |
| `AdminSecretGuard` | `auth/` | **No current usages found** |

---

## Communication styles summary

| Style | Where |
|-------|-------|
| Nest module `imports` / `exports` | Auth↔User, ProfileMedia↔User |
| Shared TypeORM entities across modules | Plans↔Wallet tables |
| GraphQL schema coupling | Shared models (e.g. `UserModel`, `ActiveSavingPlanModel`) |
| Env/config coupling | ConfigService / process.env across modules |
| No event bus / CQRS / message queue | Not present |
| No shared CommonModule | Not present |

---

## Recommended dependency pattern for a new Finance module

```
AppModule
  └── NewFinanceModule
        ├── imports: TypeOrmModule.forFeature([NewEntities...])
        ├── optional imports: UserModule (if needing UserService)
        ├── providers: NewFinanceService, NewFinanceResolver
        └── reuse auth artifacts by import path:
              JwtAuthGuard, CurrentUser, JwtUser
```

Avoid:

- Rebuilding JWT auth
- Adding Prisma
- Creating circular Nest imports between Wallet and Plans; prefer extracting shared domain later only if needed (not required for initial Finance modules)

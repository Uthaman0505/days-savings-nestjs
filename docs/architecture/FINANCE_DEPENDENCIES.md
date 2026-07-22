# Finance Dependencies

> Which Finance modules may communicate, and which must not couple directly.  
> Aligns with existing Nest patterns: feature modules, occasional cross-`forFeature` entity registration (see Plans ↔ Wallet), JWT via `auth/`, users via `UserModule`.

---

## 1. Dependency principles

1. **Write ownership stays local.** Only the owning module’s service mutates its entities’ business meaning (e.g. only `DebtModule` reduces debt principal rules).
2. **Account balance changes are coordinated with `accounts`.** Income/Expense/Debt/Loans/Goals that move cash must update Account + ledger in one TypeORM transaction (either by calling an exported Accounts API later, or by registering Account entities in `forFeature` like Plans does with wallet — both match current architecture; prefer a small exported `AccountsService` method when implementing to avoid copy-paste balance math).
3. **Dashboard & Reports are read-only consumers.** They never import write APIs for creating income/expense.
4. **No CommonModule / SharedModule / event bus.** Communication is Nest imports + TypeORM + GraphQL client composition only.
5. **Do not redesign `auth/`.** All Finance resolvers use existing guards/decorators.

---

## 2. Allowed communication matrix

Legend: **W** = may write/collaborate on money mutation · **R** = may read · **—** = no direct coupling · **S** = settings reference only

| From ↓ \ To → | settings | accounts | income | expense | debt | loans | goals | dashboard | reports | wallet | grab-profit | user/auth |
|---------------|----------|----------|--------|---------|------|-------|-------|-----------|---------|--------|-------------|-----------|
| **finance-settings** | ■ | — | — | — | — | — | — | — | — | — | — | R (user id) |
| **accounts** | R/S | ■ | — | — | — | — | — | — | — | — | — | R |
| **income** | R/S | W | ■ | — | — | — | — | — | — | — | optional R bridge | R |
| **expense** | R/S | W | — | ■ | optional W ref | — | — | — | — | — | — | R |
| **debt** | R/S | W | — | — | ■ | — | — | — | — | — | — | R |
| **loans** | R/S | W | — | — | — | ■ | — | — | — | — | — | R |
| **goals** | R/S | W | — | — | — | — | ■ | — | — | — | — | R |
| **dashboard** | R | R | R | R | R | R | R | ■ | — | optional R | optional R | R |
| **reports** | R | R | R | R | R | R | R | — | ■ | optional R | optional R | R |
| **wallet** *(existing)* | — | — | — | — | — | — | — | — | — | ■ | — | R |
| **grab-profit** *(existing)* | — | — | — | — | — | — | — | — | — | — | ■ | R |

■ = self

---

## 3. Modules that **may** communicate

### Money writers → Accounts

```
income  ──write──► accounts
expense ──write──► accounts
debt    ──write──► accounts   (on payment)
loans   ──write──► accounts   (on payment / disbursement)
goals   ──write──► accounts   (on contribution)
accounts may self-transfer between FinanceAccounts
```

### Categorization

```
income / expense / (optional debt) ──read──► finance-settings (categories)
```

### Aggregators

```
dashboard ──read──► accounts, income, expense, debt, loans, goals
reports   ──read──► accounts, income, expense, debt, loans, goals
dashboard/reports ──optional read──► wallet, grab-profit  (widgets only)
```

### Identity

```
all Finance modules ──use──► JwtAuthGuard + CurrentUser (auth)
optional UserService import when profile fields needed (rare)
```

---

## 4. Modules that must **never** communicate directly

| Forbidden coupling | Reason |
|--------------------|--------|
| `dashboard` → write any money module | Aggregates only; no duplicated or derived writes |
| `reports` → write any money module | Same |
| `dashboard` ↔ `reports` write APIs | Independent read models; either may read sources, not each other for storage |
| `income` ↔ `expense` direct writes | No netting across modules; both go through accounts |
| `debt` ↔ `loans` merging logic | Keep revolving vs installment boundaries |
| `goals` → `wallet` / `plans` mutations | Challenge product stays isolated |
| `wallet` / `plans` → Finance write modules | Challenge flows must not silently create Income/Expense |
| `grab-profit` → mutate accounts **until** an explicit bridge feature is built | Keep today’s module self-contained |
| Any Finance module → reinvent auth | Use existing JWT stack only |
| Any module → Prisma / new bus | Out of architecture scope |

---

## 5. Nest import guidance (when implementing)

### Typical write module

```
IncomeModule
  imports: TypeOrmModule.forFeature([IncomeEntry, FinanceAccount, AccountLedgerEntry, FinanceCategory])
  providers: IncomeService, IncomeResolver
```

(Same cross-entity `forFeature` style already used by `PlansModule`.)

**Cleaner variant (still valid Nest, not a new architecture):**  
`AccountsModule` exports `AccountsService` with `credit` / `debit` helpers; IncomeModule imports AccountsModule. Prefer this if balance rules start duplicating.

### Aggregator module

```
DashboardModule
  imports: TypeOrmModule.forFeature([FinanceAccount, IncomeEntry, ExpenseEntry, DebtInstrument, Loan, SavingsGoal, ...])
  providers: DashboardService, DashboardResolver
  // no entity ownership; read queries only
```

### Settings

```
FinanceSettingsModule
  imports: TypeOrmModule.forFeature([FinanceCategory, FinancePreference])
  providers: FinanceSettingsService, FinanceSettingsResolver
  exports: FinanceSettingsService   # optional, if others should call helpers
```

---

## 6. GraphQL client composition (frontend)

The React Native app may call multiple queries (`dashboard`, `myWalletOverview`, `calculateGrabProfit` history) in one screen. That is **client composition**, not backend module-to-module coupling — and is encouraged so backend modules stay focused.

---

## 7. Dependency graph (Finance layer)

```
                    auth / user
                        ▲
                        │ JWT + user_id
                        │
        ┌───────────────┴───────────────┐
        │       finance-settings        │
        └───────────────┬───────────────┘
                        │ category/prefs read
        ┌───────────────┼───────────────────────────┐
        │               │                           │
   income          expense                    debt / loans / goals
        │               │                           │
        └───────────────┴─────────────┬─────────────┘
                                      ▼
                                  accounts
                                      ▲
                          ┌───────────┴───────────┐
                          │                       │
                     dashboard                 reports
                          │                       │
                          └──────────┬────────────┘
                                     │ optional read
                          wallet / grab-profit / plans
```

---

## Related docs

- [FINANCE_MODULES.md](./FINANCE_MODULES.md)
- [FINANCE_ENTITY_PLANNING.md](./FINANCE_ENTITY_PLANNING.md)
- [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md)
- [FINANCE_ARCHITECTURE.md](./FINANCE_ARCHITECTURE.md)

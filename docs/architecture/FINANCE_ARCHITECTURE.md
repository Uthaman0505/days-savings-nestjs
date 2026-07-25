# Finance Architecture

> Architecture-only design for evolving the existing NestJS backend into a **Personal Finance Operating System**.  
> **No implementation.** Extends the current stack; does not redesign it.

**Stack contract (unchanged):** NestJS · GraphQL-first · TypeORM · PostgreSQL · Feature modules under `src/` · Resolver → Service → TypeORM Repository · JWT auth · Money in integer cents · UUID PKs · snake_case DB naming

**Non-goals (explicitly forbidden for this design):** Prisma · CQRS · custom Repository layer · CommonModule · SharedModule · Event Bus · Microservices · Clean Architecture folders

---

## 1. Design principle

Finance must look like it **always belonged** beside `wallet/`, `plans/`, and `grab-profit/`:

```
src/<feature>/
  <feature>.module.ts
  <feature>.service.ts
  <feature>.resolver.ts
  *.entity.ts
  dto/
  models/
```

Register entities in `src/entities/entities.ts` and import the Nest module in `AppModule` — same as today.

Existing product surfaces (**auth, user, plans, wallet challenge, grab-profit, profile-media**) remain. Finance is an **additive** product layer, not a replacement.

---

## 2. Finance domain design (bounded contexts)

| Bounded context | Product meaning | Nest home |
|-----------------|-----------------|-----------|
| **Accounts** | Where money lives (cash, bank, e-wallet) | `src/accounts/` |
| **Income** | Money in (salary, side income, transfers-in classified as income) | `src/income/` |
| **Expense** | Money out (spend, bills, transfers-out classified as expense) | `src/expense/` |
| **Debt** | Revolving / card / payable balances you owe | `src/debt/` |
| **Loans** | Installment obligations (or receivables) with schedules/payments | `src/loans/` |
| **Goals** | Targeted savings (distinct from challenge wallet) | `src/goals/` |
| **Dashboard** | Live snapshot aggregation for home screen | `src/dashboard/` |
| **Reports** | Period trends & summaries (computed) | `src/reports/` |
| **Finance Settings** | Categories, preferences, defaults | `src/finance-settings/` |

### Context map (conceptual)

```
                    ┌─────────────────────┐
                    │  Finance Settings   │
                    │  (categories, prefs)│
                    └──────────▲──────────┘
                               │ referenced by
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────┴───────┐    ┌────────┴───────┐    ┌────────┴───────┐
│     Income     │    │    Expense     │    │ Debt / Loans   │
└────────┬───────┘    └────────┬───────┘    └────────┬───────┘
         │                     │                     │
         └──────────┬──────────┴──────────┬──────────┘
                    ▼                     ▼
            ┌───────────────┐     ┌───────────────┐
            │   Accounts    │◄────│    Goals      │
            │ (balances +   │     │ (contributions│
            │  ledger)      │     │  from accounts)│
            └───────┬───────┘     └───────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│    Dashboard    │   │     Reports     │
│ (read aggregate)│   │ (read aggregate)│
└─────────────────┘   └─────────────────┘
```

### Relationship to existing modules

| Existing module | Role in Finance OS |
|-----------------|--------------------|
| `auth/` / `user/` | Identity; all Finance rows owned by `user_id` |
| `wallet/` + `plans/` | **Challenge savings product** — keep as-is; Dashboard/Reports may *optionally* surface challenge balances later as a read-only widget |
| `grab-profit/` | Specialized **income calculator** for Grab work; remains; later can post into Income/Accounts without moving its folder |
| `profile-media/` | Reuse later for receipt images (OCR future) — no redesign |

---

## 3. Money flow design

Canonical flow (business narrative):

```
Salary (Income)
      ↓
Account  (balance_cents increases; ledger credit)
      ↓
Expense  (balance_cents decreases; ledger debit)
      ↓
Credit Card Payment (Debt payment)
      · Account debit
      · Debt balance decrease
      ↓
Dashboard  (aggregates current balances & period totals — no new stored facts)
      ↓
Reports    (aggregates historical series — computed from source tables)
```

### Rules

1. **Accounts** are the system of record for *liquid* balances.
2. **Income / Expense / Debt payments / Loan payments / Goal contributions** are domain events that mutate Accounts (and sometimes Debt/Loan/Goal balances) inside a **TypeORM transaction** — same style as wallet claim/transfer.
3. **Dashboard and Reports never write business money.** They only read.
4. **No duplicated balances** on Dashboard/Reports tables.
5. Money always stored as **integer cents**.
6. Every money movement that affects an account should leave an **account ledger row** (same idea as `wallet_transactions`).

Detailed flows: see [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md).

---

## 4. Dashboard design (summary)

Dashboard answers “where am I *right now*?” by querying:

- Account balances (sum / per account)
- This-month income total
- This-month expense total
- Debt remaining total
- Loans remaining total
- Goals progress
- Optional: challenge wallet / grab-profit month net (existing tables)

**Storage:** none for aggregates. Service-only module.

Details: [FINANCE_REPORTING.md](./FINANCE_REPORTING.md).

---

## 5. Reporting design (summary)

Reports answer “how did I move over time?”:

- Monthly Summary
- Debt Trend
- Expense Trend
- Income Trend
- Savings Trend
- Net Worth Trend
- Cash Flow

All computed from source entities with date filters (Malaysia UTC+8 conventions already used in wallet/plans).

Details: [FINANCE_REPORTING.md](./FINANCE_REPORTING.md).

---

## 6. Future features (without redesign)

| Future capability | Fits into existing Finance module(s) |
|-------------------|--------------------------------------|
| OCR receipts | `expense/` (+ storage like `profile-media/`) |
| AI insights | `reports/` queries + optional later `src/ai-insights/` sibling |
| Investments | New sibling `src/investments/` when needed |
| Bank sync | `accounts/` (import/providers) |
| Budget planner | `finance-settings/` + `expense/` + `reports/` |
| Subscription tracker | `expense/` (recurring flag / series) |

No new architecture style — only new feature folders or fields when the time comes.

---

## 7. Folder structure after Finance

```
src/
├── main.ts
├── app.module.ts
├── app.service.ts
├── app.resolver.ts
├── auth/                    # existing — do not redesign
├── user/                    # existing
├── plans/                   # existing challenge plans
├── wallet/                  # existing challenge wallets
├── grab-profit/             # existing Grab profit
├── profile-media/           # existing
├── database/                # existing
├── entities/                # existing registry — append Finance entities
│
├── accounts/                # NEW — money containers + ledger
├── income/                  # NEW
├── expense/                 # NEW
├── debt/                    # NEW
├── loans/                   # NEW
├── goals/                   # NEW
├── finance-settings/        # NEW — categories & prefs
├── dashboard/               # NEW — read aggregates only
└── reports/                 # NEW — read trends only
```

Module responsibilities: [FINANCE_MODULES.md](./FINANCE_MODULES.md)  
Entity planning: [FINANCE_ENTITY_PLANNING.md](./FINANCE_ENTITY_PLANNING.md)  
Dependencies: [FINANCE_DEPENDENCIES.md](./FINANCE_DEPENDENCIES.md)

---

## 8. Implementation posture (when coding begins later)

| Step | Action |
|------|--------|
| 1 | Add feature folders one at a time (prefer `finance-settings` → `accounts` → money-in/out → debt/loans/goals → dashboard/reports) |
| 2 | Co-locate entity / dto / models / service / resolver |
| 3 | Append entities to `entities/entities.ts` |
| 4 | Import module in `AppModule` |
| 5 | Protect resolvers with existing `JwtAuthGuard` + `@CurrentUser()` |
| 6 | Use cents + UUID + snake_case + TypeORM transactions for multi-table money moves |

**This document set does not authorize or include any code.**

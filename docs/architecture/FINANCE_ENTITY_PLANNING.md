# Finance Entity Planning

> Planned entities only — **no TypeORM code, no columns DDL, no GraphQL**.  
> Grouped by owning module. Follow existing conventions: UUID PK, snake_case tables/columns, integer cents, `user_id` ownership.

---

## Convention reminders (from existing codebase)

- Table names: plural snake_case
- Money: `*_cents` integers
- Timestamps: `created_at` / `updated_at` timestamptz
- Register every new entity in `src/entities/entities.ts` when implementing
- Soft delete: not used project-wide — prefer hard delete or status flags (`is_active`, etc.)

---

## 1. `finance-settings/` (owns configuration)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **FinanceCategory** | Shared taxonomy for income/expense (and optional debt tags). Configuration concern, not a money movement. |
| **FinancePreference** | Per-user defaults: display currency label, month-start day, timezone (default Malaysia UTC+8). One row per user. |

**Does not belong here:** Account balances, income rows, report aggregates.

---

## 2. `accounts/` (owns liquid money)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **FinanceAccount** | The user’s cash/bank/e-wallet container; holds `balance_cents`. Core Accounts context. |
| **AccountLedgerEntry** | Append-style credit/debit history for an account (project twin of `WalletTransaction`). Required for audit & cash-flow reports. |
| **AccountTransfer** | Optional explicit transfer between two finance accounts (creates paired ledger legs). Belongs with accounts, not expense/income. |

**Does not belong here:** Category definitions, debt instruments, dashboard snapshots.

**Ledger reference style (align with wallet):** `reference_type` + `reference_id` pointing at Income / Expense / DebtPayment / LoanPayment / GoalContribution / Transfer / Adjustment.

---

## 3. `income/` (owns income documents)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **IncomeEntry** | Business document for money-in (salary, bonus, side income). Triggers account credit; not merely a ledger line. |

**Typical links (conceptual):** `user_id`, `account_id`, optional `category_id`, `occurred_on` / `work_date`, `amount_cents`, notes.

**Does not belong here:** Account balance column (live on FinanceAccount), grab-profit rows (stay in `grab-profit/` unless a future bridge posts a derived IncomeEntry).

---

## 4. `expense/` (owns expense documents)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **ExpenseEntry** | Business document for money-out. Triggers account debit. |
| **ExpenseRecurringSeries** *(future-ready, same module)* | Subscription/bill templates. Stays under expense so Subscription Tracker does not need a new bounded context. |

**Typical links:** `user_id`, `account_id`, optional `category_id`, optional `debt_id` if representing a payment (prefer DebtPayment when primary).

**Does not belong here:** OCR raw files as money source-of-truth (store media refs later; amount still on ExpenseEntry).

---

## 5. `debt/` (owns revolving obligations)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **DebtInstrument** | Credit card / revolving payable; tracks outstanding `balance_cents` (and optional limit). |
| **DebtPayment** | Payment event reducing debt and debiting an account. Clear audit for debt trend reports. |
| **DebtAdjustment** *(optional)* | Interest, fees, disputes — keeps non-payment balance changes explicit. |

**Does not belong here:** Installment loan amortization (that is `loans/`), generic expenses without debt impact.

---

## 6. `loans/` (owns installment obligations)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **Loan** | Loan contract: principal, remaining, rate optional, start/end. |
| **LoanPayment** | Installment payment event (account debit + principal reduction / interest split as product requires). |

**Does not belong here:** Credit-card revolving balances (`debt/`).

---

## 7. `goals/` (owns savings targets)

| Planned entity | Why it belongs here |
|----------------|---------------------|
| **SavingsGoal** | Target name, `target_amount_cents`, deadline, status, saved progress. |
| **GoalContribution** | Movement toward/away from a goal; ties to account ledger when funded from an account. |

**Does not belong here:** Challenge `UserSavingPlan` / `ChallengeWallet` (remain under `plans/` + `wallet/`).

---

## 8. `dashboard/` — **no entities**

Dashboard must **never** store duplicated aggregates (net worth, monthly spend, etc.).

If a GraphQL model is needed later, it is a **models/** ObjectType only, not a table.

---

## 9. `reports/` — **no entities in v1**

Trends are computed from source tables.

**Optional later (still not required):** `ReportExportJob` for async CSV — operational, not a duplicate of balances. Do not add `MonthlySummaryCache` unless a measured performance need appears; that would be an optimization, not domain redesign.

---

## 10. Existing entities (unchanged ownership)

| Module | Entities (already exist) | Finance OS note |
|--------|--------------------------|-----------------|
| `user/` | User | Owner of all Finance rows |
| `auth/` | RefreshToken | Unrelated to money |
| `plans/` | SavingPlan, UserSavingPlan | Challenge product |
| `wallet/` | GlobalWallet, ChallengeWallet, WalletTransaction, DailyChallengeClaim, CompletedChallenge, GiveUpChallenge, DailyTransactionLeverage, YearlyChallengeReset | Challenge money |
| `grab-profit/` | GrabProfitEntry | Specialized income calculator data |

---

## Entity → module ownership map

```
finance-settings/     FinanceCategory, FinancePreference
accounts/             FinanceAccount, AccountLedgerEntry, AccountTransfer
income/               IncomeEntry
expense/              ExpenseEntry [, ExpenseRecurringSeries]
debt/                 DebtInstrument, DebtPayment [, DebtAdjustment]
loans/                Loan, LoanPayment
goals/                SavingsGoal, GoalContribution
dashboard/            (none)
reports/              (none in v1)
```

---

## Cross-module foreign keys (conceptual only)

```
IncomeEntry.account_id          → FinanceAccount
IncomeEntry.category_id         → FinanceCategory
ExpenseEntry.account_id         → FinanceAccount
ExpenseEntry.category_id        → FinanceCategory
ExpenseEntry.debt_id?           → DebtInstrument
AccountLedgerEntry.account_id   → FinanceAccount
AccountTransfer.from/to         → FinanceAccount
DebtPayment.account_id          → FinanceAccount
DebtPayment.debt_id             → DebtInstrument
LoanPayment.account_id          → FinanceAccount
LoanPayment.loan_id             → Loan
GoalContribution.goal_id        → SavingsGoal
GoalContribution.account_id?    → FinanceAccount
* .user_id                      → User
```

Physical FK constraints are an implementation choice; the existing codebase sometimes uses UUID columns with indexes rather than rich relation graphs — **match existing style when coding**.

---

## Why not one giant `Transaction` entity?

A single polymorphic transaction table can work, but this codebase already separates **domain documents** (claims, grab profit entries) from **wallet ledger lines**. Finance should mirror that:

- Domain modules own **IncomeEntry / ExpenseEntry / DebtPayment / …**
- Accounts own **AccountLedgerEntry** as the unified cash movement log

That preserves feature-module clarity without introducing a new ledger microservice or CQRS.

---

## Related docs

- [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md)
- [FINANCE_MODULES.md](./FINANCE_MODULES.md)
- [FINANCE_DEPENDENCIES.md](./FINANCE_DEPENDENCIES.md)
- [DATABASE_ANALYSIS.md](./DATABASE_ANALYSIS.md)

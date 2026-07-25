# Finance Reporting & Dashboard

> Dashboard and reporting design for the Personal Finance OS.  
> **Rule:** never store duplicated aggregate money data. Compute from source entities.

---

## 1. Dashboard design

### Purpose

Single home-screen snapshot: “Where do I stand **now**?”

### Nest home

`src/dashboard/` — `DashboardModule` + service + resolver + GraphQL models only.

### Data to aggregate (read-only)

| Block | Source module / entities | Aggregation |
|-------|--------------------------|-------------|
| **Liquid cash** | `accounts` → FinanceAccount | Sum `balance_cents`; per-account breakdown |
| **Income (this month)** | `income` → IncomeEntry | Sum where date in current Malaysia month |
| **Expense (this month)** | `expense` → ExpenseEntry | Sum for current Malaysia month |
| **Cash flow (this month)** | income − expense (and optionally transfers) | Derived in service |
| **Debt outstanding** | `debt` → DebtInstrument | Sum remaining balances; count of instruments |
| **Loans outstanding** | `loans` → Loan | Sum principal remaining |
| **Goals progress** | `goals` → SavingsGoal (+ contributions) | Saved vs target; % complete |
| **Net worth (simple)** | accounts ± goals − debt − loans | Formula in service (see domain doc) |
| **Challenge widget (optional)** | `wallet` GlobalWallet / challenge | Separate field; do not mix into personal net worth by default |
| **Grab profit (optional)** | `grab-profit` entries | Month-to-date net profit widget |

### What Dashboard must **not** store

- Monthly totals tables
- Cached net worth rows
- Copied account balances
- Precomputed trend points

If performance becomes an issue later, optimize with DB indexes or careful queries — not by inventing a parallel fact store in v1.

### Suggested GraphQL shape (conceptual names only)

One query, e.g. `myFinanceDashboard`, returning a composed ObjectType with nested sections. Matches `myChallengeRoom` / `myWalletOverview` style.

### Timezone

Use the same **Malaysia UTC+8** month boundaries already used in wallet/plans, unless `FinancePreference` overrides later.

---

## 2. Reporting design

### Purpose

Answer “How did money move **over time**?” for charts and monthly reviews.

### Nest home

`src/reports/` — `ReportsModule` + service + resolver + models; **no v1 entities**.

### Report catalog

| Report | Question | Primary sources | Output idea |
|--------|----------|-----------------|-------------|
| **Monthly Summary** | How did this month perform? | IncomeEntry, ExpenseEntry, AccountLedgerEntry, DebtPayment, LoanPayment, GoalContribution | Totals: income, expense, net cash flow, debt paid, goal funded, opening/closing liquid (from ledger or account snapshots-at-date via ledger replay) |
| **Debt Trend** | Is outstanding debt rising or falling? | DebtInstrument history via DebtPayment + adjustments; monthly end balance series | Time series of total debt remaining |
| **Expense Trend** | How is spending changing? | ExpenseEntry | Monthly (or weekly) expense sums; optional by category |
| **Income Trend** | How is earning changing? | IncomeEntry | Monthly income sums; optional by category |
| **Savings Trend** | Am I accumulating savings? | Goals progress over time + optional account balances earmarked; challenge wallet optional separate series | Monthly saved amount / goal completion |
| **Net Worth Trend** | Is wealth improving? | Accounts + Goals − Debt − Loans at month ends (computed) | Monthly net worth points |
| **Cash Flow** | In vs out by period | AccountLedgerEntry (preferred) or Income/Expense pair | Inflow, outflow, net per period |

### Computation rules

1. **Source of truth = domain tables**, not report tables.
2. Prefer **AccountLedgerEntry** for cash-flow purity (includes transfers & payments).
3. Prefer **IncomeEntry / ExpenseEntry** for category trends.
4. Debt/Loan trends use instrument balances as-of period end (derive from payments + opening, or store balance after each payment on the instrument — instrument balance is live state, not a duplicate dashboard cache).
5. All amounts in **cents** internally; GraphQL may expose RM numbers like existing wallet/grab-profit mappers.

### Suggested query style (conceptual)

- `financeMonthlySummary(month: DateKey)`
- `financeExpenseTrend(from, to, interval)`
- `financeIncomeTrend(from, to, interval)`
- `financeDebtTrend(from, to)`
- `financeSavingsTrend(from, to)`
- `financeNetWorthTrend(from, to)`
- `financeCashFlow(from, to, interval)`

Mirror existing naming habits (`myWalletOverview`, `calculateGrabProfit`) when implementing.

---

## 3. Report × module dependency (read-only)

```
ReportsService
  ├── reads FinanceAccount / AccountLedgerEntry
  ├── reads IncomeEntry
  ├── reads ExpenseEntry
  ├── reads DebtInstrument / DebtPayment
  ├── reads Loan / LoanPayment
  ├── reads SavingsGoal / GoalContribution
  └── optional reads GlobalWallet / GrabProfitEntry
```

Reports must **not** call Income/Expense **mutations**.

---

## 4. Dashboard vs Reports

| | Dashboard | Reports |
|---|-----------|---------|
| Time focus | Now + current month | Ranges & series |
| Mutates money | No | No |
| Entities owned | None | None (v1) |
| Typical consumer | Home screen | Charts / month review |
| Caching | None required | None required |

---

## 5. Future features mapped to reporting (no redesign)

| Future feature | Dashboard / Reports impact |
|----------------|----------------------------|
| **OCR** | Expense gains receipt confidence; reports unchanged (still sum ExpenseEntry) |
| **AI** | New optional query beside reports (insights text); still reads same sources |
| **Investment** | Add holdings value into Net Worth formula when `investments/` module appears |
| **Bank sync** | More AccountLedgerEntry / Income / Expense rows; trends improve automatically |
| **Budget planner** | Compare ExpenseTrend vs budget targets from finance-settings |
| **Subscription tracker** | Expense recurring series feeds a subscriptions slice inside Expense Trend |

---

## 6. Indexing guidance (implementation later)

When coding, plan indexes for:

- `(user_id, occurred_on)` on income/expense
- `(user_id, created_at)` on ledger
- `(account_id, created_at)` on ledger
- `(user_id)` on debt/loans/goals

This supports trends without materialised aggregates.

---

## Related docs

- [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md)
- [FINANCE_ARCHITECTURE.md](./FINANCE_ARCHITECTURE.md)
- [FINANCE_ENTITY_PLANNING.md](./FINANCE_ENTITY_PLANNING.md)
- [FINANCE_DEPENDENCIES.md](./FINANCE_DEPENDENCIES.md)

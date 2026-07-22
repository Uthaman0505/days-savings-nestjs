# Reporting Design

> Dashboard and reporting as **read models only**.  
> They never own business data. They aggregate from domains / Ledger.

---

## 1. Dashboard

### Principle

```
Dashboard = Σ (queries across domains)
Dashboard ≠ database of balances
```

### What Dashboard retrieves

| Section | Source domain | How |
|---------|---------------|-----|
| Liquid balances | Accounts | Sum Account balances; list accounts |
| MTD income | Income | Sum IncomeEntry in current period |
| MTD expense | Expense | Sum ExpenseEntry in current period |
| MTD cash flow | Ledger and/or Income−Expense | Prefer Ledger for pure cash; documents for categorized view |
| Debt outstanding | Debt | Sum DebtInstrument outstanding + utilization |
| Loan outstanding | Loans | Sum Loan principal remaining |
| Savings pools | Savings | Balances vs targets |
| Goals | Goals | GoalProgress value objects |
| Insurance due | Insurance | Upcoming premiums |
| Budget health | Settings + Expense | BudgetLine vs actual spend |
| Optional Challenge | wallet satellite | Widget only |
| Optional Grab MTD | grab-profit satellite | Widget only |
| Net worth (now) | Accounts + Savings/Goals policy − Debt − Loans | Computed formula |

### What Dashboard must never do

- Persist monthly totals  
- Copy account balances into a `dashboard_*` table  
- Post Ledger transactions  
- Own Income/Expense/Debt rows  

### Retrieval flow

```
Client
  → Dashboard query (JWT user)
      → read Accounts
      → read Income/Expense (period)
      → read Debt/Loans/Savings/Goals/Insurance
      → optional satellites
      → compose NetWorth / GoalProgress value objects
      → return ephemeral snapshot
```

### Period

Use Settings (timezone, month-start); default Malaysia UTC+8 — consistent with existing product calendar behavior.

---

## 2. Reporting catalog

### 2.1 Monthly Summary

**Question:** How did this calendar/finance month perform?

**Inputs:** IncomeEntry, ExpenseEntry, LedgerTransaction, DebtPayment, LoanPayment, Savings/Goal contributions, InsurancePremiumPayment  

**Outputs (computed):**

- Total income  
- Total expense  
- Net cash flow  
- Debt paid  
- Loans paid  
- Savings funded  
- Goals funded  
- Opening/closing liquid (via Ledger replay or balance+ledger)  
- Budget variance (if BudgetPlan exists)

### 2.2 Income Summary

**Question:** What did I earn, by category and source?

**Inputs:** IncomeEntry (+ categories), optional Grab bridge links  

**Outputs:** Totals by category, by account, by period bucket

### 2.3 Expense Summary

**Question:** What did I spend?

**Inputs:** ExpenseEntry (+ categories), RecurringExpenseSeries tags  

**Outputs:** Totals by category, merchant/note groups later, subscription vs one-off

### 2.4 Debt Summary

**Question:** What do I owe and how is it changing?

**Inputs:** DebtInstrument, DebtPayment, DebtAdjustment, CreditCardStatement  

**Outputs:** Outstanding by instrument, utilization, payments in period, overdue statements

### 2.5 Savings Summary

**Question:** How are pools and goals progressing?

**Inputs:** SavingsPool, SavingsGoal, contributions/withdrawals  

**Outputs:** Pool balances, goal GoalProgress, contribution totals

### 2.6 Net Worth

**Question:** What is my wealth now / over time?

**Formula (logical):**

```
Net Worth =
  Σ Account balances (liquid)
+ Σ SavingsPool balances   [if not already counted as Accounts]
+ Σ Goal earmarks          [only if not double-counted with Accounts/Pools]
+ Σ Investment value       [future]
+ Σ Loan receivables       [family lent out]
− Σ Debt outstanding
− Σ Loan payables principal
```

**Rule:** Define inclusion flags in FinancePreference so Challenge wallet can be excluded by default.

**Trend:** compute month-end net worth points from balances + obligations (and ledger where needed). **Do not store** a parallel net-worth table in v1.

### 2.7 Cash Flow

**Question:** What cash moved in and out?

**Inputs:** **LedgerTransaction** (primary)

**Outputs:** Inflows, outflows, net by day/week/month; exclude or specially mark TRANSFER pairs to avoid double counting economic activity

---

## 3. Trends (time series)

| Trend | Primary source |
|-------|----------------|
| Income Trend | IncomeEntry buckets |
| Expense Trend | ExpenseEntry buckets |
| Debt Trend | Month-end debt outstanding |
| Savings Trend | Pool/goal balances over time |
| Net Worth Trend | Net worth formula per period end |
| Cash Flow Trend | Ledger buckets |

All are **computed series**, not stored fact entities.

---

## 4. Reports vs Dashboard

| | Dashboard | Reports |
|---|-----------|---------|
| Time | Now + MTD | Arbitrary ranges |
| Depth | Snapshot cards | Charts & breakdowns |
| Storage | None | None (v1) |
| Ledger use | Optional for MTD cash | Primary for Cash Flow |

---

## 5. Consistency rules

1. Numbers on Dashboard for “cash” must reconcile to Accounts (± pending drafts).  
2. Categorized spend on Reports must reconcile to Expense documents.  
3. Cash Flow must reconcile to Ledger.  
4. If two views disagree, **Ledger + Account balances win for cash**; documents win for category narrative; fix bridging bugs — do not invent a third store.

---

## Related

- [LEDGER_DESIGN.md](./LEDGER_DESIGN.md)
- [ENTITY_PLANNING.md](./ENTITY_PLANNING.md)
- [FUTURE_ARCHITECTURE.md](./FUTURE_ARCHITECTURE.md)

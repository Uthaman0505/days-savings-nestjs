# Entity Planning

> Business entities, relationships, aggregate roots, and value objects.  
> **Not TypeORM.** No classes, columns, or GraphQL types.

---

## 1. Entities by domain

### Identity (existing)
- **User** — ownership root (already exists)

### Settings
- **FinanceCategory**
- **FinancePreference**
- **BudgetPlan**
- **BudgetLine** (category limit inside a plan)

### Accounts
- **Account** (cash / bank / e-wallet / optional savings-pool subtype)
- **AccountTransfer**

### Ledger
- **LedgerTransaction**

### Income
- **IncomeEntry**
- **RefundEntry** (or IncomeEntry with kind=REFUND)

### Expense
- **ExpenseEntry**
- **RecurringExpenseSeries** (bills & subscriptions)

### Debt
- **DebtInstrument** (credit card, revolving payable)
- **CreditCardStatement**
- **DebtPayment**
- **DebtAdjustment** (interest/fees)

### Loans
- **Loan** (house, personal, vehicle, family)
- **LoanPayment**

### Savings
- **SavingsPool** (emergency, sinking fund)
- **SavingsContribution**
- **SavingsWithdrawal**

### Goals
- **SavingsGoal**
- **GoalContribution**

### Insurance
- **InsurancePolicy**
- **InsurancePremiumPayment**

### Dashboard
- *(none)*

### Reports
- *(none in v1)*

### Satellites (existing — do not re-own)
- GrabProfitEntry, GlobalWallet, ChallengeWallet, WalletTransaction, UserSavingPlan, …

---

## 2. Relationships (business)

```
User
 ├── FinancePreference (1)
 ├── FinanceCategory (many)
 ├── BudgetPlan (many)
 │    └── BudgetLine (many)
 ├── Account (many)
 │    ├── LedgerTransaction (many)
 │    └── AccountTransfer as from/to (many)
 ├── IncomeEntry (many) ──posts──► LedgerTransaction
 ├── ExpenseEntry (many) ──posts──► LedgerTransaction
 ├── RefundEntry (many) ──posts──► LedgerTransaction
 ├── RecurringExpenseSeries (many) ──spawns──► ExpenseEntry
 ├── DebtInstrument (many)
 │    ├── CreditCardStatement (many)
 │    ├── DebtPayment (many) ──posts──► LedgerTransaction
 │    └── DebtAdjustment (many)
 ├── Loan (many)
 │    └── LoanPayment (many) ──posts──► LedgerTransaction
 ├── SavingsPool (many)
 │    ├── SavingsContribution ──posts──► LedgerTransaction
 │    └── SavingsWithdrawal ──posts──► LedgerTransaction
 ├── SavingsGoal (many)
 │    └── GoalContribution ──posts──► LedgerTransaction
 └── InsurancePolicy (many)
      └── InsurancePremiumPayment ──posts──► LedgerTransaction
             └── optional ExpenseEntry

LedgerTransaction ──aggregates into──► Reports / Dashboard (computed, not stored)

Monthly Summary / Net Worth / Cash Flow
  └── derived read models (not entities)
```

### Narrative chain (example)

```
User
 ↓
Account
 ↓
LedgerTransaction  (from Salary IncomeEntry)
 ↓
(computed) Monthly Summary
 ↓
(computed) Dashboard
```

---

## 3. Aggregate roots

An **aggregate root** is the entity that consistency rules attach to; children are updated through it (conceptually).

| Aggregate root | Owns / consistency boundary | Notes |
|----------------|-----------------------------|-------|
| **Account** | Balance invariant; transfer legs touching this account | Ledger rows are facts in the boundary of “balance updates” |
| **LedgerTransaction** | Single posting immutability; reversal references | Often created inside another aggregate’s unit of work |
| **IncomeEntry** | Income fields + “must post ledger when posted” | Root for income lifecycle |
| **ExpenseEntry** | Expense fields + posting rule | Root for spend lifecycle |
| **RecurringExpenseSeries** | Schedule + spawned occurrences metadata | Occurrences are ExpenseEntry roots once created |
| **DebtInstrument** | Outstanding vs limit; statements; payments | Payments are entities inside debt consistency when reducing balance |
| **CreditCardStatement** | Period totals / due amount for a card | Child of DebtInstrument conceptually |
| **Loan** | Principal remaining; payment history | LoanPayment inside loan boundary |
| **SavingsPool** | Pool balance / target | Contributions/withdrawals inside boundary |
| **SavingsGoal** | Target, progress, status | Contributions inside boundary |
| **InsurancePolicy** | Coverage period, premium schedule | Premium payments inside boundary |
| **BudgetPlan** | Period + lines | Does not include Expense rows |
| **FinanceCategory** | Archive rules | Referenced widely; not deleted if in use |
| **User** | Identity | Existing root |

**Dashboard / Reports:** not aggregates — application read services.

### Who owns whom (summary)

```
DebtInstrument
  ├── CreditCardStatement
  ├── DebtPayment
  └── DebtAdjustment

Loan
  └── LoanPayment

SavingsPool
  ├── SavingsContribution
  └── SavingsWithdrawal

SavingsGoal
  └── GoalContribution

InsurancePolicy
  └── InsurancePremiumPayment

Account
  └── (balance guarded while posting LedgerTransaction)

BudgetPlan
  └── BudgetLine
```

---

## 4. Value objects

Value objects have no independent identity; equality by value.

| Value object | Meaning | Used by |
|--------------|---------|---------|
| **Money** | `{ amountCents, currencyCode }` | All money fields |
| **Currency** | ISO code / display rules | Settings, Money |
| **DateRange** | `{ start, end }` | Statements, reports, budgets |
| **StatementPeriod** | Billing cycle range + due date | CreditCardStatement |
| **PaymentStatus** | e.g. PENDING / POSTED / REVERSED / FAILED | Payments |
| **GoalProgress** | `{ currentCents, targetCents, percent }` | Goals, Dashboard |
| **DebtUtilization** | `{ outstanding, limit, available }` | Credit cards |
| **AccountType** | CASH / BANK / EWALLET / SAVINGS_POOL | Accounts |
| **LedgerDirection** | CREDIT / DEBIT | Ledger |
| **ReferenceLink** | `{ type, id }` | Ledger → document |
| **RecurrenceRule** | interval, next due, day-of-month | Recurring series, premiums |
| **NetWorthSnapshot** | computed composition (not stored) | Dashboard/Reports |
| **CategoryKind** | INCOME / EXPENSE / … | FinanceCategory |
| **LoanDirection** | PAYABLE / RECEIVABLE | Family loans |
| **PolicyStatus** | ACTIVE / LAPSED / … | Insurance |

---

## 5. Entity checklist by domain (quick)

| Domain | Entities |
|--------|----------|
| Settings | FinanceCategory, FinancePreference, BudgetPlan, BudgetLine |
| Accounts | Account, AccountTransfer |
| Ledger | LedgerTransaction |
| Income | IncomeEntry, RefundEntry |
| Expense | ExpenseEntry, RecurringExpenseSeries |
| Debt | DebtInstrument, CreditCardStatement, DebtPayment, DebtAdjustment |
| Loans | Loan, LoanPayment |
| Savings | SavingsPool, SavingsContribution, SavingsWithdrawal |
| Goals | SavingsGoal, GoalContribution |
| Insurance | InsurancePolicy, InsurancePremiumPayment |
| Dashboard | — |
| Reports | — |

---

## 6. Design rules for later TypeORM mapping

When implementation begins (out of scope here):

- Map each entity to a table with UUID PK, snake_case, `user_id`, cents integers  
- Do **not** create tables for Dashboard/Reports aggregates  
- Do **not** introduce Prisma  
- Keep feature-module ownership aligned with [FINANCE_MODULES.md](./FINANCE_MODULES.md)

---

## Related

- [LEDGER_DESIGN.md](./LEDGER_DESIGN.md)
- [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md)
- [REPORTING_DESIGN.md](./REPORTING_DESIGN.md)

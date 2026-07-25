# Finance Domain

> Domain-Driven Design for the **Personal Financial Operating System**.  
> NestJS / GraphQL / TypeORM / PostgreSQL architecture is **final** and not re-analyzed here.  
> **No implementation.** Domain model only.

---

## Design stance

- Identity (`User`) already exists and is the **owner** of all finance data.
- Challenge savings (`plans` / `wallet`) and Grab profit (`grab-profit`) remain product satellites; Finance domains integrate with them via the **Ledger**, not by absorbing them.
- Money is always expressed as a **Money** value (integer minor units / cents).
- The **Ledger** is the system of record for cash movement. Domain documents (Income, Expense, Debt Payment, …) are the business reasons; Ledger Transactions are the financial facts.

---

## 1. Finance domains

| Domain | Why it exists |
|--------|----------------|
| **Accounts** | Answers *where money lives*. Without accounts, balances and transfers have no home. |
| **Ledger** | Answers *what moved*. Every financial event must leave an auditable transaction. Source of truth for cash flow and many reports. |
| **Income** | Answers *why money entered*. Captures earning intent (salary, Grab, refunds-as-income) separately from raw ledger credits. |
| **Expense** | Answers *why money left* for consumption/bills. Powers spending analysis, budgets, subscriptions. |
| **Debt** | Answers *what I owe on revolving / open obligations* (cards, payables). Distinct from installment loans. |
| **Loans** | Answers *installment credit or family lending* with principal remaining and payment plans. |
| **Savings** | Answers *earmarked reserves* (emergency fund, sinking funds) as intentional pools—not challenge wallets. |
| **Goals** | Answers *targets with a deadline/amount* (vacation, down payment). Progress is measured; funding still hits Ledger. |
| **Insurance** | Answers *protection premiums & policies* so insurance is not lost inside generic expenses forever. |
| **Dashboard** | Answers *where I stand now*. Pure composition; owns **no** business data. |
| **Reports** | Answers *how I moved over time*. Pure analytics; owns **no** money facts. |
| **Settings** | Answers *how the user configures finance* (categories, calendar, currency display, preferences). |
| **Identity (existing)** | `User` ownership root—already final. |
| **Challenge Satellite (existing)** | Challenge plans/wallets—kept; optional Ledger posting when money enters personal OS. |
| **Grab Satellite (existing)** | Grab profit calculator—kept; posts or bridges into Income/Ledger when user confirms. |

### Domain map

```
                    Settings
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
      Income        Expense      Insurance
         │             │             │
         └──────┬──────┴──────┬──────┘
                ▼             ▼
             Accounts ◄─── Debt / Loans / Savings / Goals
                │
                ▼
             Ledger  ◄── every money event posts here
                │
        ┌───────┴───────┐
        ▼               ▼
   Dashboard         Reports
```

---

## 2. Domain intent (short)

### Accounts
Hold liquid containers (cash, bank, e-wallet). Balance is the live projection; Ledger is the history.

### Ledger
Universal journal of money movements. Not a “UI module”—a core domain. Nest feature module will still look like other features when implemented later.

### Income / Expense
Business documents that *cause* ledger postings. They carry categorization and narrative the ledger alone should not invent.

### Debt / Loans
Obligations. Payments reduce liability and post ledger debits from accounts.

### Savings / Goals
Intentional accumulation. Savings = pools; Goals = targets. Both fund via Ledger.

### Insurance
Policies and premium payments (often recurring). Premiums post as expenses/ledger outflows linked to a policy.

### Dashboard / Reports
Read models only. Never system-of-record.

### Settings
Reference data and preferences consumed by other domains.

---

## 3. Ubiquitous language

| Term | Meaning |
|------|---------|
| Account | Liquid money container owned by a User |
| Ledger Transaction | Immutable (or append-only) money movement fact |
| Posting | Act of writing one or more ledger legs for an event |
| Domain Document | Income / Expense / Payment / Contribution that explains *why* |
| Obligation | Debt instrument or Loan |
| Money | Integer minor units + currency code |
| Period | Date range used for statements and reports |
| Satellite | Existing Grab/Challenge product that may bridge into Finance |

---

## 4. Ownership axiom

```
User
 └── owns Accounts, Ledger postings, Income, Expense,
     Debt, Loans, Savings, Goals, Insurance, Settings
```

Dashboard and Reports own nothing durable.

---

## Related deliverables

| Doc | Content |
|-----|---------|
| [FINANCE_MODULES.md](./FINANCE_MODULES.md) | Business modules, rules, lifecycle |
| [LEDGER_DESIGN.md](./LEDGER_DESIGN.md) | How every event becomes a transaction |
| [ENTITY_PLANNING.md](./ENTITY_PLANNING.md) | Business entities & aggregates |
| [REPORTING_DESIGN.md](./REPORTING_DESIGN.md) | Dashboard & reports |
| [FUTURE_ARCHITECTURE.md](./FUTURE_ARCHITECTURE.md) | OCR, AI, bank sync, etc. without redesign |

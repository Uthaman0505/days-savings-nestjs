# Future Architecture

> How the Finance Domain Model absorbs future capabilities **without redesign**.  
> Existing Nest architecture remains final. No new architectural styles (no CQRS bus, no microservices split required).

---

## 1. Extension rule

Every future capability must attach to an **existing domain** by:

1. Adding fields / child entities inside that domain, **or**
2. Adding a new **sibling feature module** that still **posts to the Ledger**, **or**
3. Adding a **bridge** from a satellite (Grab, Challenge, Bank) into Income/Expense/Ledger

Never invent a second ledger or a dashboard database.

---

## 2. Capability map

| Future capability | Primary domain(s) | How it fits | Ledger impact |
|-------------------|-------------------|-------------|---------------|
| **OCR** | Expense (+ media storage pattern like profile-media) | OCR proposes Expense draft; user confirms → Expense + Ledger post | Posts on confirm only |
| **AI Financial Advisor** | Reports + Settings (read) | Advice reads totals/trends; may suggest BudgetLines; never silent money moves | Read-only unless user accepts a suggested posting |
| **Bank Synchronization** | Accounts + Ledger (+ Income/Expense classification) | Imported bank lines → proposed Ledger/docs → user/rules confirm | Yes — imports become transactions |
| **Investments** | New **Investments** domain (sibling) | Holdings, buy/sell; Net Worth includes market value | Buy/sell post Account Ledger; holding entity separate |
| **Subscription Tracking** | Expense (`RecurringExpenseSeries`) | Filter/tag subscriptions; reminders | Each charge posts as today |
| **Recurring Bills** | Expense | Same series engine as subscriptions | Occurrence → Expense → Ledger |
| **Budget Planning** | Settings (`BudgetPlan`) + Reports/Dashboard | Compare limits vs Expense actuals | No direct ledger posts |
| **Multi Currency** | Settings + Money value object + Ledger | Money gains currency; transfer may gain FX leg | Extend posting model; do not replace Ledger |
| **Insurance deepen** | Insurance | Claims, beneficiaries — still premium→Ledger | Unchanged pattern |
| **Family Loan deepen** | Loans | Receivable collections, write-offs | Payment/adjustment posts |
| **Grab auto-bridge** | Income + grab-profit satellite | Scheduled confirm rules | Credit Account when bridged |
| **Challenge cash-out bridge** | Accounts + wallet satellite | Explicit transfer into Finance Account | Credit Finance Ledger |

---

## 3. OCR (detail)

```
Receipt image
  → OCR service extracts Money + date + merchant
  → Expense draft (no balance change)
  → User confirms Account + Category
  → Expense posted + Ledger DEBIT
```

**No redesign:** Expense lifecycle already allows Draft → Posted.

---

## 4. AI Financial Advisor (detail)

```
AI context builder
  → reads Reports (cash flow, expense trend, debt summary)
  → reads Goals / Budgets
  → returns recommendations
User accepts “create budget” → Settings BudgetPlan
User accepts “log expense” → normal Expense flow
```

AI never bypasses Ledger invariants.

---

## 5. Bank Synchronization (detail)

```
Provider connector (future module or inside Accounts)
  → raw bank movements
  → match/dedupe against Ledger (ReferenceLink / external id)
  → propose Income/Expense/Transfer
  → confirm → post Ledger + docs
```

Accounts domain gains “link external id”; Ledger gains idempotency key — **extensions**, not a new architecture.

---

## 6. Investments (detail)

New domain when needed:

- Entities: Portfolio, Holding, InvestmentTransaction  
- Buy: Account Ledger DEBIT + Holding increase  
- Sell: reverse  
- Net Worth: + marked value (value object Quote)

Dashboard/Reports formulas already reserved an investments slot.

---

## 7. Subscriptions & Recurring Bills (detail)

Already modeled as **RecurringExpenseSeries** under Expense.

Future UI is a view/filter, not a new bounded context.

---

## 8. Budget Planning (detail)

`BudgetPlan` + `BudgetLine` in Settings.

Dashboard shows variance; Reports show adherence.  
Budgets do not hold money.

---

## 9. Multi Currency (detail)

Extend **Money** / **Currency** value objects:

- Account.currency  
- LedgerTransaction.money + optional fx_rate  
- Transfer across currencies posts two moneys + FX difference policy  

Domains stay the same; only value objects and posting rules enrich.

---

## 10. What we refuse (to avoid redesign)

| Anti-pattern | Why refused |
|--------------|-------------|
| Second “analytics database” as source of truth | Diverges from Ledger |
| Event bus required for MVP posting | Not in final Nest architecture |
| Microservice per domain | Conflicts with feature-module monolith that is final |
| Prisma alongside TypeORM | Forbidden |
| Dashboard tables of balances | Duplicate data |
| Silent OCR/bank auto-post without rules | Breaks trust / double posts |

---

## 11. Longevity test

A design is future-ready if this sentence remains true:

> **Any new money movement still becomes a Ledger Transaction referencing a domain document, owned by a User, denominated as Money, with Dashboard/Reports only reading.**

That sentence is the architecture’s compatibility guarantee.

---

## Related

- [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md)
- [LEDGER_DESIGN.md](./LEDGER_DESIGN.md)
- [ENTITY_PLANNING.md](./ENTITY_PLANNING.md)
- [REPORTING_DESIGN.md](./REPORTING_DESIGN.md)
- [FINANCE_MODULES.md](./FINANCE_MODULES.md)

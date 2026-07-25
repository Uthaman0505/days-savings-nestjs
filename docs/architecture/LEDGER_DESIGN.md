# Ledger Design

> **Most important Finance domain document.**  
> Defines what a Transaction is and how every financial event becomes ledger fact(s).  
> **No code.** Compatible with the final Nest + TypeORM feature-module architecture.

---

## 1. Why the Ledger exists

Without a Ledger:

- Dashboard and Reports disagree
- Transfers look like income/expense
- Debt payments lose cash-flow meaning
- OCR/bank sync cannot reconcile

With a Ledger:

- **Accounts** hold live balances
- **Domain documents** hold business meaning
- **Ledger Transactions** hold immutable money movement history

This mirrors the existing challenge product idea (`wallet_transactions` as movement log) — extended to the whole Personal Finance OS.

---

## 2. What is a Transaction?

A **Ledger Transaction** is an append-only financial fact that records:

| Aspect | Meaning |
|--------|---------|
| **Who** | `user_id` |
| **Where** | which Account (and optionally which obligation/pool) |
| **How much** | Money (cents + currency) |
| **Direction** | CREDIT (in) or DEBIT (out) relative to the Account |
| **When** | effective/occurred timestamp + booked timestamp |
| **Why** | `reference_type` + `reference_id` → domain document |
| **Balance after** | optional projection aid (same pattern as existing wallet txs) |

### Transaction vs Domain Document

| | Domain Document | Ledger Transaction |
|--|-----------------|--------------------|
| Examples | Income, Expense, DebtPayment, GoalContribution | Credit/Debit legs |
| Purpose | Business narrative & analytics dimensions | Cash movement truth |
| Mutable? | Controlled edits via compensating posts | Prefer append-only |
| Alone enough? | No — must post ledger | No — needs reference for “why” |

**Rule:** No silent balance change. If an Account balance changes, a Ledger Transaction exists.

---

## 3. Posting model

### Single-account event (simple)

```
Expense RM50 from Bank Account
  → Domain: ExpenseEntry
  → Ledger: DEBIT Bank Account 5000 cents
  → Account.balance_cents -= 5000
```

### Dual-account event (transfer)

```
Transfer RM100 Cash → Bank
  → Domain: AccountTransfer
  → Ledger: DEBIT Cash 10000
  → Ledger: CREDIT Bank 10000
  → Both balances updated in one unit of work
```

### Liability event (credit card payment)

```
Pay Credit Card RM200 from Bank
  → Domain: DebtPayment
  → Ledger: DEBIT Bank 20000
  → Debt.outstanding -= 20000
  (Debt is not an Account; liability lives on Debt instrument)
```

### Optional card purchase policy

```
Swipe card RM80 (no cash left yet)
  → Domain: Expense (category) + Debt increase
  → Debt.outstanding += 8000
  → Ledger: optional “on-credit” memo OR no cash ledger until payment
```

**Product decision (recommended for clarity):**

- **Cash/bank spend** → Expense + Account Ledger debit  
- **Card spend** → Expense + Debt outstanding increase (cash Ledger later at payment)  
- **Card payment** → DebtPayment + Account Ledger debit + Debt decrease  

---

## 4. Event → Transaction catalog

Every row: business event → domain document → ledger effect.

### 4.1 Salary

```
Event: Salary received
Document: Income (Salary)
Ledger: CREDIT target Account
Balance: Account ↑
```

### 4.2 Grab Income

```
Event: Grab day profit confirmed into OS
Document: Income (Grab) linked to GrabProfitEntry id
Ledger: CREDIT chosen Account (usually e-wallet/bank)
Balance: Account ↑
Rule: Grab calculator rows alone do NOT move Accounts until bridge posts
```

### 4.3 Everyday Expense

```
Event: Paid for groceries
Document: Expense
Ledger: DEBIT Account
Balance: Account ↓
```

### 4.4 Credit Card Payment

```
Event: Paid card bill
Document: DebtPayment
Ledger: DEBIT Account
Liability: Debt outstanding ↓
```

### 4.5 Loan Payment

```
Event: Mortgage installment
Document: LoanPayment
Ledger: DEBIT Account
Liability: Loan principal ↓ (interest may be Expense portion if split)
```

### 4.6 Insurance Premium

```
Event: Pay annual/monthly premium
Document: InsurancePremiumPayment (+ optional Expense for category)
Ledger: DEBIT Account
Policy: last paid / next due updated
```

### 4.7 Savings Contribution

```
Event: Move money into Emergency Fund
Document: SavingsContribution
Ledger: DEBIT funding Account
Ledger: CREDIT Savings pool account OR increase Savings.balance (if pool is account-like)
```

**Recommended:** treat each Savings pool as an **Account subtype** *or* a pool with balance that still posts ledger legs — pick one; do not double count in Net Worth.

### 4.8 Goal Contribution

```
Event: Fund “Japan Trip” goal
Document: GoalContribution
Ledger: DEBIT Account (and/or Savings)
Goal.progress ↑
```

If goal progress is earmark only (money still in same bank account), Ledger may be a **memo allocation** posting (zero net cash) *or* transfer into a goal sub-account. Prefer **sub-account / pool transfer** so Net Worth stays correct without double counting.

### 4.9 Refund

```
Event: Merchant refund
Document: Refund (Income subtype or Expense reversal link)
Ledger: CREDIT Account
Optional: link original Expense for analytics
```

### 4.10 Transfer

```
Event: Move between Accounts
Document: AccountTransfer
Ledger: DEBIT from + CREDIT to
Net worth: unchanged
```

### 4.11 Challenge / Wallet satellite

```
Event: User stops challenge and money enters personal OS (optional future bridge)
Document: Income or Transfer-in
Ledger: CREDIT Finance Account
Satellite: Challenge wallet already has its own ledger; bridge is explicit
```

---

## 5. Reference types (logical vocabulary)

| reference_type | Points to |
|----------------|-----------|
| `INCOME` | Income document |
| `EXPENSE` | Expense document |
| `TRANSFER` | AccountTransfer |
| `DEBT_PAYMENT` | DebtPayment |
| `LOAN_PAYMENT` | LoanPayment |
| `INSURANCE_PREMIUM` | InsurancePremiumPayment |
| `SAVINGS_CONTRIBUTION` | SavingsContribution |
| `SAVINGS_WITHDRAWAL` | SavingsWithdrawal |
| `GOAL_CONTRIBUTION` | GoalContribution |
| `REFUND` | Refund document |
| `ADJUSTMENT` | Manual correction |
| `GRAB_BRIDGE` | GrabProfitEntry bridge |
| `REVERSAL` | Original ledger transaction id |

---

## 6. Invariants (non-negotiable)

1. **Balance change ⇒ Ledger posting** (same unit of work).  
2. **Postings are append-only**; corrections use reversing transactions.  
3. **Money is integer cents** (Money value object).  
4. **User isolation** — never cross `user_id`.  
5. **Transfers net to zero** across accounts (ignoring FX until multi-currency).  
6. **Dashboard/Reports never write Ledger.**  
7. **Domain document without posting is incomplete** (draft state allowed only if balance untouched).

---

## 7. Aggregate behavior (Ledger)

**Aggregate root:** Ledger is usually posted *through* the commanding domain service (Income posts ledger as part of its transaction). Conceptually:

```
Command (Post Income)
  └── Unit of Work
        ├── persist Income document
        ├── persist Ledger Transaction(s)
        └── update Account balance
```

Account is the balance aggregate; Ledger Transaction is the historical child fact. See [ENTITY_PLANNING.md](./ENTITY_PLANNING.md).

---

## 8. How Dashboard uses the Ledger

Dashboard **does not** store transactions.

It may:

- Sum **Account balances** for liquid cash
- Sum Ledger CREDITS/DEBITS for MTD cash flow *or* sum Income/Expense documents for categorized MTD
- Prefer documents for category dashboards; prefer Ledger for pure cash movement

See [REPORTING_DESIGN.md](./REPORTING_DESIGN.md).

---

## 9. How Reports use the Ledger

| Report | Prefer |
|--------|--------|
| Cash Flow | Ledger Transaction series |
| Income / Expense Summary | Income/Expense documents (+ categories) |
| Debt / Loan Summary | Obligation balances + payment documents |
| Net Worth Trend | Accounts + Savings/Goals policy − Debt − Loans at period ends |
| Monthly Summary | Mix: documents for narrative, Ledger for cash proof |

---

## 10. Future events (same ledger, no redesign)

| Future capability | Still posts Ledger? |
|-------------------|---------------------|
| OCR expense | Yes — after user confirms amount/account |
| Bank sync | Yes — imported transactions become Ledger (+ docs) |
| Investments buy/sell | Yes — when Investments domain arrives |
| Recurring bills | Yes — each occurrence posts |
| Multi-currency | Yes — legs gain FX metadata; model extends, not replaced |

---

## Related

- [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md)
- [ENTITY_PLANNING.md](./ENTITY_PLANNING.md)
- [REPORTING_DESIGN.md](./REPORTING_DESIGN.md)

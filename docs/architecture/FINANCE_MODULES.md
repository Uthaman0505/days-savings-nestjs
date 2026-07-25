# Finance Modules

> Business modules inside each Finance domain.  
> For each module: responsibilities, rules, ownership, lifecycle.  
> **No code.** Nest feature folders remain the final packaging style when implementation starts.

---

## How to read this document

- **Domain** = bounded business area  
- **Business module** = cohesive capability inside a domain (not necessarily a separate Nest folder later; several may live in one feature module)  
- **Ownership** = which domain is source of truth  
- **Lifecycle** = create → active use → close/archive

---

## 1. Accounts domain

### 1.1 Cash Account
| | |
|--|--|
| **Responsibilities** | Represent physical cash on hand; accept deposits/withdrawals via Ledger. |
| **Business rules** | Balance cannot go below policy floor (default 0 unless overdraft allowed). Always User-owned. |
| **Ownership** | Accounts domain |
| **Lifecycle** | Open → Active → Freeze → Close (close only if balance ≈ 0 or transferred out) |

### 1.2 Bank Account
| | |
|--|--|
| **Responsibilities** | Represent bank/current/savings bank balances; receive salary, pay bills, sync later. |
| **Business rules** | One logical account per institution+mask (product rule); currency required. |
| **Ownership** | Accounts domain |
| **Lifecycle** | Open → Active → (Bank Sync linked) → Close |

### 1.3 E-Wallet Account
| | |
|--|--|
| **Responsibilities** | Touch-n-Go, GrabPay wallet, etc. as liquid accounts. |
| **Business rules** | Same balance invariants as bank/cash; may be default for Grab-related postings. |
| **Ownership** | Accounts domain |
| **Lifecycle** | Open → Active → Close |

### 1.4 Account Transfer
| | |
|--|--|
| **Responsibilities** | Move value between two Accounts without classifying as income/expense. |
| **Business rules** | Must post **double legs** on Ledger (debit source, credit destination); same currency in v1 (FX later). Amount > 0. |
| **Ownership** | Accounts domain (posts Ledger) |
| **Lifecycle** | Initiated → Posted → (optional Void/Reversal via compensating transaction) |

---

## 2. Ledger domain

### 2.1 Ledger Transaction (core)
| | |
|--|--|
| **Responsibilities** | Record every money movement; support cash flow and audit. |
| **Business rules** | See [LEDGER_DESIGN.md](./LEDGER_DESIGN.md). Every financial event posts ≥1 transaction leg set. |
| **Ownership** | Ledger domain |
| **Lifecycle** | Posted → (optional) Reversed by compensating posting — prefer append-only |

### 2.2 Ledger Reference / Link
| | |
|--|--|
| **Responsibilities** | Tie transaction to domain document (Income, Expense, DebtPayment, …). |
| **Business rules** | `reference_type` + `reference_id` required for non-manual adjustments. |
| **Ownership** | Ledger domain |
| **Lifecycle** | Created with posting; immutable |

---

## 3. Income domain

### 3.1 Salary Income
| | |
|--|--|
| **Responsibilities** | Capture salary/payroll; credit chosen Account via Ledger. |
| **Business rules** | Occurred-on date required; amount > 0; category = Income. |
| **Ownership** | Income domain |
| **Lifecycle** | Draft(optional) → Posted → (Reversal) |

### 3.2 Side / Freelance Income
| | |
|--|--|
| **Responsibilities** | Non-salary earnings. |
| **Business rules** | Same posting rules as salary. |
| **Ownership** | Income |
| **Lifecycle** | Posted → Reversed |

### 3.3 Grab Income Bridge
| | |
|--|--|
| **Responsibilities** | Promote confirmed Grab profit/earning into personal Income + Ledger (satellite bridge). |
| **Business rules** | Does not delete Grab entries; posting is explicit user/system action; avoid double-post. |
| **Ownership** | Income (reads Grab satellite) |
| **Lifecycle** | Grab calculated → User confirms → Income+Ledger posted → Linked |

### 3.4 Refund Received
| | |
|--|--|
| **Responsibilities** | Money returned to user (merchant refund). |
| **Business rules** | Prefer link to original Expense when known; posts Ledger credit; may reduce expense analytics if linked. |
| **Ownership** | Income *or* Expense adjustment policy — **recommend**: Refund as Income subtype *or* negative expense correction; pick one product rule and keep consistent (default: **Refund document → Ledger credit**, optional link to Expense). |
| **Lifecycle** | Posted → Linked |

---

## 4. Expense domain

### 4.1 Everyday Expense
| | |
|--|--|
| **Responsibilities** | Record spend against category and Account. |
| **Business rules** | Amount > 0; posts Ledger debit; category required (or Uncategorized). |
| **Ownership** | Expense |
| **Lifecycle** | Posted → (Edited with compensating ledger) → Void |

### 4.2 Recurring Bill
| | |
|--|--|
| **Responsibilities** | Template for rent, utilities, etc. |
| **Business rules** | Schedule defines next due; each occurrence creates Expense + Ledger posting. |
| **Ownership** | Expense |
| **Lifecycle** | Active series → Paused → Ended |

### 4.3 Subscription
| | |
|--|--|
| **Responsibilities** | Track SaaS/media subscriptions as recurring expenses. |
| **Business rules** | Same as recurring bill; identifiable as subscription for future tracker UI. |
| **Ownership** | Expense |
| **Lifecycle** | Trial → Active → Cancelled |

### 4.4 Budget Envelope *(settings-assisted)*
| | |
|--|--|
| **Responsibilities** | Limit spend per category/period (planning). |
| **Business rules** | Budgets do not move money; they constrain/warn against Expense totals. |
| **Ownership** | Settings owns budget definitions; Expense provides actuals |
| **Lifecycle** | Period open → Tracked → Closed |

---

## 5. Debt domain

### 5.1 Credit Card
| | |
|--|--|
| **Responsibilities** | Revolving facility: limit, outstanding, available credit. |
| **Business rules** | Outstanding ≥ 0; outstanding ≤ limit (warn if over); purchases may increase outstanding **without** leaving cash account until payment (policy: card spend can be Debt increase + optional Expense recognition). |
| **Ownership** | Debt |
| **Lifecycle** | Open → Active → Blocked → Closed |

### 5.2 Credit Card Statement
| | |
|--|--|
| **Responsibilities** | Period snapshot of card activity / due amount. |
| **Business rules** | Statement period is a value object; due date drives reminders; does not replace Ledger. |
| **Ownership** | Debt |
| **Lifecycle** | Open period → Issued → Due → Paid/Partial/Overdue → Archived |

### 5.3 Credit Card Payment
| | |
|--|--|
| **Responsibilities** | Pay card from an Account; reduce outstanding. |
| **Business rules** | Must post Ledger debit on Account; decrease Debt balance; amount ≤ outstanding (or allow overpay as credit balance policy). |
| **Ownership** | Debt |
| **Lifecycle** | Initiated → Posted → Reversed |

### 5.4 Other Revolving / Informal Payable
| | |
|--|--|
| **Responsibilities** | Store credit, BNPL revolving, money owed to shops. |
| **Business rules** | Same payment posting pattern as cards. |
| **Ownership** | Debt |
| **Lifecycle** | Open → Paid down → Closed |

---

## 6. Loans domain

### 6.1 House Loan / Mortgage
| | |
|--|--|
| **Responsibilities** | Long-term secured installment loan. |
| **Business rules** | Principal remaining tracks; payment splits principal/interest as product requires; posts Account Ledger debit. |
| **Ownership** | Loans |
| **Lifecycle** | Originated → Servicing → Paid off / Defaulted (status) |

### 6.2 Vehicle / Personal Installment Loan
| | |
|--|--|
| **Responsibilities** | Standard installment credit. |
| **Business rules** | Same payment pattern as house loan with simpler metadata. |
| **Ownership** | Loans |
| **Lifecycle** | Originated → Servicing → Closed |

### 6.3 Family Loan
| | |
|--|--|
| **Responsibilities** | Money borrowed from or lent to family/friends. |
| **Business rules** | Direction: payable vs receivable; payments post Ledger; receivable increases assets conceptually. |
| **Ownership** | Loans |
| **Lifecycle** | Agreed → Partially repaid → Settled / Written off |

### 6.4 Loan Payment
| | |
|--|--|
| **Responsibilities** | Single installment or ad-hoc repayment event. |
| **Business rules** | Links Loan + Account; Ledger posting mandatory; updates principal remaining. |
| **Ownership** | Loans |
| **Lifecycle** | Posted → Reversed |

---

## 7. Savings domain

### 7.1 Emergency Fund
| | |
|--|--|
| **Responsibilities** | Earmarked reserve with target months of expenses (optional). |
| **Business rules** | Funding posts Ledger (from Account into Savings pool or earmark); not a Challenge wallet. |
| **Ownership** | Savings |
| **Lifecycle** | Created → Funding → On-target → Drawn → Closed |

### 7.2 Sinking Fund
| | |
|--|--|
| **Responsibilities** | Save toward known future expense (insurance annual, road tax). |
| **Business rules** | Same funding mechanics; may auto-suggest contribution size. |
| **Ownership** | Savings |
| **Lifecycle** | Created → Funding → Spent/Transferred → Closed |

### 7.5 Savings Contribution / Withdrawal
| | |
|--|--|
| **Responsibilities** | Move money between Account and Savings pool. |
| **Business rules** | Always Ledger-backed; withdrawal returns to Account. |
| **Ownership** | Savings |
| **Lifecycle** | Posted → Reversed |

---

## 8. Goals domain

### 8.1 Savings Goal
| | |
|--|--|
| **Responsibilities** | Named target amount + optional deadline. |
| **Business rules** | Progress = contributed − withdrawn; completion when progress ≥ target. |
| **Ownership** | Goals |
| **Lifecycle** | Active → Achieved / Abandoned / Expired |

### 8.2 Goal Contribution
| | |
|--|--|
| **Responsibilities** | Fund a goal from an Account (or from Savings). |
| **Business rules** | Ledger posting required; updates Goal progress. |
| **Ownership** | Goals |
| **Lifecycle** | Posted → Reversed |

---

## 9. Insurance domain

### 9.1 Insurance Policy
| | |
|--|--|
| **Responsibilities** | Policy metadata (type, insurer, coverage period, premium). |
| **Business rules** | Premium schedule may create Recurring Bill / Expense; policy is not a Ledger account. |
| **Ownership** | Insurance |
| **Lifecycle** | Quote → Active → Lapsed → Expired / Cancelled |

### 9.2 Insurance Premium Payment
| | |
|--|--|
| **Responsibilities** | Pay premium from Account. |
| **Business rules** | Posts Ledger debit; links Policy; may also create Expense for category analytics. |
| **Ownership** | Insurance (posts Ledger; may create Expense document) |
| **Lifecycle** | Due → Posted → Failed/Retry |

---

## 10. Settings domain

### 10.1 Categories
| | |
|--|--|
| **Responsibilities** | Income/Expense/(optional Debt) taxonomy. |
| **Business rules** | User-scoped; system defaults seedable; do not delete if referenced (archive). |
| **Ownership** | Settings |
| **Lifecycle** | Active → Archived |

### 10.2 Finance Preferences
| | |
|--|--|
| **Responsibilities** | Month start, timezone (default MYT), display currency, net-worth inclusion flags. |
| **Business rules** | One preference set per User. |
| **Ownership** | Settings |
| **Lifecycle** | Created on first use → Updated |

### 10.3 Budget Plan
| | |
|--|--|
| **Responsibilities** | Category limits per period. |
| **Business rules** | Does not post Ledger; compared to Expense actuals in Reports/Dashboard. |
| **Ownership** | Settings |
| **Lifecycle** | Period draft → Active → Closed |

---

## 11. Dashboard domain

### 11.1 Home Snapshot
| | |
|--|--|
| **Responsibilities** | Aggregate live balances, MTD income/expense, debt, goals, optional satellites. |
| **Business rules** | **Never persists business money.** Read-only composition. |
| **Ownership** | Dashboard owns only the query experience |
| **Lifecycle** | Request → Compute → Return (ephemeral) |

---

## 12. Reports domain

### 12.1 Period Analytics
| | |
|--|--|
| **Responsibilities** | Monthly summary, trends, cash flow, net worth series. |
| **Business rules** | Compute from Ledger + domain documents; no duplicate fact tables in v1. |
| **Ownership** | Reports owns query experience only |
| **Lifecycle** | Request → Compute → Return |

---

## 13. Module → Nest packaging hint (not a redesign)

When implementing later, package as existing-style feature folders, e.g. `accounts`, `income`, `expense`, `debt`, `loans`, `savings`, `goals`, `insurance`, `finance-settings`, `dashboard`, `reports`, plus a ledger capability either inside `accounts` or `src/ledger/` — **Ledger must remain one coherent domain** even if folder-named `accounts` initially.

Satellite modules stay: `wallet`, `plans`, `grab-profit`.

---

## Related

- [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md)
- [LEDGER_DESIGN.md](./LEDGER_DESIGN.md)
- [ENTITY_PLANNING.md](./ENTITY_PLANNING.md)

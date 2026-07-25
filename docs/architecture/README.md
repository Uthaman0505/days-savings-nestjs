# Architecture Analysis Index

Documents are **architecture / domain only**. No feature implementation lives in these files.

## A. Existing backend reverse engineering (FINAL)

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) | Full technical assessment |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | Folder organization |
| [BOOTSTRAP_ANALYSIS.md](./BOOTSTRAP_ANALYSIS.md) | Startup |
| [PACKAGE_ANALYSIS.md](./PACKAGE_ANALYSIS.md) | Packages |
| [DATABASE_ANALYSIS.md](./DATABASE_ANALYSIS.md) | TypeORM/Postgres |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | Module graph |
| [CODING_STANDARD.md](./CODING_STANDARD.md) | Coding patterns |
| [REUSABLE_COMPONENTS.md](./REUSABLE_COMPONENTS.md) | Reuse inventory |

## B. Finance Domain Model (DDD)

| Document | Description |
|----------|-------------|
| [FINANCE_DOMAIN.md](./FINANCE_DOMAIN.md) | Domains & ubiquitous language |
| [FINANCE_MODULES.md](./FINANCE_MODULES.md) | Business modules, rules, lifecycle |
| [LEDGER_DESIGN.md](./LEDGER_DESIGN.md) | **Core** — every event → transaction |
| [ENTITY_PLANNING.md](./ENTITY_PLANNING.md) | Entities, aggregates, value objects |
| [REPORTING_DESIGN.md](./REPORTING_DESIGN.md) | Dashboard & reports (read-only) |
| [FUTURE_ARCHITECTURE.md](./FUTURE_ARCHITECTURE.md) | OCR, AI, bank sync, etc. without redesign |

## C. Earlier Nest packaging notes (still valid)

| Document | Description |
|----------|-------------|
| [FINANCE_ARCHITECTURE.md](./FINANCE_ARCHITECTURE.md) | Feature-folder packaging sketch |
| [FINANCE_DEPENDENCIES.md](./FINANCE_DEPENDENCIES.md) | Nest module communication rules |
| [FINANCE_ENTITY_PLANNING.md](./FINANCE_ENTITY_PLANNING.md) | Earlier entity sketch (superseded in depth by ENTITY_PLANNING.md) |
| [FINANCE_REPORTING.md](./FINANCE_REPORTING.md) | Earlier reporting sketch (see REPORTING_DESIGN.md) |

## Critical takeaway

**Ledger is the cash-movement source of truth.** Domain documents explain *why*. Dashboard/Reports only aggregate. Extend domains for OCR/AI/bank sync/investments — do not redesign Nest or invent a second ledger.
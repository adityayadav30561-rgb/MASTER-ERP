# ADR-0049: Data model conventions — module schemas, downward-only foreign keys, UUIDv7, exact decimals, document registry + typed tables

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 8 §4–§6](../01-discovery/STEP-08-DATA-ARCHITECTURE.md#4-how-the-data-is-organised); question [Q-47](../tracking/OPEN-QUESTIONS.md#q-47)

## Context

Many modules and packages share one database. Without conventions, module boundaries erode (R-08), and money, time and identity are handled inconsistently.

## Decision

- **Schemas per module** (kernel, foundation, each module, localization and industry packages).
- **Foreign keys only inside a module or downward** (to kernel/foundation). Peer modules reference by id, checked through contracts.
- Every table has:
  - **UUIDv7** ids (RFC 9562)
  - `tenant_id`, plus `company_id` on business rows
  - UTC timestamps
  - **exact decimals** for money and quantities (ISO 4217 currency; base UOM plus entered UOM)
  - created/updated by and at
  - a **`version`** column for optimistic locking
  - an **`ext` JSONB** column for extension fields
- Drafts can be deleted; posted documents and ledgers never; masters are archived.
- **Documents:** a kernel **document registry** (number, type, company, state, party, totals, anchor) plus **typed header and line tables** owned by modules. **Document links** connect registry entries, and open quantities are derived from links.

## Consequences

- Cross-type search, links, approvals and audit are uniform.
- Architecture tests check the foreign-key direction (Step 9).

# ADR-0031: Go live with opening balances and open items, not historical transactions

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 5A §9](../01-discovery/STEP-05A-PACKAGES-UPGRADES-AND-ONBOARDING.md#9-data-migration-and-go-live); question [Q-28](../tracking/OPEN-QUESTIONS.md#q-28)

## Context

Migrating years of history from Excel, registers and Tally is slow, error-prone and rarely used afterwards. But a business cannot start from zero.

## Decision

- **Imported at go-live:**
  - masters: parties, items, product specs, active BOMs and routings, dies, plates, current artwork
  - **opening stock** from a physical count, with reel/batch, status, owner and value
  - **open** sales orders and POs
  - **unpaid** invoices (open items)
- Closed history stays in the old system and Tally.
- Imports use Excel/CSV templates with validation and error reports. A dress rehearsal runs on staging.
- Go-live is at a month start (ideally the financial year start), and Tally continues as the books.

## Consequences

- Historical reports before go-live come from the old system.
- The opening stock value must be agreed with the accountant on cut-off day.

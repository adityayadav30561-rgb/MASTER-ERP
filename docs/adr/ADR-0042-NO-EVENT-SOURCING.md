# ADR-0042: No event sourcing; state-based persistence plus append-only ledgers, audit trail and outbox

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 7 §6](../01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md#6-event-sourcing-where-it-fits-and-where-it-doesnt); question [Q-40](../tracking/OPEN-QUESTIONS.md#q-40)

## Context

The brief asked us to evaluate event sourcing without assuming it everywhere.

## Decision

Documents, masters and configuration use **state-based persistence**. Full history and rebuildable balances come from the **append-only stock ledger and vouchers**. Tamper-evident history comes from the **hash-chained audit trail**. Reactions come from **outbox events**. No area was found where event sourcing pays for its complexity (querying, schema evolution, DPDP erasure).

## Consequences

- Simpler queries, reporting and migrations.
- Revisit only for a specific future need (e.g. high-volume IoT machine data), with its own ADR.

# ADR-0019: WIP is tracked per job operation, not as stocked semi-finished items

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 4 §5.2](../01-discovery/STEP-04-PROCESS-ARCHITECTURE.md#52-wip-is-tracked-by-job-operation-adr-0019); question [Q-19](../tracking/OPEN-QUESTIONS.md#q-19)

## Context

Between operations, printed sheets are "work in progress". A classic ERP models each stage as a
semi-finished item with stock. For a printer with hundreds of customer-specific jobs, that means
hundreds of throwaway item codes and a store transaction between every operation.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Semi-finished items in stock | Standard; exact WIP stock | Item explosion; extra store steps; nobody on the floor works this way |
| **Quantities per job operation** (input, good, waste, in process) | Matches how printers think; no item explosion | WIP valuation and job-work challans must be derived from job data |

## Decision

WIP is tracked inside the Job/production order as quantities per operation, with unit changes
along the route (sheets → pieces via ups). WIP sent to a job worker is held in Inventory at the
third-party location as **job-bound WIP**, described from the job. Semi-finished items remain
possible for products that are genuinely stocked between stages.

## Consequences

- Job cards must reconcile input = good + waste + in process.
- WIP value at any time = material issued + job-card costs − FG received, per job (a derived report).

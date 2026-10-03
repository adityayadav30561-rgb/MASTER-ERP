# ADR-0005: Fixed core lifecycle + configurable sub-status and approval workflow

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 2 §6](../01-discovery/STEP-02-DOMAIN-MODEL.md#6-state-transition-workflow--the-two-level-model)

## Context

Customers want custom statuses and approval flows. Modules rely on states for correctness
(Inventory receives only against a *Released* PO; Finance posts only *Confirmed* invoices).
Freely editable states would break these guarantees.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Fully configurable state machines per tenant | Maximum flexibility | Other modules can't rely on any state; every integration breaks per tenant |
| Fully fixed states | Safe | Customers can't express their process; constant change requests |
| **Two levels: fixed core lifecycle; configurable sub-statuses, approval workflows and extra guards inside core states** | Safe and flexible where customers actually differ (approvals, tracking labels) | Customers must map their vocabulary onto core states |

## Decision

Each document type has a **core lifecycle** defined in module code. Tenants may add
**sub-statuses** within a core state, configure **approval workflows** that gate specific
transitions, and add **extra guards**; they cannot remove core states, transitions or guards.
Workflow instances keep the definition version they started with.

## Consequences

- The workflow engine (kernel K7) attaches to *transitions*, not to arbitrary field changes.
- Reporting can rely on core states across all tenants.
- Industry packages ship default sub-statuses and approval templates.

# ADR-0020: Quantity tolerance and short-close are part of the core document lifecycle

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 4 §4.2](../01-discovery/STEP-04-PROCESS-ARCHITECTURE.md#42-partial-fulfilment-tolerance-and-short-close-adr-0020)

## Context

In printing (and in buying paper by weight) the delivered quantity rarely equals the ordered
quantity. Over- and under-runs within an agreed percentage are normal, and many order lines end
with a small balance nobody will deliver.

## Decision

The document framework (kernel K6) supports, for every fulfillable line:

- **Tolerance** (± %, default per party / item category). A line within tolerance becomes Fulfilled.
- **Short-close** as a core transition, with a mandatory reason.
- **Approval** (configurable) for fulfilment outside tolerance.

Open quantity = ordered − fulfilled, and is zero once Fulfilled or Short-closed.

## Consequences

- Pending-order and pending-PO reports stay clean.
- Invoices use actual delivered quantities.
- Applies equally to Sales Orders, Purchase Orders, Requisitions and Production Orders.

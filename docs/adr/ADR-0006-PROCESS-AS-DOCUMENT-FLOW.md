# ADR-0006: Process = document flow with typed links + process definitions + optional anchors

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 2 §5](../01-discovery/STEP-02-DOMAIN-MODEL.md#5-processes-and-process-objects)

## Context

The brief asks how to model "process objects" (Lead → … → Payment; PR → … → Payment).
Real flows are many-to-many and partial (1 SO → 3 deliveries; 2 deliveries → 1 invoice;
1 payment → 2 invoices).

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| A. BPM process instance owns the flow | Visual, explicit | Fails on many-to-many; duplicate state; heavy engine |
| B. Document flow (typed links between documents) | Handles split/merge/partial; proven in mature ERPs | No single "case" view without extra work |
| **C. B + configurable process definitions + optional anchor objects** | Correct, configurable, with case view where useful | A few more concepts |

## Decision

Each document has its own lifecycle. Documents and lines are connected by typed links:
**created-from, fulfils, settles, references**, carrying quantity/amount where relevant; open
quantities and amounts are derived from links. A **process definition** (configuration) states
which document types may be created from which and which steps are optional. Long-running work
may use an **anchor object** (Printing Job, Pharma Batch, Project) that documents point to.

## Consequences

- The document framework (kernel K6) owns links and open-quantity calculation.
- "Pending" reports (pending SO, pending GRN vs PO, outstanding invoices) come from link structure.
- No generic BPM engine is needed for document flows; the workflow engine handles approvals only.

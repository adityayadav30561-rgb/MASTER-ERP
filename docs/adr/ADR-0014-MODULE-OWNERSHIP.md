# ADR-0014: Module boundaries are drawn by ownership

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 3 §2–§6](../01-discovery/STEP-03-MODULE-BOUNDARIES.md#5-the-hard-boundary-calls)

## Context

Modules drawn by department or by end-to-end process lead to shared documents and split ledgers
(for example, Purchase and Stores both "owning" the GRN, or stock posted from three modules).

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| By department / menu | Familiar | Ownership disputes become hidden coupling |
| By end-to-end process | Matches process explanations | Splits Inventory and Accounting across modules |
| **By business capability and ownership** | One owner for every document, facet and ledger | Boundary cases need explicit decisions |

## Decision

Every document type, master facet and ledger has exactly one owner module. Specifically:

1. **Inventory is the only writer of the stock ledger.** It owns all physical-movement documents (GRN, delivery, transfer, issue, adjustment, job-work challan). Other modules request movements.
2. **Customer invoices belong to Sales; vendor bills belong to Purchase.** Accounting generates their accounting effect from posting rules.
3. **Estimation is a Sales capability**, with the calculation supplied by the industry package.
4. **The printing Job is defined by the Printing package** on the kernel anchor framework. Modules never reference it by name.
5. **Quality owns decisions; Inventory owns stock status.**
6. **Receipts and payments belong to Accounting** and settle invoices through document links.
7. **Masters are a shared core (Foundation) plus module-owned facets.**

## Consequences

- Clear answers to "where does this rule live?".
- Warehouses gain a *third-party location* type for stock held at job workers (refines ADR-0004; detailed in Step 8).

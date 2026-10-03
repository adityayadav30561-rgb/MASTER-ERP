# ADR-0018: Customer-specific product specification, reused across repeat orders

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 4 §5.1](../01-discovery/STEP-04-PROCESS-ARCHITECTURE.md#51-customer-product-specification-adr-0018)

## Context

A printer's finished goods are customer-specific (one customer's carton, with its own artwork, die,
plates, board, BOM and routing). Most business is repeat orders of the same product. Re-entering the
specification on every order wastes time and breaks estimate-vs-actual comparison.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Specification only on each order / job | Simple | Re-entry on every repeat; no history per product; plates/dies not linked |
| **Customer product specification** = an Item linked to a customer, with printing attributes, versioned BOM and routing, and links to Artwork, Die, Plate | Repeat orders in seconds; plate/die reuse; history per product | Many items (one per customer product), which is normal in printing |

## Decision

A finished product is an **Item** (Foundation) with a customer link and printing attributes
(Printing package), a versioned **BOM and routing** (Manufacturing), and references to
**Artwork versions, Dies and Plates** (Printing package objects). It is usually created from the
first winning estimate. Repeat Sales Order lines reference it; their production orders copy the
current BOM and routing version ([ADR-0008](ADR-0008-REFERENCE-VS-SNAPSHOT.md)).

## Consequences

- Item search and lists need a customer filter.
- An artwork change creates a new artwork version and may create a new BOM version. Old plates are blocked.
- Estimates for repeat orders start from the specification.

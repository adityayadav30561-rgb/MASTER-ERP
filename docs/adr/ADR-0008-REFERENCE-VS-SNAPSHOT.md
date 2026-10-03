# ADR-0008: Masters are referenced; contractual and legal data is snapshotted

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 2 §9](../01-discovery/STEP-02-DOMAIN-MODEL.md#9-reference-vs-snapshot-copy--the-rule)

## Context

If an invoice only *points* to the customer's address, item description and tax rate, then
editing the master later silently changes old invoices. If it copies everything, reporting by
customer/item becomes impossible.

## Decision

Documents **reference** master identities (party, item, warehouse) for reporting, and
**snapshot** what was promised or legally stated at that moment: addresses, GSTIN, item
descriptions, HSN, tax rates and computations, prices, discounts, terms, exchange rates.
Production orders reference the BOM version and store the exploded components. Workflow
instances reference the workflow definition version.

## Consequences

- Document schemas carry both reference ids and snapshot fields.
- Master edits never alter historical documents.
- Defaults are inherited once, at creation, then stored.

# ADR-0007: Posted documents and ledger entries are immutable

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 2 §10](../01-discovery/STEP-02-DOMAIN-MODEL.md#10-immutability-correction-and-versioning)

## Context

Stock and money must be auditable. Tax law and auditors expect that issued documents are not
silently changed.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Editable posted documents with audit log | Convenient for users | Ledgers no longer match documents; audit nightmare; legally unacceptable for invoices |
| **Immutable after posting; correct by cancel / reverse / amend / corrective document** | Standard accounting practice; reproducible balances | Users need correction flows; more documents |

## Decision

Once a document is confirmed/posted it cannot be edited. Corrections happen by **cancel**
(with reversing ledger entries, only if no follow-on documents), **amend** (new revision, old kept),
or a **corrective document** (credit note, return, stock adjustment). Ledger entries and audit
entries are never updated or deleted. Closed periods accept no postings.

## Consequences

- Every document type needs defined cancel/amend/correct behaviour.
- Balances are always reproducible from ledgers.
- UX must make corrections easy, or users will demand "just let me edit".

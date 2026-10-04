# ADR-0029: Numbering series; statutory numbers are gapless and assigned at posting

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 5 §9](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#9-numbering); question [Q-26](../tracking/OPEN-QUESTIONS.md#q-26)

## Context

Brief §33 requires configurable numbering by company, site, financial year and document type. Indian GST requires tax invoices, notes and delivery challans to carry consecutive numbers that are unique per financial year, at most 16 characters, with limited characters.

## Decision

- A **series** = document type + scope (company, optional site, optional FY) + **pattern** (tokens such as `{FY}` and `{SEQ:n}`) + **reset policy** + **allocation moment** + **gap policy**.
- **Statutory documents:**
  - Numbers are assigned **at posting**, inside the posting transaction, from a locked counter, so there are no gaps.
  - Cancelled documents keep their number; numbers are never reused.
  - Drafts carry temporary ids.
  - The India pack **locks** the format constraints.
- **Operational documents** may be numbered at creation, and gaps are allowed.
- **Migration:** series continue from the customer's last legacy number.

## Consequences

- The numbering counter is a short serialisation point per series (acceptable at SME volumes).
- Pattern validation runs at configuration time (≤ 16 characters for GST series).

## Implementation notes (kernel minimum, 2026-10-04)

- Built ([§3.5](../03-implementation/KERNEL-MINIMUM.md#35-document-framework-k6-adr-0005-0006-0007-0029)): series per type/company/optional site, period reset, tokens, India locks (max length, allowed characters), gapless allocation from a locked counter inside the posting transaction (verified with 25 concurrent postings and failures), legacy seeding. The number is assignable once on a locked document.

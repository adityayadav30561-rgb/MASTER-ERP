# ADR-0052: Data lifecycle, master-data quality and migrations

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 8A §3–§6](../01-discovery/STEP-08A-REPORTING-SEARCH-AND-DATA-LIFECYCLE.md#4-master-data-quality); question [Q-50](../tracking/OPEN-QUESTIONS.md#q-50)

## Context

Data must be kept as long as the law requires and no longer (DPDP). Masters must stay clean. The schema must evolve without breaking tenants, and onboarding imports must be trustworthy.

## Decision

- **Retention:**
  - documents, ledgers, vouchers and audit: ≥ 8 years
  - security log: ≥ 180 days in India (1 year recommended)
  - notification logs: 1 year
  - processed jobs: 30 days
  - abandoned drafts: deleted after 180 days (configurable)
  - personal data: anonymised when no longer needed
- **Archiving:** big append-only tables partitioned by period; older partitions compressed and moved to cheaper storage.
- **Tenant exit:** full export → grace period → deletion → confirmation.
- **Files:** object storage plus metadata (checksum, sniffed type, class, version, scan status). **Issued statutory PDFs stored once, unchangeable.**
- **Master data:**
  - uniqueness (PAN/GSTIN, codes) and duplicate warnings (identifiers + name similarity)
  - optional approval for new vendors and bank changes
  - lifecycle Draft → Active → Blocked → Archived
  - **merge** via a "merged into" survivor, without rewriting posted history
  - effective dating for versioned masters
- **Migrations:** versioned, forward-only, **expand → migrate → contract**, run across all databases in the tenant directory, tested on anonymised copies.
- **Imports:** staging tables → validation report → dry run → **opening balances posted as documents**.

## Consequences

- Retention and deletion jobs are part of the platform.
- Import templates and validation are MVP features.

# ADR-0034: Approval authority separate from permission; delegation; segregation-of-duties matrix with modes

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 6 §6–§7](../01-discovery/STEP-06-SECURITY-ARCHITECTURE.md#6-approval-authority-and-delegation); question [Q-32](../tracking/OPEN-QUESTIONS.md#q-32)

## Context

"Can approve" and "up to how much" are different questions. SMEs need fraud controls (fake vendors, bank-detail changes, hidden stock write-offs), but one person often holds several roles, so blocking every conflict would make the system unusable.

## Decision

- **Approval authority:**
  - Limits per role assignment and document type, in company currency, optionally varying by category (decision tables).
  - **Delegation** is time-boxed and audited, with no re-delegation.
  - **Self-approval within limit** is auto-completed and recorded, unless blocked by an SoD rule.
- **Segregation of duties:** a conflict matrix where each rule has a mode: **block**, **warn + log** or **allow**.
  - SME default is warn + log, with an SoD exceptions report for the owner and auditor.
  - **Locked to block:** bank-detail change followed by payment within N days; posting and approving the same stock adjustment.

## Consequences

- Owners get fraud visibility without operational paralysis.
- Auditors get a ready report.

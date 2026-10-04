# ADR-0036: Business audit trail (cannot be disabled, hash-chained, ≥ 8 years) and security log (≥ 180 days in India)

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-03
- **Discovery step:** [Step 6A §3](../01-discovery/STEP-06A-ISOLATION-AUDIT-PRIVACY-AND-OPERATIONS.md#3-audit-two-logs); question [Q-34](../tracking/OPEN-QUESTIONS.md#q-34)

## Context

Indian rules require accounting software to keep an audit trail (edit log) that cannot be disabled, and books of account must be kept for 8 years. CERT-In Directions (2022) require ICT logs to be kept for 180 days within India. Customers and auditors must trust that history was not altered.

## Decision

- **Business audit trail:**
  - Field-level old/new values; who, including on-behalf-of (delegation, automation, support); when (synchronised UTC); why (reasons for corrections).
  - Written in the **same transaction** as the change.
  - **Append-only**, with no update or delete rights for anyone.
  - **Hash-chained per tenant** for tamper evidence.
  - **Cannot be disabled.** Retention is at least 8 years.
- **Security log:**
  - Authentication, authorization changes, step-up events, exports, API key use, support access and configuration changes.
  - Stored separately, out of reach of application admins.
  - Retention is at least 180 days in India (recommended 1 year).

## Consequences

- Audit volume needs partitioning and archiving (Step 8).
- Owner and auditor views plus audit export are MVP features.

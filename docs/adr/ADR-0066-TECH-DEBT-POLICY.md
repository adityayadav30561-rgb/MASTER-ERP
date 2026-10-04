# ADR-0066: Technical-debt policy — allowed vs forbidden shortcuts, register, 20% slice budget, review triggers

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** Step 10 — [Risks & Tech Debt §2](../02-blueprint/RISKS-AND-TECH-DEBT.md#2-technical-debt-strategy); question [Q-64](../tracking/OPEN-QUESTIONS.md#q-64)

## Context

A solo developer under time pressure will take shortcuts. Some are healthy; some silently corrupt data or trust.

## Decision

- **Allowed shortcuts:** recorded in the **Tech-Debt Register**, each with a cost and a **repay-when trigger** (e.g. manual billing until more than 10 tenants).
- **Forbidden shortcuts (never):**
  - floating-point money
  - writing stock or vouchers outside the ledger services
  - editing posted documents
  - skipping tenant isolation or its tests
  - disabling the audit trail
  - cross-module table access
  - industry conditionals in core or modules
  - customer-specific core code
  - hand-written cryptography
  - secrets in Git, packages or logs
  - real customer data on unbacked databases
- **About 20% of each slice** is reserved for debt repayment.
- The register is reviewed at the end of each slice. ADR graduation triggers are monitored.
- **CI quality gates** block boundary violations, failing tenant or authorization tests, ledger property failures, leaked secrets and critical vulnerabilities.

## Consequences

- Speed without silent damage; debt is visible to the founder.

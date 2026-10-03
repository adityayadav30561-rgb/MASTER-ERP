# Risk Register

> **Status:** Living document · **Last updated:** 2026-10-03

## TL;DR

The biggest risks are **not technical**: building too much before validating with a customer,
and the inner-platform trap (making everything configurable). Technical risks are manageable
with a modular monolith and PostgreSQL.

| ID | Risk | Likelihood | Impact | Mitigation | Owner step |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Building breadth before a paying customer** (many modules, none complete) | High | Critical | One vertical end-to-end; MVP defined by a real pilot's processes ([Q-10](OPEN-QUESTIONS.md#q-10)) | Roadmap |
| R-02 | **Inner-platform effect** — generic builders for objects/rules/forms consume years | High | Critical | Configuration files first; custom fields + approvals only; builders after ≥3 customers | Step 5 |
| R-03 | Solo-developer bandwidth / burnout | High | Critical | Narrow MVP; reuse proven libraries; no exotic infrastructure | Roadmap |
| R-04 | Customer data loss (free-tier DB, no backups) | Medium | Critical | Managed Postgres with point-in-time backups for any real customer; tested restores | Step 9 |
| R-05 | Wrong accounting/GST behaviour causes legal exposure for the customer | Medium | High | Tally export first ([Q-03](OPEN-QUESTIONS.md#q-03)); review by a CA; test cases from real invoices | Step 4/8 |
| R-06 | Tenant data leak (one customer sees another's data) | Low | Critical | Tenant isolation enforced at database level (e.g., Row-Level Security) + automated tests | Step 6/8 |
| R-07 | Pharma ambition pulls in validation/compliance scope prematurely | Medium | High | Pharma as design test only ([Q-02](OPEN-QUESTIONS.md#q-02)) | Step 1 |
| R-08 | Module boundaries erode inside the monolith | Medium | High | Enforce with tooling (lint rules / architecture tests) from the first commit | Step 9 |
| R-09 | Configurable states break cross-module invariants | Medium | High | Two-level state model ([ADR-0005](../adr/ADR-0005-LIFECYCLE-VS-WORKFLOW.md)) | Step 2 |
| R-10 | Design based on textbook processes, not real Indian SME practice | High | High | Interviews with real printing companies before Step 4 | Step 4 |
| R-11 | Shop-floor users don't adopt the system (complex UI, poor mobile) | Medium | High | Role-specific simple screens; mobile-first for stores and shop floor | UX |
| R-12 | Upgrades break customer configurations | Medium | High | Versioned packages; no core modification; migration tests on real configurations | Step 5 |
| R-13 | Missing job-work support makes the product unusable for printers who outsource operations | Medium | High | Designed in Step 3 §5.7; decide [Q-13](OPEN-QUESTIONS.md#q-13) | Step 3 |
| R-14 | Accountant refuses the ERP as entry point for receipts/payments (Tally habits) | Medium | Medium | Fallback: import from Tally ([Q-14](OPEN-QUESTIONS.md#q-14)) | Step 3 |

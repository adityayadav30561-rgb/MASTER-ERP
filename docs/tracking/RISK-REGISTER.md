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
| R-04 | Customer data loss (free-tier DB, no backups) | Low | Critical | Managed PostgreSQL with PITR from first real data; Hyderabad backup copies; monthly restore drills ([ADR-0059](../adr/ADR-0059-HOSTING-AND-DEPLOYMENT.md)) | Step 9 |
| R-05 | Wrong accounting/GST behaviour causes legal exposure for the customer | Medium | High | Tally export first ([Q-03](OPEN-QUESTIONS.md#q-03)); review by a CA; test cases from real invoices | Step 4/8 |
| R-06 | Tenant data leak (one customer sees another's data) | Low | Critical | Layered isolation: tenant context + Row-Level Security + cross-tenant tests ([ADR-0035](../adr/ADR-0035-TENANT-ISOLATION.md)) | Step 6/8 |
| R-07 | Pharma ambition pulls in validation/compliance scope prematurely | Medium | High | Pharma as design test only ([Q-02](OPEN-QUESTIONS.md#q-02)) | Step 1 |
| R-08 | Module boundaries erode inside the monolith | Low | High | dependency-cruiser rules + architecture tests in CI ([ADR-0054](../adr/ADR-0054-BACKEND-STRUCTURE-AND-BOUNDARIES.md)) | Step 9 |
| R-09 | Configurable states break cross-module invariants | Medium | High | Two-level state model ([ADR-0005](../adr/ADR-0005-LIFECYCLE-VS-WORKFLOW.md)) | Step 2 |
| R-10 | Design based on textbook processes, not real Indian SME practice | Medium | High | Founder decision: standard-practice baseline ([ADR-0061](../adr/ADR-0061-STANDARD-PRACTICE-BASELINE.md)); configuration-first design absorbs differences; first customer onboarding captures real practice; informal printer conversation before Slice 2 recommended | Step 4 / Roadmap |
| R-11 | Shop-floor users don't adopt the system (complex UI, poor mobile) | Medium | High | Role-specific simple screens; mobile-first for stores and shop floor | UX |
| R-12 | Upgrades break customer configurations | Medium | High | Versioned packages; no core modification; migration tests on real configurations | Step 5 |
| R-13 | Missing job-work support makes the product unusable for printers who outsource operations | Medium | High | Designed in Step 3 §5.7; decide [Q-13](OPEN-QUESTIONS.md#q-13) | Step 3 |
| R-14 | Accountant refuses the ERP as entry point for receipts/payments (Tally habits) | Medium | Medium | Fallback: import from Tally ([Q-14](OPEN-QUESTIONS.md#q-14)) | Step 3 |
| R-15 | **Step 4 processes are a standard-practice baseline, not yet seen in a real company** | Medium | High | Slice-by-slice go-live with the first customer; [Pilot Interview Guide](PILOT-INTERVIEW-GUIDE.md) used during onboarding; changes via configuration first ([ADR-0061](../adr/ADR-0061-STANDARD-PRACTICE-BASELINE.md)) | Roadmap |
| R-16 | GST portal (e-invoice / e-way bill) outage blocks dispatch | Medium | High | Integration jobs with retries, circuit breaker, queue banner, manual resolution ([ADR-0046](../adr/ADR-0046-INTEGRATION-JOBS-AND-WEBHOOKS.md)) | Step 4/7 |
| R-17 | Customer-owned stock not modelled, discovered after go-live | Medium | High | Ownership dimension in stock ledger design ([Q-16](OPEN-QUESTIONS.md#q-16)) | Step 4/8 |
| R-19 | Configuration grows into a programming language (inner-platform effect) | Medium | Critical | CEL limited by design; no scripting; complex logic as versioned extension code ([ADR-0028](../adr/ADR-0028-CEL-AND-DECISION-TABLES.md)) | Step 5 |
| R-20 | Go-live data migration errors (wrong opening stock / outstanding) | Medium | High | Import templates with validation, staging dress rehearsal, physical count, accountant sign-off ([ADR-0031](../adr/ADR-0031-GO-LIVE-WITH-OPENING-BALANCES.md)) | Step 5 |
| R-21 | Account takeover of owner/accountant (phishing, reused passwords) | Medium | Critical | Mandatory MFA for privileged roles; breached-password checks; new-device alerts; step-up for bank changes ([ADR-0032](../adr/ADR-0032-AUTHENTICATION.md)) | Step 6 |
| R-22 | Insider fraud (fake vendor, bank-detail change, stock write-off) | Medium | High | SoD matrix, locked block rules, SoD report, audit trail ([ADR-0034](../adr/ADR-0034-APPROVAL-AUTHORITY-AND-SOD.md)) | Step 6 |
| R-23 | Departing employee exports customer lists / prices | Medium | High | Field security, export permission + step-up + watermark + volume alerts | Step 6 |
| R-24 | Shared shop-floor accounts destroy accountability | High | Medium | Registered device + personal PIN mode ([ADR-0032](../adr/ADR-0032-AUTHENTICATION.md)) | Step 6 |
| R-25 | Automation loops / event storms | Low | High | Causation chain, depth limit, rate limits, dry-run ([ADR-0043](../adr/ADR-0043-AUTOMATION-RULES.md)) | Step 7 |
| R-26 | Approvals stuck (approver left / on leave) | Medium | Medium | Fallback approver, escalation, delegation, stuck-approval report ([ADR-0044](../adr/ADR-0044-APPROVAL-WORKFLOW-ENGINE.md)) | Step 7 |
| R-27 | Notification fatigue or unexpected WhatsApp/SMS costs | Medium | Medium | Digests, preferences, cost caps, paid channels as add-ons ([ADR-0045](../adr/ADR-0045-NOTIFICATION-ENGINE.md)) | Step 7 |
| R-28 | Derived balances drift from ledgers | Low | High | Same-transaction updates, nightly comparison, rebuild job ([ADR-0050](../adr/ADR-0050-LEDGERS-VALUATION-AND-CONCURRENCY.md)) | Step 8 |
| R-29 | Back-dated entries confuse costs | Medium | Medium | Variance entries, open-period limit, month-end valuation check | Step 8 |
| R-30 | Per-tenant restore is slow or untested in a real incident | Medium | High | Tooled procedure, monthly drill including a single-tenant restore ([ADR-0048](../adr/ADR-0048-MULTI-TENANCY-LAYOUT.md)) | Step 8 |
| R-31 | Decimal/rounding errors in JavaScript | Medium | High | Decimal value types, strings on the wire, lint rule, property-based tests, spike S4 ([ADR-0053](../adr/ADR-0053-LANGUAGE-AND-RUNTIME.md)) | Step 9 |
| R-32 | Young libraries (CEL for JS, Better Auth) prove immature | Medium | Medium | Spikes S1/S2 with defined fallbacks; libraries behind ports | Step 9 |
| R-33 | Hosting prices or features change | Medium | Low | Portable image, standard PostgreSQL, S3 API; alternative provider documented ([ADR-0059](../adr/ADR-0059-HOSTING-AND-DEPLOYMENT.md)) | Step 9 |
| R-18 | ERP and Tally drift apart (manual edits in Tally) | Medium | Medium | Export locks, books-locked date, monthly reconciliation report ([ADR-0022](../adr/ADR-0022-TALLY-EXPORT-GRANULARITY.md)) | Step 4 |

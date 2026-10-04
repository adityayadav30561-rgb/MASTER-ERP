# Documentation Index

> **Last updated:** 2026-10-03

## Suggested reading order (new reader)

1. [Project Brief](00-context/PROJECT-BRIEF.md) — the vision and constraints
2. [Story So Far](00-context/STORY-SO-FAR.md) — plain-language explanation of Steps 1–7
3. [Current State](00-context/CURRENT-STATE.md) — where we are
4. [Step 1 — Platform Definition](01-discovery/STEP-01-PLATFORM-DEFINITION.md)
5. [Step 2 — Domain Model](01-discovery/STEP-02-DOMAIN-MODEL.md)
6. [Step 3 — Module Boundaries](01-discovery/STEP-03-MODULE-BOUNDARIES.md)
7. [Step 4 — Process Architecture](01-discovery/STEP-04-PROCESS-ARCHITECTURE.md) (then the process file you need)
8. [Step 5 — Configuration Architecture](01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md) (+ 5A)
9. [Step 6 — Security Architecture](01-discovery/STEP-06-SECURITY-ARCHITECTURE.md) (+ 6A)
10. [Step 7 — Events and Automation](01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md) (+ 7A)
11. [Decision Log sheet](tracking/DECISION-LOG.csv) and [Open Questions](tracking/OPEN-QUESTIONS.md)
12. Keep the [Glossary](00-context/GLOSSARY.md) open alongside

## All documents

### 00 — Context
| Document | Purpose |
| --- | --- |
| [PROJECT-BRIEF](00-context/PROJECT-BRIEF.md) | Condensed vision, requirements, constraints, discovery method |
| [STORY-SO-FAR](00-context/STORY-SO-FAR.md) | Plain-language explanation of everything decided so far — for explaining to others |
| [CURRENT-STATE](00-context/CURRENT-STATE.md) | Session hand-off: progress, conclusions, next step |
| [GLOSSARY](00-context/GLOSSARY.md) | ERP and architecture terms in plain language |
| [DOC-CONVENTIONS](00-context/DOC-CONVENTIONS.md) | How we write documents, diagrams and ADRs |
| [STANDARDS](00-context/STANDARDS.md) | Industry standards and laws we follow (standards-first, ADR-0023) |

### 01 — Discovery
| Step | Document | Status |
| --- | --- | --- |
| 1 | [Platform Definition](01-discovery/STEP-01-PLATFORM-DEFINITION.md) — what we build; core vs modules vs packages vs config vs integrations | Accepted |
| 2 | [Domain Model](01-discovery/STEP-02-DOMAIN-MODEL.md) — organization, access, objects, processes, states, events, rules, ledgers | Accepted |
| — | [Preliminary Roadmap Critique](01-discovery/PRELIM-ROADMAP-CRITIQUE.md) — critique of brief §37; vertical slices proposal | Accepted (ADR-0012) |
| 3 | [Module Boundaries](01-discovery/STEP-03-MODULE-BOUNDARIES.md) — ownership, dependencies, communication, manifests, extension points, editions | Accepted |
| 4 | [Process Architecture](01-discovery/STEP-04-PROCESS-ARCHITECTURE.md) — overview: landscape, personas, cross-cutting patterns, modelling consequences | Accepted (pending pilot validation) |
| 4A | [Order-to-Cash](01-discovery/STEP-04A-ORDER-TO-CASH.md) — enquiry, estimate, artwork, order, job, dispatch, invoice, receipt | Accepted (pending pilot validation) |
| 4B | [Procure-to-Pay](01-discovery/STEP-04B-PROCURE-TO-PAY.md) — requisition, PO, GRN, reels, QC, three-way match, payment | Accepted (pending pilot validation) |
| 4C | [Plan-to-Produce](01-discovery/STEP-04C-PLAN-TO-PRODUCE.md) — production orders, material, job cards, job work, costing | Accepted (pending pilot validation) |
| 4D | [Inventory & Quality](01-discovery/STEP-04D-INVENTORY-AND-QUALITY.md) — stock structure, movements, reels, valuation, counts, inspections | Accepted (pending pilot validation) |
| 4E | [Returns, Corrections & Accounting](01-discovery/STEP-04E-RETURNS-CORRECTIONS-AND-ACCOUNTING.md) — correction documents, Tally bridge | Accepted (pending pilot validation) |
| 5 | [Configuration Architecture](01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md) — layers, two stores, catalogue, metadata, UI, rules, numbering, templates, custom objects, guardrails | Accepted |
| 5A | [Packages, Upgrades & Onboarding](01-discovery/STEP-05A-PACKAGES-UPGRADES-AND-ONBOARDING.md) — package anatomy, Printing & India inventories, versioning, upgrades, onboarding, go-live data | Accepted |
| 6 | [Security Architecture](01-discovery/STEP-06-SECURITY-ARCHITECTURE.md) — threat model, authentication, authorization (8 checks), field security, approval authority, SoD, support access, default roles | Accepted |
| 6A | [Isolation, Audit, Privacy & Operations](01-discovery/STEP-06A-ISOLATION-AUDIT-PRIVACY-AND-OPERATIONS.md) — data classes, tenant isolation, audit logs, DPDP, encryption, ASVS L2, backups, incidents | Accepted |
| 7 | [Events and Automation](01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md) — event model, in-transaction vs after-commit, outbox, no broker, no event sourcing, automation rules, schedules, integration jobs, webhooks | In review |
| 7A | [Workflow and Notifications](01-discovery/STEP-07A-WORKFLOW-AND-NOTIFICATIONS.md) — approval engine (steps, resolvers, SLA, escalation, delegation, inbox), notification pipeline and channels | In review |
| 8 | Data Architecture | Not started |
| 9 | Technical Architecture | Not started |
| 10 | Master Blueprint | Not started |

### ADR — Architecture Decision Records
See [adr/README.md](adr/README.md) (index of all ADRs with status).

### Tracking
| Document | Purpose |
| --- | --- |
| [DECISION-LOG.csv](tracking/DECISION-LOG.csv) | **The sheet:** every question and decision — options, recommendation, final decision, status, ADR (opens in Excel / Google Sheets) |
| [OPEN-QUESTIONS](tracking/OPEN-QUESTIONS.md) | Detailed write-up of each question with its recommendation |
| [RISK-REGISTER](tracking/RISK-REGISTER.md) | Major risks and mitigations |
| [PILOT-INTERVIEW-GUIDE](tracking/PILOT-INTERVIEW-GUIDE.md) | Questions and document checklist to validate Step 4 with a real printing company |
| [COVERAGE-MATRIX](tracking/COVERAGE-MATRIX.md) | Every section of the founder's brief → where it is covered or which step will cover it |

# Architecture Decision Records (ADRs)

> **Status:** Living index · **Last updated:** 2026-10-03

## TL;DR

An ADR records **one** important decision: why it was needed, which options were compared,
what we chose and what it costs us. ADRs are never deleted — a changed decision gets a new ADR
that supersedes the old one. Only the founder moves an ADR from **Proposed** to **Accepted**.

## Index

| ADR | Title | Status | From |
| --- | --- | --- | --- |
| [0001](ADR-0001-DOCUMENTATION-FIRST.md) | Documentation-first, Markdown + Mermaid in the repository | Accepted | Founder request |
| [0002](ADR-0002-LAYERED-PRODUCT-MODEL.md) | Seven-layer product model with integration axis | Accepted | Step 1 |
| [0003](ADR-0003-MODULAR-MONOLITH-DIRECTION.md) | Modular monolith as architectural direction | Accepted in principle | Brief; revalidate in Step 9 |
| [0004](ADR-0004-ORGANIZATION-MODEL.md) | Organization = separate typed structures + configurable grouping (Tenant = Organization; multi-company model) | Accepted | Step 2 |
| [0005](ADR-0005-LIFECYCLE-VS-WORKFLOW.md) | Fixed core lifecycle + configurable sub-status and approval workflow | Accepted | Step 2 |
| [0006](ADR-0006-PROCESS-AS-DOCUMENT-FLOW.md) | Process = document flow with typed links + optional anchors | Accepted | Step 2 |
| [0007](ADR-0007-IMMUTABLE-POSTED-DOCUMENTS.md) | Posted documents and ledger entries are immutable | Accepted | Step 2 |
| [0008](ADR-0008-REFERENCE-VS-SNAPSHOT.md) | Masters referenced, contractual data snapshotted | Accepted | Step 2 |
| [0009](ADR-0009-MARKET-AND-FIRST-VERTICAL.md) | Market, positioning and first vertical (Printing & Packaging, India) | Accepted | Q-01, Q-02, Q-05 |
| [0010](ADR-0010-ACCOUNTING-VIA-TALLY-FIRST.md) | GST-correct invoicing + Tally export first; native GL later | Accepted | Q-03 |
| [0011](ADR-0011-CONFIGURATION-AS-PACKAGES.md) | Year-1 configuration as version-controlled packages | Accepted | Q-04 |
| [0012](ADR-0012-VERTICAL-SLICE-ROADMAP.md) | Vertical-slice roadmap | Accepted | Q-11 |
| [0013](ADR-0013-PARTY-WITH-ROLES.md) | One Party master with roles | Accepted | Q-07 |
| [0014](ADR-0014-MODULE-OWNERSHIP.md) | Module boundaries by ownership | Accepted | Step 3 |
| [0015](ADR-0015-INTER-MODULE-COMMUNICATION.md) | Four inter-module communication patterns; contracts only | Accepted | Step 3 |
| [0016](ADR-0016-DEPENDENCY-TYPES-AND-MANIFESTS.md) | Dependency types, without-modes, module manifests | Accepted | Step 3 |
| [0017](ADR-0017-SINGLE-EDITION-YEAR-ONE.md) | Year 1 sells one edition; entitlements from day one | Accepted | Step 3 |
| [0018](ADR-0018-CUSTOMER-PRODUCT-SPECIFICATION.md) | Customer-specific product specification reused across repeat orders | Accepted | Step 4 |
| [0019](ADR-0019-WIP-BY-JOB-OPERATION.md) | WIP tracked per job operation | Accepted | Step 4 |
| [0020](ADR-0020-TOLERANCE-AND-SHORT-CLOSE.md) | Tolerance and short-close in the core lifecycle | Accepted | Step 4 |
| [0021](ADR-0021-WEIGHTED-AVERAGE-VALUATION.md) | Moving weighted-average valuation (MVP) | Accepted | Step 4 |
| [0022](ADR-0022-TALLY-EXPORT-GRANULARITY.md) | Voucher-level Tally export, export locks, books-locked date | Accepted | Step 4 |
| [0023](ADR-0023-STANDARDS-FIRST.md) | Standards-first: follow recognised industry standards | Accepted | Founder instruction |
| [0024](ADR-0024-CONFIGURATION-LAYERS-AND-STORES.md) | Layered configuration (override / extend / lock); packages + runtime settings | Accepted | Step 5 |
| [0025](ADR-0025-PACKAGE-FORMAT.md) | Package format: YAML + JSON Schema, manifest, SemVer, migrations, tests | Accepted | Step 5 |
| [0026](ADR-0026-EXTENSION-FIELDS-STORAGE.md) | Extension fields as metadata-validated JSON data | Accepted | Step 5 |
| [0027](ADR-0027-HYBRID-UI-AND-TERMINOLOGY.md) | Hybrid UI and configurable terminology | Accepted | Step 5 |
| [0028](ADR-0028-CEL-AND-DECISION-TABLES.md) | CEL conditions + decision tables; no scripting in MVP | Accepted | Step 5 |
| [0029](ADR-0029-NUMBERING.md) | Numbering series; statutory numbers gapless at posting | Accepted | Step 5 |
| [0030](ADR-0030-PACKAGE-UPGRADES.md) | Pinned package versions; staging dry-run; three-way merge | Accepted | Step 5 |
| [0031](ADR-0031-GO-LIVE-WITH-OPENING-BALANCES.md) | Go live with opening balances and open items, not history | Accepted | Step 5 |
| [0032](ADR-0032-AUTHENTICATION.md) | Authentication: library, OIDC-compatible, NIST passwords, MFA for privileged roles, shop-floor PIN | Accepted | Step 6 |
| [0033](ADR-0033-AUTHORIZATION-MODEL.md) | Authorization: scoped RBAC + CEL conditions + field security, deny by default | Accepted | Step 6 |
| [0034](ADR-0034-APPROVAL-AUTHORITY-AND-SOD.md) | Approval authority, delegation, segregation of duties | Accepted | Step 6 |
| [0035](ADR-0035-TENANT-ISOLATION.md) | Layered tenant isolation with Row-Level Security | Accepted | Step 6 |
| [0036](ADR-0036-AUDIT-AND-LOGGING.md) | Business audit trail + security log | Accepted | Step 6 |
| [0037](ADR-0037-PRIVACY-AND-ENCRYPTION.md) | Privacy (DPDP), classification, India hosting, encryption, secrets | Accepted | Step 6 |
| [0038](ADR-0038-SECURITY-BASELINE-AND-OPERATIONS.md) | OWASP ASVS L2, backups, RPO/RTO, incident response | Accepted | Step 6 |
| [0039](ADR-0039-SUPPORT-ACCESS.md) | No standing operator access; approved support access | Accepted | Step 6 |
| [0040](ADR-0040-EVENT-MODEL.md) | Event model: domain vs integration events, CloudEvents, trace correlation | Proposed | Step 7 |
| [0041](ADR-0041-OUTBOX-AND-DELIVERY.md) | Transactional outbox + Postgres job queue; idempotent consumers; no broker yet | Proposed | Step 7 |
| [0042](ADR-0042-NO-EVENT-SOURCING.md) | No event sourcing; ledgers + audit + outbox | Proposed | Step 7 |
| [0043](ADR-0043-AUTOMATION-RULES.md) | Automation rules with fixed action catalogue and loop protection | Proposed | Step 7 |
| [0044](ADR-0044-APPROVAL-WORKFLOW-ENGINE.md) | Own small approval workflow engine | Proposed | Step 7 |
| [0045](ADR-0045-NOTIFICATION-ENGINE.md) | Notification engine; MVP in-app + email; WhatsApp/SMS later | Proposed | Step 7 |
| [0046](ADR-0046-INTEGRATION-JOBS-AND-WEBHOOKS.md) | Integration jobs, circuit breaker, Standard Webhooks | Proposed | Step 7 |

## Lifecycle of an ADR

```mermaid
stateDiagram-v2
    [*] --> Proposed : written by architect
    Proposed --> Accepted : founder agrees
    Proposed --> Rejected : founder disagrees
    Accepted --> Superseded : a newer ADR replaces it
    Rejected --> [*]
    Superseded --> [*]
```

## Template

```markdown
# ADR-NNNN: Title

- **Status:** Proposed | Accepted | Rejected | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Discovery step:** Step N (link)

## Context
What problem forces a decision? What constraints apply?

## Options considered
| Option | Pros | Cons |

## Decision
What we choose, in one or two sentences.

## Consequences
What becomes easier, what becomes harder, what we must now do.

## What is configurable / what stays fixed
```

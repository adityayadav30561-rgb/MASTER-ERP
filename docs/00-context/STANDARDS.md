# Industry Standards Register

> **Status:** Living document · **Last updated:** 2026-10-03
> **Principle:** [ADR-0023](../adr/ADR-0023-STANDARDS-FIRST.md) — *where a recognised industry standard exists, we follow it instead of inventing our own* (founder's instruction, 2026-10-03).

## TL;DR

- This register lists every external standard, law or widely accepted convention the platform follows, **where** we use it, and its status.
- **Adopted** = we already follow it in the design. **Planned** = it will apply when we reach that area. **Reference** = we align with it, but don't claim compliance.
- When a design decision touches an area with a standard, the ADR must cite it. If we deliberately deviate, the ADR must say why.

---

## 1. Why standards matter for us

```mermaid
flowchart LR
    S["Follow recognised standards"] --> A["Customers and auditors trust it<br/>(GST, audit trail, security)"]
    S --> B["Integrations are easier<br/>(OpenAPI, OAuth, ISO codes)"]
    S --> C["Developers learn it faster<br/>(SemVer, JSON Schema, BPMN)"]
    S --> D["Fewer design debates<br/>(the standard already decided)"]
```

## 2. Legal and statutory (India first)

| Standard / law | Area | How we use it | Status |
| --- | --- | --- | --- |
| **GST law and rules** (CGST/SGST/IGST, place of supply, invoice contents, credit/debit notes) | India pack | Tax calculation, invoice content, note time limits | Adopted |
| **GST invoice numbering rule** (unique per financial year, max 16 characters, letters, digits, `-` and `/`) | Numbering | Statutory numbering series ([Step 5 §9](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#9-numbering)) | Adopted |
| **GST e-invoice schema** (IRN, signed QR) and **e-way bill** | India pack, integrations | Registration of invoices; movement documents | Adopted |
| **GST UQC** (Unit Quantity Codes) and **HSN/SAC** codes | Foundation (UOM, Item) | Every UOM maps to a UQC; every item to an HSN/SAC | Adopted |
| **Companies (Accounts) Rules — audit trail ("edit log") that cannot be disabled** (applicable from 1 April 2023) | Kernel audit | Immutable audit of every change to books-relevant records | Adopted |
| **Accounting Standard AS 2 / Ind AS 2** (inventory valuation: FIFO or weighted average) | Inventory valuation | Weighted average ([ADR-0021](../adr/ADR-0021-WEIGHTED-AVERAGE-VALUATION.md)) | Adopted |
| **Income-tax TDS/TCS provisions** | India pack | Deductions on receipts/payments | Planned |
| **MSMED Act payment terms + Income-tax s.43B(h)** (45-day payment to micro/small vendors) | Payables | MSME due-date alerts | Adopted |
| **Digital Personal Data Protection Act, 2023** (and its Rules) | Security, privacy | Personal data inventory, consent, retention, breach handling | Planned (Step 6) |

## 3. Architecture, documentation and process modelling

| Standard | How we use it | Status |
| --- | --- | --- |
| **ADR** (Architecture Decision Records, Nygard / MADR style) | Every major decision | Adopted |
| **C4 model** (context, container, component, code diagrams) | Technical architecture diagrams in Step 9 | Planned |
| **arc42** (architecture documentation template) | Structure of the Master Blueprint (Step 10) | Planned |
| **BPMN 2.0** (OMG) | Process semantics; formal BPMN diagrams for the blueprint where flowcharts are not enough | Reference |
| **DMN** (OMG Decision Model and Notation) — decision tables | Approval matrices, rate lookups ([Step 5 §8](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#8-rules-and-the-condition-language)) | Adopted |
| **ISO/IEC 25010** (software quality model) | Non-functional requirements checklist (performance, security, maintainability…) | Planned |

## 4. Data, formats and APIs

| Standard | How we use it | Status |
| --- | --- | --- |
| **ISO 8601** dates/times; UTC storage with tenant time zone | All dates | Adopted |
| **ISO 4217** currency codes | Currency master | Adopted |
| **ISO 3166** country / subdivision codes (and GST state codes) | Addresses, place of supply | Adopted |
| **ISO 639 / BCP 47** language tags | Translations | Adopted |
| **Unicode CLDR** number/date formats (incl. Indian lakh/crore grouping) | UI formatting | Adopted |
| **UN/ECE Recommendation 20** unit codes | UOM master (alongside GST UQC) | Adopted |
| **UTF-8** | All text | Adopted |
| **YAML 1.2** (authoring) + **JSON Schema 2020-12** (validation) | Configuration packages ([Step 5A](../01-discovery/STEP-05A-PACKAGES-UPGRADES-AND-ONBOARDING.md)) | Adopted |
| **CEL** (Common Expression Language) | Condition expressions in rules ([Step 5 §8](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#8-rules-and-the-condition-language)) | Adopted |
| **OpenAPI 3.1** | Public and internal REST API contracts | Planned |
| **RFC 9457** Problem Details | API error format | Planned |
| **CloudEvents** (CNCF) | Event envelope for webhooks and integration events | Planned (Step 7) |
| **Standard Webhooks** | Webhook signing and retries | Planned (Step 7) |
| **QR code (ISO/IEC 18004)**, **GS1** barcodes | Labels, reel tags, e-invoice QR | Planned |

## 5. Security and identity

| Standard | How we use it | Status |
| --- | --- | --- |
| **OWASP ASVS** (Application Security Verification Standard), target **Level 2** | Security requirements and testing checklist | Planned (Step 6) |
| **OWASP Top 10** | Developer awareness and review checklist | Planned |
| **OAuth 2.x / OpenID Connect** | Login, SSO, API access | Planned (Step 6) |
| **NIST SP 800-63B** (digital identity: passwords, MFA) | Password and MFA rules | Planned |
| **ISO/IEC 27001 / 27002** | Control framework for operations; certification later | Reference |
| **CIS Benchmarks** | Server and database hardening | Planned (Step 9) |

## 6. Engineering and operations

| Standard | How we use it | Status |
| --- | --- | --- |
| **Semantic Versioning 2.0** | Platform, modules, packages | Adopted |
| **Conventional Commits** + **Keep a Changelog** | Commit messages and release notes (from the implementation phase) | Planned |
| **Twelve-Factor App** | Configuration, logs, stateless processes, deployment | Planned (Step 9) |
| **OpenTelemetry** | Logs, metrics, traces | Planned (Step 9) |
| **WCAG 2.2 Level AA** | Accessibility of the UI | Planned |

## 7. Industry references (for later)

| Standard | Area | Status |
| --- | --- | --- |
| **ISO 12647** / Fogra (process control for colour printing) | Printing quality (colour targets) | Reference |
| **21 CFR Part 11**, **EU GMP Annex 11**, **GAMP 5** | Pharma (design test only, [ADR-0009](../adr/ADR-0009-MARKET-AND-FIRST-VERTICAL.md)) | Reference |

## 8. How to use this register

- **New decision:** check this register first. Cite the standard in the ADR.
- **New standard:** add a row here with status *Planned* or *Reference*, and add a row to the [decision log](../tracking/DECISION-LOG.csv) if it is a choice.
- **Deviation:** allowed only with an ADR explaining why.

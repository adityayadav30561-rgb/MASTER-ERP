# Open Questions — decisions waiting for the founder

> **Status:** Living document · **Last updated:** 2026-10-03

## TL;DR

Each question below blocks or shapes a part of the architecture. Every question has a
**recommendation** so you can answer quickly with "agree", "disagree because…", or "don't know yet".

- **Q-01 … Q-11:** answered on 2026-10-03 (founder agreed with all recommendations). One action is still open: **Q-10, find a real printing company before Step 4**.
- **Q-12 … Q-15:** raised in Step 3; answered on 2026-10-03 (agreed).
- **Q-16 … Q-21:** raised in Step 4; answered on 2026-10-03 (agreed). Several still need validation with the pilot ([Pilot Interview Guide](PILOT-INTERVIEW-GUIDE.md)).
- **Q-22 … Q-28:** raised in Step 5; answered on 2026-10-03 (agreed).
- **Q-29 … Q-37:** raised in Step 6 (security); answered on 2026-10-04 (agreed).
- **Q-38 … Q-44:** raised in Step 7 (events and workflow); answered on 2026-10-04 (agreed).
- **Q-45 … Q-50:** raised in Step 8 (data architecture); answered on 2026-10-04 (agreed).
- **Q-51 … Q-59:** raised in Step 9 (technical architecture) and waiting for answers.
- **All questions and decisions in one sheet:** [DECISION-LOG.csv](DECISION-LOG.csv) (opens in Excel / Google Sheets).

| ID | Question | Priority | Recommendation (short) | Status |
| --- | --- | --- | --- | --- |
| [Q-01](#q-01) | What is our positioning? | High | Industry depth + fast go-live, not "cheaper Odoo" | Agreed |
| [Q-02](#q-02) | First vertical, and is pharma near-term? | **Critical** | Printing & packaging first; pharma as design test only | Agreed |
| [Q-03](#q-03) | Native Finance/GL in MVP, or integrate with Tally? | **Critical** | GST-correct invoices + Tally export first; native GL later | Agreed |
| [Q-04](#q-04) | Who configures customers in year 1? | **Critical** | Founder, via configuration files; admin UIs only for frequent settings | Agreed |
| [Q-05](#q-05) | Target country/market for the first 2 years? | **Critical** | India first; architecture keeps other countries possible | Agreed |
| [Q-06](#q-06) | Is Tenant = Organization (1:1)? | Medium | Yes | Agreed |
| [Q-07](#q-07) | One Party master with customer/vendor roles? | Medium | Yes | Agreed |
| [Q-08](#q-08) | Multi-company in the MVP? | Medium | Model it from day one; UI for one company at first | Agreed |
| [Q-09](#q-09) | Is "Job" the right anchor for printing? | Medium | Yes, for make-to-order | Agreed — validate with pilot |
| [Q-10](#q-10) | Do you have access to a real printing company now? | **Critical** | Find one before Step 4 | Agreed — action open |
| [Q-11](#q-11) | Roadmap: vertical slices instead of horizontal phases? | High | Yes — slices driven by the pilot's biggest pain | Agreed |
| [Q-12](#q-12) | Estimation inside Sales, or its own module? | Medium | Inside Sales as a capability; revisit with a second vertical | Agreed |
| [Q-13](#q-13) | Job work (outsourced operations) in the MVP? | **High** | Yes — design it in slice 2; confirm with the pilot | Agreed — validate with pilot |
| [Q-14](#q-14) | How are receipts/payments recorded while Tally holds the books? | High | Record in the ERP, export to Tally (one entry point) | Agreed |
| [Q-15](#q-15) | Sell only one edition in year 1? | Medium | Yes — "Printing Essentials" | Agreed |
| [Q-16](#q-16) | Support customer-supplied material (conversion jobs)? | **High** | Design stock ownership now; switch on for the first pilot that needs it | Agreed |
| [Q-17](#q-17) | Stock valuation method? | Medium | Moving weighted average; FG at actual job cost | Agreed |
| [Q-18](#q-18) | What do we export to Tally? | High | Ledger-level financial vouchers only; no stock | Agreed — confirm with pilot accountant |
| [Q-19](#q-19) | WIP as quantities per job operation (no semi-finished stock items)? | Medium | Yes | Agreed |
| [Q-20](#q-20) | Gate entry in the MVP? | Low | Optional capability, off by default | Agreed |
| [Q-21](#q-21) | Target pharma-packaging printers as the first segment? | High | Yes, if the pilot fits — adds artwork version control + COA early | Agreed |
| [Q-22](#q-22) | Configuration layers, two stores and package format? | High | Layered override/extend/lock; Git packages (YAML + JSON Schema, SemVer) + audited runtime settings | Agreed |
| [Q-23](#q-23) | How are custom fields stored? | High | Metadata-validated JSON extension data; no EAV, no per-tenant schema changes | Agreed |
| [Q-24](#q-24) | Generated or hand-crafted screens? | Medium | Hybrid: crafted for critical tasks, generated for the rest; configurable terminology | Agreed |
| [Q-25](#q-25) | How are business rules written? | High | CEL conditions + decision tables; no scripting in MVP | Agreed |
| [Q-26](#q-26) | Numbering rules? | High | Series per type/company/site/FY; statutory numbers gapless at posting | Agreed |
| [Q-27](#q-27) | How are package upgrades done? | Medium | Pinned versions; staging dry-run; three-way merge; rollback | Agreed |
| [Q-28](#q-28) | What data do we migrate at go-live? | High | Masters + opening stock + open orders + unpaid invoices; no history | Agreed |
| [Q-29](#q-29) | Authentication: How do users log in, and who must use MFA? | High | Proven library with OIDC-compatible design | Agreed |
| [Q-30](#q-30) | Shop-floor login: How do operators without email log in on shared tablets? | High | Registered device + personal 6-digit PIN, operator permissions only, auto-logout, lockout | Agreed |
| [Q-31](#q-31) | Authorization model: How is access decided? | High | Scoped RBAC + CEL record conditions + field security | Agreed |
| [Q-32](#q-32) | Segregation of duties: Block or warn on conflicting duties? | High | Per-rule mode (block / warn+log / allow) | Agreed |
| [Q-33](#q-33) | Tenant isolation: How do we guarantee tenants never see each other's data? | High | Tenant context everywhere + PostgreSQL Row-Level Security + tenant-keyed files/caches/jobs + cross-tenant test suite | Agreed |
| [Q-34](#q-34) | Audit and logs: What is audited and how long is it kept? | High | Business audit trail: cannot be disabled, append-only, hash-chained, ≥ 8 years. Security log: ≥ 180 days in India (recommend 1 year) | Agreed |
| [Q-35](#q-35) | Privacy and hosting: How do we handle personal data and where is data hosted? | High | Customer = Data Fiduciary, us = Processor (DPA + sub-processor list) | Agreed |
| [Q-36](#q-36) | Support access: Can we (the platform operator) see customer data? | High | No standing access | Agreed |
| [Q-37](#q-37) | Security baseline and recovery: Which security standard and recovery targets? | High | OWASP ASVS Level 2 | Agreed |
| [Q-38](#q-38) | Event model: What do events look like and how are they named? | High | Domain events (internal) + versioned integration events (public) | Agreed |
| [Q-39](#q-39) | Reliable delivery: How are events delivered reliably, and do we need a message broker? | High | Transactional outbox + PostgreSQL job queue | Agreed |
| [Q-40](#q-40) | Event sourcing: Should we use event sourcing? | High | No event sourcing | Agreed |
| [Q-41](#q-41) | Automation rules: How do configurable automations work safely? | High | Trigger (event/schedule) + CEL condition + fixed action catalogue | Agreed |
| [Q-42](#q-42) | Approval engine: Build our own approval engine or embed a BPM engine? | High | Own small approval engine with BPMN-aligned concepts | Agreed |
| [Q-43](#q-43) | Notifications: How do notifications work and which channels come first? | High | Pipeline with rules, recipients, preferences, templates, delivery log | Agreed |
| [Q-44](#q-44) | Integrations: How are external calls (GST portal, Tally, webhooks) handled? | High | Integration jobs (visible states, retries, circuit breaker, manual resolution) | Agreed |
| [Q-45](#q-45) | Database: Which database is the system of record? | High | PostgreSQL as the single system of record (ACID, Row-Level Security, JSONB, full-text, partitioning, free, managed in India) | Agreed |
| [Q-46](#q-46) | Multi-tenancy layout: Do tenants share a database, or get their own? | High | Hybrid: pool by default (shared schema + tenant_id + RLS) | Agreed |
| [Q-47](#q-47) | Data conventions: Which conventions does every table follow, and how are documents stored? | High | Module schemas | Agreed |
| [Q-48](#q-48) | Ledgers, valuation and concurrency: How do we keep stock and money consistent, and how are back-dated receipts valued? | High | Append-only ledgers (status + owner dimensions) with derived balances in the same transaction | Agreed |
| [Q-49](#q-49) | Reporting and search: How are reports and global search built? | High | Curated, permission-aware report datasets | Agreed |
| [Q-50](#q-50) | Data lifecycle and migrations: How long is data kept, how do masters stay clean, and how do schema and imports evolve? | High | Retention schedule (>= 8 years books/audit | Agreed |
| [Q-51](#q-51) | Architecture style (final): Confirm modular monolith over microservices after the full comparison? | High | Modular monolith | Open |
| [Q-52](#q-52) | Language: Which programming language for backend and frontend? | High | TypeScript end to end on Node.js LTS, with a strict decimal rule (decimal value types, decimals as strings, lint + property tests) | Open |
| [Q-53](#q-53) | Backend structure: Which backend framework and how are module boundaries enforced? | High | NestJS at the edges (Fastify adapter), framework-free domain | Open |
| [Q-54](#q-54) | Data access and jobs: How does code talk to PostgreSQL, and which job library? | High | Kysely + plain SQL migrations | Open |
| [Q-55](#q-55) | Frontend stack: Which frontend technologies? | High | React + Vite SPA/PWA | Open |
| [Q-56](#q-56) | Contracts, rules, templates, PDF: How are contracts, CEL rules, templates and PDFs implemented? | High | JSON Schema (TypeBox + Ajv) as single contract language | Open |
| [Q-57](#q-57) | Authentication library: Which authentication library? | High | Better Auth after a spike | Open |
| [Q-58](#q-58) | Hosting and deployment: Where and how do we host? | High | AWS Mumbai (Lightsail first, RDS/ECS later) with Hyderabad backup copies | Open |
| [Q-59](#q-59) | Engineering practice: How do we test, release and monitor? | High | Local → CI → staging/demo → production | Open |

---

<a id="q-01"></a>
## Q-01 — Positioning

**Question:** Are we "a cheaper Odoo" or something else?

**Why it matters:** Positioning decides what we build first. Odoo Community and ERPNext are free,
so price cannot be our main advantage.

**Options:**
1. Cheaper generic ERP — competes with free products.
2. **Industry-ready ERP that goes live in weeks** (Printing & Packaging ERP for Indian SMEs first), on a platform that becomes other industry ERPs.
3. Implementation-services company that uses its own platform.

**Recommendation:** Option 2, with option 3 as the business model for the first years
(implementation fees fund development).

**Your answer:** **Agreed (2026-10-03)** — position on industry depth + fast go-live; implementation services fund development. → [ADR-0009](../adr/ADR-0009-MARKET-AND-FIRST-VERTICAL.md)

---

<a id="q-02"></a>
## Q-02 — First vertical, second vertical, and pharma

**Question:** Do we confirm Printing & Packaging as the first vertical? Is pharma a near-term
target or only a design test?

**Why it matters:** Pharma requires GMP compliance, electronic records/signatures and computer
system validation — very expensive to sell credibly as a solo developer.

**Recommendation:** Printing & Packaging first. Pharma = design test ("could the model support
it?"), not a sales target until the platform is mature. Second vertical should be adjacent
(corrugated boxes, labels, flexible packaging) or simpler batch-based (food, chemicals).

**Your answer:** **Agreed (2026-10-03)** — Printing & Packaging first; pharma is a design test only. → [ADR-0009](../adr/ADR-0009-MARKET-AND-FIRST-VERTICAL.md)

---

<a id="q-03"></a>
## Q-03 — Finance: build or integrate with Tally?

**Question:** Does the MVP include a full native Finance module (GL, AR/AP, bank, GST returns, TDS),
or do we produce GST-correct invoices and export accounting entries to Tally?

**Why it matters:** Most Indian SMEs' accountants use Tally and resist changing. A full finance module
is large and the riskiest code to get wrong. But invoices with correct GST, e-invoice and e-way bill
are needed from day one because dispatch creates them.

**Options:**
1. Full native Finance in MVP — complete product, much longer to first customer.
2. **Operational ERP + GST-correct invoicing + Tally export/sync**; native Finance later.
3. No invoicing at all (customer invoices in Tally) — weak; breaks the order-to-cash flow.

**Recommendation:** Option 2. The architecture still designs for native Finance (accounting
posting rules exist from day one, exported instead of posted to our own GL).

**Your answer:** **Agreed (2026-10-03)** — GST-correct invoicing + Tally export first; native GL later. → [ADR-0010](../adr/ADR-0010-ACCOUNTING-VIA-TALLY-FIRST.md)

---

<a id="q-04"></a>
## Q-04 — Who configures each customer in year 1?

**Question:** Will customers configure the system themselves, or will you (the founder) configure
it during implementation?

**Why it matters:** Self-service configuration requires drag-and-drop builders (forms, workflows,
rules, fields) — months of work each. If you configure, configuration can be version-controlled
files, and builders come later.

**Recommendation:** You configure in year 1 using configuration files/packages. Build admin UIs
only for what customers change often: users, roles, approval limits, numbering, print templates.

**Your answer:** **Agreed (2026-10-03)** — founder configures in year 1 via version-controlled configuration packages. → [ADR-0011](../adr/ADR-0011-CONFIGURATION-AS-PACKAGES.md)

---

<a id="q-05"></a>
## Q-05 — Target country / market

**Question:** India only for the first two years? Any export/other-country customers expected?

**Why it matters:** Decides whether the India localization pack is part of the MVP (it must be,
if India) and how much multi-currency/multi-language is needed early.

**Recommendation:** India first (GST, e-invoice, e-way bill in MVP). English UI first; keep text
translatable. Multi-currency in the data model from day one (export orders exist even for Indian SMEs).

**Your answer:** **Agreed (2026-10-03)** — India first; English UI, translatable; multi-currency in the data model. → [ADR-0009](../adr/ADR-0009-MARKET-AND-FIRST-VERTICAL.md)

---

<a id="q-06"></a>
## Q-06 — Is Tenant = Organization?

**Recommendation:** Yes, 1:1. One customer account = one business group, containing one or more
companies. Revisit only if a single account must manage several unrelated groups (e.g., an
accounting firm serving clients).

**Your answer:** **Agreed (2026-10-03)** — Tenant = Organization (1:1). Recorded in [ADR-0004](../adr/ADR-0004-ORGANIZATION-MODEL.md).

---

<a id="q-07"></a>
## Q-07 — One Party master with roles?

**Recommendation:** Yes. One Party (legal identity, GSTIN, addresses) with roles (customer, vendor,
transporter…) holding role-specific data (credit limit, payment terms, bank details).
See [Step 2 §4.5](../01-discovery/STEP-02-DOMAIN-MODEL.md#45-customer-and-vendor--one-party-with-roles).

**Your answer:** **Agreed (2026-10-03)** — one Party with roles. → [ADR-0013](../adr/ADR-0013-PARTY-WITH-ROLES.md)

---

<a id="q-08"></a>
## Q-08 — Multi-company in the MVP?

**Recommendation:** The data model supports multiple companies from day one (retrofitting it is
very expensive). The first pilot probably needs one company; inter-company features can wait.

**Your answer:** **Agreed (2026-10-03)** — multi-company in the data model from day one; single-company UI first. Recorded in [ADR-0004](../adr/ADR-0004-ORGANIZATION-MODEL.md).

---

<a id="q-09"></a>
## Q-09 — "Job" as the printing anchor object

**Question:** In your knowledge of printing companies, is everything organised around a **Job**
(one customer order line / one product run, with its estimate, artwork, plates, production,
costing and delivery)? Or around something else?

**Recommendation:** Job = anchor for make-to-order printing. Needs validation with a real company.

**Your answer:** **Agreed (2026-10-03)** — Job is the printing anchor. ⚠️ Still to be validated with a real printing company (Q-10).

---

<a id="q-10"></a>
## Q-10 — Access to a real printing company

**Question:** Do you have (or can you get) a real printing/packaging company willing to explain
their process and possibly pilot the product?

**Why it matters:** Step 4 (process architecture) without a real company produces textbook
processes that don't match how Indian printing SMEs actually work (job costing, wastage,
outsourcing of lamination/die-cutting to job workers, etc.).

**Recommendation:** Identify at least one before Step 4. Even 2–3 interviews would greatly
improve the design.

**Your answer:** **Agreed (2026-10-03)** — find at least one real printing/packaging company before Step 4. ⚠️ **Action open:** no company identified yet.

---

<a id="q-11"></a>
## Q-11 — Roadmap shape: vertical slices?

**Question:** Do we replace the 20 horizontal phases (all platform → module by module → industry
packages at Phase 17) with **vertical slices** (Foundation → Buy & store → Estimate & make →
Ship & bill → Control & visibility), each one a complete, demonstrable printing flow?

**Why it matters:** With horizontal phases there is nothing to demo for months, and industry needs
are discovered too late. See [Preliminary roadmap critique](../01-discovery/PRELIM-ROADMAP-CRITIQUE.md).

**Recommendation:** Yes. The order of slices 1–3 should follow the pilot customer's biggest pain.

**Your answer:** **Agreed (2026-10-03)** — vertical-slice roadmap. → [ADR-0012](../adr/ADR-0012-VERTICAL-SLICE-ROADMAP.md)

---

<a id="q-12"></a>
## Q-12 — Estimation: inside Sales or its own module?

**Question:** Estimation (costing a job before quoting) is central for printers. Is it a capability
of Sales, or a separate module?

**Why it matters:** A separate module could be sold to estimators who don't need the rest. It
adds a boundary and another module to test.

**Recommendation:** Keep it inside Sales as a capability, with the calculation coming from the
Printing package ([Step 3 §5.3](../01-discovery/STEP-03-MODULE-BOUNDARIES.md#53-who-owns-the-estimate--sales-as-a-capability-with-the-calculation-from-the-industry-package)).
Revisit when a second vertical needs it.

**Your answer:** **Agreed (2026-10-03)** — Estimation stays a Sales capability; calculation from the Printing package. Recorded in [ADR-0014](../adr/ADR-0014-MODULE-OWNERSHIP.md).

---

<a id="q-13"></a>
## Q-13 — Job work (outsourced operations) in the MVP?

**Question:** Printing SMEs send sheets to job workers for lamination, UV, die-cutting or binding.
Under GST this needs job-work challans, and the stock stays the company's while it is away. Is
this part of the MVP?

**Why it matters:** If most target printers outsource operations, an ERP without job work cannot
track their stock or job costs. It touches Manufacturing, Inventory, Purchase and the India pack
([Step 3 §5.7](../01-discovery/STEP-03-MODULE-BOUNDARIES.md#57-job-work-outsourced-operations--a-printing-reality)).

**Recommendation:** Yes, design it into slice 2 (Estimate & make). Confirm how often it happens
with the pilot company.

**Your answer:** **Agreed (2026-10-03)** — job work is in the MVP (slice 2). ⚠️ How often it happens is to be confirmed with the pilot.

---

<a id="q-14"></a>
## Q-14 — Recording receipts and payments while Tally holds the books

**Question:** Customer receipts and vendor payments are needed to show outstanding amounts and
check credit limits. Where are they entered?

**Options:**
1. **Entered in the ERP, exported to Tally** — one entry point; outstanding is always current. The accountant must accept the ERP as the entry point for receipts.
2. Entered in Tally, imported into the ERP periodically — the accountant's habits stay the same; outstanding may lag.
3. Not tracked in the ERP in the MVP — simplest; no credit control.

**Recommendation:** Option 1, with option 2 as a fallback if the pilot's accountant refuses.

**Your answer:** **Agreed (2026-10-03)** — receipts and payments are entered in the ERP and exported to Tally; fallback is import from Tally if the pilot's accountant refuses.

---

<a id="q-15"></a>
## Q-15 — One edition in year 1?

**Question:** Do we sell only "Printing Essentials" (all core modules together) in year 1?

**Why it matters:** Every module combination sold must be tested. 6 core modules make 63 combinations.

**Recommendation:** Yes. Per-module activation is built from day one, so selling smaller
editions later is a commercial decision ([ADR-0017](../adr/ADR-0017-SINGLE-EDITION-YEAR-ONE.md)).

**Your answer:** **Agreed (2026-10-03)** — one edition, "Printing Essentials", in year 1. → [ADR-0017](../adr/ADR-0017-SINGLE-EDITION-YEAR-ONE.md)

---

<a id="q-16"></a>
## Q-16 — Customer-supplied material (conversion jobs)

**Question:** Many printers print on board supplied by the customer and charge only for conversion.
Do we support that?

**Why it matters:** That board sits in our warehouse but **belongs to the customer**. This breaks
the rule "stock in our warehouse is ours". Adding an ownership dimension to the stock ledger later
would be very expensive.

**Options:** A. Not supported · **B. Stock ownership dimension (own / named party)** · C. Track outside the ERP.

**Recommendation:** B in the design now (cheap at design time). Switch it on for the first pilot
that needs it. The conversion invoice is a service (different GST treatment, India pack).
See [Step 4 §5.3](../01-discovery/STEP-04-PROCESS-ARCHITECTURE.md#53-customer-supplied-material--a-new-ownership-case-q-16).

**Your answer:** **Agreed (2026-10-03)** — stock ownership dimension (own / named party) designed in now; switched on for the first pilot that needs it.

---

<a id="q-17"></a>
## Q-17 — Stock valuation method

**Recommendation:** Moving weighted average for purchased material (with freight as landed cost).
Finished goods at actual job cost. Scrap at a realisable rate. FIFO possible later.
See [ADR-0021](../adr/ADR-0021-WEIGHTED-AVERAGE-VALUATION.md).

**Your answer:** **Agreed (2026-10-03)** — moving weighted average; FG at actual job cost; scrap at realisable rate. → [ADR-0021](../adr/ADR-0021-WEIGHTED-AVERAGE-VALUATION.md)

---

<a id="q-18"></a>
## Q-18 — What we export to Tally

**Question:** Do we export only financial vouchers (ledger level), or also items and stock?

**Recommendation:** Ledger-level financial vouchers only. The ERP owns stock and costing; the
accountant enters closing stock from our report at period end. Exported documents are locked;
corrections travel as new documents. See [ADR-0022](../adr/ADR-0022-TALLY-EXPORT-GRANULARITY.md).
Validate with the pilot's accountant (interview guide E2–E4).

**Your answer:** **Agreed (2026-10-03)** — ledger-level financial vouchers only; export locks; books-locked date; monthly reconciliation. → [ADR-0022](../adr/ADR-0022-TALLY-EXPORT-GRANULARITY.md). ⚠️ Confirm with the pilot's accountant.

---

<a id="q-19"></a>
## Q-19 — WIP per job operation

**Recommendation:** Yes. Track WIP as quantities per job operation, not as stocked semi-finished
items. Job work holds WIP at the job worker as job-bound stock. See [ADR-0019](../adr/ADR-0019-WIP-BY-JOB-OPERATION.md).
Gang runs (several jobs on one sheet) are out of the MVP unless the pilot needs them.

**Your answer:** **Agreed (2026-10-03)** — WIP as quantities per job operation; gang runs out of MVP unless the pilot needs them. → [ADR-0019](../adr/ADR-0019-WIP-BY-JOB-OPERATION.md)

---

<a id="q-20"></a>
## Q-20 — Gate entry

**Recommendation:** An optional Inventory capability (vehicle in/out, vendor invoice and e-way
bill numbers before the GRN, returnable gate passes), **off by default**. Switch it on for larger
factories.

**Your answer:** **Agreed (2026-10-03)** — gate entry is an optional Inventory capability, off by default.

---

<a id="q-21"></a>
## Q-21 — Pharma-packaging printers as the first segment?

**Question:** Printers who make cartons, leaflets and labels for pharma companies are a large
segment in India. They need **artwork version control** (text changes often and old plates must be
blocked) and often a **Certificate of Analysis (COA)** per dispatch. Do we target them first?

**Why it matters:** It sharpens positioning ("the ERP for pharma-packaging printers") and builds
pharma-grade capabilities without the burden of selling to pharma manufacturers themselves.
It adds artwork control and COA to the MVP.

**Recommendation:** Yes, if the pilot company is (or serves) pharma packaging. Otherwise keep
general cartons/labels and add COA later.

**Your answer:** **Agreed (2026-10-03)** — target pharma-packaging printers first **if the pilot fits**; then artwork version control and COA are in the MVP.

---

<a id="q-22"></a>
## Q-22 — Configuration layers, two stores and package format

**Question:** How do configuration layers combine, where is configuration stored, and in what format?

**Why it matters:** Without clear layering, customer changes are lost on upgrade; without a standard format, packages cannot be validated or reviewed.

**Recommendation:** Layers platform → module → localization → industry → tenant → company/site, merged by **override / extend / lock**. Structural configuration in **Git packages** (YAML validated by JSON Schema, SemVer manifest, migrations, tests); frequently changed settings in **audited runtime settings**. See [ADR-0024](../adr/ADR-0024-CONFIGURATION-LAYERS-AND-STORES.md), [ADR-0025](../adr/ADR-0025-PACKAGE-FORMAT.md).

**Your answer:** **Agreed (2026-10-03)** — Layered configuration (override/extend/lock); Git packages (YAML + JSON Schema, SemVer manifest, migrations, tests) + audited runtime settings.

---

<a id="q-23"></a>
## Q-23 — Custom field storage

**Question:** Where are values of custom/extension fields (GSM, "Plate rack no.") stored?

**Why it matters:** Wrong choice either makes reporting slow (EAV) or upgrades risky (per-tenant schema changes).

**Recommendation:** Metadata-validated **JSON extension data** on each record, indexed where needed; promote universal fields to core columns later. See [ADR-0026](../adr/ADR-0026-EXTENSION-FIELDS-STORAGE.md).

**Your answer:** **Agreed (2026-10-03)** — Metadata-validated JSON extension data; no EAV, no per-tenant schema changes; promote universal fields later.

---

<a id="q-24"></a>
## Q-24 — Generated or crafted screens

**Question:** Should screens be generated from metadata or designed by hand?

**Why it matters:** Fully generated screens are clumsy for estimate/job card on phones; fully hand-made screens ignore configuration.

**Recommendation:** **Hybrid** (crafted for critical tasks with metadata slots; generated for masters and custom objects) plus configurable **terminology** (Job / Batch). See [ADR-0027](../adr/ADR-0027-HYBRID-UI-AND-TERMINOLOGY.md).

**Your answer:** **Agreed (2026-10-03)** — Hybrid UI (crafted critical screens with metadata slots + generated screens) and configurable terminology.

---

<a id="q-25"></a>
## Q-25 — Business rule language

**Question:** How are configurable rules (validation, approvals, automation, notifications) written?

**Why it matters:** Too weak → developer needed for every policy; too powerful (scripting) → security and upgrade risk.

**Recommendation:** **CEL** expressions for conditions, **decision tables** for matrices, extension code for complex logic, **no scripting** in MVP. See [ADR-0028](../adr/ADR-0028-CEL-AND-DECISION-TABLES.md).

**Your answer:** **Agreed (2026-10-03)** — CEL conditions + decision tables; extension code for complex logic; no scripting in MVP.

---

<a id="q-26"></a>
## Q-26 — Numbering

**Question:** How are document numbers generated?

**Why it matters:** GST requires consecutive, unique-per-FY invoice numbers of max 16 characters; gaps raise audit questions.

**Recommendation:** Series by document type + company (+ site) (+ FY) with patterns; **statutory numbers gapless, assigned at posting**; drafts use temporary ids; continue from legacy numbers. See [ADR-0029](../adr/ADR-0029-NUMBERING.md).

**Your answer:** **Agreed (2026-10-03)** — Series per document type/company/site/FY; statutory numbers gapless and assigned at posting; continue from legacy numbers.

---

<a id="q-27"></a>
## Q-27 — Package upgrades

**Question:** How do we upgrade a customer to a new package version safely?

**Why it matters:** Upgrades that overwrite customer changes or break running work destroy trust.

**Recommendation:** Pinned versions; **staging dry-run**; **three-way merge** (locks win, conflicts decided by implementer); migrations; tests; rollback. See [ADR-0030](../adr/ADR-0030-PACKAGE-UPGRADES.md).

**Your answer:** **Agreed (2026-10-03)** — Pinned package versions; staging dry-run; three-way merge (locks win); migrations; tests; rollback.

---

<a id="q-28"></a>
## Q-28 — Data migrated at go-live

**Question:** What data do we bring in when a customer goes live?

**Why it matters:** Migrating full history is slow and error-prone; bringing too little stops the business working on day one.

**Recommendation:** Masters, product specs, active BOMs/routings, dies/plates/artwork, **opening stock from a physical count**, **open orders/POs**, **unpaid invoices**; no closed history; Excel/CSV templates; dress rehearsal on staging; go-live at a month start. See [ADR-0031](../adr/ADR-0031-GO-LIVE-WITH-OPENING-BALANCES.md).

**Your answer:** **Agreed (2026-10-03)** — Go live with masters, opening stock (physical count), open orders/POs and unpaid invoices; no closed history.

---

<a id="q-29"></a>
## Q-29 — Authentication

**Question:** How do users log in, and who must use MFA?

**Why it matters:** Stolen passwords are the most common way in; paid identity services cost per user.

**Options:** Hand-written login | Hosted identity service | Self-hosted identity server | Proven library, OIDC-compatible.

**Recommendation:** Proven library with OIDC-compatible design; NIST 800-63B passwords; MFA (authenticator app) mandatory for owner/admin/accountant/approvers; Google/Microsoft login; passkeys later; step-up re-auth for sensitive actions. See [ADR-0032](../adr/ADR-0032-AUTHENTICATION.md).

**Your answer:** **Agreed (2026-10-04)** — Proven auth library, OIDC-compatible; NIST 800-63B passwords; authenticator-app MFA mandatory for owner/admin/accountant/approvers; Google/Microsoft login; passkeys later; step-up re-auth.

---

<a id="q-30"></a>
## Q-30 — Shop-floor login

**Question:** How do operators without email log in on shared tablets?

**Why it matters:** If login is too hard, people share one account and nothing is attributable.

**Options:** Full login + MFA | Shared account | Registered device + personal PIN.

**Recommendation:** Registered device + personal 6-digit PIN, operator permissions only, auto-logout, lockout; disabled in pharma (GMP) mode. See [ADR-0032](../adr/ADR-0032-AUTHENTICATION.md).

**Your answer:** **Agreed (2026-10-04)** — Registered device + personal PIN for shop-floor roles only; auto-logout; lockout; disabled in GMP mode.

---

<a id="q-31"></a>
## Q-31 — Authorization model

**Question:** How is access decided?

**Why it matters:** Must express "only Bhiwandi", "only my customers", "no margins for shop floor".

**Options:** Pure RBAC | Scoped RBAC + conditions | Policy engine | Relationship-based.

**Recommendation:** Scoped RBAC + CEL record conditions + field security; eight checks in one central deny-by-default service; server-side enforcement. See [ADR-0033](../adr/ADR-0033-AUTHORIZATION-MODEL.md).

**Your answer:** **Agreed (2026-10-04)** — Scoped RBAC + CEL record conditions + field security; eight checks in one central deny-by-default service; server-side.

---

<a id="q-32"></a>
## Q-32 — Segregation of duties

**Question:** Block or warn on conflicting duties?

**Why it matters:** Fraud protection vs. small teams where one person holds several roles.

**Options:** Always block | Never check | Per-rule mode.

**Recommendation:** Per-rule mode (block / warn+log / allow); SME default warn+log with SoD report; bank-detail change + payment and own stock adjustment approval locked to block. See [ADR-0034](../adr/ADR-0034-APPROVAL-AUTHORITY-AND-SOD.md).

**Your answer:** **Agreed (2026-10-04)** — SoD rules with block / warn+log / allow; SME default warn+log with report; bank-change+payment and own stock-adjustment approval always block.

---

<a id="q-33"></a>
## Q-33 — Tenant isolation

**Question:** How do we guarantee tenants never see each other's data?

**Why it matters:** A cross-tenant leak would end the business.

**Options:** App filters only | App filters + database RLS + tests | Database per tenant.

**Recommendation:** Tenant context everywhere + PostgreSQL Row-Level Security + tenant-keyed files/caches/jobs + cross-tenant test suite; single-tenant restore; path to dedicated DB. See [ADR-0035](../adr/ADR-0035-TENANT-ISOLATION.md).

**Your answer:** **Agreed (2026-10-04)** — Tenant context + PostgreSQL Row-Level Security + tenant-keyed files/caches/jobs + cross-tenant tests; single-tenant restore; path to dedicated DB.

---

<a id="q-34"></a>
## Q-34 — Audit and logs

**Question:** What is audited and how long is it kept?

**Why it matters:** Companies (Accounts) Rules audit-trail requirement; CERT-In log retention; auditor trust.

**Options:** Basic change log | Statutory audit trail + security log.

**Recommendation:** Business audit trail: cannot be disabled, append-only, hash-chained, ≥ 8 years. Security log: ≥ 180 days in India (recommend 1 year). See [ADR-0036](../adr/ADR-0036-AUDIT-AND-LOGGING.md).

**Your answer:** **Agreed (2026-10-04)** — Business audit trail (cannot be disabled, append-only, hash-chained, >= 8 years) + security log (>= 180 days in India).

---

<a id="q-35"></a>
## Q-35 — Privacy and hosting

**Question:** How do we handle personal data and where is data hosted?

**Why it matters:** DPDP Act duties; customer trust; CERT-In logs in India.

**Options:** Any region, ad hoc | DPDP-aligned design, India hosting.

**Recommendation:** Customer = Data Fiduciary, us = Processor (DPA + sub-processor list); four data classes; no Aadhaar/biometrics; India-region hosting and backups; field-level encryption; secret manager. See [ADR-0037](../adr/ADR-0037-PRIVACY-AND-ENCRYPTION.md).

**Your answer:** **Agreed (2026-10-04)** — Customer = Data Fiduciary, us = Processor (DPA, sub-processor list); 4 data classes; no Aadhaar/biometrics; India hosting; field-level encryption; secret manager.

---

<a id="q-36"></a>
## Q-36 — Support access

**Question:** Can we (the platform operator) see customer data?

**Why it matters:** Customers must trust that we cannot browse their prices and customers.

**Options:** Standing admin access | No access ever | Approved, time-boxed access.

**Recommendation:** No standing access; tenant-approved, time-boxed, audited support sessions; break-glass only for platform incidents, reported afterwards. See [ADR-0039](../adr/ADR-0039-SUPPORT-ACCESS.md).

**Your answer:** **Agreed (2026-10-04)** — No standing operator access; tenant-approved, time-boxed, audited support sessions; break-glass only for platform incidents.

---

<a id="q-37"></a>
## Q-37 — Security baseline and recovery

**Question:** Which security standard and recovery targets?

**Why it matters:** Data loss or downtime at dispatch is as damaging as a breach.

**Options:** ASVS L1 | ASVS L2 | ASVS L3; various RPO/RTO.

**Recommendation:** OWASP ASVS Level 2; 3-2-1 backups with PITR; RPO ≤ 15 min; RTO ≤ 4 h; monthly restore drills; incident runbook with CERT-In 6-hour reporting; pentest before/soon after first paying customer. See [ADR-0038](../adr/ADR-0038-SECURITY-BASELINE-AND-OPERATIONS.md).

**Your answer:** **Agreed (2026-10-04)** — OWASP ASVS L2; 3-2-1 backups with PITR; RPO <= 15 min, RTO <= 4 h; monthly restore drills; CERT-In 6 h; pentest around first paying customer.

---

<a id="q-38"></a>
## Q-38 — Event model

**Question:** What do events look like and how are they named?

**Why it matters:** Many consumers and partners need one stable format.

**Options:** Ad-hoc payloads | Domain + integration events with CloudEvents envelope.

**Recommendation:** Domain events (internal) + versioned integration events (public); <module>.<object>.<past-tense> naming; CloudEvents envelope with tenant, trace and causation ids; key-fact payloads. See [ADR-0040](../adr/ADR-0040-EVENT-MODEL.md).

**Your answer:** **Agreed (2026-10-04)** — Domain + versioned integration events; <module>.<object>.<past-tense> naming; CloudEvents envelope with tenant, trace and causation ids; key-fact payloads.

---

<a id="q-39"></a>
## Q-39 — Reliable delivery

**Question:** How are events delivered reliably, and do we need a message broker?

**Why it matters:** Lost or duplicated events break stock, books and trust; extra infrastructure costs a solo developer time and money.

**Options:** Postgres outbox + queue | Redis | RabbitMQ | Kafka | Cloud queues.

**Recommendation:** Transactional outbox + PostgreSQL job queue; at-least-once with idempotent consumers; retries + dead-letter; Idempotency-Key on APIs; no broker until graduation triggers. See [ADR-0041](../adr/ADR-0041-OUTBOX-AND-DELIVERY.md).

**Your answer:** **Agreed (2026-10-04)** — Transactional outbox + PostgreSQL job queue; at-least-once with idempotent consumers; retries + dead-letter; Idempotency-Key on APIs; no broker until graduation triggers.

---

<a id="q-40"></a>
## Q-40 — Event sourcing

**Question:** Should we use event sourcing?

**Why it matters:** Event sourcing is powerful but complex; the brief asked not to assume it.

**Options:** Everywhere | Selectively | Not at all (ledgers + audit instead).

**Recommendation:** No event sourcing; state-based persistence + append-only ledgers + hash-chained audit + outbox. See [ADR-0042](../adr/ADR-0042-NO-EVENT-SOURCING.md).

**Your answer:** **Agreed (2026-10-04)** — No event sourcing; state-based persistence + append-only ledgers + hash-chained audit + outbox.

---

<a id="q-41"></a>
## Q-41 — Automation rules

**Question:** How do configurable automations work safely?

**Why it matters:** Unrestricted automation causes loops, security holes and unexplained changes.

**Options:** Free scripting | Trigger + CEL condition + fixed action catalogue.

**Recommendation:** Trigger (event/schedule) + CEL condition + fixed action catalogue; system user; loop protection (depth 3); essential vs optional; dry-run. See [ADR-0043](../adr/ADR-0043-AUTOMATION-RULES.md).

**Your answer:** **Agreed (2026-10-04)** — Trigger + CEL condition + fixed action catalogue; system user; loop protection (depth 3); essential vs optional; dry-run.

---

<a id="q-42"></a>
## Q-42 — Approval engine

**Question:** Build our own approval engine or embed a BPM engine?

**Why it matters:** Approvals are the core of control; general BPM engines are heavy and mostly unused.

**Options:** Embed BPMN engine | Temporal | Cloud step functions | Own small engine.

**Recommendation:** Own small approval engine with BPMN-aligned concepts; versioned definitions on transitions; resolvers, modes, SLA, escalation; fallback approver; re-approval on material change; deep-link approvals. See [ADR-0044](../adr/ADR-0044-APPROVAL-WORKFLOW-ENGINE.md).

**Your answer:** **Agreed (2026-10-04)** — Own small approval engine (BPMN-aligned); versioned definitions on transitions; resolvers, modes, SLA, escalation, delegation; fallback approver; re-approval on material change; deep-link approvals.

---

<a id="q-43"></a>
## Q-43 — Notifications

**Question:** How do notifications work and which channels come first?

**Why it matters:** Right message to the right person without spam or surprise costs.

**Options:** All channels day one | In-app + email first, paid channels later.

**Recommendation:** Pipeline with rules, recipients, preferences, templates, delivery log; MVP in-app + email (SPF/DKIM/DMARC); WhatsApp (Meta templates, opt-in, cost caps) and SMS (TRAI DLT) later as add-ons. See [ADR-0045](../adr/ADR-0045-NOTIFICATION-ENGINE.md).

**Your answer:** **Agreed (2026-10-04)** — Notification pipeline; MVP in-app + email (SPF/DKIM/DMARC); WhatsApp (Meta templates, opt-in, cost caps) and SMS (TRAI DLT) later as add-ons.

---

<a id="q-44"></a>
## Q-44 — Integrations

**Question:** How are external calls (GST portal, Tally, webhooks) handled?

**Why it matters:** GST portal outages must not silently stop dispatch.

**Options:** Direct calls in the request | Integration jobs with states and retries.

**Recommendation:** Integration jobs (visible states, retries, circuit breaker, manual resolution); Standard Webhooks out; verify-store-dedupe-async for inbound. See [ADR-0046](../adr/ADR-0046-INTEGRATION-JOBS-AND-WEBHOOKS.md).

**Your answer:** **Agreed (2026-10-04)** — Integration jobs with visible states, retries, circuit breaker, manual resolution; Standard Webhooks out; verify-store-dedupe-async in.

---

<a id="q-45"></a>
## Q-45 — Database

**Question:** Which database is the system of record?

**Why it matters:** Every earlier decision (tenant isolation, extension fields, outbox) depends on database features.

**Options:** PostgreSQL | MySQL | SQL Server/Oracle | MongoDB.

**Recommendation:** PostgreSQL as the single system of record (ACID, Row-Level Security, JSONB, full-text, partitioning, free, managed in India). See [ADR-0047](../adr/ADR-0047-POSTGRESQL-SYSTEM-OF-RECORD.md).

**Your answer:** **Agreed (2026-10-04)** — PostgreSQL as the single system of record.

---

<a id="q-46"></a>
## Q-46 — Multi-tenancy layout

**Question:** Do tenants share a database, or get their own?

**Why it matters:** Decides cost, isolation, upgrades and whether enterprise/on-premise customers can be served.

**Options:** Pool (shared schema) | Schema per tenant | Database per tenant | Hybrid.

**Recommendation:** Hybrid: pool by default (shared schema + tenant_id + RLS); silo / on-premise option with the same schema; tenant directory; per-tenant restore tooling. See [ADR-0048](../adr/ADR-0048-MULTI-TENANCY-LAYOUT.md).

**Your answer:** **Agreed (2026-10-04)** — Hybrid: pool by default (shared schema + tenant_id + RLS); silo / on-premise option with same schema; tenant directory; per-tenant restore tooling.

---

<a id="q-47"></a>
## Q-47 — Data conventions

**Question:** Which conventions does every table follow, and how are documents stored?

**Why it matters:** Consistent data is the foundation for correct stock, money and reports.

**Options:** Generic document table | Separate tables only | Registry + typed tables.

**Recommendation:** Module schemas; foreign keys only within a module or downward; UUIDv7; exact decimals; UTC; version column; ext JSONB; document registry + typed tables + document links. See [ADR-0049](../adr/ADR-0049-DATA-MODEL-CONVENTIONS.md).

**Your answer:** **Agreed (2026-10-04)** — Module schemas; FKs only within module or downward; UUIDv7; exact decimals; UTC; version column; ext JSONB; document registry + typed tables + links.

---

<a id="q-48"></a>
## Q-48 — Ledgers, valuation and concurrency

**Question:** How do we keep stock and money consistent, and how are back-dated receipts valued?

**Why it matters:** Back-dated bills are common in SMEs; rewriting posted values confuses accountants.

**Options:** Retroactive recalculation | Moving average at posting time + variance.

**Recommendation:** Append-only ledgers (status + owner dimensions) with derived balances in the same transaction; negative stock off by default; moving average at posting time with variance for back-dated receipts (open period only); optimistic + ordered row locks. See [ADR-0050](../adr/ADR-0050-LEDGERS-VALUATION-AND-CONCURRENCY.md).

**Your answer:** **Agreed (2026-10-04)** — Append-only ledgers (status + owner) with derived balances in-transaction; negative stock off by default; moving average at posting time with variance for back-dated receipts; optimistic + ordered row locks.

---

<a id="q-49"></a>
## Q-49 — Reporting and search

**Question:** How are reports and global search built?

**Why it matters:** The brief warns against reports from random table joins; search must never leak data outside a user's scope.

**Options:** Ad-hoc joins | Curated datasets + read models | Separate warehouse now; Postgres search | OpenSearch now.

**Recommendation:** Curated, permission-aware report datasets; read models for dashboards; analytics store later; permission-filtered PostgreSQL search (full-text + trigram); OpenSearch only on graduation. See [ADR-0051](../adr/ADR-0051-REPORTING-AND-SEARCH.md).

**Your answer:** **Agreed (2026-10-04)** — Curated permission-aware report datasets; read models; analytics store later; permission-filtered PostgreSQL search; OpenSearch only on graduation.

---

<a id="q-50"></a>
## Q-50 — Data lifecycle and migrations

**Question:** How long is data kept, how do masters stay clean, and how do schema and imports evolve?

**Why it matters:** Legal retention, DPDP minimisation, clean masters and safe upgrades.

**Options:** Keep everything forever | Retention schedule + archiving + MDM rules + expand-contract migrations.

**Recommendation:** Retention schedule (>= 8 years books/audit; logs per law); partitioning/archiving; tenant exit export; stored statutory PDFs; duplicate checks, approval, merge; expand-contract migrations; opening balances as documents. See [ADR-0052](../adr/ADR-0052-DATA-LIFECYCLE-MDM-AND-MIGRATIONS.md).

**Your answer:** **Agreed (2026-10-04)** — Retention schedule; partitioning/archiving; tenant exit; stored statutory PDFs; duplicate checks, approval, merge; expand-contract migrations; opening balances as documents.

---

<a id="q-51"></a>
## Q-51 — Architecture style (final)

**Question:** Confirm modular monolith over microservices after the full comparison?

**Why it matters:** Single ACID transactions for stock + money; one developer; lowest cost.

**Options:** Microservices | Modular monolith | Hybrid.

**Recommendation:** Modular monolith; one image with web + worker processes; extract services only when measured. See [ADR-0003](../adr/ADR-0003-MODULAR-MONOLITH-DIRECTION.md).

**Your answer:** _pending_

---

<a id="q-52"></a>
## Q-52 — Language

**Question:** Which programming language for backend and frontend?

**Why it matters:** One language for everything; decimal handling is the one ERP risk and is controlled by rules.

**Options:** TypeScript/Node | Python+TS | C#+TS | Java/Kotlin+TS | Go+TS.

**Recommendation:** TypeScript end to end on Node.js LTS, with a strict decimal rule (decimal value types, decimals as strings, lint + property tests). See [ADR-0053](../adr/ADR-0053-LANGUAGE-AND-RUNTIME.md).

**Your answer:** _pending_

---

<a id="q-53"></a>
## Q-53 — Backend structure

**Question:** Which backend framework and how are module boundaries enforced?

**Why it matters:** Boundaries that only exist in documents erode; tooling makes them fail the build.

**Options:** NestJS | Express/Fastify alone | Light frameworks.

**Recommendation:** NestJS at the edges (Fastify adapter), framework-free domain; pnpm monorepo; boundaries enforced by dependency-cruiser + architecture tests. See [ADR-0054](../adr/ADR-0054-BACKEND-STRUCTURE-AND-BOUNDARIES.md).

**Your answer:** _pending_

---

<a id="q-54"></a>
## Q-54 — Data access and jobs

**Question:** How does code talk to PostgreSQL, and which job library?

**Why it matters:** Full control over transactions, locks, RLS and JSONB; outbox without extra infrastructure.

**Options:** Prisma | TypeORM | Drizzle | Kysely; Graphile Worker | pg-boss | BullMQ.

**Recommendation:** Kysely + plain SQL migrations; tenant context set per transaction; Graphile Worker for jobs, outbox (jobs added inside the transaction) and schedules. See [ADR-0055](../adr/ADR-0055-DATA-ACCESS-AND-JOBS.md).

**Your answer:** _pending_

---

<a id="q-55"></a>
## Q-55 — Frontend stack

**Question:** Which frontend technologies?

**Why it matters:** Modern, fast, accessible, phone-friendly, simple to host.

**Options:** Next.js | React + Vite SPA/PWA | Other frameworks.

**Recommendation:** React + Vite SPA/PWA; Tailwind + shadcn/ui; TanStack Query/Router/Table; React Hook Form; i18next + Intl (en-IN); no offline in MVP. See [ADR-0056](../adr/ADR-0056-FRONTEND-STACK.md).

**Your answer:** _pending_

---

<a id="q-56"></a>
## Q-56 — Contracts, rules, templates, PDF

**Question:** How are contracts, CEL rules, templates and PDFs implemented?

**Why it matters:** One schema source; safe templates; high-fidelity GST invoices.

**Options:** Various.

**Recommendation:** JSON Schema (TypeBox + Ajv) as single contract language; OpenAPI 3.1; CEL JS library after spike (fallbacks defined); LiquidJS templates; headless Chromium PDFs in the worker. See [ADR-0057](../adr/ADR-0057-CONTRACTS-RULES-TEMPLATES-PDF.md).

**Your answer:** _pending_

---

<a id="q-57"></a>
## Q-57 — Authentication library

**Question:** Which authentication library?

**Why it matters:** Proven, free, self-hosted login without hand-written cryptography.

**Options:** Better Auth | Auth.js | Lucia | Keycloak | Composed libraries.

**Recommendation:** Better Auth after a spike; fallback composed standard libraries (Argon2id, TOTP, WebAuthn, openid-client); authorization stays our own service. See [ADR-0058](../adr/ADR-0058-AUTHENTICATION-LIBRARY.md).

**Your answer:** _pending_

---

<a id="q-58"></a>
## Q-58 — Hosting and deployment

**Question:** Where and how do we host?

**Why it matters:** India residency, PITR, second-region backups, low cost, portability.

**Options:** AWS Mumbai | DigitalOcean Bangalore | GCP | Azure | Indian clouds | Free platforms.

**Recommendation:** AWS Mumbai (Lightsail first, RDS/ECS later) with Hyderabad backup copies; DigitalOcean Bangalore as alternative; one portable Docker image; Cloudflare in front; pilot ≈ ₹3,000–6,000/month. See [ADR-0059](../adr/ADR-0059-HOSTING-AND-DEPLOYMENT.md).

**Your answer:** _pending_

---

<a id="q-59"></a>
## Q-59 — Engineering practice

**Question:** How do we test, release and monitor?

**Why it matters:** A solo developer needs automation to keep ledgers correct and tenants isolated.

**Options:** Manual | Automated pipeline with quality gates.

**Recommendation:** Local → CI → staging/demo → production; real-PostgreSQL, property-based, cross-tenant and authorization-matrix tests; GitHub Actions with boundary and security scanning; OpenTelemetry with logs in India. See [ADR-0060](../adr/ADR-0060-ENGINEERING-PRACTICE.md).

**Your answer:** _pending_

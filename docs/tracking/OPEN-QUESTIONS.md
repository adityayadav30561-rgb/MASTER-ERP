# Open Questions — decisions waiting for the founder

> **Status:** Living document · **Last updated:** 2026-10-03

## TL;DR

Each question below blocks or shapes a part of the architecture. Every question has a
**recommendation** so you can answer quickly with "agree", "disagree because…", or "don't know yet".

- **Q-01 … Q-11:** answered on 2026-10-03 (founder agreed with all recommendations). One action is still open: **Q-10, find a real printing company before Step 4**.
- **Q-12 … Q-15:** raised in Step 3 and waiting for answers.

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
| [Q-12](#q-12) | Estimation inside Sales, or its own module? | Medium | Inside Sales as a capability; revisit with a second vertical | Open |
| [Q-13](#q-13) | Job work (outsourced operations) in the MVP? | **High** | Yes — design it in slice 2; confirm with the pilot | Open |
| [Q-14](#q-14) | How are receipts/payments recorded while Tally holds the books? | High | Record in the ERP, export to Tally (one entry point) | Open |
| [Q-15](#q-15) | Sell only one edition in year 1? | Medium | Yes — "Printing Essentials" | Open |

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

**Your answer:** _pending_

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

**Your answer:** _pending_

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

**Your answer:** _pending_

---

<a id="q-15"></a>
## Q-15 — One edition in year 1?

**Question:** Do we sell only "Printing Essentials" (all core modules together) in year 1?

**Why it matters:** Every module combination sold must be tested. 6 core modules make 63 combinations.

**Recommendation:** Yes. Per-module activation is built from day one, so selling smaller
editions later is a commercial decision ([ADR-0017](../adr/ADR-0017-SINGLE-EDITION-YEAR-ONE.md)).

**Your answer:** _pending_

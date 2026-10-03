# Open Questions — decisions waiting for the founder

> **Status:** Living document · **Last updated:** 2026-10-03

## TL;DR

Each question below blocks or shapes a part of the architecture. Every question has a
**recommendation** so you can answer quickly with "agree", "disagree because…", or "don't know yet".
The **top four (Q-02, Q-03, Q-04, Q-05)** change the MVP scope the most — please answer those first.

| ID | Question | Priority | Recommendation (short) | Status |
| --- | --- | --- | --- | --- |
| [Q-01](#q-01) | What is our positioning? | High | Industry depth + fast go-live, not "cheaper Odoo" | Open |
| [Q-02](#q-02) | First vertical, and is pharma near-term? | **Critical** | Printing & packaging first; pharma as design test only | Open |
| [Q-03](#q-03) | Native Finance/GL in MVP, or integrate with Tally? | **Critical** | GST-correct invoices + Tally export first; native GL later | Open |
| [Q-04](#q-04) | Who configures customers in year 1? | **Critical** | Founder, via configuration files; admin UIs only for frequent settings | Open |
| [Q-05](#q-05) | Target country/market for the first 2 years? | **Critical** | India first; architecture keeps other countries possible | Open |
| [Q-06](#q-06) | Is Tenant = Organization (1:1)? | Medium | Yes | Open |
| [Q-07](#q-07) | One Party master with customer/vendor roles? | Medium | Yes | Open |
| [Q-08](#q-08) | Multi-company in the MVP? | Medium | Model it from day one; UI for one company at first | Open |
| [Q-09](#q-09) | Is "Job" the right anchor for printing? | Medium | Yes, for make-to-order | Open |
| [Q-10](#q-10) | Do you have access to a real printing company now? | **Critical** | Find one before Step 4 | Open |
| [Q-11](#q-11) | Roadmap: vertical slices instead of horizontal phases? | High | Yes — slices driven by the pilot's biggest pain | Open |

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

**Your answer:** _pending_

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

**Your answer:** _pending_

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

**Your answer:** _pending_

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

**Your answer:** _pending_

---

<a id="q-05"></a>
## Q-05 — Target country / market

**Question:** India only for the first two years? Any export/other-country customers expected?

**Why it matters:** Decides whether the India localization pack is part of the MVP (it must be,
if India) and how much multi-currency/multi-language is needed early.

**Recommendation:** India first (GST, e-invoice, e-way bill in MVP). English UI first; keep text
translatable. Multi-currency in the data model from day one (export orders exist even for Indian SMEs).

**Your answer:** _pending_

---

<a id="q-06"></a>
## Q-06 — Is Tenant = Organization?

**Recommendation:** Yes, 1:1. One customer account = one business group, containing one or more
companies. Revisit only if a single account must manage several unrelated groups (e.g., an
accounting firm serving clients).

**Your answer:** _pending_

---

<a id="q-07"></a>
## Q-07 — One Party master with roles?

**Recommendation:** Yes. One Party (legal identity, GSTIN, addresses) with roles (customer, vendor,
transporter…) holding role-specific data (credit limit, payment terms, bank details).
See [Step 2 §4.5](../01-discovery/STEP-02-DOMAIN-MODEL.md#45-customer-and-vendor--one-party-with-roles).

**Your answer:** _pending_

---

<a id="q-08"></a>
## Q-08 — Multi-company in the MVP?

**Recommendation:** The data model supports multiple companies from day one (retrofitting it is
very expensive). The first pilot probably needs one company; inter-company features can wait.

**Your answer:** _pending_

---

<a id="q-09"></a>
## Q-09 — "Job" as the printing anchor object

**Question:** In your knowledge of printing companies, is everything organised around a **Job**
(one customer order line / one product run, with its estimate, artwork, plates, production,
costing and delivery)? Or around something else?

**Recommendation:** Job = anchor for make-to-order printing. Needs validation with a real company.

**Your answer:** _pending_

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

**Your answer:** _pending_

---

<a id="q-11"></a>
## Q-11 — Roadmap shape: vertical slices?

**Question:** Do we replace the 20 horizontal phases (all platform → module by module → industry
packages at Phase 17) with **vertical slices** (Foundation → Buy & store → Estimate & make →
Ship & bill → Control & visibility), each one a complete, demonstrable printing flow?

**Why it matters:** With horizontal phases there is nothing to demo for months, and industry needs
are discovered too late. See [Preliminary roadmap critique](../01-discovery/PRELIM-ROADMAP-CRITIQUE.md).

**Recommendation:** Yes. The order of slices 1–3 should follow the pilot customer's biggest pain.

**Your answer:** _pending_

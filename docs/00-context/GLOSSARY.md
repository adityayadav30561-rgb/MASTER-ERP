# Glossary — ERP and architecture terms in plain language

> **Status:** Living document · **Last updated:** 2026-10-03

## TL;DR

Look up any term used in the documentation here. Each entry: a plain definition, and where
useful an example from printing or pharma. Terms that have a precise meaning *in this project*
are marked **(project term)** — read those carefully, they are decisions, not just vocabulary.

---

## A. Business / ERP terms

| Term | Meaning |
| --- | --- |
| **ERP** | Enterprise Resource Planning. Software that records a company's operations (selling, buying, stock, production, money, people) in one shared system so every department works from the same data. |
| **Master data** | Slow-changing reference data that transactions point to: customers, vendors, items, warehouses, accounts. *Example: "Paper 80 GSM A4 Maplitho" is an item master record.* |
| **Transaction** | A business event that has consequences: an order is placed, goods arrive, an invoice is raised, money is paid. |
| **Document** **(project term)** | The formal record of a transaction: it has a number (PO-2026-00012), a date, a lifecycle, can be printed, and once confirmed cannot be silently edited. |
| **Posting** | The moment a document's effects are written into a ledger. *Posting a GRN adds stock to the stock ledger.* |
| **Ledger** | An append-only list of changes (quantity or money). Balances are computed from it. You never edit a ledger line; you add a correcting line. |
| **General Ledger (GL)** | The master accounting ledger: every financial effect as debit/credit lines against accounts in the Chart of Accounts. |
| **Sub-ledger** | A detailed ledger feeding the GL: Accounts Receivable (who owes us), Accounts Payable (whom we owe), stock ledger, fixed assets. |
| **Chart of Accounts (CoA)** | The list of accounts (Cash, Bank, Sales, Purchases, Raw Material Inventory…) that the GL uses. |
| **Double entry** | Every financial transaction affects at least two accounts with equal debits and credits. |
| **BOM** | Bill of Materials — the recipe: which materials and how much to make one unit of a product. *Printing: board + ink + lamination film per 1,000 cartons. Pharma: API + excipients per batch.* |
| **Routing** | The ordered list of operations to make a product, and on which work centers. *Printing → Lamination → Die-cutting → Folding/Gluing.* |
| **Work center** | A machine or group of machines/people where an operation happens. *"Heidelberg 4-colour press".* |
| **Production order / Work order** | An instruction to produce a quantity of a product using a BOM and routing. |
| **Job card** | The shop-floor record of one operation of a production order: who, which machine, start/end, quantity good/rejected. In printing, "job card" often means the whole job. |
| **WIP** | Work In Progress — material that has been issued to production but isn't a finished product yet. |
| **GRN** | Goods Receipt Note — the document recording that goods physically arrived and were accepted into stock. |
| **ASN** | Advance Shipping Notice — the vendor tells you what is coming before it arrives. |
| **PR / RFQ / PO** | Purchase Requisition (internal request to buy) / Request For Quotation (asking vendors for prices) / Purchase Order (the legal order to a vendor). |
| **SO / DN** | Sales Order / Delivery Note (dispatch document). |
| **Three-way match** | Checking PO vs GRN vs vendor invoice agree (quantity and price) before paying. |
| **UOM** | Unit of Measure — kg, sheet, reel, ream, litre, nos. Conversion between UOMs is a core problem (*paper bought in kg, consumed in sheets*). |
| **GSM** | Grams per Square Metre — paper weight. Needed to convert kg ↔ sheets. |
| **Batch / Lot** | A quantity of material produced or received together, tracked as one unit for quality and traceability. Pharma: mandatory, with expiry. |
| **Serial number** | Identity of a single unit (a machine, a device). |
| **Quarantine** | Stock that physically exists but cannot be used until QC releases it. Pharma: every incoming material. |
| **QC / QA** | Quality Control (testing: does this batch meet spec?) / Quality Assurance (the system ensuring quality: procedures, approvals, release decisions). |
| **CAPA** | Corrective And Preventive Action — formal process after a quality problem. |
| **NCR** | Non-Conformance Report — record that something failed a requirement. |
| **GMP** | Good Manufacturing Practice — regulatory rules for pharma manufacturing. |
| **21 CFR Part 11 / EU Annex 11** | US / EU rules for electronic records and electronic signatures in regulated industries. Required if pharma customers export to those markets. |
| **CSV (Computer System Validation)** | Documented proof that software used in GMP does what it should. Expensive; a major barrier for pharma ERP vendors. |
| **Cost center** | A part of the business that incurs costs and is tracked for them (Maintenance dept). |
| **Profit center** | A part of the business tracked for both revenue and cost (Packaging division). |
| **Legal entity / Company** | An organization registered by law, with its own books of accounts and tax identity (PAN in India). |
| **GSTIN** | GST registration number. In India one company (one PAN) has **one GSTIN per state** where it operates. |
| **E-invoice / IRN** | Indian mandate: B2B invoices above a turnover threshold must be registered on the government portal and get an Invoice Reference Number + QR code. |
| **E-way bill** | Indian document required to move goods above a value threshold. |
| **TDS / TCS** | Tax Deducted / Collected at Source — Indian withholding taxes. |
| **Financial year (FY)** | India: 1 April – 31 March. Numbering and closing often reset per FY. |
| **Period closing** | Locking an accounting period so no more postings can change it. |
| **Tally** | The dominant accounting software among Indian SMEs. Very relevant to our go-to-market. |

## B. Architecture / software terms

| Term | Meaning |
| --- | --- |
| **Architecture** | The big structural choices that are expensive to change later. |
| **ADR** | Architecture Decision Record — a short document recording one decision, the alternatives and the reasoning. |
| **Tenant** **(project term)** | One subscribing customer account in our SaaS: its data, users, configuration and modules are isolated from every other tenant. |
| **Multi-tenancy** | Serving many tenants from one running system. |
| **Monolith** | One deployable application containing all features. |
| **Modular monolith** | One deployable application, but internally split into modules with strict boundaries (each owns its data and talks to others only through defined interfaces). |
| **Microservices** | Many separately deployed applications, each owning a part of the system, talking over the network. Powerful, but costly to build and run. |
| **Module** **(project term)** | A sellable, activatable area of business functionality (Sales, Inventory…) built on the platform core. |
| **Platform kernel** **(project term)** | The technical services every module needs and which carry no business meaning (identity, permissions, metadata, workflow, events, audit…). |
| **Industry package** **(project term)** | A bundle of configuration (and optionally small code extensions) that turns the generic modules into an industry-specific product. |
| **Localization pack** **(project term)** | Country-specific rules (taxes, statutory documents, formats) packaged separately from industry and core. |
| **Metadata** | Data that describes other data: "the Item object has a field GSM, type decimal, mandatory for paper". A metadata-driven system builds forms/validation from such descriptions. |
| **Custom field** | A field added by a customer/admin without code. |
| **Custom object** | A whole new record type added without code (e.g., "Printing Plate"). |
| **Configuration vs customization vs extension** | Settings changed by an admin / forms-fields-workflows changed per customer / new code written against defined extension points. Core modification = changing platform source (to be avoided). |
| **State** | Where a record is in its life: Draft, Approved, Closed. |
| **Transition** | A permitted move from one state to another, usually caused by an action: *Approve* moves Submitted → Approved. |
| **State machine** | The full set of states and allowed transitions of an object type. |
| **Workflow** | A configurable sequence of human steps (usually approvals) attached to a document. |
| **Event** | A fact that something happened, named in past tense: `PurchaseOrderApproved`. Never changes after it is recorded. |
| **Domain event** | An event inside the application, meaningful to the business. |
| **Event bus** | The mechanism that delivers events from the module that raised them to the modules that care. |
| **Outbox pattern** | Saving an event in the same database transaction as the business change, then delivering it afterwards. Guarantees "if the change happened, the event will be delivered". |
| **Event sourcing** | Storing *only* events and rebuilding current state by replaying them. Powerful but complex. Not the same as "using events". |
| **Message queue** | Infrastructure that holds messages until a worker processes them (RabbitMQ, Redis Streams, or a Postgres table). |
| **Webhook** | An HTTP call our system makes to an external URL when an event happens. |
| **ACID transaction** | A group of database changes that either all happen or none happen, isolated from other users. Essential when stock and money move. |
| **Eventual consistency** | Data in different places becomes consistent shortly after, not instantly. Acceptable for notifications and reports, not for stock-and-ledger postings. |
| **Idempotency** | Doing the same operation twice has the same effect as once. Essential for retries ("did that payment go through?"). |
| **Optimistic concurrency** | Two users edit the same record; the second save is rejected if the record changed since they loaded it. |
| **RBAC** | Role-Based Access Control — permissions are given to roles; users get roles. |
| **ABAC** | Attribute-Based Access Control — rules using attributes: "can approve POs where amount ≤ their limit and plant = their plant". |
| **Row-Level Security (RLS)** | A PostgreSQL feature that filters rows automatically per user/tenant at the database level. |
| **AuthN / AuthZ** | Authentication (who are you?) / Authorization (what may you do?). |
| **OIDC / OAuth2** | Standards for login and delegated access (e.g., "Login with Google/Microsoft", API access tokens). |
| **MFA** | Multi-Factor Authentication — password + a second proof (OTP, authenticator app). |
| **API** | A defined way for programs to talk to our system. REST is the common style. |
| **PWA** | Progressive Web App — a website that installs and behaves like a mobile app. |
| **Bounded context** | A part of the system with its own consistent vocabulary and rules, owned by one module. Our modules are drawn this way. |
| **Owner module** **(project term)** | The single module allowed to create and change a given document type, master facet or ledger. |
| **Facet** **(project term)** | The part of a shared master (Item, Party) owned by one module, e.g. the Inventory facet of an Item (reorder level, batch tracking). |
| **Contract** **(project term)** | What a module publishes for others: its queries, commands and events. Others may use nothing else. |
| **Hard dependency / optional integration** **(project term)** | A module that cannot run without another / a module that works alone but does more when the other is active. |
| **Without mode** **(project term)** | How a module behaves when an optional partner module is switched off. |
| **Module manifest** **(project term)** | A module's declaration of its dependencies, owned objects, permissions, menus, events, extension points and settings. |
| **Extension point** **(project term)** | A named slot in a module where a package can plug in behaviour (e.g., estimate calculator, tax calculator). |
| **Edition** **(project term)** | A sellable, tested bundle of modules and packages (e.g., "Printing Essentials"). |
| **Entitlement** | What a tenant's subscription allows them to activate. |
| **Accounting Bridge** **(project term)** | The MVP form of Accounting: posting rules, vouchers, Tally export, receivables/payables tracking — without a native general ledger. |
| **Job work** | Sending your material to an outside processor (job worker) for an operation and getting it back. Under Indian GST it needs a challan; the stock remains yours. |
| **Ups** | In printing: how many finished pieces fit on one printed sheet. |
| **Make-ready** | Setup work and wasted sheets before a print run produces good output. |
| **Product specification** **(project term)** | A customer-specific finished product (item + printing attributes + BOM + routing + artwork/die/plate links), reused for repeat orders. |
| **Tolerance** | Allowed over/under quantity (± %) when delivering or receiving against an order. |
| **Short-close** | Closing an order line although some quantity is still open; the balance is cancelled with a reason. |
| **OK sheet** | The first good printed sheet, approved before the print run continues. |
| **Gang run** | Printing several different jobs together on one sheet to save paper and machine time. |
| **Sheeting** | Cutting paper/board reels (or large parent sheets) into sheets. |
| **Conversion job / customer-supplied material** | The customer supplies the board; the printer charges only for printing and conversion. The material belongs to the customer. |
| **Moving weighted average** | Stock valuation where every receipt recalculates the average cost per unit; issues are valued at the current average. |
| **Landed cost** | Purchase price plus freight and other costs to bring material into stock. |
| **Three-way match** | Comparing PO, GRN and vendor invoice before accepting the bill. |
| **MSME 45-day rule** | Indian rule requiring payment to registered micro/small vendors within 45 days (with tax consequences if late). |
| **Export batch** **(project term)** | A group of accounting vouchers exported together to Tally, with an acknowledgement status. |
| **Books-locked date** **(project term)** | A date before which no new postings are allowed (the accountant has closed that period). |
| **COA** | Certificate of Analysis — a document certifying that a delivered lot meets specification; demanded by pharma customers. |
| **Effective configuration** **(project term)** | The final configuration a tenant runs with, after merging all layers (platform → module → localization → industry → tenant → company/site). |
| **Override / extend / lock** **(project term)** | The three ways layers combine: replace a value / add items / forbid higher layers from changing an item. |
| **Runtime settings** **(project term)** | Configuration changed by tenant admins through screens, stored in the database and audited (approval limits, numbering, roles…). |
| **Package manifest** | The header file of a package: id, version, compatible platform, dependencies, extension bindings, locks. |
| **SemVer** | Semantic Versioning: MAJOR.MINOR.PATCH — breaking change / new features / fixes. |
| **JSON Schema** | A standard way to describe and validate the structure of configuration files. |
| **YAML** | A human-friendly text format for configuration files. |
| **CEL** | Common Expression Language — a small, safe language for writing conditions like `doc.amount > 500000`. |
| **Decision table** | A table of conditions and outcomes (e.g., value band → approver), based on the DMN standard. |
| **Extension fields** **(project term)** | Fields added by packages or tenants, stored as validated JSON data alongside core fields. |
| **Terminology override** | A package renaming platform terms for its industry (Job, Batch, Work order) without changing the underlying object. |
| **Gapless numbering** | Document numbers with no missing values in the sequence; required for GST invoices, notes and challans. |
| **Three-way merge** | Combining old package, new package and the tenant's own changes during an upgrade, detecting conflicts. |
| **Staging tenant** | A copy of a customer's tenant used to test configuration changes and upgrades before production. |
| **Cut-over / go-live** | The moment a customer stops using the old way of working and starts using the ERP. |
| **Opening balances** | Stock, open orders and unpaid invoices brought into the ERP at go-live, instead of full history. |
| **STRIDE** | Threat-modelling checklist: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege. |
| **Scope** **(project term)** | The part of the organization a role assignment applies to: tenant, company, site, warehouse, region/BU, own records, assigned records, external party. |
| **Field security / field group** | Rules that hide or protect groups of fields (costs, margins, bank details) from roles that should not see them — enforced on the server. |
| **Approval authority** | The value limit up to which someone may approve, separate from the permission to approve. |
| **Delegation** | Temporarily giving your approval authority to someone else for a fixed period. |
| **Segregation of duties (SoD)** | Preventing one person from completing a risky chain alone (e.g., creating a vendor and paying it). |
| **Step-up re-authentication** | Asking for password/MFA again inside a session before a sensitive action. |
| **TOTP / authenticator app** | Time-based one-time codes from an app such as Google Authenticator — a common MFA method. |
| **Passkey** | Passwordless, phishing-resistant login using the phone or computer's built-in security (WebAuthn/FIDO2). |
| **Row-Level Security (RLS)** | A database feature that hides rows from queries unless they belong to the current tenant — a second lock behind the application. |
| **Hash chain** | Each audit entry contains a fingerprint of the previous one, so deleting or editing an entry is detectable. |
| **Data Fiduciary / Data Processor** | Under the DPDP Act: the organization deciding why personal data is processed (our customer) / the one processing it on their behalf (us). |
| **CERT-In** | India's national cyber-security agency; requires incident reporting within 6 hours and 180-day log retention in India. |
| **OWASP ASVS** | An open standard listing application security requirements in three levels; we target Level 2. |
| **RPO / RTO** | Recovery Point Objective (how much data we may lose) / Recovery Time Objective (how long until service is back). |
| **3-2-1 backup** | Three copies of data, on two different media/services, one in another location. |
| **Break-glass access** | Emergency access without normal approval, allowed only in incidents and always reviewed afterwards. |
| **Inner-platform effect** | The anti-pattern of building a system so configurable that it becomes a poor copy of a programming language/database. A key risk for this project. |

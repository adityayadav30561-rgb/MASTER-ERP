# The Story So Far — plain-language explanation

> **Status:** Living document · **Last updated:** 2026-10-03 (after Step 3)
> **Use this** when you need to explain the project to someone else: a partner, a customer, a developer. No jargon without an explanation.

## TL;DR

We are designing one ERP platform that can be configured into a Printing ERP, a Pharma ERP and so on, starting with **Printing & Packaging companies in India**. Steps 1–3 decided **what the platform is**, **what its building blocks mean**, and **how it is split into modules**. No code has been written yet, on purpose.

---

## Step 1 — What are we building?

**In one sentence:** a system where every business event (an order, a delivery, a payment) becomes a numbered **document**. Documents move through controlled stages (Draft → Approved → Done) and update **ledgers**, the permanent records of stock and money. Industry and country differences come from **configuration**, not from separate software.

```mermaid
flowchart LR
    E["Something happens<br/>(customer orders 10,000 cartons)"] --> D["A document records it<br/>(Sales Order)"]
    D --> S["It moves through stages<br/>(approved, produced, dispatched)"]
    S --> L["Stock and money ledgers update"]
    L --> R["Reports show the truth"]
```

**Key ideas:**

1. **Seven layers.** From bottom to top:
   - Platform engine (kernel)
   - Shared business data: customers, items, units
   - Modules: Sales, Purchase, …
   - Country rules: Indian GST
   - Industry packages: Printing
   - One customer's settings
   - One customer's custom additions

   Lower layers never know about higher ones. That is what lets one engine serve many industries and countries.
2. **Industry packages are mostly configuration, plus a little code** for real calculations, such as "how many cartons fit on one sheet".
3. **Five levels of change**, from safe to dangerous: settings → configuration → customization → extension → changing the core. Changing the core for one customer is forbidden; it would make every upgrade painful.
4. **Decisions taken:**
   - Win on industry depth and fast go-live, not on price (Odoo and ERPNext are free).
   - Printing & Packaging first, India first.
   - Pharma only as a design test.
   - Invoices are GST-correct, and accounts go to Tally (no own accounting ledger yet).
   - The founder configures customers in year 1.
   - Build in complete "slices" that can be demonstrated.

## Step 2 — What do the words mean, and how do the pieces fit?

1. **A company is described by several structures, not one tree:**
   - **Legal:** company, GSTIN
   - **Physical:** site, warehouse, rack
   - **People:** department, team
   - **Money:** cost and profit centers
   - **Grouping:** a flexible tree for regions and business units

   Example: one printing plant can serve both the Cartons and the Labels business units.
2. **Access is always "role + where".** "Store Manager *at the Bhiwandi plant*" cannot touch stock in Vapi. "Can approve" and "up to how much" are kept separate.
3. **Six kinds of things in the system:**
   - **Masters:** customers, items
   - **Documents:** orders, invoices
   - **Document lines**
   - **Ledger entries:** stock and money movements
   - **Anchors:** a printing **Job** that groups everything about one order
   - **Configuration**
4. **A business process is a chain of linked documents.** Real life is messy: one order goes out in three deliveries, and one invoice covers two orders. Links with quantities handle that.
5. **Two levels of status.** Fixed core stages keep the system correct, for example "you can only receive goods against an approved order". Each customer adds their own sub-statuses and approval chains on top.
6. **Nothing confirmed is ever edited.** Mistakes are fixed by cancelling, reversing or amending, which is what auditors and tax law expect.

## Step 3 — How is the system split into modules?

**A module is defined by what it owns.** Every document type has exactly one owner module.

```mermaid
flowchart LR
    SAL["Sales<br/>estimates, quotations,<br/>orders, invoices"]
    PUR["Purchase<br/>requisitions, orders,<br/>vendor bills"]
    INV["Inventory<br/>receipts, deliveries,<br/>transfers, issues<br/>(owns the stock ledger)"]
    MFG["Manufacturing<br/>BOMs, production orders,<br/>job cards"]
    QUA["Quality<br/>inspections,<br/>release / reject"]
    ACC["Accounting Bridge<br/>vouchers, Tally export,<br/>who owes whom"]
    SAL -.-> INV
    PUR -.-> INV
    MFG ==> INV
    QUA ==> INV
    ACC -.-> SAL
    ACC -.-> PUR
```

**Key ideas:**

1. **Only Inventory changes stock.** Other modules ask it to. One place, one set of rules.
2. **Invoices belong to Sales and Purchase.** Invoicing therefore works even while the books are kept in Tally.
3. **The printing Job belongs to the Printing package.** The general modules don't need to know what a Job is.
4. **Three kinds of dependency:**
   - **"Can't work without":** Manufacturing needs Inventory.
   - **"Works better with":** Sales and Inventory.
   - **"Sold together":** editions.

   Every module says what it does when a partner module is switched off.
5. **Modules talk only through published "contracts"**, never by reading each other's data directly. Anything that moves stock or money happens all-or-nothing.
6. **Each module carries a manifest**, a declaration of what it needs and offers. The system uses it to switch modules on and off and to show each user only the menus they need.
7. **Year 1 sells one tested bundle, "Printing Essentials":** Sales, Purchase, Inventory, Manufacturing, Quality, Accounting Bridge, the India rules and the Printing package.

## What's next

- **Step 4:** map the real business flows: enquiry → estimate → order → job → production → dispatch → invoice → payment, and purchase → receipt → inspection → stock.
- **Before Step 4:** talk to at least one real printing company. Otherwise we design textbook processes instead of how Indian printers actually work.

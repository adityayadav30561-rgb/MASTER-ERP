# ADR-0022: Voucher-level Tally export with export locks and books-locked date

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 4E §6–§9](../01-discovery/STEP-04E-RETURNS-CORRECTIONS-AND-ACCOUNTING.md#part-2--accounting-bridge-record-to-report-for-the-mvp); question [Q-18](../tracking/OPEN-QUESTIONS.md#q-18)

## Context

[ADR-0010](ADR-0010-ACCOUNTING-VIA-TALLY-FIRST.md) decided that Tally keeps the books in the MVP.
We must decide what is exported, how duplicates are prevented, and how the ERP and Tally stay in
agreement when documents are corrected.

## Decision

- Export **financial vouchers at ledger level**: sales, purchases, receipts, payments, credit and debit notes, scrap sales. Stock and production costing are not exported.
- Our accounts map to **Tally ledger names** per company. Parties are exported as ledger masters before their first voucher.
- Vouchers travel in **export batches** with a stable voucher id (idempotent). A failed batch can be regenerated without duplicates.
- Documents in an **acknowledged** batch are locked. Corrections are new documents in a later batch.
- A **books-locked-up-to date** setting prevents back-dated postings.
- A monthly **reconciliation report** compares ERP and Tally totals.

## Consequences

- Item-level export (stock in Tally) is a possible later option, not the default.
- The accountant's workflow changes from data entry to import + review, which is our selling point to them.

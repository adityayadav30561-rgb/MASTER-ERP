# ADR-0010: GST-correct invoicing + Tally export first; native general ledger later

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 1 C7](../01-discovery/STEP-01-PLATFORM-DEFINITION.md#12-assumptions-challenged); answers [Q-03](../tracking/OPEN-QUESTIONS.md#q-03)

## Context

Indian SME accountants use Tally and resist changing it. A full finance module (GL, AR/AP, bank
reconciliation, GST returns, TDS) is large and the riskiest code to get wrong. But every dispatch
needs a GST-correct invoice, plus e-invoice and e-way bill above the thresholds.

## Decision

The MVP produces **GST-correct sales and purchase invoices** (with e-invoice and e-way bill
through the India localization pack). It generates **accounting vouchers from posting rules**
and **exports them to Tally**. A native general ledger comes later.

Posting rules exist from day one. They feed an exporter now and the native ledger later, so
the design does not change when native accounting arrives.

## Consequences

- An **Accounting** module exists from the MVP in a reduced form, the "Accounting Bridge": posting rules, voucher generation, Tally export, and receivables/payables tracking (see [Step 3](../01-discovery/STEP-03-MODULE-BOUNDARIES.md)).
- Invoices are owned by Sales and Purchase, not by Accounting, so invoicing works whatever accounting edition is active.
- How payments are recorded in the MVP is open: [Q-14](../tracking/OPEN-QUESTIONS.md#q-14).

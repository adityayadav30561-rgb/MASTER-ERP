# ADR-0050: Append-only ledgers with derived balances; moving average without retroactive recalculation; optimistic and ordered pessimistic locking

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 8 §7–§8](../01-discovery/STEP-08-DATA-ARCHITECTURE.md#7-ledgers-source-of-truth-and-derived-balances); question [Q-48](../tracking/OPEN-QUESTIONS.md#q-48)

## Context

Stock and money must stay consistent while many users post at once. Back-dated receipts are common in SMEs (bills entered late).

## Decision

- **Stock ledger entries:**
  - append-only
  - keyed by item, warehouse, location, tracking unit (reel/batch), **status** and **owner** (own or customer)
  - signed quantity in base UOM, and value for own stock only
  - linked to the source document
- **Reservation ledger:** the same append-only pattern.
- **Vouchers:** always balanced and append-only.
- **Balances are derived** (`stock_balance`, `item_cost`, open items), updated in the **same transaction** as the entries. A nightly check and a rebuild job guard against drift.
- **Negative stock** is off by default (a tenant setting).
- **Valuation:** perpetual **moving average at posting time**. A back-dated receipt affects the average from now on; differences on stock already issued go to a **valuation variance** entry. Back-dating is limited to the open period after the books-locked date. A month-end valuation check report supports the accountant.
- **Concurrency:**
  - **optimistic locking** (`version`) for editing documents and masters
  - short **row locks in a fixed order** for stock balances, cost rows and numbering counters
  - read committed isolation, short transactions, automatic retry of the transaction once on a deadlock
  - idempotency keys for repeated requests

## Consequences

- No retroactive rewriting of posted values.
- Small timing variances are visible instead of hidden.

# ADR-0015: Four inter-module communication patterns; contracts only

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 3 §8](../01-discovery/STEP-03-MODULE-BOUNDARIES.md#8-how-modules-talk-to-each-other)

## Context

In a modular monolith all modules share one database. Without rules, modules start reading each
other's tables, and the boundaries disappear. At the same time, stock and money effects across
modules must be all-or-nothing.

## Decision

Modules communicate only through published **contracts**, using four patterns:

1. **Query**: synchronous read.
2. **Command**: synchronous action inside the caller's transaction.
3. **In-transaction event**: subscribers run inside the publisher's transaction.
4. **After-commit event**: delivered through the outbox after commit.

Stock and money effects use patterns 2 or 3; everything else uses pattern 4. No module reads or
writes another module's tables. Events are past-tense and owned by the publisher.

## Consequences

- Cross-module postings stay ACID without distributed transactions.
- Notifications, search, dashboards and webhooks are decoupled and can never fire for rolled-back changes.
- Tooling to enforce the rules is chosen in Step 9.
- Detailed event and outbox design is in Step 7.

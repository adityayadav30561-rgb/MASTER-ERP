# ADR-0041: Transactional outbox and PostgreSQL job queue; at-least-once delivery with idempotent consumers; no broker until graduation triggers

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 7 §3–§5](../01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md#4-reliable-delivery-outbox-dispatcher-idempotent-consumers); question [Q-39](../tracking/OPEN-QUESTIONS.md#q-39)

## Context

After-commit reactions (notifications, inspections, webhooks, e-invoice) must never be lost, never fire for rolled-back changes, and never double-apply. A solo developer cannot run extra infrastructure without strong reason.

## Options considered

PostgreSQL outbox + Postgres job queue · Redis queues · RabbitMQ · Kafka · cloud queues.

## Decision

- **Deciding rule:** reactions required for a valid business state run **in the transaction**: stock and voucher postings, audit, statutory numbers, essential automations such as Job creation. Everything else runs **after commit**.
- After-commit events are written to a **transactional outbox** in the same transaction, dispatched to a **PostgreSQL-backed job queue**, and delivered **at least once**. Order is kept per document (subject).
- **Every consumer is idempotent** (inbox of processed event ids in the same transaction as its work).
- Failures retry with **exponential backoff**, then go to a **dead-letter list** with alerts and replay.
- Create/post APIs accept an **Idempotency-Key** header.
- **No external broker** until a graduation trigger: sustained load over about 50 events/second, many external consumers needing replay, or a module extracted into a service. The transport sits behind a kernel event port so it can be swapped.

## Consequences

- Zero extra infrastructure in the MVP.
- Library choice in Step 9.

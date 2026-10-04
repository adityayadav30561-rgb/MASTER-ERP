# ADR-0055: Kysely + SQL migrations; tenant context per transaction; Graphile Worker for jobs, outbox and schedules

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 9 §5](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#5-data-access-jobs-and-the-outbox); question [Q-54](../tracking/OPEN-QUESTIONS.md#q-54)

## Context

We need full control over transactions, row locks, Row-Level Security settings, NUMERIC-as-string handling, JSONB and plain SQL migrations (ADR-0035, 0041, 0049, 0050, 0052).

## Options considered

Prisma · TypeORM · Drizzle (acceptable alternative) · **Kysely**. For jobs: **Graphile Worker** · pg-boss (alternative) · BullMQ (needs Redis — excluded).

## Decision

- **Kysely**, a type-safe SQL query builder, with **plain SQL migration files** (forward-only, expand → migrate → contract).
- Every transaction **sets the tenant context** (session setting read by RLS policies) at its start.
- **Graphile Worker** for jobs: jobs added **inside the business transaction** (outbox), cron-style schedules, retries with backoff. It sits behind the kernel event/job port.

## Consequences

- No ORM magic; SQL is explicit and reviewable.
- Spike S3 proves RLS + Kysely + Graphile Worker + row-lock posting under concurrency.

## Implementation notes (Phase 1, 2026-10-04)

- **Spike S3 passed** ([results §3](../03-implementation/PHASE-1-SPIKE-RESULTS.md#3-s3--tenant-isolation-transactions-and-background-jobs)) on PostgreSQL 16 with Kysely 0.29 and Graphile Worker 0.18.
- The application connects as an **unprivileged role** (not owner, no BYPASSRLS); tables use `FORCE ROW LEVEL SECURITY`; the tenant is set per transaction with `set_config('app.tenant_id', …, true)`; an unset tenant matches no rows.
- Jobs are enqueued through a `SECURITY DEFINER` function that stamps the tenant from the transaction, so the app role needs no access to job tables. Commit-to-handler latency measured at ~44 ms.
- Ledger tables: the app role has INSERT/SELECT only (immutability enforced by privileges). Balance rows are locked in a fixed order: no deadlocks, no negative stock under 50 concurrent postings.

# ADR-0055: Kysely + SQL migrations; tenant context per transaction; Graphile Worker for jobs, outbox and schedules

- **Status:** Proposed
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

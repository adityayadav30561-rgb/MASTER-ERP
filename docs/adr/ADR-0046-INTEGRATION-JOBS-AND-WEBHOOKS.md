# ADR-0046: Integration jobs with visible states and retries; Standard Webhooks out; verify-store-dedupe-async in

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 7 §9](../01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md#9-integrations-calls-out-and-calls-in); question [Q-44](../tracking/OPEN-QUESTIONS.md#q-44)

## Context

External systems (GST e-invoice / e-way bill portals, Tally, email providers, customer webhooks) are slow, sometimes down, and may receive duplicate calls. Dispatch must not stop silently (risk R-16).

## Decision

- **Outgoing calls:**
  - Every outgoing call is an **integration job** with states: Pending → InProgress → Succeeded / RetryScheduled / NeedsAttention / ResolvedManually.
  - Jobs retry with backoff.
  - A **circuit breaker** pauses calls during outages and shows a banner with a queue count.
  - Duplicate submissions are treated idempotently (an "already registered" response counts as success).
  - **Manual resolution** records an external reference, audited.
- **Outgoing webhooks:**
  - **CloudEvents** payloads signed per **Standard Webhooks**.
  - Retries for about 24 hours, then auto-disable with an admin alert.
  - SSRF protection and a delivery log.
- **Incoming webhooks:** verify the signature → store the raw message → deduplicate by provider event id → process asynchronously.

## Consequences

- GST outages queue invoices visibly instead of breaking dispatch.
- An operations screen for integration jobs is in the MVP.

# ADR-0040: Event model — domain vs integration events, naming, CloudEvents envelope, key-fact payloads, trace correlation

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 7 §2](../01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md#2-what-an-event-is-recap-and-the-two-event-types); question [Q-38](../tracking/OPEN-QUESTIONS.md#q-38)

## Context

Many consumers (modules, automations, notifications, webhooks, search) react to business facts. Without a shared format, every consumer invents its own, and external partners get unstable payloads.

## Decision

- **Domain events** are internal and evolve with platform releases. **Integration events** are public and versioned (`.v1`), with a deprecation period.
- **Naming:** `<module>.<object>.<past-tense verb>`, declared in module manifests to form a generated **event catalogue**.
- **Envelope:** **CloudEvents**, with extensions `tenantid`, `traceparent` (**W3C Trace Context**), `causationid` and `actor`. Times in ISO 8601 UTC.
- **Payloads** carry key facts (ids, status, totals, scope). Consumers query the owner module for more. Integration payloads respect field security for the subscription's service account.

## Consequences

- One trace id links a user action to every downstream effect.
- Partners integrate against stable, documented versions.

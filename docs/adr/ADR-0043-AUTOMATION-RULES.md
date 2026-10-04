# ADR-0043: Automation rules — trigger + CEL condition + fixed action catalogue, run as system user with loop protection

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 7 §7–§8](../01-discovery/STEP-07-EVENTS-AND-AUTOMATION.md#7-automation-rules); question [Q-41](../tracking/OPEN-QUESTIONS.md#q-41)

## Context

Customers want "if X then do Y" without developers, but unrestricted automation causes loops, security holes and unexplained data changes.

## Decision

- An automation rule has three parts:
  - a **trigger**: an event or a schedule (cron-style, tenant time zone, idempotent run keys)
  - a **condition** in CEL
  - **actions** from a **fixed catalogue**: create-from, set sub-status/field, start workflow, notify, create task, call webhook
- Rules run as the tenant's **system user** with least-privilege permissions, audited with rule id and version.
- **Loop protection:** a causation chain with a maximum depth of 3, no self-triggering, and per-rule and per-tenant rate limits.
- **Essential** rules run in the transaction; **optional** rules run after commit with retries.
- Rules have a **dry-run** mode.
- Brief examples that are really invariants or core behaviour (QC fail blocks stock; production creates the FG receipt) stay in code, not in rules.

## Consequences

- Small, safe automation surface.
- Complex needs go to extension code.

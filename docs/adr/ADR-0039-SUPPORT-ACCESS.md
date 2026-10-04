# ADR-0039: No standing operator access; tenant-approved, time-boxed, audited support access

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-03
- **Discovery step:** [Step 6 §8](../01-discovery/STEP-06-SECURITY-ARCHITECTURE.md#8-external-users-and-support-access); question [Q-36](../tracking/OPEN-QUESTIONS.md#q-36)

## Context

Customers must trust that the platform operator (us) cannot browse their prices and customer lists. Support still sometimes needs to see the data.

## Decision

- The platform operator has **no standing access** to tenant business data.
- Support access works like this:
  1. Support requests access, giving a reason, a scope and a duration.
  2. The tenant owner or admin approves it, with step-up re-authentication.
  3. Access is granted as a time-boxed session marked SUPPORT.
  4. Every action is audited and visible to the tenant.
  5. Access expires automatically.
- **Break-glass** access without approval is allowed only for platform-wide incidents. It is logged, reported to the tenant afterwards and reviewed.

## Consequences

- Trust becomes a selling point.
- Support tooling must work within these constraints.

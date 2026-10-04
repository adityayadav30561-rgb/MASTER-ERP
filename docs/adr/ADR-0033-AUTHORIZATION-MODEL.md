# ADR-0033: Authorization — RBAC with scoped assignments, CEL record conditions and field security, in one deny-by-default service

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-03
- **Discovery step:** [Step 6 §5](../01-discovery/STEP-06-SECURITY-ARCHITECTURE.md#5-authorization--deciding-what-you-may-do); question [Q-31](../tracking/OPEN-QUESTIONS.md#q-31)

## Context

The brief requires module, object, action, field, record, organization-level and approval-level control, with custom roles. Pure RBAC cannot express "only at Bhiwandi" or "only my customers". A full policy engine is overkill for the MVP.

## Options considered

Pure RBAC · **RBAC with scoped role assignments + attribute conditions** · policy engine (OPA/Cedar/XACML) · relationship-based (Zanzibar).

## Decision

- Every request passes **eight checks** in one central service (kernel K4):
  1. tenant
  2. module entitlement
  3. role permission (`module.object.action`)
  4. **scope** (tenant / company / site / warehouse / grouping node / own / assigned / external party)
  5. **record conditions** (CEL)
  6. **field security** (field groups by data class)
  7. approval authority
  8. segregation of duties
- **Deny by default.** Everything is enforced server-side for UI, API, exports, search, prints and notifications.
- Roles are templates and fully customisable.
- The single interface allows a policy engine to be added later without changing modules.

## Consequences

- Permissions are declared in module manifests.
- An automated authorization test suite covers every endpoint.

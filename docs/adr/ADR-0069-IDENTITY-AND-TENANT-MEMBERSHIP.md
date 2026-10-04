# ADR-0069: One login per person, tenant membership, and sessions bound to one tenant

- **Status:** Proposed
- **Date:** 2026-10-04
- **Step:** Kernel minimum (identity); question [Q-68](../tracking/OPEN-QUESTIONS.md#q-68)
- **Builds on:** [ADR-0032](ADR-0032-AUTHENTICATION.md) (authentication), [ADR-0035](ADR-0035-TENANT-ISOLATION.md) (tenant isolation), [ADR-0058](ADR-0058-AUTHENTICATION-LIBRARY.md) (Better Auth)

## Context

Better Auth, like most authentication libraries, treats an e-mail address as one global account. Our data is per tenant, and some real people work for several tenants: a chartered accountant serving three printing companies, a group owner with two businesses, or our own implementer. ADR-0035 requires every request to carry exactly one tenant, identified by sub-domain and token claim, and both must agree.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Global identity + tenant membership** | One password, one MFA device, one passkey per person; matches how CAs and group owners work; standard SaaS pattern | Every login must check membership of the sub-domain's tenant |
| B. Separate login per tenant | Simple mental model | Same e-mail in several tenants fights the library's design; several MFA enrolments per person; password-reset ambiguity |

## Decision (proposed)

- **Identity (global):** person, credentials, MFA, passkeys and sessions are stored in the `identity` schema, managed by Better Auth. There is no tenant data there.
- **Membership (per tenant):** `kernel.tenant_membership` links a person to a tenant. It holds the status, the employee code and the shop-floor PIN hash, and it is protected by RLS like all tenant data. **Role assignments refer to the membership.**
- **Session bound to one tenant:** the session stores the tenant chosen at login (from the sub-domain). Every request checks that the sub-domain tenant equals the session tenant **and** that the membership is active. Switching tenant means a new session on the other sub-domain.
- **Shop-floor devices** belong to a tenant and a site. A PIN login resolves the device's tenant first, then the membership by employee code.
- **Password policy (ADR-0032):** at least 15 characters, or at least 8 once MFA is enabled; checked against breached-password lists where the network allows; Argon2id.

## Consequences

- ✅ A person keeps one strong credential and one MFA device across tenants.
- ✅ Data isolation is unchanged: identity tables hold no business data, and everything tenant-specific sits behind RLS.
- ⚠️ The login flow has one extra step: the membership check. It is covered by tests.
- ⚠️ If a tenant needs its own identity provider (enterprise SSO), it is configured per tenant through OIDC (ADR-0032), linked to the same identity.

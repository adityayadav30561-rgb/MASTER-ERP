# ADR-0035: Layered tenant isolation with database Row-Level Security and cross-tenant tests

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-03
- **Discovery step:** [Step 6A §2](../01-discovery/STEP-06A-ISOLATION-AUDIT-PRIVACY-AND-OPERATIONS.md#2-tenant-isolation); question [Q-33](../tracking/OPEN-QUESTIONS.md#q-33)

## Context

A cross-tenant data leak is the single most damaging SaaS failure (R-06). Application filters alone fail when one query forgets the tenant condition.

## Decision

- A **tenant context** is set on every request and job. The tenant is identified by sub-domain and token claim, and both must agree.
- **Every** business row carries a tenant id.
- **PostgreSQL Row-Level Security** policies act as a second, independent lock that the application user cannot bypass.
- Files, caches, search indexes, queues and logs are **tenant-keyed**. Files are served only via short-lived signed URLs.
- An **automated cross-tenant test suite** runs for every endpoint in every build.
- **Single-tenant restore** is supported.
- The design keeps a path open to move a tenant to a dedicated database or server (enterprise, on-premise). Topology is decided in Step 8/9.

## Consequences

- Every table and query design must include the tenant id.
- Platform-operations tooling that crosses tenants is separate and audited.

## Implementation notes (kernel minimum, 2026-10-04)

- Built in the kernel minimum ([§3.1](../03-implementation/KERNEL-MINIMUM.md#31-database-layer-and-tenant-isolation-adr-0035-00470049-0052)): transaction-local tenant context, RLS on every tenant table, unset tenant = no rows. RLS is **not forced** on the table owner (provisioning, audit sealing and migrations run as owner on purpose); instead the application role never owns tables and the server **refuses to start** as a superuser, owner or BYPASSRLS role (`assertApplicationRole`).

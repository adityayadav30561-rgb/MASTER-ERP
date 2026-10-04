# ADR-0048: Pooled multi-tenancy by default with a silo / on-premise option on the same schema

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 8 §3](../01-discovery/STEP-08-DATA-ARCHITECTURE.md#3-multi-tenancy-layout); question [Q-46](../tracking/OPEN-QUESTIONS.md#q-46)

## Context

Brief §14 asks to evaluate shared DB, schema per tenant, DB per tenant and hybrid, considering cost, security, scalability, backup, isolation, migration, performance and enterprise deployments.

## Options considered

| Option | Verdict |
| --- | --- |
| Pool (shared schema + `tenant_id` + RLS) | Lowest cost; one migration; needs strong isolation, which ADR-0035 provides |
| Schema per tenant | Migrations multiply; catalog bloat beyond ~100 tenants |
| Silo (database per tenant) | Strongest isolation, higher cost |
| **Hybrid pool + silo** | Chosen |

## Decision

- **Default:** tenants share one database and schema, with `tenant_id` on every row and Row-Level Security.
- **Silo option:** enterprise, very large or on-premise tenants get a dedicated database or server, with the **same schema and code** (and still `tenant_id` + RLS).
- A **tenant directory** records placement, region, status and plan.
- Tenants can be moved between placements by a tenant-scoped export/import.
- **Per-tenant restore** is tooled: point-in-time restore to a temporary instance, extract the tenant, import.

## Consequences

- Migrations run across all databases in the directory.
- On-premise and private-cloud deployments (brief §27) are not blocked.

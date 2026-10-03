# ADR-0030: Tenants pinned to package versions; upgrades by staging dry-run and three-way merge

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 5A §5–§7](../01-discovery/STEP-05A-PACKAGES-UPGRADES-AND-ONBOARDING.md#6-upgrading-a-tenant-to-a-new-package-version); question [Q-27](../tracking/OPEN-QUESTIONS.md#q-27)

## Context

Packages evolve. Customers have their own configuration on top. Upgrades must neither lose customer changes nor break running work (risk R-12).

## Decision

- Each tenant is **pinned** to exact package versions.
- Packages follow **SemVer**: MAJOR = breaking change, MINOR = additions, PATCH = fixes.
- An upgrade runs in this order:
  1. compatibility check
  2. copy the tenant to **staging**
  3. **three-way merge** (old package, new package, tenant changes), where locks win and conflicts are decided by the implementer
  4. migrations
  5. package and smoke tests
  6. production in a maintenance window
- The previous version is kept for rollback.
- Running documents and workflows keep the configuration version they started with.

## Consequences

- A staging tenant per customer is needed from the first pilot.
- MAJOR upgrades require customer agreement and a migration plan.

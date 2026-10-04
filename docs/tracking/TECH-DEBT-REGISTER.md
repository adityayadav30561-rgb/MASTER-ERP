# Technical-Debt Register

> **Status:** Living document · **Last updated:** 2026-10-04 (kernel minimum)
> **Policy:** [Risks & Tech-Debt Strategy](../02-blueprint/RISKS-AND-TECH-DEBT.md) ([ADR-0066](../adr/ADR-0066-TECH-DEBT-POLICY.md))

## TL;DR

- This file lists every **deliberate** shortcut, why it was taken, what it will cost later and **when it must be repaid**. It is reviewed at the end of every slice.
- Forbidden shortcuts are never recorded here, because they are never taken.

| ID | Shortcut | Area | Why now | Cost later | Repay when (trigger) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TD-01 | Manual SaaS billing | Billing | Few customers | Build billing integration | > 10 paying tenants | Planned |
| TD-02 | Tally XML file export (no live connector) | Accounting | Works everywhere | Build local connector | Customers ask for automatic sync | Planned |
| TD-03 | Admin screens only for frequent settings | Configuration | Implementer-led year 1 | Build self-service screens | ≥ 3 customers ask for the same | Planned |
| TD-04 | No offline mode on phones | Frontend | Online PWA with retries | Local storage + sync | Poor shop-floor connectivity at a customer | Planned |
| TD-05 | Single region, pooled production database | Infrastructure | Cost; RTO ≤ 4 h acceptable | Silo / standby setup | Enterprise customer or SLA > 99.5% | Planned |
| TD-06 | Simple machine queue (no scheduling engine) | Manufacturing | Planners schedule by experience | Scheduling feature | Customer with > 10 machines asks | Planned |
| TD-07 | No package inheritance | Configuration | One vertical | Inheritance + merge rules | Second vertical starts | Planned |
| TD-08 | Email sent from our domain (reply-to tenant) | Notifications | Simplicity | Per-tenant domain verification | Customers ask | Planned |
| TD-09 | CloudWatch only; error tracking optional | Observability | Cost | Add error tracking / dashboards | > 5 tenants | Planned |
| TD-10 | PDF tests skip in CI (no browser installed there) | Testing | Spike stage | Install Chromium in CI | PDF renderer moves into the kernel | Open |
| TD-11 | TypeScript pinned to 6.0 (TypeScript 7 exists) | Tooling | typescript-eslint supports < 6.1 only | Upgrade and fix new errors | typescript-eslint supports TypeScript 7 | Open |
| TD-12 | Local-disk file storage only (no S3-compatible adapter yet) | Files | No hosting account yet | Write and test the S3 adapter | Before the pilot goes live | Open |
| TD-13 | No sweep of objects orphaned by rolled-back uploads | Files | Rare, harmless | Periodic sweep job | Slice 1, or storage cost noticeable | Open |
| TD-14 | Login rate limits kept in process memory | Identity | One web process in the pilot | Database or shared store | Before running two web containers | Open |
| TD-15 | No Docker image / staging deployment yet | Infrastructure | Nothing to deploy before Slice 0 | Image with Node + Chromium; staging | Slice 0 (demo tenant) | Open |

**How to add an entry:** next ID, all columns filled, link to the ADR or slice that introduced it, and a row in the [decision log](DECISION-LOG.csv) if it was a founder decision.

# Technical-Debt Register

> **Status:** Living document · **Last updated:** 2026-10-04 (Slice 0)
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
| TD-15 | No staging deployment yet (the image exists since Slice 0) | Infrastructure | No hosting account yet | Staging environment, deploy pipeline | Before the pilot goes live | Open |
| TD-16 | No `Idempotency-Key` handling and no per-client rate limits on the API | API | Masters only; forms disable double submit | Idempotency store + middleware; rate limiter | Slice 1 (first documents and integrations) | Open |
| TD-17 | Admin sets a person's first password (no invitation e-mail) | Identity | No notification engine yet | Invitation e-mail with a one-time link | Slice 1 (notification engine) | Open |
| TD-18 | Image without Chromium (no PDF printing in production) and 818 MB in size | Infrastructure | No printed document before Slice 1 | Chromium layer; prune dependencies | Slice 1 (first printed document) | Open |
| TD-19 | Web app is one 550 kB bundle (175 kB gzipped); no route-level code splitting | Frontend | Few screens | Lazy routes | Bundle over 300 kB gzipped or slow first load on phones | Open |
| TD-20 | No Content-Security-Policy / security headers on the web app | Security | Same-origin app, no third-party scripts | Add headers (helmet) and test | Before the pilot goes live | Open |
| TD-21 | Identity accepts an `x-tenant` header besides the sub-domain | Identity | Handy in tests and tools | Accept it only from trusted proxies | Before the pilot goes live | Open |
| TD-22 | Excel upload protected by size and row caps only (no check of the unzipped size) | Import | 2 MB cap; imports are by admins | Check the zip directory before loading | Imports open to more roles, or a public API for import | Open |

**How to add an entry:** next ID, all columns filled, link to the ADR or slice that introduced it, and a row in the [decision log](DECISION-LOG.csv) if it was a founder decision.

# Current State — session hand-off

> **Read this first in every session.** · **Last updated:** 2026-10-04 (Slice 0 built)

## Phase

**IMPLEMENTATION — Slice 0 (Foundation): built; all five exit criteria pass.**

- **Slice 1 (Buy & store) starts when the founder says so** ([IMPL-11](../tracking/DECISION-LOG.csv)).
- Build only what the [roadmap](../02-blueprint/ROADMAP-AND-MVP.md) lists for the current slice.

## Progress

```mermaid
flowchart LR
    P0["Phase 0<br/>Discovery<br/>Steps 1–10"]:::done --> SP["Phase 1<br/>Repo · CI · spikes"]:::done --> KM["Kernel<br/>minimum"]:::done --> S0["Slice 0<br/>Foundation"]:::done --> S1["Slice 1<br/>Buy & store"]:::todo --> S24["Slices 2–4<br/>MVP"]:::todo
    classDef done fill:#d9f2d9,stroke:#2e7d32
    classDef todo fill:#eeeeee,stroke:#999999
```

| Item | Status | Where |
| --- | --- | --- |
| Steps 1–10 | **Accepted** | [BLUEPRINT](../02-blueprint/BLUEPRINT.md) |
| Repository, CI, spikes S1–S5 | ✅ | [Developer Guide](../03-implementation/DEVELOPER-GUIDE.md), [Spike results](../03-implementation/PHASE-1-SPIKE-RESULTS.md) |
| Kernel minimum | ✅ | [Kernel Minimum](../03-implementation/KERNEL-MINIMUM.md) |
| **Slice 0 — Foundation** | ✅ foundation masters · India pack · Printing package · demo tenant · onboarding · Excel import · REST API + OpenAPI · web app · Docker image · e2e tests | [Slice 0](../03-implementation/SLICE-0-FOUNDATION.md) |
| Slice 1 — Buy & store | ⏳ Waiting for the founder's go-ahead | [Roadmap §4](../02-blueprint/ROADMAP-AND-MVP.md#4-phase-wise-feature-breakdown-slices-with-exit-criteria) |

**Slice 0 exit criteria:**

| Criterion | Status | Proof |
| --- | --- | --- |
| A demo tenant is created from packages | ✅ | `node apps/server/dist/main.js demo`; `tenants/demo-printers` tests |
| Masters are imported from Excel | ✅ | e2e + import tests |
| MFA works for the owner | ✅ | e2e (enrolment, then sign-in with code) |
| A store keeper on a tablet sees only their screens | ✅ | e2e (tablet + PIN; server refuses other screens) |
| Cross-tenant and authorization tests are green | ✅ | kernel, server and API tests |

**Test status (2026-10-04):**

- `pnpm check` is green: **285 tests**.
- `pnpm --filter @master-erp/e2e e2e` is green: **6 browser tests**.
- `pnpm audit` is clean.
- The Docker image builds and runs migrate → demo → web. Its health check reports "healthy".

**Code map:**

| Folder | Contents |
| --- | --- |
| `platform/kernel` | Kernel services, plus `onboarding` and `importer`; migrations `0001–0009` |
| `platform/foundation` | Party, item, UOM, currency, tax; import targets; seeder; migration `0001` |
| `packages-config/india` | India localization pack |
| `packages-config/printing-packaging` | Printing & Packaging industry package |
| `tenants/demo-printers` | Demo tenant baseline and demo data |
| `apps/server` | REST API, serves the web app; commands web · worker · migrate · demo |
| `apps/web` | React web app |
| `apps/e2e` | Playwright browser tests |
| `Dockerfile` | The one image |

**Trackers:**

- The sheet: [DECISION-LOG.csv](../tracking/DECISION-LOG.csv), 103 rows (IMPL-04 … IMPL-11 added in Slice 0).
- Shortcuts: [TECH-DEBT-REGISTER](../tracking/TECH-DEBT-REGISTER.md), TD-01 … TD-22.
- Story: [STORY-SO-FAR](STORY-SO-FAR.md).

## Decided

- **Accepted ADRs:** ADR-0001 … ADR-0069. ADR-0069 is one login per person with a membership per tenant (Q-68 agreed).
- **Implementation decisions within accepted ADRs:**
  - Kernel: KERNEL-01…05.
  - Slice 0 (IMPL-03 … IMPL-10):
    - approval and notification engines moved to Slice 1
    - tenant baselines live in `tenants/`, and packages are independent
    - kg ↔ sheet is stored as an item unit conversion
    - Excel import: savepoint dry run, all or nothing
    - OpenAPI comes from our own `@Api` specs
    - the server serves the web app
    - PWA = web manifest only
    - the admin sets the first password until invitation e-mails exist

## Waiting for the founder

| Item | Question |
| --- | --- |
| Start Slice 1 (Buy & store)? | [IMPL-11](../tracking/DECISION-LOG.csv) |
| Weekly hours and target dates | [Q-66](../tracking/OPEN-QUESTIONS.md#q-66) |
| Validation (not blocking) | Demo GST rates and HSN codes, to be checked by a chartered accountant (IMPL-04). Sheets by nominal GSM, to be confirmed with a pilot (IMPL-05) |

## Next step: Slice 1 — Buy & store (after the go-ahead)

1. **Kernel additions moved from Slice 0:**
   - approval workflow engine (K7)
   - notification engine (K10: in-app + e-mail, invitation e-mails)
   - list scope filtering by site/store
   - `Idempotency-Key` handling (TD-16)
2. **Modules**, per [Roadmap §4](../02-blueprint/ROADMAP-AND-MVP.md#4-phase-wise-feature-breakdown-slices-with-exit-criteria):
   - **Purchase:** PO with approval, PO PDF by e-mail
   - **Inventory:** GRN with reels and weights, issue, transfer, adjustment, count, stock ledger
   - **Quality:** incoming inspection
   - **Accounting:** purchase vouchers, Tally export
3. **Image:** Chromium for PDFs (TD-18).
4. **Exit criteria:**
   - PO → approval → GRN (reels) → QC → stock → issue → count reconciles with the ledger
   - purchase bill three-way match
   - concurrency test on the last stock

## How to run things

| Task | How |
| --- | --- |
| Run all checks | `pnpm install && pnpm check` (PostgreSQL tests need `DATABASE_URL`; PDF tests need `PLAYWRIGHT_BROWSERS_PATH`) |
| Browser tests | `pnpm --filter @master-erp/e2e e2e` (needs PostgreSQL at `E2E_ADMIN_URL`, default `postgres://erp:erp@localhost:5432/postgres`) |
| Server, demo tenant, web app, image | [Developer Guide §2](../03-implementation/DEVELOPER-GUIDE.md#2-getting-started) |

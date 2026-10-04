# Developer Guide — working in the code repository

> **Status:** Living document · **Last updated:** 2026-10-04 (Slice 0)
> **Rules come from:** [ADR-0053](../adr/ADR-0053-LANGUAGE-AND-RUNTIME.md) (language, decimals) · [ADR-0054](../adr/ADR-0054-BACKEND-STRUCTURE-AND-BOUNDARIES.md) (structure, boundaries) · [ADR-0060](../adr/ADR-0060-ENGINEERING-PRACTICE.md) (testing, CI)

## TL;DR

- **One repository** holds the documents and the code. Code lives in internal packages managed by **pnpm workspaces**: `platform/`, `modules/`, `packages-config/`, `tenants/`, `apps/`, `tools/`, `spikes/`.
- **One command checks everything:** `pnpm check` runs lint, typecheck, module-boundary rules and all tests. `pnpm --filter @master-erp/e2e e2e` runs the browser tests. GitHub runs both on every push, and also builds the Docker image.
- **Three rules the build enforces:**
  1. Money and quantities never use JavaScript `number`.
  2. A module may use another module only through its `contract/` folder.
  3. The kernel never depends on anything above it.

---

## 1. Repository layout

```mermaid
flowchart TB
    subgraph APPS["apps/"]
        SRV["server<br/>REST API · serves web app"]
        WEB["web<br/>React app"]
        E2E["e2e<br/>browser tests"]
    end
    subgraph TEN["tenants/"]
        DP["demo-printers<br/>tenant baseline"]
    end
    subgraph CFG["packages-config/"]
        IN["india<br/>GST, GSTIN, HSN, UQC"]
        PP["printing-packaging<br/>attributes, roles, kg↔sheet"]
    end
    subgraph MOD["modules/ (Slices 1–4)"]
        M["purchase · inventory · quality ·<br/>sales · manufacturing · accounting"]
    end
    subgraph PLAT["platform/"]
        FND["foundation<br/>party · item · UOM · tax"]
        KER["kernel<br/>tenancy · identity · authz · …"]
    end
    SP["spikes/<br/>experiments, never imported"]
    APPS --> TEN --> CFG --> MOD --> FND --> KER
    APPS --> CFG
    APPS --> FND
    CFG --> FND
    SP -.-> KER
```

Arrows mean "may import". Imports only go **downward** (ADR-0002). `spikes/` may use the kernel, but nothing may import a spike. Two more rules: packages in `packages-config/` never import each other (the industry package stays country-neutral), and only `apps/` may import `tenants/`.

| Folder | What lives there | Today |
| --- | --- | --- |
| `platform/kernel` | L0 platform services | decimal, ids, db, tenancy, audit, documents, events, rules, authz, metadata, config, identity, files, pdf, testing ([Kernel Minimum](KERNEL-MINIMUM.md)) |
| `platform/foundation` | Party, Item, UOM, currency, tax framework, Excel import targets, seeder | Built ([Slice 0](SLICE-0-FOUNDATION.md)) |
| `modules/*` | Business modules with `contract/ domain/ application/ infrastructure/` | Slices 1–4 |
| `packages-config/*` | India localization and printing industry packages (YAML + small code) | `india`, `printing-packaging` v0.1 |
| `tenants/*` | Tenant baselines: one business's choices on top of the packages | `demo-printers` |
| `apps/*` | Server, web app, browser tests | `apps/server` (web, worker, migrate, demo), `apps/web`, `apps/e2e` |
| `spikes/*` | Phase 1 experiments S1–S5 ([results](PHASE-1-SPIKE-RESULTS.md)) | Done |

## 2. Getting started

| Step | Command |
| --- | --- |
| Install Node.js 22 LTS and pnpm 10 | `corepack enable` |
| Install dependencies | `pnpm install` |
| Start PostgreSQL, Mailpit, MinIO locally | `docker compose up -d` |
| Point tests at the database | copy `.env.example` to `.env`, or `export DATABASE_URL=postgres://erp:erp@localhost:5432/erp_dev` |
| Run everything | `pnpm check` |
| Only tests, watch mode | `pnpm vitest` |

Tests that need PostgreSQL or a browser **skip themselves** when `DATABASE_URL` or `PLAYWRIGHT_BROWSERS_PATH` is missing. CI provides PostgreSQL. Each database test file creates its own fresh, fully migrated database (`createTestDatabase()` from `@master-erp/kernel/testing`) and drops it afterwards.

### Running the server and the web app locally

| Step | Command |
| --- | --- |
| Build both | `pnpm --filter @master-erp/web build && pnpm --filter @master-erp/server build` |
| Migrate (owner role) | `DATABASE_OWNER_URL=… node apps/server/dist/main.js migrate` |
| Let the app role in | once per database: `create role erp_web login password '…'; grant erp_app to erp_web;` |
| Demo tenant | `DEMO_OWNER_EMAIL=… DEMO_OWNER_PASSWORD=… node apps/server/dist/main.js demo` (does nothing if it exists) |
| Web (API + app) | `DATABASE_URL=… BASE_URL=http://erp.localhost:3000 AUTH_SECRET=… FILES_SECRET=… WEB_DIR=apps/web/dist node apps/server/dist/main.js web` |
| Open it | `http://demo.erp.localhost:3000` (browsers resolve `*.localhost` to this machine; the first label is the tenant) |
| Web app with hot reload | `pnpm --filter @master-erp/web dev` (port 5173, `/api` proxied to port 3000) |
| Worker | same variables plus `DATABASE_OWNER_URL=…`, then `… main.js worker` |

Rules the server enforces:

- `DATABASE_URL` must be a login role that is a member of `erp_app` (never the owner). The server refuses to start otherwise.
- Secrets must be at least 32 characters.
- The owner must set up two-step sign-in at the first sign-in.

### Browser tests and the Docker image

| Task | Command |
| --- | --- |
| Browser tests (fresh database `erp_e2e`, demo tenant, Chromium) | `pnpm --filter @master-erp/e2e e2e`. Set `E2E_ADMIN_URL` if PostgreSQL is not at `postgres://erp:erp@localhost:5432/postgres` |
| Build the image | `docker build -t master-erp .` (the base image can be changed with `--build-arg NODE_IMAGE=…`) |
| Run it | `docker run --env-file … master-erp migrate`, then `… demo`, then `… web` (port 3000, runs as a non-root user, has a health check) |

## 3. The checks

| Command | What it does | Protects |
| --- | --- | --- |
| `pnpm lint` | ESLint with TypeScript rules; bans `parseFloat`, `toFixed` and direct use of the decimal library in business code | ADR-0053 decimal rule |
| `pnpm typecheck` | Strict TypeScript (`tsc -b`) | Type safety |
| `pnpm boundaries` | dependency-cruiser: no cycles, modules use only other modules' `contract/`, kernel imports nothing above it, nothing imports `spikes/` | ADR-0002, ADR-0015, ADR-0054 |
| `pnpm test` | Vitest: unit, property-based (fast-check) and PostgreSQL integration tests | Correctness |
| `pnpm --filter @master-erp/e2e e2e` | Playwright: the slice exit criteria in Chromium against the built server and web app | Slice exit criteria |
| CI `image` job | Builds the Docker image | ADR-0059 |
| CI `security` job | gitleaks (no secrets in Git) and `pnpm audit` (no high/critical vulnerable dependencies) | ADR-0037, ADR-0038 |

The boundary rules were tested by deliberately breaking them: an import of another module's `domain/`, an upward kernel import and a direct `big.js` import all fail the build.

## 4. Coding rules (short version)

1. **Money:** `Money.of("1234.50", "INR")`, never `1234.5`. Round only where a rule says so, and name the mode: `money.round("half-up")`.
2. **Decimals in JSON:** strings (`"12345.50"`). Use `DecimalString` / `MoneySchema` from `@master-erp/kernel/decimal`.
3. **Database:** `NUMERIC` values arrive as strings; convert with `Decimal.from(row.quantity)`.
4. **Tenant context:** every database unit of work runs inside `withTenant(db, ctx, tx => …)` from `@master-erp/kernel/db`. Never query tenant tables outside it.
5. **Permissions:**
   - Every endpoint declares its permission in `@Api({ permission })`.
   - `TenantApi.run(...)` runs the eight checks and opens the tenant transaction.
   - Responses pass through `redactFields` where field groups apply.
6. **Documents:** use `DocumentService` for creating and transitioning documents; never update `kernel.document` directly.
7. **No country or industry logic** in kernel or modules: GST goes to `packages-config/india`.
8. **TypeScript:**
   - Use erasable syntax only (no `enum`, no constructor parameter properties).
   - Relative imports end in `.ts`, so Node runs the source directly.
   - Exception: `apps/server` is compiled (`tsc`) because NestJS uses decorators; it injects kernel services by explicit tokens.
9. **Tests:** anything touching money or stock gets property-based tests. Database behaviour is tested on real PostgreSQL, never mocked.
10. **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`), and `pnpm check` green before pushing.

## 5. Tool versions (pinned)

| Tool | Version | Note |
| --- | --- | --- |
| Node.js | 22 LTS | `.nvmrc` |
| pnpm | 10.28 | `packageManager` field |
| TypeScript | 6.0.3 | TypeScript 7 exists, but typescript-eslint supports < 6.1 ([TD-11](../tracking/TECH-DEBT-REGISTER.md)) |
| Vitest | 5.0 | |
| ESLint / typescript-eslint | 10 / 8.71 | |
| dependency-cruiser | 18.5 | |
| big.js | 7.0 | Only inside `platform/kernel/src/decimal` |
| React / Vite | 19.3 / 8.3 | Web app |
| Tailwind CSS | 4.3 | Web app |
| TanStack Router / Query | 1.170 / 5.104 | Web app |
| Playwright (Test) | 1.56.1 | Matches the installed Chromium build |
| exceljs | 4.4.0 | Behind `@master-erp/kernel/importer` only; `uuid` overridden for an advisory |

Exact versions are saved (`save-exact`) so every machine and CI builds the same thing.

## Open questions raised

None.

## Related documents

[Phase 1 Spike Results](PHASE-1-SPIKE-RESULTS.md) · [Slice 0](SLICE-0-FOUNDATION.md) · [Step 9 §4](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#4-backend-structure-and-module-boundaries) · [Step 9A](../01-discovery/STEP-09A-INFRASTRUCTURE-DEVOPS-AND-COSTS.md) · [CLAUDE.md](../../CLAUDE.md)

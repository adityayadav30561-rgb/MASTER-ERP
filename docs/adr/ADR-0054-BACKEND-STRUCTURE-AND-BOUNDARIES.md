# ADR-0054: NestJS at the edges, framework-free domain, pnpm monorepo, tooling-enforced module boundaries

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 9 §4](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#4-backend-structure-and-module-boundaries); question [Q-53](../tracking/OPEN-QUESTIONS.md#q-53)

## Context

The modular monolith (ADR-0003) is only as good as its boundaries (R-08). Modules must stay independent so they can be activated, sold and possibly extracted later.

## Decision

- **NestJS** (Fastify adapter) for HTTP, dependency injection, guards (authentication and authorization), and interceptors (tenant context, idempotency, tracing).
- **Business logic in plain TypeScript** (ports and adapters), independent of the framework.
- **One repository** (pnpm workspaces): `platform/kernel`, `platform/foundation`, `modules/*` (each with `contract/`, `domain/`, `application/` and `infrastructure/` folders), `packages-config/*`, `tenants/*`, `apps/server`, `apps/web`, `tools/`.
- **Enforcement:**
  - dependency-cruiser rules: modules import only other modules' `contract/`; no upward imports
  - architecture tests: no SQL against other modules' schemas; foreign-key direction checked on the database catalogue
  - manifest validation in the build

## Consequences

- Boundary violations fail the build instead of eroding silently.

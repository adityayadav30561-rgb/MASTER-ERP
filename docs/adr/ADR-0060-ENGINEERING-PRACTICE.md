# ADR-0060: Environments, testing strategy, CI/CD with boundary and security checks, observability

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 9A §3–§6](../01-discovery/STEP-09A-INFRASTRUCTURE-DEVOPS-AND-COSTS.md#4-testing-strategy); question [Q-59](../tracking/OPEN-QUESTIONS.md#q-59)

## Context

A solo developer needs automation to keep quality high: ledgers must stay correct, tenants isolated, boundaries intact and releases safe.

## Decision

- **Environments:**
  - local (Docker Compose with PostgreSQL, MinIO, Mailpit)
  - CI (throw-away database)
  - **staging**, which doubles as the demo environment and the upgrade dry-run target
  - production
- **Testing:**
  - unit (Vitest)
  - **integration on real PostgreSQL** (Testcontainers)
  - **property-based ledger invariants** (fast-check)
  - **cross-tenant** and **authorization-matrix** suites
  - contract and package tests
  - migration tests
  - Playwright end-to-end tests per slice
  - k6 load test before go-live
  - OWASP ZAP baseline on staging
  - monthly restore drills
- **CI/CD on GitHub Actions:**
  - every pull request: lint, typecheck, dependency-cruiser boundary checks, all test suites, package/schema validation, secret scanning (gitleaks), dependency scanning (OSV), static analysis (Semgrep CE), image build and scan (Trivy)
  - merge: auto-deploy to staging with expand migrations, smoke tests, end-to-end tests and ZAP
  - production on manual approval
  - Conventional Commits, Keep a Changelog, SemVer tags; Dependabot/Renovate
- **Observability:** OpenTelemetry; structured logs without personal data, kept in India for ≥ 180 days; metrics including outbox lag and dead letters; uptime checks; alerts to the founder; pilot target 99.5% availability.

## Consequences

- Most quality rules from Steps 3–8 become automated gates, not good intentions.

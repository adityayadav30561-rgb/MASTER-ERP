# ADR-0062: REST + OpenAPI 3.1, API-first, versioned, with OAuth/API-key scopes; connectors as adapters

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** Step 10 — [API & Integration Architecture](../02-blueprint/API-AND-INTEGRATION-ARCHITECTURE.md); question [Q-60](../tracking/OPEN-QUESTIONS.md#q-60)

## Context

Brief §17–§18 require APIs for authentication, masters, transactions, reports, workflows, events, integrations and webhooks, so that third parties can build on the platform.

## Options considered

REST + OpenAPI · GraphQL · gRPC · mixed.

## Decision

- **REST over HTTPS with JSON**, described by **OpenAPI 3.1** generated from the platform's JSON Schemas. **API-first:** our own UI uses the same API.
- **Conventions:**
  - `/api/v1` URLs; lifecycle actions as `…/actions/{action}`
  - UUIDv7 ids; ISO 8601 dates; decimals as strings
  - cursor pagination, filters, sorting, field selection
  - ETag/If-Match optimistic locking
  - Idempotency-Key on POST
  - RFC 9457 errors
  - rate limits with 429 + Retry-After
  - `202 Accepted` + job resource for long operations
- **Versioning:** additive changes stay in the same version; breaking changes need a new major version; old versions supported ≥ 12 months.
- **Access:** session for our UI; OAuth 2 client credentials or scoped, hashed, expiring API keys for integrations (integration users with roles; field security applies); OAuth authorization code with tenant consent for partner apps later. All calls audited.
- **Bulk:** import and export jobs. **Push:** webhooks (CloudEvents + Standard Webhooks).
- **Connectors** are adapters behind ports, run as integration jobs, with credentials in the secret store and sold as add-ons where relevant.
- **No GraphQL** for now.

## Consequences

- One contract source for UI, partners and documentation.
- SDKs can be generated later.

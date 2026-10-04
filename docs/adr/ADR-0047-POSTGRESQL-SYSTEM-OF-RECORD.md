# ADR-0047: PostgreSQL as the single system of record

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 8 §2](../01-discovery/STEP-08-DATA-ARCHITECTURE.md#2-database-why-postgresql); question [Q-45](../tracking/OPEN-QUESTIONS.md#q-45)

## Context

The ERP needs ACID transactions for stock and money, row-level tenant isolation, flexible extension fields, search, large append-only tables and zero licence cost. Earlier decisions already assume RLS (ADR-0035), JSONB (ADR-0026) and a database-backed outbox (ADR-0041).

## Options considered

PostgreSQL · MySQL/MariaDB · SQL Server/Oracle · MongoDB.

## Decision

**PostgreSQL** is the single system of record for all modules, tenants and kernel services (including outbox, jobs and the search index). The version and managed-hosting choice are made in Step 9 (must offer Indian regions and point-in-time recovery).

## Consequences

- One database technology to learn, back up and operate.
- PostgreSQL-specific features (RLS, JSONB, full-text, partitioning) are used deliberately. This limits portability to other databases, which we accept.

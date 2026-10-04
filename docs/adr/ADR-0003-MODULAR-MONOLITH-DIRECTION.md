# ADR-0003: Modular monolith as the architectural direction

- **Status:** Accepted in principle (from the founder's brief). **Re-validated in Step 9** with a full comparison ([Step 9 §2](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#2-modular-monolith-vs-microservices--final-validation)); final acceptance pending [Q-51](../tracking/OPEN-QUESTIONS.md#q-51)
- **Date:** 2026-10-03
- **Discovery step:** Brief §29, §40 and the solo-developer guidance

## Context

One developer, near-zero budget, no customers yet. ERP postings (stock + accounting) need strong
transactional consistency across modules.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Microservices | Independent scaling and deployment | Distributed transactions across stock/finance; many deployments; monitoring cost; far too heavy for one developer |
| Plain monolith | Fastest start | Modules entangle; hard to sell/activate modules separately; hard to extract later |
| **Modular monolith** | One deployment, one database, ACID across modules; strict internal boundaries allow later extraction | Requires discipline (enforced module boundaries) |

## Decision

Build a **modular monolith**: one deployable application and one database, internally divided
into modules that own their data and communicate only through defined interfaces and events.
Extract a service only when a measured need appears.

## Consequences

- Module boundaries must be enforced by tooling (Step 9), not only by convention.
- Cross-module postings can use a single database transaction.
- Infrastructure stays minimal: one app server + PostgreSQL + object storage.

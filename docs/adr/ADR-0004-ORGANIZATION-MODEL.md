# ADR-0004: Organization = separate typed structures + configurable grouping tree

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 2 §2](../01-discovery/STEP-02-DOMAIN-MODEL.md#2-organization-model)

## Context

The brief proposes one hierarchy (Organization → Company → BU → Division → Department → Plant →
Warehouse → Location → Team → User). It mixes legal, physical, people and financial structures;
real companies (a plant serving two BUs, a department spanning plants) don't fit one tree.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| A. Fixed hierarchy | Simple | Doesn't fit reality |
| B. One generic configurable tree | Flexible | Still one tree; code can't rely on node meaning |
| **C. Separate typed structures + configurable grouping tree** | Fits reality; core can enforce legal/stock invariants | More concepts; permissions span structures |
| D. Generic graph | Maximum flexibility | Inner-platform effect; hard to secure and query |

## Decision

Option C. Fixed core concepts: Tenant, Company (legal entity), Tax registration, Site (typed:
plant/branch/office/depot), Warehouse, Location, Work center, Department, Team, Cost center,
Profit center. A **configurable grouping tree** (Region, Division, Business Unit, …) groups
companies and sites for reporting and security scopes.

Invariants: every document belongs to one company; every warehouse belongs to one site and one
company; inter-company stock movement is a sale/purchase; structures are effective-dated.

## Consequences

- Authorization scopes (Step 6) must accept nodes from several structures.
- Reporting can group by legal, physical or grouping dimensions independently.
- Business Unit and Branch are not separate fixed concepts (grouping node type / site type).

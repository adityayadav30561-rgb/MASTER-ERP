# ADR-0026: Custom and extension fields stored as metadata-validated JSON extension data

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 5 §6.3](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#63-where-custom-field-values-are-stored); question [Q-23](../tracking/OPEN-QUESTIONS.md#q-23)

## Context

Industry packages and tenants add fields (GSM, sheet size, "Plate rack no."). We need storage that works for many tenants in one database and survives upgrades.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Per-tenant real columns (schema changes) | Fast, typed | Schema per tenant; risky upgrades; poor fit for shared multi-tenancy |
| EAV tables | Flexible | Slow, complex queries |
| **JSON extension data validated by metadata** | One schema; flexible; indexable | Type safety from the metadata layer; reporting needs indexes or read models |
| Pre-allocated generic columns | Typed | Opaque mapping, hard limits |

## Decision

Core fields remain typed columns. Package and tenant fields are stored as **JSON extension data**, validated against field definitions on every write and indexed where they are searched or reported on. A field that becomes universal is **promoted** to a core column in a platform release, with a data migration. Physical design is in Step 8.

## Consequences

- No database schema changes are needed to add a field for one tenant.
- Reporting tools must understand extension fields through metadata.

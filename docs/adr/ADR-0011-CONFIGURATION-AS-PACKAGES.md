# ADR-0011: Year-1 configuration is authored by the implementer as version-controlled packages

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 1 §8, C4, C5](../01-discovery/STEP-01-PLATFORM-DEFINITION.md#8-l5--l6--customer-configuration-and-customization); answers [Q-04](../tracking/OPEN-QUESTIONS.md#q-04)

## Context

Self-service configuration means building visual builders for forms, workflows, rules, fields
and objects. Each is a multi-month project. In year 1, the founder implements every customer.

## Decision

Industry packages, localization packs and tenant configuration are written as
**version-controlled configuration files (packages)** and applied by the kernel's package loader
(K12). Admin screens are built only for settings customers change often: users, roles,
approval limits, numbering series and print templates. Visual builders come after at least
3 customers show which ones are actually needed.

## Consequences

- Configuration is reviewable, diffable and reproducible (Git history = configuration history).
- Configuration formats must be designed carefully (Step 5) because they become the contract later admin UIs must respect.
- A customer cannot change things outside the admin screens without the implementer, which is acceptable (and billable) in year 1.

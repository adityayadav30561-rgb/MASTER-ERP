# ADR-0016: Dependency types, without-modes and module manifests

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 3 §7, §9](../01-discovery/STEP-03-MODULE-BOUNDARIES.md#7-dependencies)

## Context

The brief asks to distinguish technical dependency, business dependency and optional
integration, and to support independent activation, licensing, permissions and navigation.

## Decision

- Three dependency kinds:
  - **Hard**: activation is refused without the dependency. The hard-dependency graph must have no cycles.
  - **Optional integration**: features appear when both modules are active, and each module has a documented **without mode**.
  - **Commercial bundling**: handled by entitlements and editions, not by code.
- Every module declares a **manifest**: dependencies, owned objects and ledgers, facets, permissions, default roles, navigation, settings, events published and consumed, extension points, reports, migrations.
- Activation checks the entitlement and hard dependencies, then applies the module's default configuration. Deactivation is refused if a dependent module is active, and **never deletes data**.
- Navigation shown to a user = active modules ∩ the user's permissions in their scope.

## Consequences

- Each without-mode is a test scenario.
- Manifests double as contract documentation.

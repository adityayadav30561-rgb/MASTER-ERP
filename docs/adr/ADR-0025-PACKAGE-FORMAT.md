# ADR-0025: Package format — YAML + JSON Schema, manifest, SemVer, migrations, tests

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 5A §2](../01-discovery/STEP-05A-PACKAGES-UPGRADES-AND-ONBOARDING.md#2-anatomy-of-a-package); question [Q-22](../tracking/OPEN-QUESTIONS.md#q-22)

## Context

Packages (industry, localization, tenant, add-on) must be readable by humans, validated by machines, versioned and upgradeable ([ADR-0023](ADR-0023-STANDARDS-FIRST.md): use standards).

## Decision

A package is a folder with:

- a **manifest**: id, type, SemVer version, compatible platform range, required modules and packages, extension bindings, locks
- configuration files authored in **YAML 1.2** and validated against published **JSON Schema 2020-12** schemas
- optional extension code
- version-to-version **migrations**
- **package tests**
- seed and demo data
- a changelog (Keep a Changelog)

Tenant packages contain configuration only, no code.

## Consequences

- JSON Schemas for every configuration file type become part of the platform contract.
- A package cannot be published unless schema validation, semantic validation and its tests pass.

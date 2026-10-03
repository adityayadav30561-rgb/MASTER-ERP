# ADR-0017: Year 1 sells one edition; entitlements exist from day one

- **Status:** Proposed
- **Date:** 2026-10-03
- **Discovery step:** [Step 3 §11](../01-discovery/STEP-03-MODULE-BOUNDARIES.md#11-editions-and-the-module-purchasing-model); question [Q-15](../tracking/OPEN-QUESTIONS.md#q-15)

## Context

Six core modules allow 63 combinations. Every combination we sell must be tested and supported.
A solo developer cannot do that.

## Decision

In year 1 we sell one edition, **"Printing Essentials"**:

- Sales (with Estimation)
- Purchase
- Inventory
- Manufacturing
- Quality (basic)
- Accounting Bridge
- India pack
- Printing package

The kernel's entitlement mechanism (per-module activation through manifests) is built from day
one. Add-ons and smaller editions are opened only after they are tested.

## Consequences

- The test matrix stays small.
- À-la-carte selling later is a commercial decision, not a rewrite.

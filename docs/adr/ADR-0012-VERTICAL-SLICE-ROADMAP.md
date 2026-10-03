# ADR-0012: Vertical-slice roadmap instead of horizontal phases

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Preliminary roadmap critique](../01-discovery/PRELIM-ROADMAP-CRITIQUE.md); answers [Q-11](../tracking/OPEN-QUESTIONS.md#q-11)

## Context

The brief's 20 phases build all the platform first, then module after module, with industry
packages at Phase 17. That leaves nothing to demo for months, and industry needs are
discovered too late.

## Decision

Build in **vertical slices**. Each slice is one complete, demonstrable printing flow, plus only
the platform features that flow needs:

0. Foundation
1. Buy & store
2. Estimate & make
3. Ship & bill
4. Control & visibility

The order of slices 1–3 follows the pilot customer's biggest pain. The final roadmap is written
in Step 10.

## Consequences

- Kernel services are built in "minimum first" form and grow slice by slice.
- The printing package and the India pack grow with the slices, not at the end.
- Module boundaries ([Step 3](../01-discovery/STEP-03-MODULE-BOUNDARIES.md)) must be clean from the first slice, because modules grow incrementally across slices.

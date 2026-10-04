# ADR-0065: Roadmap phases, MVP scope ("Printing Essentials") and slice exit criteria

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** Step 10 — [Roadmap & MVP](../02-blueprint/ROADMAP-AND-MVP.md); question [Q-63](../tracking/OPEN-QUESTIONS.md#q-63)

## Context

The vertical-slice roadmap (ADR-0012) needs a concrete MVP scope, ordering, exit criteria, non-functional targets and effort ranges before implementation.

## Decision

- **Phases:** 0 Discovery (done) → 1 Foundations + spikes S1–S5 → **Slices 0–4** (Foundation, Buy & store, Estimate & make, Ship & bill, Control & visibility) → 3 First customer → 4 Customers 2–5 → 5 Expansion → 6 Second vertical.
- **MVP = "Printing Essentials"**, with the in-scope and out-of-scope lists in the roadmap document.
- **Non-functional targets** follow ISO/IEC 25010, including:
  - p95 reads < 300 ms, posting < 1 s, invoice PDF < 3 s
  - 99.5% availability, RPO ≤ 15 min, RTO ≤ 4 h
  - job card on a phone in ≤ 30 s
  - WCAG 2.2 AA target
- Each slice has **exit criteria**, and every feature follows a **definition of done**.
- **Slice-by-slice go-live:** the first customer can start after Slice 1.
- **Effort:** about 36–51 focused developer-weeks (ranges; re-estimated after Phase 1).

## Consequences

- Scope creep is visible: anything not on the in-scope list needs a decision.
- The calendar depends on the founder's weekly hours (Q-66).

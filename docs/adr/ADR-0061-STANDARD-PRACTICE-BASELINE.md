# ADR-0061: Build on standard industry practice now; customise with the first customer

- **Status:** Accepted (founder decision, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** Answers [Q-10](../tracking/OPEN-QUESTIONS.md#q-10); affects [Step 4](../01-discovery/STEP-04-PROCESS-ARCHITECTURE.md)

## Context

Step 4's processes were written from general knowledge of Indian printing and packaging SMEs and
were to be validated by visiting a real company before implementation (Q-10). The founder decided
not to wait for that visit.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Wait for a pilot visit before implementation | Lowest risk of building the wrong process | Delays everything until a company is found |
| **Build on the most common, standard procedures; customise with the first customer** | Work starts now; the configuration-first design ([ADR-0024](ADR-0024-CONFIGURATION-LAYERS-AND-STORES.md)) absorbs differences | Some processes will need rework when real customer practice differs |

## Decision

Implementation uses the **standard industry processes documented in Step 4** as the baseline. The
first customer's real practice is captured during onboarding using the
[Pilot Interview Guide](../tracking/PILOT-INTERVIEW-GUIDE.md). Differences are handled in this order:

1. configuration (settings, sub-statuses, approvals, process definitions)
2. package changes
3. extension code
4. core change, only with a new ADR

## Consequences

- Questions marked "validate with pilot" (Q-09, Q-13, Q-18, Q-19, Q-21) become "**customise with the first customer**".
- **Architect's caution (non-blocking):** the most practice-sensitive area is **Slice 2** (estimation, job costing, wastage, job work). An informal 1–2 hour conversation with any printer before building Slice 2 is cheap insurance. It is recommended, not required.
- Vertical slices let the first customer go live slice by slice (stores first), so corrections arrive early ([Step 10 roadmap](../02-blueprint/ROADMAP-AND-MVP.md)).

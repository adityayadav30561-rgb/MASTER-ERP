# ADR-0028: Conditions in CEL, matrices as decision tables, no general scripting in the MVP

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 5 §8](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#8-rules-and-the-condition-language); question [Q-25](../tracking/OPEN-QUESTIONS.md#q-25)

## Context

Validation, default, approval, automation and notification rules need conditions that change per customer without code releases, while staying safe and upgradeable.

## Options considered

Hard-coded rules · JSON logic trees · **CEL expressions** · **DMN-style decision tables** · general scripting (JavaScript/Python sandbox) · visual rule builder.

## Decision

- Conditions are written in **CEL** (Common Expression Language): typed, non-Turing-complete, fast and side-effect free.
- Matrices (approval bands, rate lookups) are **decision tables** following DMN concepts.
- Complex logic is **extension code** bound to extension points.
- There is **no general-purpose scripting** in the MVP.
- A visual builder may come later; it will generate CEL.

## Consequences

- Rules can be validated and tested at package-publish time.
- No customer code runs inside the platform.

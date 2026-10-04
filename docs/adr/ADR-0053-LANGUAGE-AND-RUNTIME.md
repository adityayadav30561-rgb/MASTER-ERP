# ADR-0053: TypeScript end to end on Node.js LTS, with a strict decimal rule

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 9 §3](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#3-language-and-runtime); question [Q-52](../tracking/OPEN-QUESTIONS.md#q-52)

## Context

A solo developer must build backend, frontend, configuration tooling and tests. One language reduces context switching and lets AI assistants help across the whole codebase. ERP correctness depends on exact decimal arithmetic, which JavaScript does not provide natively.

## Options considered

TypeScript/Node.js · Python (Django) + TS frontend · C# (.NET) + TS frontend · Java/Kotlin (Spring) + TS frontend · Go + TS frontend.

## Decision

- **TypeScript** for backend (Node.js, current LTS), frontend and tooling.
- **Decimal rule (non-negotiable):**
  - money, quantities, rates and percentages use a shared **decimal value type** (Money / Quantity / Rate on a decimal library), never `number`
  - database NUMERIC values arrive as strings and APIs/events carry decimals as strings
  - rounding is explicit and named (GST paisa rounding, invoice round-off)
  - a lint rule and property-based tests enforce it
- CPU-heavy work (PDFs, big reports) runs in the worker process.

## Consequences

- One toolchain, one package manager, shared contracts between frontend and backend.
- Spike S4 must prove the decimal discipline end to end before implementation.

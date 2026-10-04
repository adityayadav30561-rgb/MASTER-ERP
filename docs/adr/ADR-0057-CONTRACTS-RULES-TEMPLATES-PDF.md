# ADR-0057: JSON Schema as the single contract language; OpenAPI 3.1; CEL library after spike; LiquidJS templates; Chromium PDF rendering in the worker

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 9 §6](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#6-contracts-validation-rules-templates-and-pdfs); question [Q-56](../tracking/OPEN-QUESTIONS.md#q-56)

## Context

Configuration packages, APIs, events and manifests all need validated contracts. Rules use CEL (ADR-0028). Statutory documents need high-fidelity PDFs with tenant branding (ADR-0052).

## Decision

- **Contracts:** **JSON Schema 2020-12** for packages, API payloads, events and manifests; authored with **TypeBox**, validated with **Ajv**.
- **APIs:** **OpenAPI 3.1** generated from the schemas; RFC 9457 errors.
- **CEL:** a JavaScript CEL implementation **chosen after spike S1** (conformance, sandbox limits, maintenance). Fallback: CEL compiled to WebAssembly, or our own restricted CEL subset with the same syntax.
- **Decision tables:** our own evaluator over CEL cells.
- **Templates:** **LiquidJS** (safe, logic-limited, branding-editable).
- **PDFs:** HTML/CSS rendered to PDF by **headless Chromium in the worker** (spike S5 checks speed and memory; Typst is an alternative).

## Consequences

- One schema source feeds validation, documentation and the UI forms.

## Implementation notes (Phase 1, 2026-10-04)

- **S1 (CEL):** library choice proposed in [ADR-0068](ADR-0068-CEL-LIBRARY.md) ([Q-67](../tracking/OPEN-QUESTIONS.md#q-67)).
- **S5 (PDF) passed** ([results §6](../03-implementation/PHASE-1-SPIKE-RESULTS.md#6-s5--pdf-tax-invoices)): LiquidJS with auto-escaping, headless Chromium with JavaScript disabled in documents; 3-copy GST invoice median ~200 ms; Chromium ~230–270 MB, so the **worker needs ~1 GB of memory**. Typst fallback not needed.
- JSON Schema 2020-12 validation uses Ajv's 2020 build (`ajv/dist/2020`).

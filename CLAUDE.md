# Instructions for AI assistants working in this repository

## Phase

**IMPLEMENTATION — Phase 1 (foundations and spikes)**, declared by the founder on 2026-10-04.
Discovery Steps 1–10 are accepted; the documents in `docs/` remain the source of truth.

- Build **only** what the current phase or slice in `docs/02-blueprint/ROADMAP-AND-MVP.md` lists.
  Anything else is a scope change: raise it as a question first.
- Code follows the accepted ADRs. A change of direction needs a new or superseding ADR.
- Spike results are written up in `docs/03-implementation/` and recorded as ADR implementation notes.

## Coding rules (from accepted ADRs)

- **Decimal rule (ADR-0053):** money, quantities, rates and percentages use
  `@master-erp/kernel/decimal` (`Decimal`, `Money`, `Quantity`, `Percent`). Never JavaScript `number`,
  `parseFloat` or `toFixed`. Decimals travel as strings in JSON and come from the database as strings.
- **Boundaries (ADR-0054):** a module imports only other modules' `contract/` folders; the kernel
  imports nothing above it; nothing imports `spikes/`. `pnpm boundaries` enforces this.
- **No country or industry logic in the kernel or modules** (ADR-0002): GST lives in
  `packages-config/india`, printing logic in `packages-config/printing-packaging`.
- TypeScript strict; only erasable syntax (no enums, no parameter properties) so Node runs the source directly.
- Before every commit: `pnpm check` (lint, typecheck, boundaries, tests) must pass.
- Tests: unit and property-based (fast-check) for anything touching money or stock; integration tests on
  real PostgreSQL (`DATABASE_URL`).
- Keep comments plain and short; cite the ADR a rule comes from.

## Read this first (keep context small)

1. `docs/00-context/CURRENT-STATE.md` — where we are, what is decided, what is next. **Always read.**
2. `docs/INDEX.md` — map of all documents. Open only the documents the current task needs.
   `docs/02-blueprint/BLUEPRINT.md` is the architecture on one page (27 parts → detailed docs and ADRs).
3. Every document starts with a **TL;DR** block. Read the TL;DR first; read the full document only
   if the task requires the detail.

Do not re-read the whole `docs/` tree at the start of a session. That wastes context.

## Working rules

- **Challenge assumptions.** The user explicitly asked for criticism. If an idea is weak, say so
  and propose a better one. Do not simply agree.
- **No silent major decisions.** A major decision is written as an ADR with status `Proposed`
  and the question is added to `docs/tracking/OPEN-QUESTIONS.md`. It becomes `Accepted` only
  when the user agrees.
- **Explain for a non-expert.** The user is learning ERP and architecture concepts and will
  explain these documents to others. Define terms, give concrete examples (printing and pharma
  are the reference industries), and add diagrams.
- **Do not over-engineer.** Solo developer, near-zero budget. Every piece of complexity must
  justify its business value.
- **Standards-first.** Follow recognised industry standards and laws wherever they exist
  (`docs/00-context/STANDARDS.md`, ADR-0023). Cite the standard in the ADR; deviations need an ADR.
- **Decision log sheet.** Every question raised and every decision taken is recorded in
  `docs/tracking/DECISION-LOG.csv` (one row each: question, options, recommendation, final
  decision, status, ADR, validation still needed). Keep it in sync with `OPEN-QUESTIONS.md` and
  the ADR index.

## Documentation conventions

See `docs/00-context/DOC-CONVENTIONS.md`. In short:

- One topic per file. File names in `UPPER-KEBAB-CASE.md` inside numbered folders.
- Every document: title, status line, TL;DR, body, "Open questions raised", "Related documents".
- Diagrams: Mermaid code blocks (GitHub renders them). Quote node labels that contain symbols.
- ADRs: `docs/adr/ADR-NNNN-short-title.md`, using the template in `docs/adr/README.md`.

## End of every working session

1. Update `docs/00-context/CURRENT-STATE.md` (done / decided / next, test status).
2. Update `docs/INDEX.md` if documents were added.
3. Update `docs/tracking/OPEN-QUESTIONS.md`, `docs/tracking/DECISION-LOG.csv` and `docs/adr/README.md`.
   Update `docs/tracking/COVERAGE-MATRIX.md` and `docs/00-context/STORY-SO-FAR.md` after each step.
4. Run `pnpm check`, then commit with a descriptive message (Conventional Commits, ADR-0060).

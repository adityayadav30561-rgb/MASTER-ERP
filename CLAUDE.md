# Instructions for AI assistants working in this repository

## Phase

The project is in **DISCOVERY + ARCHITECTURE**. Do **not** write application code, database
schemas, or UI components unless the user explicitly says the implementation phase has started.
The deliverables right now are Markdown documents with Mermaid diagrams.

## Read this first (keep context small)

1. `docs/00-context/CURRENT-STATE.md` — where we are, what is decided, what is next. **Always read.**
2. `docs/INDEX.md` — map of all documents. Open only the documents the current task needs.
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

1. Update `docs/00-context/CURRENT-STATE.md` (done / decided / next).
2. Update `docs/INDEX.md` if documents were added.
3. Update `docs/tracking/OPEN-QUESTIONS.md`, `docs/tracking/DECISION-LOG.csv` and `docs/adr/README.md`.
   Update `docs/tracking/COVERAGE-MATRIX.md` and `docs/00-context/STORY-SO-FAR.md` after each step.
4. Commit with a descriptive message.

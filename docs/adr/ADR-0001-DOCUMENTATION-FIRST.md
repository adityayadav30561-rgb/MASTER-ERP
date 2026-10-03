# ADR-0001: Documentation-first, Markdown + Mermaid in the repository

- **Status:** Accepted
- **Date:** 2026-10-03
- **Discovery step:** Process decision (founder's request)

## Context

The project is in discovery. The founder is learning ERP and architecture concepts, will explain
the product to others, and works with AI assistants whose working memory per session is limited.
Knowledge must survive between sessions and be explainable.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Chat history only | Zero effort | Lost between sessions; not shareable; not reviewable |
| External wiki / Google Docs / Notion | Nice editing | Separate from code; diagrams as images go stale; may cost money |
| **Markdown + Mermaid in the Git repo** | Versioned with the code; free; diagrams are text (editable, diffable); GitHub renders them; AI sessions read them directly | Less pretty than a wiki; Mermaid has layout limits |

## Decision

All product and architecture knowledge is written as Markdown files with Mermaid diagrams in
`docs/`, following [DOC-CONVENTIONS](../00-context/DOC-CONVENTIONS.md). Every major decision is
an ADR. `CURRENT-STATE.md` is the session hand-off file.

## Consequences

- Every working session ends by updating `CURRENT-STATE.md`, `INDEX.md`, open questions and ADRs.
- Documents start with a TL;DR so future sessions can load summaries instead of full text.
- Later, the same folder can be published as a documentation website without rewriting.

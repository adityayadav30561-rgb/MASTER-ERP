# MASTER-ERP

**A modular, configurable, multi-industry ERP / business operating platform.**

> One core platform → many industries → many organizations → many configurations.

## Current phase: IMPLEMENTATION — Phase 1 (foundations and spikes)

Discovery and architecture (Steps 1–10) are complete and accepted. The repository now holds the
documentation **and** the code: a pnpm monorepo with the first kernel package (exact money and
quantity types) and the five Phase 1 experiments. Run `pnpm install && pnpm check` to verify everything.

| If you want to…                                  | Read                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| See the whole architecture on one page            | [`docs/02-blueprint/BLUEPRINT.md`](docs/02-blueprint/BLUEPRINT.md)       |
| Understand the project in 5 minutes              | [`docs/00-context/PROJECT-BRIEF.md`](docs/00-context/PROJECT-BRIEF.md) |
| Explain the project to someone else              | [`docs/00-context/STORY-SO-FAR.md`](docs/00-context/STORY-SO-FAR.md)   |
| See every question and decision (sheet)          | [`docs/tracking/DECISION-LOG.csv`](docs/tracking/DECISION-LOG.csv)     |
| Work on the code                                 | [`docs/03-implementation/DEVELOPER-GUIDE.md`](docs/03-implementation/DEVELOPER-GUIDE.md) |
| See what the technical experiments proved        | [`docs/03-implementation/PHASE-1-SPIKE-RESULTS.md`](docs/03-implementation/PHASE-1-SPIKE-RESULTS.md) |
| Know where we are right now and what's next      | [`docs/00-context/CURRENT-STATE.md`](docs/00-context/CURRENT-STATE.md) |
| Look up an ERP word you don't know               | [`docs/00-context/GLOSSARY.md`](docs/00-context/GLOSSARY.md)           |
| See every document in reading order              | [`docs/INDEX.md`](docs/INDEX.md)                                       |
| See decisions we have made (and why)             | [`docs/adr/README.md`](docs/adr/README.md)                             |
| See questions waiting for an answer              | [`docs/tracking/OPEN-QUESTIONS.md`](docs/tracking/OPEN-QUESTIONS.md)   |

## How the documentation is organised

```mermaid
flowchart LR
    A["00-context<br/>brief, current state,<br/>glossary, conventions"] --> B["01-discovery<br/>Step 1 … Step 9<br/>(the thinking)"]
    B --> E["02-blueprint<br/>the whole plan<br/>on one page"]
    E --> F["03-implementation<br/>spike results,<br/>developer guide"]
    B --> C["adr<br/>Architecture Decision Records<br/>(the decisions)"]
    B --> D["tracking<br/>open questions,<br/>risks"]
    D -->|answered| C
```

Diagrams are written in **Mermaid** (text-based diagrams). GitHub renders them automatically,
so they stay versioned and editable alongside the text.

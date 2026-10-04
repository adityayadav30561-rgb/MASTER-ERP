# ADR-0051: Reporting through curated report datasets and read models; permission-filtered PostgreSQL search

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 8A §1–§2](../01-discovery/STEP-08A-REPORTING-SEARCH-AND-DATA-LIFECYCLE.md#1-reporting-architecture); question [Q-49](../tracking/OPEN-QUESTIONS.md#q-49)

## Context

Brief §22–§23 require standard and custom reports, drill-down, exports, dashboards, scheduled reports and global search. The brief warns against reports built from random joins of transactional tables.

## Decision

- **Tier 1:** module-owned **report datasets** (curated views encoding business meaning, applying scope and field security) feed all reports, exports, scheduled reports and future AI queries.
- **Tier 2:** **read models** (summary tables updated by events or refresh) for dashboards and heavy analyses. Heavy reports run as background jobs.
- **Tier 3** (later): an analytics store fed by change capture, for BI tools.
- Report definitions ship in packages. Exports are xlsx and CSV (RFC 4180), under export controls.
- **Search:** one **search index** in PostgreSQL (full-text + trigram), filled after commit, **filtered by the user's scope and permissions**, with only non-sensitive text. Results open the document with its linked chain. Move to OpenSearch only when volumes or relevance needs demand it.

## Consequences

- One place for business semantics; consistent numbers across reports.
- No extra search infrastructure in the MVP.

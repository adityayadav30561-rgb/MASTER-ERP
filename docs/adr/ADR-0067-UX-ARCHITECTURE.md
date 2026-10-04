# ADR-0067: UX architecture — role-first, dense office screens, touch-first shop floor, seven archetypes, performance budgets

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** Step 10 — [UX Architecture](../02-blueprint/UX-ARCHITECTURE.md); question [Q-65](../tracking/OPEN-QUESTIONS.md#q-65)

## Context

Brief §19: modern, fast, responsive, clean, information-dense, configurable, role-aware UI. Shop-floor adoption is a major risk (R-11).

## Decision

- **Ten UX principles:** role first, dense for office, touch-first for shop floor, status always visible, never lose work, explain don't block, consistency, local formats, accessible, fast.
- **Seven screen archetypes** (list, document, master, dashboard, inbox, mobile task, wizard), shared by crafted and generated screens.
- A standard **document screen anatomy**: header + status badges, allowed actions, lines, side panel with chain / approvals / attachments / audit / comments.
- **Role home dashboards** per the Printing package.
- **Performance budgets:**
  - first load < 3 s on 4G
  - navigation < 1 s
  - search < 500 ms
  - job card submit < 1 s, with retry
- Global search (Ctrl+K), notification centre, keyboard shortcuts, help links.

## Consequences

- Consistent, learnable product; generated screens look native.
- Shop-floor screens are designed first, not adapted from desktop.

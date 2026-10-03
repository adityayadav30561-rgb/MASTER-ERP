# ADR-0027: Hybrid UI (crafted + generated screens) and configurable terminology

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 5 §7](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#7-forms-lists-and-navigation); question [Q-24](../tracking/OPEN-QUESTIONS.md#q-24)

## Context

The brief asks for metadata-driven UI and also a modern, fast, role-aware UX. Fully generated screens are clumsy for complex tasks (estimate, job card on a phone); fully hand-coded screens ignore configuration.

## Decision

- **Crafted screens** for critical, high-frequency tasks: estimate, sales order, job board, job card, reel receiving, material issue, dispatch, invoice, approval inbox. Each has **metadata slots** for extension fields and columns.
- **Generated screens** for masters, custom objects, picklists and settings.
- Both follow one design system.
- **Terminology** (labels such as Job / Batch / Work order) is overridden by packages through the translation mechanism.
- Menus are reordered and renamed per package; each role gets a home dashboard.

This follows the established pattern of SAP Fiori elements/freestyle and Salesforce layouts.

## Consequences

- Adding a field shows up automatically in both kinds of screens.
- Industry vocabulary needs no code changes.

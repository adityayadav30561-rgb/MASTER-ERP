# ADR-0056: React + Vite SPA/PWA with Tailwind, shadcn/ui, TanStack, React Hook Form, i18next

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 9 §8](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#8-frontend); question [Q-55](../tracking/OPEN-QUESTIONS.md#q-55)

## Context

The UI must be modern, fast, dense, role-aware, phone-friendly for the shop floor, accessible, and support crafted and generated screens (ADR-0027) and terminology overrides.

## Decision

- **React + TypeScript**, built with **Vite** as a single-page app and **installable PWA**.
- **Not Next.js:** no SEO need and no server-side rendering complexity.
- **UI:** Tailwind CSS + **shadcn/ui** (Radix primitives; WCAG 2.2 AA target).
- **Data, routing, tables:** TanStack Query (server data), TanStack Router, TanStack Table (AG Grid Community only if needed).
- **Forms:** React Hook Form with the same JSON Schemas as the backend.
- **Generated screens:** our own metadata form/list renderer.
- **Languages and formats:** i18next (ICU messages) + browser Intl (en-IN).
- No offline mode in the MVP; native apps later.

## Consequences

- Static frontend served via CDN; one design system for crafted and generated screens.

## Implementation notes (Slice 0, 2026-10-04)

- Built (`apps/web`, [Slice 0 §7](../03-implementation/SLICE-0-FOUNDATION.md#7-the-web-app)):
  - React 19 + Vite 8, Tailwind 4 with shadcn-style components (Radix dialog), TanStack Router and Query, React Hook Form, i18next (English, Hindi)
  - a generated form renderer for extension fields (ADR-0027)
- "Installable PWA" means a web manifest without a service worker, because there is no offline mode (IMPL-09).
- The server serves the built app on the tenant's sub-domain (IMPL-08).
- TanStack Table is not used yet; the lists are simple tables. It comes when sorting or column features are needed.

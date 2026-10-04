# ADR-0063: Tenant lifecycle with read-only suspension; editions, add-ons, limits and metering; manual billing first

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** Step 10 — [SaaS, Billing & AI Parts 1–2](../02-blueprint/SAAS-BILLING-AND-AI-ARCHITECTURE.md); question [Q-61](../tracking/OPEN-QUESTIONS.md#q-61)

## Context

Brief §26 asks for trials, per-user, per-module, bundle, usage and enterprise pricing, licensing, feature flags, subscriptions, plan limits, suspension and upgrade/downgrade. In year 1 there are few customers and a solo founder.

## Decision

- **Tenant lifecycle:**
  - Demo → Onboarding → Active → Past due → **Suspended (read-only: view, print, export)** → Cancelled → Deleted.
  - Demo tenants are never converted to production.
  - **Data is never deleted or hidden because of non-payment**; export is always available.
- **Plans:** edition + add-ons + limits, enforced by the entitlement service with warnings at 80% and 100%. Usage is metered daily per tenant.
- **Operations console** for the platform operator: no business-data access, audited.
- **Billing:**
  - **Year 1 manual:** implementation fee + subscription, GST invoices issued by us, bank/UPI payment, state updated in the console.
  - **Later:** a subscription-billing provider behind a billing port, with RBI-compliant e-mandates, proration and automated dunning.
- **Prices are not decided here.** They follow market research with printers and competitors.

## Consequences

- No billing system to build for the MVP.
- Customer trust: fair suspension rules.

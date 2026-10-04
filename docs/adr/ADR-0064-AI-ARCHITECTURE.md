# ADR-0064: AI is an assistant — dataset reads with user permissions, drafts only, opt-in, audited; from Phase 5

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** Step 10 — [SaaS, Billing & AI Part 3](../02-blueprint/SAAS-BILLING-AND-AI-ARCHITECTURE.md#part-3--ai-architecture); question [Q-62](../tracking/OPEN-QUESTIONS.md#q-62)

## Context

Brief §24: AI must not be the foundation; the transactional system stays deterministic; AI can help with natural-language search, reports, document extraction, forecasting, anomaly detection and assistance.

## Decision

- **Principles:**
  1. The ERP is authoritative.
  2. AI reads **only through report datasets with the user's permissions and field security**.
  3. AI can **only create drafts or suggestions**; a human posts.
  4. **Opt-in per tenant**, with the provider listed as a sub-processor.
  5. Providers must not train on customer data, with limited retention.
  6. Personal data is minimised and redacted.
  7. Every interaction is audited and cost-capped.
  8. An evaluation suite runs before releases.
- **Architecture:** an **AI gateway port** in the kernel, a replaceable model provider, and three tool types (read datasets, create drafts, explain records).
- **Use-case order:** vendor-invoice reading → natural-language questions → anomaly alerts → reorder suggestions → explanations. **Autonomous posting or payments: never.**
- **Timing:** Phase 5, after product-market fit.

## Consequences

- AI features can be added without touching ledgers or permissions.
- Customers keep control and transparency.

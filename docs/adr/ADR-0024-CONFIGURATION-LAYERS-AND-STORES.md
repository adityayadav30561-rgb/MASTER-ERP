# ADR-0024: Layered configuration (override / extend / lock) and two configuration stores

- **Status:** Accepted (founder, 2026-10-03)
- **Date:** 2026-10-03
- **Discovery step:** [Step 5 §2–§5](../01-discovery/STEP-05-CONFIGURATION-ARCHITECTURE.md#2-the-configuration-stack-and-how-layers-combine); question [Q-22](../tracking/OPEN-QUESTIONS.md#q-22)

## Context

One platform must behave differently per industry, country, customer, company and site, while staying upgradeable. ADR-0011 put year-1 configuration in version-controlled packages, but tenant admins must still change some settings (approval limits, numbering, roles) without a release.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| Everything in the database, edited through screens | Self-service | Hard to review, test, diff and promote; huge admin-UI scope |
| Everything in Git packages | Reviewable, reproducible | Every limit change needs a release |
| **Layered merge of Git packages + audited runtime settings** | Structure is reviewed; frequent settings stay self-service | Two stores to keep apart |

## Decision

- Configuration layers: platform → module → localization → industry → tenant → company/site, plus personal preferences for the UI only.
- Every configuration item merges by **override**, **extend** or **lock**.
- Structural configuration lives in **packages (Git)**. Frequently changed settings live in **runtime settings (database, audited)**.
- Each configuration item type is owned by exactly one store.
- The system compiles and caches an **effective configuration** per tenant.

## Consequences

- MVP admin screens are limited to picklists, approvals, notification recipients, numbering, branding, roles, module settings and integration connections.
- Locks let localization packs protect statutory rules.

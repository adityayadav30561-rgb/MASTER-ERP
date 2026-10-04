# ADR-0045: Notification engine pipeline; MVP in-app + email; WhatsApp/SMS later with Meta templates and TRAI DLT

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 7A Part 2](../01-discovery/STEP-07A-WORKFLOW-AND-NOTIFICATIONS.md#part-2--notification-engine); question [Q-43](../tracking/OPEN-QUESTIONS.md#q-43)

## Context

Brief §10 requires event-driven notifications on many channels, configurable by event, recipient, channel, template, condition, timing and escalation. The founder's cost guidance says WhatsApp must not be a day-one cost.

## Decision

- **Pipeline:**
  1. event, task or schedule
  2. notification rule (CEL)
  3. recipient resolution (roles + scope, users, watchers, document party contacts)
  4. preferences, digests, quiet hours, opt-in
  5. template rendering (recipient language, **field security applied**)
  6. channel adapter
  7. delivery log, retries, fallback channel
- **Fixed rules:**
  - sent after commit only
  - once per recipient per event
  - approval and security notifications always reach in-app
- **MVP channels:** in-app and email (SPF, DKIM, DMARC; our domain with reply-to the tenant; tenant domain later).
- **Later:**
  - **WhatsApp**: Meta pre-approved templates, recipient opt-in, cost caps; sold as a tenant add-on
  - **SMS**: TRAI DLT registration of entity, header and templates
  - web push
  - Slack/Teams via webhooks
- Delivery logs are kept for 1 year.

## Consequences

- No messaging costs until a tenant buys a paid channel.
- The template registry tracks provider approval status.

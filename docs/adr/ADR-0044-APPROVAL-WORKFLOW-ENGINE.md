# ADR-0044: Own small approval workflow engine (BPMN-aligned concepts) attached to document transitions

- **Status:** Proposed
- **Date:** 2026-10-04
- **Discovery step:** [Step 7A Part 1](../01-discovery/STEP-07A-WORKFLOW-AND-NOTIFICATIONS.md#part-1--approval-workflow-engine); question [Q-42](../tracking/OPEN-QUESTIONS.md#q-42)

## Context

Brief §8 requires configurable approval levels, hierarchy, conditions, parallel and sequential steps, escalation, delegation, rejection, resubmission, timeouts and SLAs. General BPM engines and durable-execution platforms are heavy and mostly unused for this need.

## Options considered

Embed a BPMN engine · Temporal · cloud step functions · **own small engine**.

## Decision

- **Definitions:** versioned workflow definitions attached to a document type and transition, with an entry condition (CEL).
- **Steps:** each step has an inclusion condition, an **approver resolver** (role + document scope, user, manager-of, or decision table, plus a fallback), a **mode** (any / all / N of M), an **SLA** (ISO 8601 duration, business calendar), reminders and an **escalation** action.
- **Instances:**
  - pin the definition version
  - end as Approved, Rejected, SentBack, Recalled or Cancelled
  - transitions happen in the same transaction as the document change
- **Fixed rules:**
  - always a fallback approver, never auto-approve when no approver is found
  - submitter excluded beyond own authority, and SoD applies
  - **material change after approval requires re-approval**
  - auto-approve escalation only where explicitly configured for low risk, and never in GMP mode
- **One inbox** (web and phone). Approvals happen via authenticated deep links; no reply-to-approve in the MVP.
- Concepts follow BPMN (user task, gateways, timer) so formal export stays possible.

## Consequences

- Scope is deliberately limited to approvals, tasks and timers.
- Stuck-approval report and admin reassign screen are in the MVP.

# ADR-0038: OWASP ASVS Level 2 baseline; 3-2-1 backups with PITR; RPO ≤ 15 min, RTO ≤ 4 h; incident response with CERT-In reporting

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-03
- **Discovery step:** [Step 6A §5–§6](../01-discovery/STEP-06A-ISOLATION-AUDIT-PRIVACY-AND-OPERATIONS.md#5-application-security-baseline-owasp-asvs-level-2); question [Q-37](../tracking/OPEN-QUESTIONS.md#q-37)

## Context

Security must be first-class but affordable for a solo developer. Losing data or being down at dispatch time is as damaging as a breach.

## Decision

- **Application security:**
  - Requirements and verification follow **OWASP ASVS Level 2**.
  - Automated authorization tests, dependency and secret scanning, and dynamic scanning (e.g. OWASP ZAP) in CI.
  - Safe file-upload handling for artwork.
  - Bulk-export protection.
  - `security.txt` (RFC 9116).
  - A professional penetration test before or soon after the first paying customer.
- **Backups:** **3-2-1** with point-in-time recovery. Daily snapshots kept 30 days, monthly snapshots kept 12 months. **Monthly restore drills**; single-tenant restore.
- **Targets:** **RPO ≤ 15 minutes, RTO ≤ 4 hours.**
- **Monitoring:** OpenTelemetry; security alerts to us and to tenant owners.
- **Incident response:** documented runbook; reportable incidents go to **CERT-In within 6 hours**; customers notified without delay.
- **Hygiene:** weekly dependency updates (critical fixes within 72 hours), quarterly access reviews, dormant accounts disabled after 90 days, immediate offboarding.

## Consequences

- Managed database with point-in-time recovery is a required paid service from the pilot onwards (consistent with Step 1 C10). **Trigger = the day the first customer enters real data** (even an unpaid pilot or trial), not the first payment. Development and demos (demo data only, reloadable from the package) stay on free/local databases. Cost is recovered through the pilot's implementation fee.
- No ISO 27001 / SOC 2 certification in year 1; reference only.

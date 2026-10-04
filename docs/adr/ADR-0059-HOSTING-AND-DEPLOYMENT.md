# ADR-0059: AWS Mumbai (Lightsail first) with Hyderabad backups; one portable Docker image; Cloudflare in front

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 9A §1–§2, §9](../01-discovery/STEP-09A-INFRASTRUCTURE-DEVOPS-AND-COSTS.md#1-hosting-options); question [Q-58](../tracking/OPEN-QUESTIONS.md#q-58)

## Context

Requirements:

- India data residency, plus a second Indian region for backups
- managed PostgreSQL with point-in-time recovery
- S3-compatible storage, email, key management and logs in India
- simple, predictable cost
- portability to other clouds and on-premise

## Options considered

AWS (Lightsail → RDS/ECS) · DigitalOcean Bangalore · Google Cloud · Azure · Indian clouds · free-tier platforms without Indian residency (excluded for customer data).

## Decision

- **AWS Mumbai** for the pilot, starting with **Lightsail** (container service + managed PostgreSQL with point-in-time restore), plus S3 (versioning), SES, KMS/Secrets Manager and CloudWatch.
- Backup copies (nightly encrypted dumps + file replication) go to **AWS Hyderabad**. The growth path is RDS/ECS.
- **DigitalOcean Bangalore** is the alternative, with off-site backups to another provider.
- **One Docker image** with two process types (`web`, `worker`). Twelve-Factor configuration. Only standard PostgreSQL features, the S3 API and OpenTelemetry.
- **Cloudflare free plan** for DNS, TLS, WAF and static caching.
- On-premise / private cloud later via a Docker Compose bundle (silo tenant), signed releases and a licence file.
- Prices are verified at purchase time.

## Consequences

- Pilot infrastructure costs about ₹3,000–6,000/month, covered by the implementation fee.
- Provider switch = migration, not rewrite.

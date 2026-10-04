# ADR-0058: Better Auth (after spike) for authentication; composed standard libraries as fallback

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-04
- **Discovery step:** [Step 9 §7](../01-discovery/STEP-09-TECHNICAL-ARCHITECTURE.md#7-authentication-library); question [Q-57](../tracking/OPEN-QUESTIONS.md#q-57)

## Context

ADR-0032 requires Argon2id passwords, TOTP MFA, passkeys later, Google/Microsoft OIDC, session controls, step-up re-authentication, and a shop-floor device + PIN mode, using a proven library rather than hand-written cryptography.

## Options considered

**Better Auth** · Auth.js · Lucia (deprecated as a library) · Keycloak (heavy to operate) · **composed standard libraries** (Argon2id, TOTP, WebAuthn server library, openid-client).

## Decision

- **Better Auth**, subject to **spike S2**, which checks all ADR-0032 requirements.
- The device + PIN mode is expected to be a small custom addition.
- Fallback: composed standard libraries.
- Authorization (the eight checks) remains our own kernel service either way.

## Consequences

- Self-hosted, free, TypeScript-native authentication.
- The choice is reversible behind the identity port.

## Implementation notes (Phase 1, 2026-10-04)

- **Spike S2 passed** ([results §5](../03-implementation/PHASE-1-SPIKE-RESULTS.md#5-s2--login-better-auth)) with Better Auth 1.7: Argon2id (custom hash hook, OWASP parameters), TOTP + backup codes, passkey registration, OIDC with PKCE through the generic OAuth plugin, rate limiting.
- **Device + PIN** and **step-up** are small custom plugins of ours. Better Auth's "fresh session" is based on sign-in time only and is not used for step-up.
- Telemetry is explicitly disabled. Fallback (composed libraries) not needed.

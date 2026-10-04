# ADR-0032: Authentication — proven library, OIDC-compatible, NIST passwords, MFA for privileged roles, shop-floor device + PIN

- **Status:** Accepted (founder, 2026-10-04)
- **Date:** 2026-10-03
- **Discovery step:** [Step 6 §4](../01-discovery/STEP-06-SECURITY-ARCHITECTURE.md#4-authentication--proving-who-you-are); questions [Q-29](../tracking/OPEN-QUESTIONS.md#q-29), [Q-30](../tracking/OPEN-QUESTIONS.md#q-30)

## Context

Users range from the owner on a phone to operators with no email sharing a tablet. Stolen passwords are the most common way in. Budget rules out paid per-user identity services, and operating an identity server is heavy for a solo developer.

## Options considered

Hand-written login · hosted identity service · self-hosted identity server (Keycloak) · **proven authentication library with an OIDC-compatible design**.

## Decision

- Use a **maintained, proven authentication library**, never hand-written cryptography, inside an **OIDC-compatible** architecture. Google/Microsoft login works via OIDC, and a move to a dedicated identity server later stays possible.
- **Passwords** follow NIST SP 800-63B:
  - length-based: at least 15 characters as the only factor, at least 8 with MFA
  - checked against breached-password lists
  - no forced rotation
  - stored with **Argon2id**
- **MFA:**
  - **Mandatory** for owner, admin, accountant and approvers, by authenticator app (TOTP, RFC 6238).
  - **Passkeys** (WebAuthn/FIDO2) come later.
  - SMS/WhatsApp OTP is a fallback only, never MFA for privileged roles.
- **Shop floor:** registered devices plus a personal PIN, limited to operator permissions, with lockout and device revocation. Disabled in GMP mode.
- **Sessions:** secure, HttpOnly, SameSite cookies with idle and absolute timeouts. **Step-up re-authentication** for sensitive actions.
- **Systems:** OAuth 2 client credentials or scoped, hashed, expiring API keys. Webhooks signed with HMAC.

## Consequences

- Device registration and PIN management screens are in the MVP.
- No per-user identity-service fees.

## Implementation notes (kernel minimum, 2026-10-04)

- Built ([§3.3](../03-implementation/KERNEL-MINIMUM.md#33-identity-k2-adr-0032-adr-0058-adr-0069)): no public sign-up (admin invitation); password ≥ 15 characters, or ≥ 8 with MFA, common passwords refused, Argon2id; MFA enrolment enforced for privileged roles; shop-floor PIN = 6 digits, lockout after 5 failures for 15 minutes; step-up valid 5 minutes.

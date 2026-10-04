/**
 * Spike S2 — Better Auth configured against ADR-0032 / Step 6 requirements.
 * Built-in: e-mail + password, TOTP two-factor with backup codes, passkeys, OIDC login with a customer IdP,
 * sessions, rate limiting. Custom plugins (proving extensibility): shop-floor device + PIN, step-up.
 */
import { createHash, randomBytes } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import type pg from "pg";
// Named so TypeScript can describe createAuth()'s return type in declaration files (passkey plugin types).
export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

/** OWASP Password Storage Cheat Sheet: Argon2id, m = 19 MiB, t = 2, p = 1. */
const ARGON2 = { algorithm: 2 /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
export const hashSecret = (secret: string) => argon2Hash(secret, ARGON2);
export const verifySecret = (hash: string, secret: string) => argon2Verify(hash, secret);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Step-up window for sensitive actions (approvals, books unlock, role changes) — Step 6 §4. */
export const STEP_UP_SECONDS = 5 * 60;

/**
 * Shop-floor login: a registered tablet (device token) + employee code + short PIN.
 * The session is marked `authMethod = device-pin` so authorization can limit it to shop-floor screens.
 */
const devicePin = () =>
  ({
    id: "device-pin",
    schema: {
      shopDevice: {
        fields: {
          tokenHash: { type: "string", unique: true },
          siteCode: { type: "string" },
          active: { type: "boolean", defaultValue: true },
        },
      },
      user: {
        fields: {
          employeeCode: { type: "string", required: false, unique: true },
          pinHash: { type: "string", required: false, returned: false },
        },
      },
      session: {
        fields: {
          authMethod: { type: "string", required: false },
          deviceSite: { type: "string", required: false },
          stepUpAt: { type: "date", required: false },
        },
      },
    },
    endpoints: {
      signInWithDevicePin: createAuthEndpoint(
        "/device/pin-sign-in",
        { method: "POST", body: z.object({ deviceToken: z.string().min(32), employeeCode: z.string().min(1), pin: z.string().regex(/^\d{4,8}$/) }) },
        async (ctx) => {
          const { deviceToken, employeeCode, pin } = ctx.body;
          const device = await ctx.context.adapter.findOne<{ id: string; siteCode: string; active: boolean }>({
            model: "shopDevice",
            where: [{ field: "tokenHash", value: sha256(deviceToken) }],
          });
          const user = await ctx.context.adapter.findOne<{ id: string; pinHash?: string }>({
            model: "user",
            where: [{ field: "employeeCode", value: employeeCode }],
          });
          // Same error for every failure: no hint whether the device, employee or PIN was wrong.
          const ok = device?.active && user?.pinHash ? await verifySecret(user.pinHash, pin) : false;
          if (!ok || !device || !user) throw new APIError("UNAUTHORIZED", { message: "Invalid device, employee or PIN" });
          const fullUser = await ctx.context.internalAdapter.findUserById(user.id);
          if (!fullUser) throw new APIError("UNAUTHORIZED", { message: "Invalid device, employee or PIN" });
          const session = await ctx.context.internalAdapter.createSession(user.id, true, { authMethod: "device-pin", deviceSite: device.siteCode });
          await setSessionCookie(ctx, { session, user: fullUser });
          return ctx.json({ ok: true, site: device.siteCode });
        },
      ),
      stepUp: createAuthEndpoint(
        "/step-up",
        { method: "POST", use: [sessionMiddleware], body: z.object({ password: z.string() }) },
        async (ctx) => {
          const { session } = ctx.context.session;
          const accounts = await ctx.context.internalAdapter.findAccounts(session.userId);
          const credential = accounts.find((a) => a.providerId === "credential");
          const valid = credential?.password ? await ctx.context.password.verify({ hash: credential.password, password: ctx.body.password }) : false;
          if (!valid) throw new APIError("UNAUTHORIZED", { message: "Re-authentication failed" });
          await ctx.context.internalAdapter.updateSession(session.token, { stepUpAt: new Date() });
          return ctx.json({ ok: true, validForSeconds: STEP_UP_SECONDS });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

export function createAuth(pool: pg.Pool) {
  return betterAuth({
    appName: "MASTER-ERP",
    baseURL: "http://localhost:3000",
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
    database: pool,
    telemetry: { enabled: false }, // never send usage data out of India (ADR-0037, DPDP)
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8, // NIST SP 800-63B: length over composition rules
      maxPasswordLength: 128,
      password: { hash: hashSecret, verify: ({ hash, password }) => verifySecret(hash, password) },
    },
    session: { expiresIn: 8 * 60 * 60, updateAge: 60 * 60, freshAge: 15 * 60 },
    rateLimit: { enabled: true, storage: "memory", window: 60, max: 100, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    plugins: [
      twoFactor({ issuer: "MASTER-ERP" }),
      passkey({ rpID: "localhost", rpName: "MASTER-ERP", origin: "http://localhost:3000" }),
      genericOAuth({
        config: [
          {
            providerId: "customer-idp", // e.g. a customer's Microsoft Entra ID or Google Workspace
            clientId: "erp-client",
            clientSecret: "not-a-real-secret",
            authorizationUrl: "https://idp.example.com/oauth2/authorize",
            tokenUrl: "https://idp.example.com/oauth2/token",
            userInfoUrl: "https://idp.example.com/oauth2/userinfo",
            scopes: ["openid", "email", "profile"],
            pkce: true,
          },
        ],
      }),
      devicePin(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export { sha256 };

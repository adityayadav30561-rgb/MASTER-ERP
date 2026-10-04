/**
 * K2 Identity (ADR-0032, ADR-0058, ADR-0069): Better Auth for credentials, MFA, passkeys and sessions;
 * the kernel for tenants, memberships, shop-floor devices and PINs.
 *
 * - One identity per person (global); a session is bound to ONE tenant, chosen by the sub-domain.
 * - Every session creation checks an active membership in that tenant.
 * - Shop-floor login: registered device token + employee code + 6-digit PIN, with lockout.
 * - Step-up: re-enter the password; the time is stamped on the session.
 * - Sign-ins (success and failure) go to the security log.
 */
import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import pg from "pg";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { getMigrations } from "better-auth/db/migration";
import { twoFactor } from "better-auth/plugins/two-factor";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { passkey } from "@better-auth/passkey";
import { z } from "zod";
import { newId } from "../ids/index.ts";
import type { AnyDb, Tx } from "../db/database.ts";
import { systemContext, withTenant } from "../db/context.ts";
import { logSecurityEvent } from "../audit/audit.ts";
import { holdsPrivilegedRole } from "../authz/admin.ts";
import type { Principal } from "../authz/authorization.ts";
import { checkPassword, checkPin, hashSecret, PIN_LOCK_MINUTES, PIN_MAX_FAILURES, sha256, verifySecret } from "./password.ts";

// Named so TypeScript can describe the auth instance's type in declaration files.
export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

export const STEP_UP_SECONDS = 5 * 60;

export interface IdentityOptions {
  /** Application-role connection string; identity tables are reached with search_path=identity. */
  appConnectionString: string;
  /** Kernel application database (tenant data, RLS). */
  appDb: AnyDb;
  baseURL: string; // e.g. "https://erp.example.in"
  secret: string; // ≥ 32 random bytes, from the secret store (ADR-0037)
  trustedOrigins?: string[];
  /** Tenant code for a request; default: first label of the Host (alpha.erp.example.in → alpha) or x-tenant. */
  tenantFromHeaders?: (headers: Headers) => string | undefined;
  /** Company identity providers (Microsoft Entra ID, Google Workspace …) via OIDC. */
  oidcProviders?: GenericOAuthConfig[];
  rateLimit?: boolean;
  rpID?: string; // WebAuthn relying party, e.g. "erp.example.in"
}

export interface ResolvedSession {
  principal: Principal;
  sessionToken: string;
  /** Holds a privileged role but has not enrolled two-factor login yet: only enrolment is allowed. */
  mfaEnrolmentRequired: boolean;
  stepUpAt: Date | null;
}

export function defaultTenantFromHeaders(headers: Headers): string | undefined {
  const explicit = headers.get("x-tenant");
  if (explicit) return explicit.toLowerCase();
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(":")[0] ?? "";
  const labels = host.split(".");
  return labels.length >= 3 ? labels[0]?.toLowerCase() : undefined;
}

function clientIp(headers: Headers | undefined): string | undefined {
  const ip = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : undefined;
}

export class IdentityError extends Error {
  override name = "IdentityError";
}

export function createIdentity(o: IdentityOptions) {
  const identityPool = new pg.Pool({ connectionString: o.appConnectionString, max: 5, options: "-c search_path=identity" });
  const tenantCode = o.tenantFromHeaders ?? defaultTenantFromHeaders;

  async function resolveTenant(headers: Headers | undefined): Promise<{ id: string; status: string } | undefined> {
    const code = headers ? tenantCode(headers) : undefined;
    if (!code) return undefined;
    const r = await sql<{ id: string; status: string }>`select id, status from kernel.resolve_tenant(${code})`.execute(o.appDb);
    return r.rows[0];
  }

  async function activeMembership(tenantId: string, userId: string): Promise<{ id: string } | undefined> {
    return withTenant(
      o.appDb,
      systemContext(tenantId, "identity"),
      (tx) => tx.selectFrom("kernel.tenant_membership").select("id").where("user_id", "=", userId).where("status", "=", "active").executeTakeFirst(),
      { mode: "read" },
    );
  }

  const kernelPlugin = {
    id: "master-erp-kernel",
    schema: {
      session: {
        fields: {
          tenantId: { type: "string", required: false, input: false },
          authMethod: { type: "string", required: false, input: false },
          deviceSiteId: { type: "string", required: false, input: false },
          stepUpAt: { type: "date", required: false, input: false },
        },
      },
    },
    hooks: {
      before: [
        {
          // Password policy (ADR-0032): applied wherever a password is set.
          matcher: (ctx) => ["/sign-up/email", "/reset-password", "/change-password"].includes(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as { password?: string; newPassword?: string };
            const password = body.newPassword ?? body.password ?? "";
            const session = ctx.path === "/change-password" ? ctx.context.session : null;
            const mfaEnabled = Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled);
            const check = checkPassword(password, { mfaEnabled });
            if (!check.ok) throw new APIError("BAD_REQUEST", { message: check.message ?? "Password not allowed" });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => (ctx.path ?? "").startsWith("/sign-in"),
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (returned instanceof APIError) {
              const tenant = await resolveTenant(ctx.headers);
              await logSecurityEvent(o.appDb, {
                type: ctx.path === "/sign-in/device-pin" ? "auth.device_pin" : "auth.sign_in",
                outcome: "failure",
                details: { path: ctx.path, reason: returned.message },
                ...(tenant ? { tenantId: tenant.id } : {}),
                ...(clientIp(ctx.headers) ? { ip: clientIp(ctx.headers) as string } : {}),
                ...(ctx.headers?.get("user-agent") ? { userAgent: ctx.headers.get("user-agent") as string } : {}),
              });
            }
          }),
        },
      ],
    },
    endpoints: {
      signInWithDevicePin: createAuthEndpoint(
        "/sign-in/device-pin",
        { method: "POST", body: z.object({ deviceToken: z.string().min(32).max(128), employeeCode: z.string().min(1).max(32), pin: z.string().max(12) }) },
        async (ctx) => {
          const tenant = await resolveTenant(ctx.headers);
          const fail = () => new APIError("UNAUTHORIZED", { message: "Invalid device, employee or PIN" }); // never say which
          if (!tenant) throw fail();
          const found = await withTenant(o.appDb, systemContext(tenant.id, "device sign-in"), async (tx) => {
            const device = await tx.selectFrom("kernel.shop_device").select(["id", "site_id"]).where("token_hash", "=", sha256(ctx.body.deviceToken)).where("active", "=", true).executeTakeFirst();
            const member = await tx
              .selectFrom("kernel.tenant_membership")
              .select(["id", "user_id", "pin_hash", "pin_failed_attempts", "pin_locked_until", "status"])
              .where("employee_code", "=", ctx.body.employeeCode)
              .executeTakeFirst();
            if (!device || !member || member.status !== "active" || !member.pin_hash) return undefined;
            if (member.pin_locked_until && new Date(member.pin_locked_until) > new Date()) return undefined;
            if (!(await verifySecret(member.pin_hash, ctx.body.pin))) {
              const failures = member.pin_failed_attempts + 1;
              await tx
                .updateTable("kernel.tenant_membership")
                .set({ pin_failed_attempts: failures >= PIN_MAX_FAILURES ? 0 : failures, pin_locked_until: failures >= PIN_MAX_FAILURES ? sql`now() + ${`${PIN_LOCK_MINUTES} minutes`}::interval` : null })
                .where("id", "=", member.id)
                .execute();
              return undefined;
            }
            await tx.updateTable("kernel.tenant_membership").set({ pin_failed_attempts: 0, pin_locked_until: null }).where("id", "=", member.id).execute();
            await tx.updateTable("kernel.shop_device").set({ last_seen_at: sql`now()` }).where("id", "=", device.id).execute();
            return { userId: member.user_id as string, siteId: device.site_id as string };
          });
          if (!found) throw fail();
          const user = await ctx.context.internalAdapter.findUserById(found.userId);
          if (!user) throw fail();
          const session = await ctx.context.internalAdapter.createSession(found.userId, true, { tenantId: tenant.id, authMethod: "device-pin", deviceSiteId: found.siteId });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
      stepUp: createAuthEndpoint("/step-up", { method: "POST", use: [sessionMiddleware], body: z.object({ password: z.string().max(128) }) }, async (ctx) => {
        const { session } = ctx.context.session;
        const accounts = await ctx.context.internalAdapter.findAccounts(session.userId);
        const credential = accounts.find((a) => a.providerId === "credential");
        const valid = credential?.password ? await ctx.context.password.verify({ hash: credential.password, password: ctx.body.password }) : false;
        const tenantId = (session as { tenantId?: string }).tenantId;
        await logSecurityEvent(o.appDb, { type: "auth.step_up", outcome: valid ? "success" : "failure", userId: session.userId, ...(tenantId ? { tenantId } : {}) });
        if (!valid) throw new APIError("UNAUTHORIZED", { message: "Re-authentication failed" });
        await ctx.context.internalAdapter.updateSession(session.token, { stepUpAt: new Date() });
        return ctx.json({ ok: true, validForSeconds: STEP_UP_SECONDS });
      }),
    },
  } satisfies BetterAuthPlugin;

  const auth = betterAuth({
    appName: "MASTER-ERP",
    baseURL: o.baseURL,
    basePath: "/api/auth",
    secret: o.secret,
    database: identityPool,
    telemetry: { enabled: false }, // ADR-0037: no usage data leaves India
    trustedOrigins: o.trustedOrigins ?? [o.baseURL],
    advanced: { database: { generateId: () => newId() } }, // UUIDv7, so memberships can reference users
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // people are invited by an admin, never self-registered
      minPasswordLength: 8, // the full policy is in the hook above
      maxPasswordLength: 128,
      password: { hash: hashSecret, verify: ({ hash, password }) => verifySecret(hash, password) },
    },
    session: { expiresIn: 12 * 60 * 60, updateAge: 30 * 60, freshAge: 15 * 60 },
    rateLimit: { enabled: o.rateLimit ?? true, storage: "memory", window: 60, max: 200, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/sign-in/device-pin": { window: 60, max: 10 } } },
    databaseHooks: {
      session: {
        create: {
          // Bind every new session to the sub-domain's tenant, and only for active members (ADR-0069).
          before: async (session, context) => {
            const given = session as unknown as { tenantId?: string; authMethod?: string };
            const tenant = given.tenantId ? { id: given.tenantId } : await resolveTenant(context?.headers);
            if (!tenant) throw new APIError("BAD_REQUEST", { message: "Sign in on your company's address" });
            if (!(await activeMembership(tenant.id, session.userId))) throw new APIError("FORBIDDEN", { message: "You are not a member of this company" });
            return { data: { ...session, tenantId: tenant.id, authMethod: given.authMethod ?? "password" } };
          },
          after: async (session, context) => {
            const s = session as unknown as { tenantId: string; authMethod: string };
            const ip = clientIp(context?.headers);
            const ua = context?.headers?.get("user-agent");
            await logSecurityEvent(o.appDb, {
              type: s.authMethod === "device-pin" ? "auth.device_pin" : "auth.sign_in",
              outcome: "success",
              userId: session.userId,
              tenantId: s.tenantId,
              details: { method: s.authMethod },
              ...(ip ? { ip } : {}),
              ...(ua ? { userAgent: ua } : {}),
            });
          },
        },
      },
    },
    plugins: [
      twoFactor({ issuer: "MASTER-ERP" }),
      passkey({ rpID: o.rpID ?? new URL(o.baseURL).hostname, rpName: "MASTER-ERP", origin: o.trustedOrigins ?? [o.baseURL] }),
      ...(o.oidcProviders?.length ? [genericOAuth({ config: o.oidcProviders })] : []),
      kernelPlugin,
    ],
  });

  /* ---------- administration (called by kernel admin use cases) ---------- */

  async function ensureUser(email: string, name: string): Promise<string> {
    const c = await auth.$context;
    const existing = await c.internalAdapter.findUserByEmail(email.toLowerCase());
    if (existing) return existing.user.id;
    const user = await c.internalAdapter.createUser({ email: email.toLowerCase(), name, emailVerified: false }, { method: "admin" }); // invited by an admin, never self-registered
    return user.id;
  }

  async function setPassword(userId: string, password: string): Promise<void> {
    const c = await auth.$context;
    const user = (await c.internalAdapter.findUserById(userId)) as { twoFactorEnabled?: boolean } | null;
    if (!user) throw new IdentityError("Unknown user");
    const check = checkPassword(password, { mfaEnabled: Boolean(user.twoFactorEnabled) });
    if (!check.ok) throw new IdentityError(check.message);
    const hash = await hashSecret(password);
    const accounts = await c.internalAdapter.findAccounts(userId);
    if (accounts.some((a) => a.providerId === "credential")) await c.internalAdapter.updatePassword(userId, hash);
    else await c.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: hash });
  }

  /** Whether the person has two-step sign-in (TOTP) or a passkey. */
  async function mfaEnabled(userId: string): Promise<boolean> {
    const c = await auth.$context;
    const user = (await c.internalAdapter.findUserById(userId)) as { twoFactorEnabled?: boolean } | null;
    if (user?.twoFactorEnabled) return true;
    const passkeys = await c.adapter.count({ model: "passkey", where: [{ field: "userId", value: userId }] });
    return passkeys > 0;
  }

  async function registerDevice(tx: Tx, input: { siteId: string; name: string }): Promise<{ id: string; token: string }> {
    const site = await tx.selectFrom("kernel.org_unit").select("kind").where("id", "=", input.siteId).executeTakeFirst();
    if (site?.kind !== "site") throw new IdentityError("A device is registered to a site");
    const token = randomBytes(32).toString("hex");
    const id = newId();
    await tx.insertInto("kernel.shop_device").values({ id, site_id: input.siteId, name: input.name, token_hash: sha256(token) }).execute();
    return { id, token }; // shown once, stored only as a hash
  }

  async function revokeDevice(tx: Tx, deviceId: string): Promise<void> {
    await tx.updateTable("kernel.shop_device").set({ active: false, revoked_at: sql`now()` }).where("id", "=", deviceId).execute();
  }

  async function setPin(tx: Tx, membershipId: string, pin: string): Promise<void> {
    const check = checkPin(pin);
    if (!check.ok) throw new IdentityError(check.message);
    await tx
      .updateTable("kernel.tenant_membership")
      .set({ pin_hash: await hashSecret(pin), pin_failed_attempts: 0, pin_locked_until: null })
      .where("id", "=", membershipId)
      .execute();
  }

  /**
   * Turn a request into a Principal: valid session, session tenant = sub-domain tenant, active membership.
   * Returns undefined when any of these fails.
   */
  async function resolve(headers: Headers): Promise<ResolvedSession | undefined> {
    const result = await auth.api.getSession({ headers });
    if (!result) return undefined;
    const s = result.session as typeof result.session & { tenantId?: string; authMethod?: Principal["authMethod"]; deviceSiteId?: string | null; stepUpAt?: Date | string | null };
    const tenant = await resolveTenant(headers);
    if (!tenant || !s.tenantId || tenant.id !== s.tenantId) {
      await logSecurityEvent(o.appDb, { type: "authz.denied", outcome: "denied", userId: s.userId, details: { reason: "session used on another tenant's address" } });
      return undefined;
    }
    const membership = await activeMembership(s.tenantId, s.userId);
    if (!membership) return undefined;
    const privileged = await withTenant(o.appDb, systemContext(s.tenantId, "identity"), (tx) => holdsPrivilegedRole(tx, membership.id), { mode: "read" });
    const twoFactor = Boolean((result.user as { twoFactorEnabled?: boolean }).twoFactorEnabled);
    return {
      principal: {
        tenantId: s.tenantId,
        userId: s.userId,
        membershipId: membership.id,
        authMethod: s.authMethod ?? "password",
        ...(s.deviceSiteId ? { deviceSiteId: s.deviceSiteId } : {}),
      },
      sessionToken: s.token,
      mfaEnrolmentRequired: privileged && !twoFactor && s.authMethod !== "device-pin",
      stepUpAt: s.stepUpAt ? new Date(s.stepUpAt) : null,
    };
  }

  function hasRecentStepUp(session: ResolvedSession, seconds = STEP_UP_SECONDS): boolean {
    return session.stepUpAt !== null && Date.now() - session.stepUpAt.getTime() <= seconds * 1000;
  }

  return {
    auth,
    resolve,
    hasRecentStepUp,
    ensureUser,
    mfaEnabled,
    setPassword,
    registerDevice,
    revokeDevice,
    setPin,
    /** Create or update the identity tables (owner connection; run with the other migrations). */
    async migrate(ownerConnectionString: string): Promise<void> {
      const ownerPool = new pg.Pool({ connectionString: ownerConnectionString, max: 2, options: "-c search_path=identity" });
      try {
        const { runMigrations } = await getMigrations({ ...auth.options, database: ownerPool });
        await runMigrations();
      } finally {
        await ownerPool.end();
      }
    },
    async close(): Promise<void> {
      await identityPool.end();
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;

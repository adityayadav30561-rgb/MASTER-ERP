/**
 * Spike S2 — Better Auth on a real PostgreSQL database (DATABASE_URL, a role allowed to CREATE DATABASE).
 */
import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { getMigrations } from "better-auth/db/migration";
import { createAuth, hashSecret, sha256 } from "./auth.ts";
import type { Auth } from "./auth.ts";

const ADMIN_URL = process.env.DATABASE_URL ?? "";
const PASSWORD = "correct horse battery staple";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what an authenticator app computes. */
function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32Secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = (h[h.length - 1] ?? 0) & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Turn Set-Cookie response headers into a Cookie request header. */
function cookieHeader(headers: Headers, previous = ""): Headers {
  const jar = new Map(previous.split("; ").filter(Boolean).map((c) => c.split("=") as [string, string]));
  for (const c of headers.getSetCookie()) {
    const [pair = ""] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), origin: "http://localhost:3000" });
}

describe.skipIf(!ADMIN_URL)("Spike S2: Better Auth", { timeout: 60_000 }, () => {
  let pool: pg.Pool;
  let auth: Auth;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query("drop database if exists s2_auth_spike with (force)");
    await admin.query("create database s2_auth_spike");
    await admin.end();
    const url = new URL(ADMIN_URL);
    url.pathname = "/s2_auth_spike";
    pool = new pg.Pool({ connectionString: url.toString() });
    auth = createAuth(pool);
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("stores passwords with Argon2id (OWASP parameters)", async () => {
    await auth.api.signUpEmail({ body: { email: "owner@demo-printers.example", password: PASSWORD, name: "Owner" } });
    const row = await pool.query(`select a.password from account a join "user" u on u.id = a."userId" where u.email = 'owner@demo-printers.example'`);
    expect(row.rows[0].password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("rejects short passwords (NIST 800-63B minimum length)", async () => {
    await expect(auth.api.signUpEmail({ body: { email: "short@demo-printers.example", password: "1234567", name: "S" } })).rejects.toThrow();
  });

  it("enrols TOTP two-factor, then requires the code at sign-in (MFA for privileged roles)", async () => {
    const signIn = await auth.api.signInEmail({ body: { email: "owner@demo-printers.example", password: PASSWORD }, returnHeaders: true });
    let headers = cookieHeader(signIn.headers);
    const enable = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers });
    if (enable.method !== "totp") throw new Error("expected TOTP enrolment");
    const secret = new URL(enable.totpURI).searchParams.get("secret") ?? "";
    expect(enable.backupCodes.length).toBeGreaterThanOrEqual(8);
    await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers });

    // Next sign-in stops at the second factor.
    const second = await auth.api.signInEmail({ body: { email: "owner@demo-printers.example", password: PASSWORD }, returnHeaders: true });
    expect((second.response as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    headers = cookieHeader(second.headers);
    await expect(auth.api.verifyTOTP({ body: { code: "000000" }, headers })).rejects.toThrow();
    const verified = await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers, returnHeaders: true });
    const session = await auth.api.getSession({ headers: cookieHeader(verified.headers) });
    expect(session?.user.email).toBe("owner@demo-printers.example");
  });

  it("offers passkey (WebAuthn) registration for a signed-in user", async () => {
    await auth.api.signUpEmail({ body: { email: "accounts@demo-printers.example", password: PASSWORD, name: "Accounts" } });
    const signIn = await auth.api.signInEmail({ body: { email: "accounts@demo-printers.example", password: PASSWORD }, returnHeaders: true });
    const options = await auth.api.generatePasskeyRegistrationOptions({ headers: cookieHeader(signIn.headers) });
    expect(options.rp.id).toBe("localhost");
    expect(options.challenge.length).toBeGreaterThan(20);
  });

  it("starts an OIDC login with a customer's identity provider (authorization code + PKCE)", async () => {
    const start = await auth.api.signInSocial({ body: { provider: "customer-idp", callbackURL: "/home" } });
    const url = new URL(start.url ?? "");
    expect(url.origin).toBe("https://idp.example.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("signs a store keeper in on a registered tablet with employee code + PIN (custom plugin)", async () => {
    const deviceToken = randomBytes(32).toString("hex");
    const created = await auth.api.signUpEmail({ body: { email: "storekeeper@demo-printers.example", password: PASSWORD, name: "Ramesh (Stores)" } });
    await pool.query(`update "user" set "employeeCode" = 'E-0042', "pinHash" = $1 where id = $2`, [await hashSecret("4821"), created.user.id]);
    await pool.query(`insert into "shopDevice" (id, "tokenHash", "siteCode", active) values ('dev-1', $1, 'BHIWANDI', true)`, [sha256(deviceToken)]);

    await expect(auth.api.signInWithDevicePin({ body: { deviceToken, employeeCode: "E-0042", pin: "0000" } })).rejects.toThrow(/Invalid device, employee or PIN/);
    await expect(auth.api.signInWithDevicePin({ body: { deviceToken: "f".repeat(64), employeeCode: "E-0042", pin: "4821" } })).rejects.toThrow(/Invalid device, employee or PIN/);

    const ok = await auth.api.signInWithDevicePin({ body: { deviceToken, employeeCode: "E-0042", pin: "4821" }, returnHeaders: true });
    const session = await auth.api.getSession({ headers: cookieHeader(ok.headers) });
    expect(session?.user.email).toBe("storekeeper@demo-printers.example");
    expect((session?.session as { authMethod?: string }).authMethod).toBe("device-pin");
    expect((session?.session as { deviceSite?: string }).deviceSite).toBe("BHIWANDI");
  });

  it("supports step-up re-authentication before a sensitive action (custom plugin)", async () => {
    const signIn = await auth.api.signInEmail({ body: { email: "accounts@demo-printers.example", password: PASSWORD }, returnHeaders: true });
    const headers = cookieHeader(signIn.headers);
    await expect(auth.api.stepUp({ body: { password: "wrong password!" }, headers })).rejects.toThrow(/Re-authentication failed/);
    await auth.api.stepUp({ body: { password: PASSWORD }, headers });
    const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    const stepUpAt = (session?.session as { stepUpAt?: Date | string }).stepUpAt;
    expect(stepUpAt).toBeTruthy();
    expect(Date.now() - new Date(stepUpAt ?? 0).getTime()).toBeLessThan(5_000);
  });

  it("rate-limits password guessing over HTTP (OWASP ASVS 2.2.1)", async () => {
    const attempt = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.7" },
          body: JSON.stringify({ email: "owner@demo-printers.example", password: "guess-guess-guess" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await attempt()).status);
    console.log(`[S2] sign-in statuses: ${statuses.join(", ")}`);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });
});

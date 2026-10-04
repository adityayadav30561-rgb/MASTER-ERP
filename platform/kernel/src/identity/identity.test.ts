import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newTraceId, systemContext, withTenant } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { addMember, createOrgUnit, provisionTenant } from "../tenancy/index.ts";
import { assignRole, createRole } from "../authz/index.ts";
import { checkPassword, checkPin, createIdentity } from "./index.ts";
import type { Identity } from "./index.ts";

const PASSWORD = "paper reels arrive on tuesday";

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** Request headers for a tenant sub-domain, carrying the cookies a response set. */
function on(host: string, from?: Headers): Headers {
  const h = new Headers({ host, "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" });
  const cookies = from?.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (cookies) h.set("cookie", cookies);
  return h;
}

describe("password and PIN policy (NIST SP 800-63B)", () => {
  it("needs 15 characters, or 8 with two-factor login, and refuses common ones", () => {
    expect(checkPassword("short password", { mfaEnabled: false }).ok).toBe(false);
    expect(checkPassword(PASSWORD, { mfaEnabled: false }).ok).toBe(true);
    expect(checkPassword("Gx7#pq2m", { mfaEnabled: true }).ok).toBe(true);
    expect(checkPassword("password123", { mfaEnabled: true }).ok).toBe(false);
  });
  it("needs a 6-digit PIN that is not trivial", () => {
    expect(checkPin("4821").ok).toBe(false);
    expect(checkPin("111111").ok).toBe(false);
    expect(checkPin("123456").ok).toBe(false);
    expect(checkPin("482913").ok).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase)("K2 identity (Better Auth + tenant membership)", { timeout: 120_000 }, () => {
  let t: TestDatabase;
  let identity: Identity;
  let alpha: string;
  let beta: string;
  let owner: string;
  let operator: string;
  let operatorMembership: string;
  let site: string;
  let deviceToken: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    identity = createIdentity({ appConnectionString: t.appUrl, appDb: t.app.db, baseURL: "http://erp.test", secret: "x".repeat(48), rateLimit: false });
    await identity.migrate(t.url);
    alpha = await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" });
    beta = await provisionTenant(t.owner.db, { code: "beta", name: "Beta Cartons", status: "active" });
    owner = await identity.ensureUser("owner@alpha.example", "Mr Sharma");
    await identity.setPassword(owner, PASSWORD);
    operator = await identity.ensureUser("e0042@alpha.example", "Suresh");
    const ctx = { ...systemContext(alpha), traceId: newTraceId() };
    await withTenant(t.app.db, ctx, async (tx) => {
      const ownerMembership = await addMember(tx, { userId: owner, displayName: "Mr Sharma" });
      operatorMembership = await addMember(tx, { userId: operator, displayName: "Suresh", employeeCode: "E-0042" });
      const company = await createOrgUnit(tx, { kind: "company", code: "AP", name: "Alpha" });
      site = await createOrgUnit(tx, { kind: "site", code: "BHW", name: "Bhiwandi", parentId: company });
      const ownerRole = await createRole(tx, { code: "owner", name: "Owner", privileged: true, permissions: ["*"] });
      await assignRole(tx, ownerMembership, ownerRole, { type: "tenant" });
      deviceToken = (await identity.registerDevice(tx, { siteId: site, name: "Press 2 tablet" })).token;
      await identity.setPin(tx, operatorMembership, "482913");
    });
  });
  afterAll(async () => {
    await identity?.close();
    await t?.drop();
  });

  it("refuses self sign-up and weak passwords", async () => {
    await expect(identity.auth.api.signUpEmail({ body: { email: "x@example.com", password: PASSWORD, name: "X" }, headers: on("alpha.erp.test") })).rejects.toThrow();
    await expect(identity.setPassword(owner, "too short")).rejects.toThrow(/15 characters/);
  });

  it("binds the session to the sub-domain's tenant and resolves a principal", async () => {
    const r = await identity.auth.api.signInEmail({ body: { email: "owner@alpha.example", password: PASSWORD }, headers: on("alpha.erp.test"), returnHeaders: true });
    const s = await identity.resolve(on("alpha.erp.test", r.headers));
    expect(s?.principal).toMatchObject({ tenantId: alpha, userId: owner, authMethod: "password" });
    expect(s?.mfaEnrolmentRequired).toBe(true); // owner is privileged and has no second factor yet
    // The same cookie on another tenant's address is useless.
    expect(await identity.resolve(on("beta.erp.test", r.headers))).toBeUndefined();
  });

  it("refuses sign-in where the person is not a member, and logs it", async () => {
    await expect(identity.auth.api.signInEmail({ body: { email: "owner@alpha.example", password: PASSWORD }, headers: on("beta.erp.test") })).rejects.toThrow(/not a member/);
    await expect(identity.auth.api.signInEmail({ body: { email: "owner@alpha.example", password: PASSWORD }, headers: on("erp.test") })).rejects.toThrow(/company's address/);
    const events = (await t.owner.pool.query("select tenant_id, outcome from kernel.security_event where event_type = 'auth.sign_in' order by id")).rows;
    expect(events).toContainEqual({ tenant_id: alpha, outcome: "success" });
    expect(events).toContainEqual({ tenant_id: beta, outcome: "failure" }); // the refused attempt on Beta's address
  });

  it("clears the MFA requirement once TOTP is enrolled", async () => {
    const r = await identity.auth.api.signInEmail({ body: { email: "owner@alpha.example", password: PASSWORD }, headers: on("alpha.erp.test"), returnHeaders: true });
    const headers = on("alpha.erp.test", r.headers);
    const enable = await identity.auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers });
    if (enable.method !== "totp") throw new Error("expected TOTP");
    await identity.auth.api.verifyTOTP({ body: { code: totp(new URL(enable.totpURI).searchParams.get("secret") ?? "") }, headers });
    const second = await identity.auth.api.signInEmail({ body: { email: "owner@alpha.example", password: PASSWORD }, headers: on("alpha.erp.test"), returnHeaders: true });
    const verified = await identity.auth.api.verifyTOTP({
      body: { code: totp(new URL(enable.totpURI).searchParams.get("secret") ?? "") },
      headers: on("alpha.erp.test", second.headers),
      returnHeaders: true,
    });
    const s = await identity.resolve(on("alpha.erp.test", verified.headers));
    expect(s?.mfaEnrolmentRequired).toBe(false);
  });

  it("signs an operator in on a registered tablet with employee code + PIN, with lockout", async () => {
    const pin = (p: string, token = deviceToken) =>
      identity.auth.handler(
        new Request("http://alpha.erp.test/api/auth/sign-in/device-pin", {
          method: "POST",
          headers: { "content-type": "application/json", host: "alpha.erp.test", origin: "http://erp.test" },
          body: JSON.stringify({ deviceToken: token, employeeCode: "E-0042", pin: p }),
        }),
      );
    expect((await pin("482913", "f".repeat(64))).status).toBe(401); // unknown device
    for (let i = 0; i < 5; i++) expect((await pin("000000")).status).toBe(401);
    expect((await pin("482913")).status).toBe(401); // locked after 5 failures, even with the right PIN
    await t.owner.pool.query("update kernel.tenant_membership set pin_locked_until = null where id = $1", [operatorMembership]);
    const ok = await pin("482913");
    expect(ok.status).toBe(200);
    const s = await identity.resolve(on("alpha.erp.test", ok.headers));
    expect(s?.principal).toMatchObject({ userId: operator, authMethod: "device-pin", deviceSiteId: site });
  });

  it("stamps step-up re-authentication on the session", async () => {
    // The owner has TOTP now (sign-in stops at the second factor), so use the operator's device session.
    const ok = await identity.auth.handler(new Request("http://alpha.erp.test/api/auth/sign-in/device-pin", {
      method: "POST", headers: { "content-type": "application/json", host: "alpha.erp.test", origin: "http://erp.test" },
      body: JSON.stringify({ deviceToken, employeeCode: "E-0042", pin: "482913" }),
    }));
    const headers = on("alpha.erp.test", ok.headers);
    const before = await identity.resolve(headers);
    expect(before && identity.hasRecentStepUp(before)).toBe(false);
    await identity.setPassword(operator, "operator passphrase long enough");
    await expect(identity.auth.api.stepUp({ body: { password: "wrong passphrase" }, headers })).rejects.toThrow(/Re-authentication failed/);
    await identity.auth.api.stepUp({ body: { password: "operator passphrase long enough" }, headers });
    const after = await identity.resolve(headers);
    expect(after && identity.hasRecentStepUp(after)).toBe(true);
  });
});

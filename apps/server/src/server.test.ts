import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { newTraceId, systemContext, withTenant } from "@master-erp/kernel/db";
import { createTestDatabase, hasTestDatabase } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { addMember, provisionTenant } from "@master-erp/kernel/tenancy";
import { assignRole, createRole } from "@master-erp/kernel/authz";
import { loadConfig } from "./config.ts";
import { createKernel } from "./app.module.ts";
import type { Kernel } from "./app.module.ts";
import { createApp } from "./main.ts";

const PASSWORD = "plates go to press two at noon";

describe("configuration", () => {
  it("refuses to start with missing or weak settings", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://x", BASE_URL: "http://erp.test", AUTH_SECRET: "short", FILES_SECRET: "y".repeat(40) })).toThrow(/AUTH_SECRET/);
    expect(loadConfig({ DATABASE_URL: "postgres://x", BASE_URL: "http://erp.test", AUTH_SECRET: "x".repeat(40), FILES_SECRET: "y".repeat(40) }).PORT).toBe("3000");
  });
});

describe.skipIf(!hasTestDatabase)("server (web process)", { timeout: 120_000 }, () => {
  let t: TestDatabase;
  let kernel: Kernel;
  let app: NestFastifyApplication;
  const inject = (opts: InjectOptions) => app.getHttpAdapter().getInstance().inject(opts);

  beforeAll(async () => {
    t = await createTestDatabase();
    kernel = createKernel(loadConfig({ DATABASE_URL: t.appUrl, BASE_URL: "http://erp.test", AUTH_SECRET: "a".repeat(48), FILES_SECRET: "f".repeat(48), FILES_DIR: mkdtempSync(join(tmpdir(), "erp-srv-")) }));
    await kernel.identity.migrate(t.url);
    const alpha = await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" });
    await provisionTenant(t.owner.db, { code: "beta", name: "Beta Cartons", status: "active" });
    const user = await kernel.identity.ensureUser("planner@alpha.example", "Anita");
    await kernel.identity.setPassword(user, PASSWORD);
    const admin = await kernel.identity.ensureUser("admin@alpha.example", "Admin");
    await kernel.identity.setPassword(admin, PASSWORD);
    await withTenant(t.app.db, { ...systemContext(alpha), traceId: newTraceId() }, async (tx) => {
      await addMember(tx, { userId: user, displayName: "Anita (planning)" });
      const adminMembership = await addMember(tx, { userId: admin, displayName: "Admin" });
      const role = await createRole(tx, { code: "admin", name: "Administrator", privileged: true, permissions: ["admin.*"] });
      await assignRole(tx, adminMembership, role, { type: "tenant" });
    });
    app = await createApp(kernel);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await kernel?.identity.close();
    await kernel?.database.destroy();
    await t?.drop();
  });

  const signIn = async (email: string, host = "alpha.erp.test") => {
    const r = await inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { host, origin: "http://erp.test", "content-type": "application/json" }, payload: { email, password: PASSWORD } });
    const raw = r.headers["set-cookie"];
    const cookies = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((c) => String(c).split(";")[0]).join("; ");
    return { status: r.statusCode, cookies };
  };

  it("reports liveness and readiness", async () => {
    expect((await inject({ method: "GET", url: "/health/live" })).json()).toEqual({ status: "ok" });
    expect((await inject({ method: "GET", url: "/health/ready" })).statusCode).toBe(200);
  });

  it("answers errors as problem details (RFC 9457)", async () => {
    const r = await inject({ method: "GET", url: "/api/v1/me", headers: { host: "alpha.erp.test" } });
    expect(r.statusCode).toBe(401);
    expect(r.headers["content-type"]).toContain("application/problem+json");
    expect(r.json()).toMatchObject({ status: 401, title: "Sign in required", instance: "/api/v1/me" });
  });

  it("signs in on the tenant's address and returns the person in that tenant", async () => {
    const { status, cookies } = await signIn("planner@alpha.example");
    expect(status).toBe(200);
    const me = await inject({ method: "GET", url: "/api/v1/me", headers: { host: "alpha.erp.test", cookie: cookies } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ tenantName: "Alpha Printers", displayName: "Anita (planning)", authMethod: "password", mfaEnrolmentRequired: false });
    // The same cookie on Beta's address does not work.
    expect((await inject({ method: "GET", url: "/api/v1/me", headers: { host: "beta.erp.test", cookie: cookies } })).statusCode).toBe(401);
  });

  it("refuses sign-in on a tenant where the person is not a member", async () => {
    expect((await signIn("planner@alpha.example", "beta.erp.test")).status).toBe(403);
  });

  it("lets a privileged user without two-factor login see only the enrolment path", async () => {
    const { cookies } = await signIn("admin@alpha.example");
    const me = await inject({ method: "GET", url: "/api/v1/me", headers: { host: "alpha.erp.test", cookie: cookies } });
    expect(me.json()).toMatchObject({ mfaEnrolmentRequired: true });
  });
});

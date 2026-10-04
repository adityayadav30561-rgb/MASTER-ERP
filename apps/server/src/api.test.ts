import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { kernelMigrations } from "@master-erp/kernel/db";
import { readWorkbook, writeWorkbook } from "@master-erp/kernel/importer";
import { createTestDatabase, hasTestDatabase, totpCode, totpSecret } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { foundationMigrations } from "@master-erp/foundation";
import { provisionDemoPrinters } from "@master-erp/tenant-demo-printers";
import type { ProvisionResult } from "@master-erp/kernel/onboarding";
import { loadConfig } from "./config.ts";
import { createKernel } from "./app.module.ts";
import type { Kernel } from "./app.module.ts";
import { createApp } from "./main.ts";
import { XLSX } from "./import.controller.ts";

const PASSWORD = "plates go to press two at noon";
const HOST = "demo.erp.test";

describe.skipIf(!hasTestDatabase)("REST API on the demo tenant", { timeout: 120_000 }, () => {
  let t: TestDatabase;
  let kernel: Kernel;
  let app: NestFastifyApplication;
  let demo: ProvisionResult;
  let owner = ""; // cookies of the owner's session (after two-factor)
  const raw = (opts: InjectOptions) => app.getHttpAdapter().getInstance().inject(opts);
  const call = (method: "GET" | "POST" | "PUT", url: string, cookies: string, payload?: unknown, headers: Record<string, string> = {}) =>
    raw({ method, url, headers: { host: HOST, origin: "http://erp.test", cookie: cookies, ...(payload !== undefined ? { "content-type": "application/json" } : {}), ...headers }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const cookiesOf = (r: { headers: Record<string, unknown> }, previous = "") => {
    const set = r.headers["set-cookie"];
    const fresh = (Array.isArray(set) ? set : set ? [set] : []).map((c) => String(c).split(";")[0] ?? "");
    const jar = new Map(previous.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c] as const));
    for (const c of fresh) jar.set(c.split("=")[0], c);
    return [...jar.values()].join("; ");
  };
  const signIn = async (email: string) => cookiesOf(await call("POST", "/api/auth/sign-in/email", "", { email, password: PASSWORD }));

  beforeAll(async () => {
    t = await createTestDatabase([kernelMigrations, foundationMigrations]);
    kernel = createKernel(loadConfig({ DATABASE_URL: t.appUrl, BASE_URL: "http://erp.test", AUTH_SECRET: "a".repeat(48), FILES_SECRET: "f".repeat(48), FILES_DIR: mkdtempSync(join(tmpdir(), "erp-api-")) }));
    await kernel.identity.migrate(t.url);
    const ownerId = await kernel.identity.ensureUser("owner@demo.example", "Asha Mehta");
    await kernel.identity.setPassword(ownerId, PASSWORD);
    demo = await provisionDemoPrinters({ owner: t.owner.db, app: t.app.db }, { userId: ownerId, displayName: "Asha Mehta" });
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

  it("makes the owner enrol two-factor sign-in before anything else", async () => {
    let cookies = await signIn("owner@demo.example");
    expect((await call("GET", "/api/v1/me", cookies)).json()).toMatchObject({ mfaEnrolmentRequired: true, roles: ["admin", "owner"] });
    const blocked = await call("GET", "/api/v1/parties", cookies);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ title: "Set up two-factor login first" });

    const enable = await call("POST", "/api/auth/two-factor/enable", cookies, { password: PASSWORD });
    const secret = totpSecret((enable.json() as { totpURI: string }).totpURI);
    expect((await call("POST", "/api/auth/two-factor/verify-totp", cookies, { code: totpCode(secret) })).statusCode).toBe(200);

    cookies = await signIn("owner@demo.example"); // now asks for the second factor
    owner = cookiesOf(await call("POST", "/api/auth/two-factor/verify-totp", cookies, { code: totpCode(secret) }), cookies);
    const me = (await call("GET", "/api/v1/me", owner)).json() as { mfaEnrolmentRequired: boolean; permissions: string[]; tenantStatus: string };
    expect(me).toMatchObject({ mfaEnrolmentRequired: false, tenantStatus: "demo" });
    expect(me.permissions).toEqual(expect.arrayContaining(["admin.*", "foundation.*"]));
  });

  it("lists, creates and updates parties with validation, ETag and If-Match", async () => {
    const vendors = (await call("GET", "/api/v1/parties?filter[role]=vendor&limit=2", owner)).json() as { items: { code: string }[]; nextCursor: string | null };
    expect(vendors.items.map((p) => p.code)).toEqual(["BHARATFILMS", "COLOURTECH"]);
    const next = (await call("GET", `/api/v1/parties?filter[role]=vendor&limit=2&cursor=${encodeURIComponent(vendors.nextCursor ?? "")}`, owner)).json() as { items: { code: string }[] };
    expect(next.items.map((p) => p.code)).toEqual(["SHREEPAPER"]);

    const bad = await call("POST", "/api/v1/parties", owner, { name: "Kalpana Cartons", roles: ["customer"], taxIds: [{ scheme: "gstin", value: "27AABCK1234A1Z0" }], colour: "red" });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toMatchObject({ errors: [{ field: "colour", message: "is not a known field" }] });
    const invalid = await call("POST", "/api/v1/parties", owner, { name: "Kalpana Cartons", roles: ["customer"], taxIds: [{ scheme: "gstin", value: "27AABCK1234A1Z0" }] });
    expect(invalid.statusCode).toBe(422);
    expect((invalid.json() as { errors: { field: string }[] }).errors.map((e) => e.field)).toContain("taxIds[0].value");

    const created = await call("POST", "/api/v1/parties", owner, { name: "Kalpana Cartons", roles: ["customer"], addresses: [{ kind: "registered", line1: "Unit 5", city: "Thane", regionCode: "IN-MH", postalCode: "400601" }] });
    expect(created.statusCode).toBe(201);
    const party = created.json() as { id: string; code: string; version: number };
    expect(created.headers.etag).toBe(`"v${party.version}"`);
    expect(created.headers.location).toBe(`/api/v1/parties/${party.id}`);

    const body = { name: "Kalpana Cartons Pvt Ltd", roles: ["customer", "vendor"], addresses: [{ kind: "registered", line1: "Unit 5", city: "Thane", regionCode: "IN-MH", postalCode: "400601" }] };
    expect((await call("PUT", `/api/v1/parties/${party.id}`, owner, body)).statusCode).toBe(428);
    const ok = await call("PUT", `/api/v1/parties/${party.id}`, owner, body, { "if-match": String(created.headers.etag) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ name: "Kalpana Cartons Pvt Ltd", roles: ["customer", "vendor"] });
    expect((await call("PUT", `/api/v1/parties/${party.id}`, owner, body, { "if-match": String(created.headers.etag) })).statusCode).toBe(412); // stale

    expect((await call("POST", `/api/v1/parties/${party.id}/actions/block`, owner)).json()).toMatchObject({ status: "blocked" });
    expect((await call("GET", "/api/v1/parties/0190a5f0-0000-7000-8000-000000000000", owner)).statusCode).toBe(404);
  });

  it("creates a board item with its sheet conversion and serves form fields per language", async () => {
    const r = await call("POST", "/api/v1/items", owner, { name: "SBS 350 GSM 720 × 1020", category: "board", ext: { gsm: "350", length_mm: "720", width_mm: "1020", board_type: "sbs" } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ code: "BOARD-0001", hsnSac: "4810", computed: { sheet_weight_g: "257.04" }, conversions: [{ from: "kg", to: "sheet" }] });
    const fields = (await call("GET", "/api/v1/fields/foundation.item?lang=hi", owner)).json() as { key: string; label: string }[];
    expect(fields.find((f) => f.key === "gsm")?.label).toBe("जीएसएम");
    expect((await call("GET", "/api/v1/uoms", owner)).json()).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ream", uqc: "OTH" })]));
  });

  it("serves an Excel template and imports a filled one (dry run, then commit)", async () => {
    const template = await call("GET", "/api/v1/imports/items/template", owner);
    expect(template.headers["content-type"]).toBe(XLSX);
    const headers = (await readWorkbook(new Uint8Array(template.rawPayload), "Items")).headers;
    expect(headers).toContain("GSM");
    const file = await writeWorkbook([{ name: "Items", columns: [{ header: "Name *" }, { header: "Category *" }, { header: "Ink colour" }], rows: [["Process magenta", "ink", "magenta"], ["Process yellow", "ink", "violet"]] }]);
    const upload = (mode: string, data: Uint8Array) => raw({ method: "POST", url: `/api/v1/imports/items?mode=${mode}`, headers: { host: HOST, origin: "http://erp.test", cookie: owner, "content-type": XLSX }, payload: Buffer.from(data) });
    const dry = await upload("dry-run", file);
    expect(dry.statusCode).toBe(200);
    expect(dry.json()).toMatchObject({ created: 1, failed: 1, committed: false, errors: [{ row: 3, column: "Ink colour" }] });
    const fixed = await writeWorkbook([{ name: "Items", columns: [{ header: "Name *" }, { header: "Category *" }, { header: "Ink colour" }], rows: [["Process magenta", "ink", "magenta"]] }]);
    expect((await upload("commit", fixed)).json()).toMatchObject({ created: 1, committed: true });
  });

  it("adds a store keeper (after step-up) who sees only store screens, also on a tablet with a PIN", async () => {
    const invite = { email: "ravi@demo.example", name: "Ravi Patil", employeeCode: "E-014", roles: [{ role: "store_keeper", scope: { type: "org_unit", id: demo.orgUnits.PAPER } }], initialPassword: PASSWORD };
    const refused = await call("POST", "/api/v1/admin/members", owner, invite);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ type: "https://errors.master-erp.in/step-up" });
    owner = cookiesOf(await call("POST", "/api/auth/step-up", owner, { password: PASSWORD }), owner);
    const added = await call("POST", "/api/v1/admin/members", owner, invite);
    expect(added.statusCode).toBe(201);
    const { membershipId } = added.json() as { membershipId: string };

    const ravi = await signIn("ravi@demo.example");
    const me = (await call("GET", "/api/v1/me", ravi)).json() as { roles: string[]; permissions: string[]; mfaEnrolmentRequired: boolean };
    expect(me).toMatchObject({ roles: ["store_keeper"], mfaEnrolmentRequired: false });
    expect((await call("GET", "/api/v1/items", ravi)).statusCode).toBe(200);
    const denied = await call("GET", "/api/v1/parties", ravi);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ check: 3 });
    expect((await call("GET", "/api/v1/admin/members", ravi)).statusCode).toBe(403);
    const logged = await t.owner.pool.query("select details->>'permission' as p from kernel.security_event where event_type = 'authz.denied' and tenant_id = $1", [demo.tenantId]);
    expect(logged.rows.map((r: { p: string }) => r.p)).toContain("foundation.party.read"); // logged although the request's transaction rolled back

    // Tablet at the Bhiwandi works: register it, give Ravi a PIN, sign in with employee code + PIN.
    const device = (await call("POST", "/api/v1/admin/devices", owner, { siteId: demo.orgUnits.BHW, name: "Store tablet" })).json() as { token: string };
    expect((await call("POST", `/api/v1/admin/members/${membershipId}/pin`, owner, { pin: "482913" })).statusCode).toBe(204);
    const tablet = cookiesOf(await call("POST", "/api/auth/sign-in/device-pin", "", { deviceToken: device.token, employeeCode: "E-014", pin: "482913" }));
    const onTablet = (await call("GET", "/api/v1/me", tablet)).json() as { authMethod: string; roles: string[]; deviceSiteId: string };
    expect(onTablet).toMatchObject({ authMethod: "device-pin", roles: ["store_keeper"], deviceSiteId: demo.orgUnits.BHW });
  });

  it("administers numbering, settings and the checklist within package locks", async () => {
    const series = (await call("GET", "/api/v1/admin/numbering", owner)).json() as { id: string; document_type: string; preview: string }[];
    const invoice = series.find((s) => s.document_type === "sales.tax_invoice");
    expect(invoice?.preview).toMatch(/^DP\/\d\d-\d\d\/99999$/);
    const tooLong = await call("PUT", `/api/v1/admin/numbering/${invoice?.id}`, owner, { pattern: "DEMOPRINT/{FYYYY}/{SEQ:5}" });
    expect(tooLong.statusCode).toBe(409);
    expect((await call("PUT", `/api/v1/admin/numbering/${invoice?.id}`, owner, { pattern: "DPI/{FY}/{SEQ:5}" })).json()).toMatchObject({ pattern: "DPI/{FY}/{SEQ:5}" });

    const settings = (await call("GET", "/api/v1/admin/settings", owner)).json() as { key: string; value: unknown; locked: boolean }[];
    expect(settings.find((s) => s.key === "sales.invoice_round_off")).toMatchObject({ value: "rupee", locked: true });
    expect((await call("PUT", "/api/v1/admin/settings/sales.invoice_round_off", owner, { value: "none" })).statusCode).toBe(422);
    expect((await call("PUT", "/api/v1/admin/settings/inventory.over_receipt_tolerance_percent", owner, { value: "5" })).json()).toEqual({ key: "inventory.over_receipt_tolerance_percent", value: "5" });

    const checklist = (await call("POST", "/api/v1/admin/checklist/configuration.numbering", owner, { done: true })).json() as { key: string; done: boolean }[];
    expect(Object.fromEntries(checklist.map((c) => [c.key, c.done]))).toMatchObject({ "configuration.numbering": true, "users.invited": true, "users.mfa": true, "masters.items": true });
  });

  it("describes itself in OpenAPI 3.1, generated from the same specs that validate requests", async () => {
    const doc = (await raw({ method: "GET", url: "/api/v1/openapi.json" })).json() as { openapi: string; paths: Record<string, Record<string, { "x-permission"?: string; parameters?: { name: string }[] }>> };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/api/v1/parties/{id}"]?.put?.["x-permission"]).toBe("foundation.party.update");
    expect(doc.paths["/api/v1/parties"]?.get?.parameters?.map((p) => p.name)).toEqual(expect.arrayContaining(["limit", "cursor", "filter[role]"]));
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(["/api/v1/admin/members", "/api/v1/imports/{target}", "/api/v1/me"]));
  });
});

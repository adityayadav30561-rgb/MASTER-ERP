import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "../ids/index.ts";
import { newTraceId, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { createOrgUnit, provisionTenant } from "../tenancy/index.ts";
import { createSeries, DocumentService, DocumentTypeRegistry, LifecycleError } from "../documents/index.ts";
import { purchaseOrder } from "../documents/fixtures.ts";
import { EffectiveConfiguration, loadPackage, PackageError, pinTenantPackages, SettingsError, SettingsService } from "./index.ts";

const FIX = fileURLToPath(new URL("./fixtures/", import.meta.url));
const india = loadPackage(join(FIX, "india"));
const printing = loadPackage(join(FIX, "printing"));
const tenant = loadPackage(join(FIX, "tenant-demo"));

/** Copy a fixture and change one file, to test what a package author might get wrong. */
function variant(name: string, file: string, content: string) {
  const dir = mkdtempSync(join(tmpdir(), "pkg-"));
  cpSync(join(FIX, name), dir, { recursive: true });
  writeFileSync(join(dir, file), content);
  return loadPackage(dir);
}

describe("K12 configuration packages (pure)", () => {
  const config = new EffectiveConfiguration([tenant, printing, india]); // any order: sorted by layer

  it("orders layers and records versions and checksums", () => {
    expect(config.packages.map((p) => p.id)).toEqual(["india", "printing-packaging", "tenant-demo"]);
    expect(config.packages[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("overrides terminology per layer, with language fallback", () => {
    expect(config.label("manufacturing.production_order")).toBe("Work order"); // tenant over industry
    expect(config.label("manufacturing.production_order", "hi")).toBe("जॉब");
    expect(config.label("manufacturing.job_card", "hi")).toBe("Job card"); // falls back to English
    expect(config.label("sales.tax_invoice")).toBe("Tax Invoice");
  });

  it("extends fields across layers and validates with them", () => {
    expect(config.fields("foundation.item").map((f) => f.key)).toEqual(["gsm", "grain", "plate_rack"]);
    expect(config.validator("foundation.item").validate({ gsm: "300", plate_rack: "R-12" }, { category: "board" })).toEqual([]);
  });

  it("merges numbering per property and keeps the India locks", () => {
    expect(config.numbering("sales.tax_invoice")).toMatchObject({ pattern: "DP/{FY}/{SEQ:5}", maxLength: 16, gapless: true });
    expect(() => new EffectiveConfiguration([india, printing, variant("tenant-demo", "numbering/series.yaml", "sales.tax_invoice:\n  maxLength: 30\n")])).toThrow(/locks/);
  });

  it("enforces locks on settings and fields", () => {
    expect(() => new EffectiveConfiguration([india, printing, variant("tenant-demo", "settings/defaults.yaml", "sales.invoice_round_off: none\n")])).toThrow(/india locks/);
    expect(() =>
      new EffectiveConfiguration([india, printing, variant("tenant-demo", "fields/foundation.item.yaml", "- key: gsm\n  label: { en: Weight }\n  type: decimal\n")]),
    ).toThrow(/locks/);
  });

  it("checks dependencies, versions and schemas", () => {
    expect(() => new EffectiveConfiguration([printing, tenant])).toThrow(/requires package india/);
    expect(() => variant("printing", "manifest.yaml", "id: printing-packaging\ntype: industry\nversion: one\nplatform: '*'\n")).toThrow(/not SemVer/);
    expect(() => variant("printing", "manifest.yaml", "id: printing-packaging\ntype: industry\nversion: 0.1.0\nplatform: '>=2.0.0'\n")).not.toThrow();
    expect(() => new EffectiveConfiguration([india, variant("printing", "manifest.yaml", "id: printing-packaging\ntype: industry\nversion: 0.1.0\nplatform: '>=2.0.0'\n")])).toThrow(/needs platform/);
    expect(() => variant("printing", "roles/store_keeper.yaml", "code: store_keeper\nname: x\npermissions: [a]\nunknown: 1\n")).toThrow(PackageError);
    expect(() => new EffectiveConfiguration([india, variant("printing", "rules/guards.yaml", "purchase.purchase_order:\n  release:\n    - condition: 'record.total_amount >'\n      message: x\n")])).toThrow(/rule/);
  });

  it("provides role templates from packages", () => {
    expect(config.roleTemplates().map((r) => r.code)).toEqual(["store_keeper"]);
  });
});

describe.skipIf(!hasTestDatabase)("K12 configuration in a tenant", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  let company: string;
  let site: string;
  const config = new EffectiveConfiguration([india, printing, tenant]);
  const settings = new SettingsService(
    [
      { key: "inventory.over_receipt_tolerance_percent", description: "Accept up to this % more than ordered", schema: { type: "string", pattern: "^\\d{1,2}(\\.\\d{1,2})?$" }, default: "0", perOrgUnit: true },
      { key: "sales.invoice_round_off", description: "Round invoice totals", schema: { enum: ["none", "rupee"] }, default: "none" },
      { key: "inventory.allow_negative_stock", description: "Allow negative stock", schema: { type: "boolean" }, default: false },
    ],
    config,
  );
  const run = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(t.app.db, ctx, work);

  beforeAll(async () => {
    t = await createTestDatabase();
    const tenantId = await provisionTenant(t.owner.db, { code: "demo", name: "Demo Printers", status: "active" });
    ctx = { tenantId, actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    await run(async (tx) => {
      company = await createOrgUnit(tx, { kind: "company", code: "DP", name: "Demo Printers" });
      site = await createOrgUnit(tx, { kind: "site", code: "VAPI", name: "Vapi", parentId: company });
    });
  });
  afterAll(async () => t?.drop());

  it("resolves settings: site → tenant → package → module default", async () => {
    expect(await run((tx) => settings.get(tx, "inventory.allow_negative_stock"))).toBe(false); // module default
    expect(await run((tx) => settings.get(tx, "inventory.over_receipt_tolerance_percent", site))).toBe("5"); // tenant package
    await run((tx) => settings.set(tx, "inventory.over_receipt_tolerance_percent", "7"));
    await run((tx) => settings.set(tx, "inventory.over_receipt_tolerance_percent", "2.5", site));
    expect(await run((tx) => settings.get(tx, "inventory.over_receipt_tolerance_percent", site))).toBe("2.5");
    expect(await run((tx) => settings.get(tx, "inventory.over_receipt_tolerance_percent", company))).toBe("7");
  });

  it("refuses locked, invalid or unknown settings", async () => {
    await expect(run((tx) => settings.set(tx, "sales.invoice_round_off", "none"))).rejects.toThrow(/locked/);
    await expect(run((tx) => settings.set(tx, "inventory.allow_negative_stock", "yes"))).rejects.toThrow(SettingsError);
    await expect(run((tx) => settings.set(tx, "inventory.allow_negative_stock", true, site))).rejects.toThrow(/cannot differ/);
    await expect(run((tx) => settings.get(tx, "nope.nothing"))).rejects.toThrow(/Unknown setting/);
  });

  it("drives document sub-statuses and extra guards from packages", async () => {
    const registry = new DocumentTypeRegistry();
    registry.register(purchaseOrder);
    const docs = new DocumentService(registry, { configuration: config.asDocumentConfiguration() });
    const vendor = newId();
    await run((tx) => createSeries(tx, { documentType: "purchase.purchase_order", companyId: company, pattern: "PO/{FY}/{SEQ:4}" }));
    const po = await run((tx) => docs.create(tx, ctx, { documentType: "purchase.purchase_order", companyId: company, date: "2026-10-04", partyId: vendor }));
    await run((tx) => docs.transition(tx, ctx, po.id, "submit"));
    await run((tx) => docs.transition(tx, ctx, po.id, "approve"));
    await expect(run((tx) => docs.transition(tx, ctx, po.id, "release"))).rejects.toThrow(LifecycleError); // package guard: value needed
    const po2 = await run((tx) => docs.create(tx, ctx, { documentType: "purchase.purchase_order", companyId: company, date: "2026-10-04", partyId: vendor, totalAmount: "1000" }));
    for (const a of ["submit", "approve", "release"]) await run((tx) => docs.transition(tx, ctx, po2.id, a));
    await run((tx) => docs.setSubStatus(tx, ctx, po2.id, "awaiting_vendor_ack"));
    await expect(run((tx) => docs.setSubStatus(tx, ctx, po2.id, "lost_in_post"))).rejects.toThrow(/not configured/);
  });

  it("pins the package versions the tenant runs", async () => {
    await run((tx) => pinTenantPackages(tx, config));
    const rows = await run((tx) => tx.selectFrom("kernel.tenant_package").select(["package_id", "version"]).orderBy("package_id").execute());
    expect(rows).toEqual([
      { package_id: "india", version: "0.1.0" },
      { package_id: "printing-packaging", version: "0.1.0" },
      { package_id: "tenant-demo", version: "1.0.0" },
    ]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EffectiveConfiguration, loadPackage } from "@master-erp/kernel/config";
import { kernelMigrations, newTraceId, withTenant } from "@master-erp/kernel/db";
import type { ExecutionContext, Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { ValidationError } from "@master-erp/kernel/metadata";
import { createTestDatabase, hasTestDatabase } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { provisionTenant } from "@master-erp/kernel/tenancy";
import { FOUNDATION_DEFAULT_SEED, foundationMigrations, FoundationSeeder, ItemService, PartyService } from "@master-erp/foundation";
import { indiaPackageDir, indiaRules } from "./index.ts";

const india = loadPackage(indiaPackageDir);
const config = new EffectiveConfiguration([india]);

describe("India package (YAML)", () => {
  it("loads, locks the GST numbering rules and the round-off", () => {
    expect(india.manifest).toMatchObject({ id: "india", type: "localization" });
    expect(config.numbering("sales.tax_invoice")).toMatchObject({ maxLength: 16, gapless: true, fyStartMonth: 4 });
    expect(config.isLocked("numbering.sales.tax_invoice.maxLength")).toBe(true);
    expect(config.isLocked("settings.sales.invoice_round_off")).toBe(true);
    expect(config.label("sales.tax_invoice", "hi")).toBe("कर बीजक");
  });
});

describe.skipIf(!hasTestDatabase)("India rules on foundation masters", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  const parties = new PartyService({ rules: [indiaRules], config });
  const items = new ItemService({ rules: [indiaRules], config });
  const run = <T>(work: (tx: Tx) => Promise<T>) => withTenant(t.app.db, ctx, work);

  beforeAll(async () => {
    t = await createTestDatabase([kernelMigrations, foundationMigrations]);
    ctx = { tenantId: await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    await run(async (tx) => {
      const seeder = new FoundationSeeder({ rules: [indiaRules], config });
      await seeder.apply(tx, FOUNDATION_DEFAULT_SEED);
      await seeder.apply(tx, config.seed());
      await new ItemService({ rules: [indiaRules], config }).createCategory(tx, { code: "board", name: "Board", defaultUom: "kg", defaultTaxCategory: "gst_18" });
      await new ItemService({ rules: [indiaRules], config }).createCategory(tx, { code: "printing_service", name: "Printing services", itemType: "service", defaultUom: "nos" });
    });
  });
  afterAll(async () => t?.drop());

  it("seeds GST tax categories and maps UQC codes onto the default units", async () => {
    const uqc = await run((tx) => tx.selectFrom("foundation.uom").select(["code", "uqc"]).where("code", "in", ["kg", "nos", "hour"]).orderBy("code").execute());
    expect(uqc).toEqual([{ code: "hour", uqc: null }, { code: "kg", uqc: "KGS" }, { code: "nos", uqc: "NOS" }]);
    const cats = await run((tx) => tx.selectFrom("foundation.tax_category").select("code").orderBy("code").execute());
    expect(cats.map((c) => c.code)).toContain("gst_18");
  });

  it("accepts a vendor with matching PAN, GSTIN and Maharashtra address", async () => {
    const p = await run((tx) =>
      parties.create(tx, {
        name: "Sample Board Mills Pvt Ltd",
        roles: ["vendor"],
        taxIds: [{ scheme: "pan", value: "aapfu0939f" }, { scheme: "gstin", value: "27aapfu0939f1zv" }],
        addresses: [{ kind: "registered", line1: "Gala 4", city: "Bhiwandi", regionCode: "IN-MH", postalCode: "421302" }],
        ext: { gst_registration: "regular", msme_udyam: "UDYAM-MH-33-0012345", msme_category: "small" },
      }),
    );
    expect(p.taxIds.map((x) => `${x.scheme}:${x.value}:${x.regionCode ?? "-"}`)).toEqual(["gstin:27AAPFU0939F1ZV:IN-MH", "pan:AAPFU0939F:-"]);
  });

  it("explains GSTIN, PAN, state and PIN problems in plain words", async () => {
    const err = (await run((tx) =>
      parties.create(tx, {
        name: "Wrong Details Co",
        roles: ["customer"],
        taxIds: [{ scheme: "pan", value: "AAPFU0939G" }, { scheme: "gstin", value: "24AAPFU0939F1ZV" }],
        addresses: [{ kind: "billing", line1: "x", city: "Surat", regionCode: "IN-GJ", postalCode: "39500" }],
        ext: { msme_udyam: "UDYAM-GJ-01-1234567" },
      }),
    ).catch((e: unknown) => e)) as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    const byField = Object.fromEntries(err.errors.map((e) => [e.field, e.message]));
    expect(byField["taxIds[1].value"]).toMatch(/wrong check character|does not contain/);
    expect(byField["addresses[0].postalCode"]).toBe("must be a 6-digit PIN code");
    expect(byField["ext.msme_category"]).toBe("is required");
  });

  it("requires HSN for stock items and SAC for services", async () => {
    const err = (await run((tx) => items.create(tx, { name: "Duplex board", category: "board", hsnSac: "9989" })).catch((e: unknown) => e)) as ValidationError;
    expect(err.errors).toEqual([{ field: "hsnSac", message: "codes starting with 99 are SAC codes for services, not goods" }]);
    const svc = await run((tx) => items.create(tx, { name: "Offset printing charges", category: "printing_service", hsnSac: "998912" }));
    expect(svc).toMatchObject({ itemType: "service", hsnSac: "998912" });
  });
});

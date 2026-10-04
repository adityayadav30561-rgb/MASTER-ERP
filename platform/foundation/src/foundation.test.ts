import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Quantity } from "@master-erp/kernel/decimal";
import { newTraceId, withTenant } from "@master-erp/kernel/db";
import type { ExecutionContext, Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { ValidationError } from "@master-erp/kernel/metadata";
import { EffectiveConfiguration } from "@master-erp/kernel/config";
import type { LoadedPackage } from "@master-erp/kernel/config";
import { kernelMigrations } from "@master-erp/kernel/db";
import { createTestDatabase, hasTestDatabase } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { provisionTenant } from "@master-erp/kernel/tenancy";
import { foundationMigrations, FoundationSeeder, ItemService, PartyService, TaxService, UomService } from "./index.ts";
import type { LocalizationRules } from "./index.ts";

/** A made-up country ("Testland") so the foundation is tested without any real country's rules. */
const testland: LocalizationRules = {
  taxIdSchemes: {
    tin: {
      label: "Tax id",
      normalize: (v) => v.trim().toUpperCase(),
      validate: (v) => (/^T\d{2}[A-Z]{3}\d{3}$/.test(v) ? undefined : "must look like T27ABC123"),
      regionOf: (v) => `IN-${{ "27": "MH", "24": "GJ" }[v.slice(1, 3)] ?? "XX"}`,
    },
  },
  validateHsnSac: (code, type) => (type !== "non_stock" && !code ? "is required for stock items and services" : undefined),
  regionName: (r) => ({ "IN-MH": "Maharashtra", "IN-GJ": "Gujarat" })[r],
};

const pkg: LoadedPackage = {
  manifest: { id: "test-industry", type: "industry", version: "0.1.0", platform: ">=0.1.0 <1.0.0" },
  checksum: "x",
  fields: {
    "foundation.item": [
      { key: "gsm", label: { en: "GSM" }, type: "decimal", precision: 6, scale: 1, appliesWhen: "record.category in ['board']", required: "record.category == 'board'" },
    ],
    "foundation.party": [{ key: "msme", label: { en: "MSME" }, type: "boolean" }],
  },
  terminology: {}, subStatuses: {}, guards: {}, settings: {}, numbering: {}, roles: [], seed: {},
};

/** The ValidationError a promise rejects with (fails the test if it resolves). */
async function failure(p: Promise<unknown>): Promise<ValidationError> {
  try {
    await p;
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error("expected a validation error");
}

describe.skipIf(!hasTestDatabase)("L1 foundation masters", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let alpha: ExecutionContext;
  let beta: ExecutionContext;
  const config = new EffectiveConfiguration([pkg]);
  const parties = new PartyService({ rules: [testland], config });
  const items = new ItemService({ rules: [testland], config });
  const uoms = new UomService();
  const taxes = new TaxService();
  const run = <T>(work: (tx: Tx) => Promise<T>, ctx = alpha) => withTenant(t.app.db, ctx, work);

  beforeAll(async () => {
    t = await createTestDatabase([kernelMigrations, foundationMigrations]);
    alpha = { tenantId: await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    beta = { tenantId: await provisionTenant(t.owner.db, { code: "beta", name: "Beta", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    await run(async (tx) => {
      await new FoundationSeeder({ rules: [testland], config }).apply(tx, {
        "foundation.uom": [
          { code: "kg", name: "Kilogram", dimension: "mass", decimals: 3, unece: "KGM" },
          { code: "sheet", name: "Sheet", dimension: "count", decimals: 0 },
          { code: "ream", name: "Ream", dimension: "count", decimals: 0 },
          { code: "nos", name: "Numbers", dimension: "count", decimals: 0 },
        ],
        "foundation.uom_conversion": [{ from: "ream", to: "sheet", factor: "500" }],
        "foundation.tax_category": [{ code: "gst_12", name: "Goods 12%", rates: [{ taxType: "gst", rate: "12", validFrom: "2017-07-01" }, { taxType: "gst", rate: "18", validFrom: "2025-09-22" }] }],
        "foundation.item_category": [
          { code: "board", name: "Board", defaultUom: "kg", defaultTaxCategory: "gst_12", defaultHsnSac: "48109200" },
          { code: "consumables", name: "Consumables", itemType: "non_stock", defaultUom: "nos" },
        ],
      });
    });
  });
  afterAll(async () => t?.drop());

  it("lists ISO 4217 currencies", async () => {
    const r = await run((tx) => tx.selectFrom("foundation.currency").select(["code", "minor_unit"]).where("code", "in", ["INR", "KWD"]).orderBy("code").execute());
    expect(r).toEqual([{ code: "INR", minor_unit: 2 }, { code: "KWD", minor_unit: 3 }]);
  });

  it("finds the tax rate in force on a date", async () => {
    const cat = await run((tx) => tx.selectFrom("foundation.tax_category").select("id").where("code", "=", "gst_12").executeTakeFirstOrThrow());
    expect((await run((tx) => taxes.rateOn(tx, cat.id, "2025-01-01")))?.toString()).toBe("12");
    expect((await run((tx) => taxes.rateOn(tx, cat.id, "2025-10-01")))?.toString()).toBe("18");
    expect(await run((tx) => taxes.rateOn(tx, cat.id, "2016-01-01"))).toBeUndefined();
  });

  it("creates a party with roles, tax ids, addresses and contacts; generates a code", async () => {
    const p = await run((tx) =>
      parties.create(tx, {
        name: "Shree Papers Pvt Ltd",
        roles: ["vendor"],
        taxIds: [{ scheme: "tin", value: " t27abc123 " }],
        addresses: [{ kind: "registered", line1: "Plot 5, MIDC", city: "Bhiwandi", regionCode: "IN-MH", postalCode: "421302" }],
        contacts: [{ name: "Mr Shah", phone: "+91 98200 12345", email: "Shah@ShreePapers.example" }],
        ext: { msme: true },
      }),
    );
    expect(p).toMatchObject({ code: "SHREEPAPER", roles: ["vendor"], ext: { msme: true } });
    expect(p.taxIds[0]).toMatchObject({ value: "T27ABC123", regionCode: "IN-MH" });
    expect(p.taxIds[0]?.addressId).toBe(p.addresses[0]?.id);
    expect(p.contacts[0]).toMatchObject({ phone: "+919820012345", email: "shah@shreepapers.example" });
  });

  it("explains every problem at once", async () => {
    const err = await failure(run((tx) =>
      parties.create(tx, {
        name: "",
        roles: [],
        taxIds: [{ scheme: "tin", value: "T24ABC999" }, { scheme: "vat", value: "1" }],
        addresses: [{ kind: "billing", line1: "x", city: "Pune", regionCode: "IN-MH" }],
        contacts: [{ name: "A", email: "not-an-email" }],
        ext: { msme: "yes" },
      }),
    ));
    expect(err.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["name", "roles", "taxIds[0].value", "taxIds[1].scheme", "contacts[0].email", "ext.msme"]),
    );
    expect(err.errors.find((e) => e.field === "taxIds[0].value")?.message).toMatch(/needs an address in Gujarat/);
  });

  it("refuses a duplicate party with the same tax id (master-data quality)", async () => {
    const err = await failure(run((tx) =>
      parties.create(tx, { name: "Shree Paper Mart", roles: ["vendor"], taxIds: [{ scheme: "tin", value: "T27ABC123" }], addresses: [{ kind: "registered", line1: "x", city: "Thane", regionCode: "IN-MH" }] }),
    ));
    expect(err.errors[0]?.message).toMatch(/already belongs to Shree Papers Pvt Ltd \(SHREEPAPER\)/);
  });

  it("updates with optimistic locking and keeps the code", async () => {
    const id = (await run((tx) => parties.list(tx, { search: "shree" }))).items[0]?.id ?? "";
    const before = await run((tx) => parties.get(tx, id));
    const input = { name: "Shree Papers Private Limited", roles: ["vendor", "customer"] as const, taxIds: [{ scheme: "tin", value: "T27ABC123" }], addresses: [{ kind: "registered" as const, line1: "Plot 5", city: "Bhiwandi", regionCode: "IN-MH" }] };
    const after = await run((tx) => parties.update(tx, id, before.version, { ...input, roles: [...input.roles] }));
    expect(after).toMatchObject({ code: "SHREEPAPER", name: "Shree Papers Private Limited", roles: ["customer", "vendor"], version: before.version + 1 });
    await expect(run((tx) => parties.update(tx, id, before.version, { ...input, roles: ["vendor"] }))).rejects.toThrow(/changed by someone else/);
  });

  it("lists with search, role filter and cursor pagination; archived parties drop out", async () => {
    await run(async (tx) => {
      for (const n of ["Apex Inks", "Bharat Board Mills", "City Transport Co", "Delta Adhesives"]) {
        await parties.create(tx, { name: n, roles: n.includes("Transport") ? ["transporter"] : ["vendor"] });
      }
    });
    const first = await run((tx) => parties.list(tx, { role: "vendor", limit: 2 }));
    expect(first.items.map((p) => p.name)).toEqual(["Apex Inks", "Bharat Board Mills"]);
    const second = await run((tx) => parties.list(tx, { role: "vendor", limit: 2, cursor: first.nextCursor ?? "" }));
    expect(second.items.map((p) => p.name)).toEqual(["Delta Adhesives", "Shree Papers Private Limited"]);
    expect((await run((tx) => parties.list(tx, { search: "T27ABC123" }))).items.map((p) => p.code)).toEqual(["SHREEPAPER"]);
    await run((tx) => parties.setStatus(tx, first.items[0]?.id ?? "", "archived"));
    expect((await run((tx) => parties.list(tx, { role: "vendor" }))).items.map((p) => p.name)).not.toContain("Apex Inks");
  });

  it("creates items with category defaults, attribute rules and running codes", async () => {
    const board = await run((tx) => items.create(tx, { name: "Duplex board 300 gsm", category: "board", ext: { gsm: "300" }, conversions: [{ from: "kg", to: "sheet", factor: "6.8" }] }));
    expect(board).toMatchObject({ code: "BOARD-0001", baseUom: "kg", hsnSac: "48109200", taxCategory: "gst_12", itemType: "stock", ext: { gsm: "300" } });
    expect(board.conversions).toEqual([{ from: "kg", to: "sheet", factor: "6.8000000000" }]);
    expect((await run((tx) => items.create(tx, { name: "FBB board 350 gsm", category: "board", ext: { gsm: "350" } }))).code).toBe("BOARD-0002");
    const err = await failure(run((tx) => items.create(tx, { name: "Board without GSM", category: "board" })));
    expect(err.errors).toEqual([{ field: "ext.gsm", message: "is required" }]);
    const gloves = await run((tx) => items.create(tx, { name: "Cotton gloves", category: "consumables" }));
    expect(gloves).toMatchObject({ code: "CONSUMABLE-0001", itemType: "non_stock", hsnSac: null });
  });

  it("converts quantities through item-specific and general factors", async () => {
    const id = (await run((tx) => items.list(tx, { search: "duplex" }))).items[0]?.id ?? "";
    // 2 reams = 1,000 sheets; 1 kg = 6.8 sheets for this board → 147.059 kg (kg allows 3 decimals)
    const kg = await run((tx) => uoms.convert(tx, Quantity.of("2", "ream"), "kg", id));
    expect(kg.toString()).toBe("147.059 kg");
    await expect(run((tx) => uoms.convert(tx, Quantity.of("2", "ream"), "kg"))).rejects.toThrow(/no conversion/);
  });

  it("seeds idempotently and keeps tenants apart", async () => {
    const report = await run((tx) => new FoundationSeeder({ rules: [testland], config }).apply(tx, { "foundation.uom": [{ code: "kg", name: "Kilogram", dimension: "mass" }] }));
    expect(report).toEqual({ created: {}, skipped: { "foundation.uom": 1 } });
    expect((await run((tx) => parties.list(tx), beta)).items).toEqual([]);
    expect(await run((tx) => uoms.list(tx), beta)).toEqual([]);
  });
});

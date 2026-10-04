import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EffectiveConfiguration, loadPackage } from "@master-erp/kernel/config";
import { Decimal, Quantity } from "@master-erp/kernel/decimal";
import { kernelMigrations, newTraceId, withTenant } from "@master-erp/kernel/db";
import type { ExecutionContext, Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { createTestDatabase, hasTestDatabase } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { provisionTenant } from "@master-erp/kernel/tenancy";
import { FOUNDATION_DEFAULT_SEED, foundationMigrations, FoundationSeeder, ItemService, UomService } from "@master-erp/foundation";
import { kgToSheetConversion, printingPackageDir, sheetsPerKg, sheetWeightGrams, withSheetConversions } from "./index.ts";

const printing = loadPackage(printingPackageDir);
const config = new EffectiveConfiguration([printing]);
const item = config.validator("foundation.item");

describe("Printing & Packaging package (YAML)", () => {
  it("loads as a country-neutral industry package with the eleven default roles plus Admin", () => {
    expect(printing.manifest).toMatchObject({ id: "printing-packaging", type: "industry" });
    expect(config.roleTemplates().map((r) => r.code).sort()).toEqual(
      ["accountant", "admin", "dispatch", "estimator", "operator", "owner", "planner", "prepress", "purchase", "qc", "sales", "store_keeper"],
    );
    const shopFloor = config.roleTemplates().filter((r) => r.shopFloor).map((r) => r.code).sort();
    expect(shopFloor).toEqual(["operator", "store_keeper"]);
    expect(config.label("manufacturing.production_order")).toBe("Job");
    expect(JSON.stringify(printing)).not.toMatch(/gst|hsn|uqc/i); // no country logic (ADR-0002)
  });

  it("gives board and paper their attribute set, and ink its own", () => {
    expect(item.validate({ gsm: "300", length_mm: "700", width_mm: "1000", board_type: "fbb", grain: "long" }, { category: "board" })).toEqual([]);
    expect(item.validate({}, { category: "board" })).toEqual([{ field: "gsm", message: "is required" }]);
    expect(item.validate({ gsm: "300", length_mm: "700" }, { category: "paper" })).toContainEqual({ field: "width_mm", message: "is required" });
    expect(item.validate({ gsm: "300" }, { category: "ink", ink_colour: "cyan" }).map((e) => e.field)).toContain("gsm"); // not part of ink's set
    expect(item.validate({ ink_colour: "pantone" }, { category: "ink" })).toEqual([{ field: "pantone_ref", message: "is required" }]);
    expect(item.validate({ ink_colour: "pantone", pantone_ref: "185 C" }, { category: "ink" })).toEqual([]);
  });

  it("computes the sheet weight from GSM and size", () => {
    const w = item.computed({ gsm: "300", length_mm: "700", width_mm: "1000" }, { category: "board" }).sheet_weight_g;
    expect(String(w)).toBe("210");
    expect(item.computed({ gsm: "300" }, { category: "board" }).sheet_weight_g).toBeNull(); // size not entered yet
    expect(item.computed({ ink_colour: "cyan" }, { category: "ink" })).toEqual({}); // not part of ink's set
  });
});

describe("kg ↔ sheet calculator", () => {
  it("matches a worked example", () => {
    expect(sheetWeightGrams({ gsm: "300", lengthMm: "700", widthMm: "1000" }).toString()).toBe("210");
    expect(sheetsPerKg({ gsm: "300", lengthMm: "700", widthMm: "1000" }).toString()).toBe("4.7619047619");
    expect(sheetsPerKg({ gsm: "250", lengthMm: "635", widthMm: "889" }).toString()).toBe("7.0857284572");
    expect(kgToSheetConversion({ gsm: "300", length_mm: "700", width_mm: "1000" })).toEqual({ from: "kg", to: "sheet", factor: "4.7619047619" });
    expect(kgToSheetConversion({ gsm: "300", reel_width_mm: "1000" })).toBeUndefined();
    expect(() => sheetsPerKg({ gsm: "0", lengthMm: "700", widthMm: "1000" })).toThrow(/gsm/);
  });

  it("is consistent: sheets per kg × sheet weight ≈ 1000 g (property)", () => {
    const dim = (min: number, max: number) => fc.integer({ min: min * 10, max: max * 10 }).map((n) => Decimal.from(BigInt(n)).dividedBy("10", 1, "half-even"));
    fc.assert(
      fc.property(dim(20, 1200), dim(50, 3000), dim(50, 3000), (gsm, lengthMm, widthMm) => {
        const grams = sheetsPerKg({ gsm, lengthMm, widthMm }).times(sheetWeightGrams({ gsm, lengthMm, widthMm }));
        return grams.minus("1000").abs().lessThan("0.0001");
      }),
    );
  });

  it("adds the conversion to sized sheet records only, once", () => {
    type Rec = { code: string; ext: Record<string, unknown>; conversions?: { from: string; to: string; factor: string }[] };
    const out = withSheetConversions<Rec>([{ code: "A", ext: { gsm: "300", length_mm: "700", width_mm: "1000" } }, { code: "B", ext: { ink_colour: "cyan" } }]);
    expect(out[0]?.conversions).toEqual([{ from: "kg", to: "sheet", factor: "4.7619047619" }]);
    expect(out[1]?.conversions).toBeUndefined();
    expect(withSheetConversions(out)[0]?.conversions).toHaveLength(1);
  });
});

describe.skipIf(!hasTestDatabase)("Printing package seeded into a tenant", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  const run = <T>(work: (tx: Tx) => Promise<T>) => withTenant(t.app.db, ctx, work);
  const uoms = new UomService();
  const items = new ItemService({ config });

  beforeAll(async () => {
    t = await createTestDatabase([kernelMigrations, foundationMigrations]);
    ctx = { tenantId: await provisionTenant(t.owner.db, { code: "pp", name: "PP", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    await run(async (tx) => {
      const seeder = new FoundationSeeder({ config });
      await seeder.apply(tx, FOUNDATION_DEFAULT_SEED);
      await seeder.apply(tx, config.seed());
    });
  });
  afterAll(async () => t?.drop());

  it("seeds the industry's categories and units with their conversions", async () => {
    const cats = await run((tx) => items.listCategories(tx));
    expect(cats.map((c) => c.code)).toEqual(expect.arrayContaining(["board", "paper", "ink", "plate", "lamination_film", "finished_goods", "scrap"]));
    expect((await run((tx) => uoms.convert(tx, Quantity.of("2", "ream"), "sheet"))).toString()).toBe("1000 sheet");
    expect((await run((tx) => uoms.convert(tx, Quantity.of("3", "thousand"), "nos"))).toString()).toBe("3000 nos");
  });

  it("converts kg of a board to sheets with its own factor", async () => {
    const [record] = withSheetConversions([{ code: "FBB-300", name: "FBB 300 GSM 700 × 1000", category: "board", ext: { gsm: "300", length_mm: "700", width_mm: "1000" } }]);
    if (!record) throw new Error("no record");
    const { id } = await run((tx) => items.create(tx, record));
    const sheets = await run((tx) => uoms.convert(tx, Quantity.of("100", "kg"), "sheet", id, "down"));
    expect(sheets.toString()).toBe("476 sheet"); // 476.19… whole sheets
    const got = await run((tx) => items.get(tx, id));
    expect(String(got?.computed.sheet_weight_g)).toBe("210");
  });
});

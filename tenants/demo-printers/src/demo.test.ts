import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Quantity } from "@master-erp/kernel/decimal";
import { kernelMigrations, newTraceId, withTenant } from "@master-erp/kernel/db";
import type { ExecutionContext, Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { createTestDatabase, hasTestDatabase } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { provisionTenant } from "@master-erp/kernel/tenancy";
import { foundationMigrations, ItemService, PartyService, UomService } from "@master-erp/foundation";
import { indiaRules } from "@master-erp/pack-india";
import { demoPrintersConfiguration, seedDemoPrinters } from "./index.ts";

const config = demoPrintersConfiguration();

describe("Demo Printers configuration", () => {
  it("layers India → Printing → tenant, keeping the statutory locks", () => {
    expect(config.packages.map((p) => p.id)).toEqual(["india", "printing-packaging", "demo-printers"]);
    expect(config.numbering("sales.tax_invoice")).toMatchObject({ pattern: "DP/{FY}/{SEQ:5}", maxLength: 16, gapless: true });
    const board = config.seed()["foundation.item_category"]?.find((c) => (c as { code: string }).code === "board");
    expect(board).toEqual({ code: "board", name: "Board", defaultUom: "kg", defaultHsnSac: "4810", defaultTaxCategory: "gst_18" });
  });
});

describe.skipIf(!hasTestDatabase)("Demo Printers tenant", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  const run = <T>(work: (tx: Tx) => Promise<T>) => withTenant(t.app.db, ctx, work);
  const items = new ItemService({ rules: [indiaRules], config });
  const parties = new PartyService({ rules: [indiaRules], config });

  beforeAll(async () => {
    t = await createTestDatabase([kernelMigrations, foundationMigrations]);
    ctx = { tenantId: await provisionTenant(t.owner.db, { code: "demo", name: "Demo Printers Pvt Ltd", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    await run((tx) => seedDemoPrinters(tx, config));
  });
  afterAll(async () => t?.drop());

  it("creates the demo masters, valid under the India rules", async () => {
    const page = await run((tx) => parties.list(tx, { limit: 50 }));
    expect(page.items.map((p) => p.code).sort()).toEqual(["BHARATFILMS", "COLOURTECH", "FRESHFOODS", "LAMIWORKS", "SHREEPAPER", "SPEEDLINE", "SUNRISE", "VAPICOS"]);
    const sunrise = await run((tx) => parties.findByCode(tx, "SUNRISE"));
    const carton = await run((tx) => items.findByCode(tx, "SUN-PCM500-CTN"));
    if (!carton) throw new Error("carton missing");
    expect(await run((tx) => items.get(tx, carton))).toMatchObject({ ownerPartyId: sunrise, hsnSac: "4819", taxCategory: "gst_5", baseUom: "nos" });
  });

  it("takes HSN and GST category from the tenant's category defaults, UQC from the India pack", async () => {
    const id = await run((tx) => items.findByCode(tx, "FBB-300-700X1000"));
    if (!id) throw new Error("board missing");
    const board = await run((tx) => items.get(tx, id));
    expect(board).toMatchObject({ hsnSac: "4810", taxCategory: "gst_18", baseUom: "kg", computed: { sheet_weight_g: "210" } });
    expect(board?.conversions).toEqual([{ from: "kg", to: "sheet", factor: "4.7619047619" }]);
    expect((await run((tx) => new UomService().convert(tx, Quantity.of("1000", "kg"), "sheet", id, "down"))).toString()).toBe("4761 sheet");
    const uqc = await run((tx) => tx.selectFrom("foundation.uom").select(["code", "uqc"]).where("code", "in", ["sheet", "ream", "thousand"]).orderBy("code").execute());
    expect(uqc).toEqual([{ code: "ream", uqc: "OTH" }, { code: "sheet", uqc: "NOS" }, { code: "thousand", uqc: "THD" }]);
  });

  it("re-seeding creates nothing new", async () => {
    const reports = await run((tx) => seedDemoPrinters(tx, config));
    expect(reports.flatMap((r) => Object.values(r.created))).toEqual([]);
  });
});

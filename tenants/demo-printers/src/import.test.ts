import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemContext, withTenant } from "@master-erp/kernel/db";
import type { Tx } from "@master-erp/kernel/db";
import { newId } from "@master-erp/kernel/ids";
import { buildTemplate, readWorkbook, runImport, writeWorkbook } from "@master-erp/kernel/importer";
import { kernelMigrations } from "@master-erp/kernel/db";
import { createTestDatabase, hasTestDatabase } from "@master-erp/kernel/testing";
import type { TestDatabase } from "@master-erp/kernel/testing";
import { foundationMigrations, ItemImportTarget, ItemService, PartyImportTarget, PartyService } from "@master-erp/foundation";
import { indiaRules } from "@master-erp/pack-india";
import { withSheetConversions } from "@master-erp/pack-printing-packaging";
import { demoPrintersConfiguration, provisionDemoPrinters } from "./index.ts";

const config = demoPrintersConfiguration();
const parties = new PartyImportTarget({ rules: [indiaRules], config });
const items = new ItemImportTarget({ rules: [indiaRules], config, prepare: (i) => withSheetConversions([i])[0] ?? i });

/** A filled-in template: headers as the template has them, cells by column key. */
async function filled(sheet: string, target: PartyImportTarget | ItemImportTarget, rows: Record<string, string>[]) {
  const cols = target.columns();
  return writeWorkbook([{ name: sheet, columns: cols.map((c) => ({ header: c.required ? `${c.label} *` : c.label })), rows: rows.map((r) => cols.map((c) => r[c.key] ?? "")) }]);
}

describe("Excel templates from package fields", () => {
  it("has the India tax numbers and the printing attributes as columns", async () => {
    const template = await buildTemplate([parties, items]);
    expect((await readWorkbook(template, "Parties")).headers).toEqual(expect.arrayContaining(["Name *", "Roles *", "PAN", "GSTIN", "State", "Udyam registration no."]));
    expect((await readWorkbook(template, "Items")).headers).toEqual(expect.arrayContaining(["Category *", "HSN / SAC", "GSM", "Sheet length (mm)", "Ink colour"]));
    expect((await readWorkbook(template, "Items")).headers).not.toContain("Sheet weight (g)"); // computed: never imported
  });
});

describe.skipIf(!hasTestDatabase)("Importing masters into a new tenant", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let tenantId: string;
  const run = <T>(work: (tx: Tx) => Promise<T>) => withTenant(t.app.db, systemContext(tenantId, "import"), work);

  beforeAll(async () => {
    t = await createTestDatabase([kernelMigrations, foundationMigrations]);
    tenantId = (await provisionDemoPrinters({ owner: t.owner.db, app: t.app.db }, { userId: newId(), displayName: "Owner" }, { code: "fresh", demo: false })).tenantId;
  });
  afterAll(async () => t?.drop());

  it("finds every mistake in a dry run, then imports the corrected file", async () => {
    const rows = [
      { name: "Sunrise Pharma Ltd", roles: "Customer", gstin: "24aaecs5678f1z6", address_line1: "Plot 14, GIDC", city: "Vapi", postal_code: "396195", phone: "9825010001", gst_registration: "Regular" },
      { code: "COLOURTECH", name: "Colourtech Inks", roles: "vendor", gstin: "27AAGFC8642K1Z4", address_line1: "Gala 12", city: "Bhiwandi", state: "Maharashtra", postal_code: "421302" },
      { name: "Lami Works", roles: "job worker", address_line1: "Shop 3", city: "Bhiwandi", state: "27", postal_code: "42130" },
    ];
    await expect(run((tx) => runImport(tx, parties, new Uint8Array(), { mode: "dry-run" }))).rejects.toThrow(/not a readable Excel/);

    const report = await run(async (tx) => runImport(tx, parties, await filled("Parties", parties, rows), { mode: "dry-run" }));
    expect(report).toMatchObject({ total: 3, created: 1, failed: 2, committed: false });
    expect(report.errors).toEqual([
      { row: 3, column: "GSTIN", message: expect.stringMatching(/check character/) },
      { row: 4, column: "PIN / postal code", message: "must be a 6-digit PIN code" },
    ]);

    const fixed = [rows[0], { ...rows[1], gstin: "27AAGFC8642K1Z3" }, { ...rows[2], postal_code: "421302" }] as Record<string, string>[];
    const done = await run(async (tx) => runImport(tx, parties, await filled("Parties", parties, fixed), { mode: "commit" }));
    expect(done).toMatchObject({ created: 3, failed: 0, committed: true });
    const svc = new PartyService({ rules: [indiaRules], config });
    const [found] = (await run((tx) => svc.list(tx, { search: "sunrise" }))).items;
    expect(found?.code).toMatch(/^SUNRISE/); // generated from the name
    const sunrise = await run((tx) => svc.get(tx, found?.id as string));
    expect(sunrise).toMatchObject({ roles: ["customer"], ext: { gst_registration: "regular" } });
    expect(sunrise?.addresses[0]).toMatchObject({ regionCode: "IN-GJ", city: "Vapi" }); // state taken from the GSTIN
    expect(sunrise?.taxIds).toEqual([expect.objectContaining({ scheme: "gstin", value: "24AAECS5678F1Z6", regionCode: "IN-GJ" })]);
  });

  it("imports items with category defaults, attribute checks and the kg ↔ sheet conversion", async () => {
    const rows = [
      { code: "FBB-300-700X1000", name: "FBB 300 GSM 700 × 1000", category: "Board", gsm: "300", length_mm: "700", width_mm: "1000", board_type: "FBB" },
      { name: "Process cyan", category: "ink", ink_colour: "Cyan" },
      { name: "Pantone 185 C", category: "ink", ink_colour: "pantone" },
      { name: "Mystery", category: "unobtainium" },
    ];
    const report = await run(async (tx) => runImport(tx, items, await filled("Items", items, rows), { mode: "commit" }));
    expect(report).toMatchObject({ created: 2, failed: 2, committed: false });
    expect(report.errors).toContainEqual({ row: 4, column: "Pantone reference", message: "is required" });
    expect(report.errors).toContainEqual({ row: 5, column: "Category", message: expect.stringMatching(/unobtainium/) });
    expect(report.errors.every((e) => e.row === 4 || e.row === 5)).toBe(true);
    const ok = await run(async (tx) => runImport(tx, items, await filled("Items", items, rows.slice(0, 2)), { mode: "commit" }));
    expect(ok).toMatchObject({ created: 2, committed: true });
    const svc = new ItemService({ rules: [indiaRules], config });
    const board = await run(async (tx) => svc.get(tx, (await svc.findByCode(tx, "FBB-300-700X1000")) as string));
    expect(board).toMatchObject({ hsnSac: "4810", taxCategory: "gst_18", ext: { board_type: "fbb", gsm: "300" }, conversions: [{ from: "kg", to: "sheet", factor: "4.7619047619" }] });
  });
});

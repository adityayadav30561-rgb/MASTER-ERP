import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemContext, withTenant } from "../db/index.ts";
import type { Tx } from "../db/index.ts";
import { ValidationError } from "../metadata/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { createOrgUnit, provisionTenant } from "../tenancy/index.ts";
import { buildTemplate, parseList, parseYesNo, readWorkbook, runImport, SpreadsheetError, writeWorkbook } from "./index.ts";
import type { ImportTarget } from "./index.ts";

/** A small real target: sites under a company. */
function sites(companyId: () => string): ImportTarget<{ code: string; name: string; active: boolean }> {
  return {
    objectType: "kernel.org_unit",
    sheet: "Sites",
    columns: () => [
      { key: "code", label: "Code", required: true, format: "code" },
      { key: "name", label: "Name", required: true },
      { key: "active", label: "Active", format: "boolean", values: ["yes", "no"] },
    ],
    parse: (row) => {
      const active = row.active === undefined ? true : parseYesNo(row.active);
      return { input: { code: row.code ?? "", name: row.name ?? "", active: active ?? true }, errors: active === undefined ? [{ field: "active", message: "must be yes or no" }] : [] };
    },
    key: (i) => i.code,
    exists: async (tx, code) => Boolean(await tx.selectFrom("kernel.org_unit").select("id").where("code", "=", code).executeTakeFirst()),
    create: async (tx, i) => {
      if (i.code.startsWith("BAD")) throw new ValidationError([{ field: "siteName", message: "is not allowed" }]);
      return createOrgUnit(tx, { kind: "site", code: i.code, name: i.name, parentId: companyId() });
    },
    columnOf: (f) => (f === "siteName" ? "name" : undefined),
  };
}

const book = (rows: string[][], headers = ["Code *", "Name *", "Active"]) => writeWorkbook([{ name: "Sites", columns: headers.map((h) => ({ header: h })), rows }]);

describe("xlsx adapter", () => {
  it("writes a template with an instructions sheet and reads it back as text", async () => {
    const template = await buildTemplate([sites(() => "")]);
    const data = await readWorkbook(template, "Sites");
    expect(data.headers).toEqual(["Code *", "Name *", "Active"]);
    expect(data.rows).toEqual([]);
    const help = await readWorkbook(template, "Instructions");
    expect(help.rows.map((r) => r.cells.slice(0, 4))).toEqual([["Sites", "Code", "yes", "code (letters, digits, - _ /)"], ["Sites", "Name", "yes", "text"], ["Sites", "Active", "", "yes, no"]]);
  });

  it("refuses oversized and unreadable files", async () => {
    await expect(readWorkbook(new Uint8Array(10), undefined, { maxBytes: 5 })).rejects.toThrow(SpreadsheetError);
    await expect(readWorkbook(new TextEncoder().encode("not a zip"))).rejects.toThrow(/not a readable Excel/);
    const many = await book(Array.from({ length: 6 }, (_, i) => [`S${i}`, "x", "yes"]));
    await expect(readWorkbook(many, "Sites", { maxRows: 5 })).rejects.toThrow(/more than 5 rows/);
  });

  it("parses yes/no and lists", () => {
    expect([parseYesNo("Yes"), parseYesNo("n"), parseYesNo("maybe")]).toEqual([true, false, undefined]);
    expect(parseList(" customer, vendor;;job_worker ")).toEqual(["customer", "vendor", "job_worker"]);
  });
});

describe.skipIf(!hasTestDatabase)("Import runner", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let tenantId: string;
  let company = "";
  const run = <T>(work: (tx: Tx) => Promise<T>) => withTenant(t.app.db, systemContext(tenantId, "test"), work);
  const count = () => run(async (tx) => (await tx.selectFrom("kernel.org_unit").select("code").where("kind", "=", "site").execute()).map((r) => r.code).sort());

  beforeAll(async () => {
    t = await createTestDatabase();
    tenantId = await provisionTenant(t.owner.db, { code: "imp", name: "Import", status: "active" });
    company = await run((tx) => createOrgUnit(tx, { kind: "company", code: "C", name: "C" }));
  });
  afterAll(async () => t?.drop());

  it("dry run reports every problem with its row and column, and saves nothing", async () => {
    const file = await book([["S1", "Bhiwandi", "yes"], ["S2", "", ""], ["S1", "Again", ""], ["BAD1", "x", ""], ["S3", "Vapi", "perhaps"]]);
    const report = await run((tx) => runImport(tx, sites(() => company), file, { mode: "dry-run" }));
    expect(report).toMatchObject({ committed: false, total: 5, created: 1, failed: 4, skipped: 0 });
    expect(report.errors).toEqual([
      { row: 3, column: "Name", message: "is required" },
      { row: 4, column: "Code", message: '"S1" appears again (first on row 2)' },
      { row: 5, column: "Name", message: "is not allowed" },
      { row: 6, column: "Active", message: "must be yes or no" },
    ]);
    expect(await count()).toEqual([]);
  });

  it("commit saves all rows only when every row is valid; existing codes are skipped next time", async () => {
    const bad = await book([["S1", "Bhiwandi", ""], ["BAD2", "x", ""]]);
    expect(await run((tx) => runImport(tx, sites(() => company), bad, { mode: "commit" }))).toMatchObject({ committed: false, created: 1, failed: 1 });
    expect(await count()).toEqual([]);

    const good = await book([["S1", "Bhiwandi", "yes"], ["S2", "Vapi", "no"]], ["code", "NAME", "Active", "Remarks"]);
    const report = await run((tx) => runImport(tx, sites(() => company), good, { mode: "commit" }));
    expect(report).toMatchObject({ committed: true, created: 2, failed: 0, unknownColumns: ["Remarks"] });
    expect(await count()).toEqual(["S1", "S2"]);
    expect(await run((tx) => runImport(tx, sites(() => company), good, { mode: "commit" }))).toMatchObject({ committed: true, created: 0, skipped: 2 });
    expect(await run((tx) => runImport(tx, sites(() => company), good, { mode: "dry-run", existing: "error" }))).toMatchObject({ failed: 2 });
  });

  it("reports missing required columns before reading rows", async () => {
    const file = await book([["S9"]], ["Code"]);
    const report = await run((tx) => runImport(tx, sites(() => company), file, { mode: "commit" }));
    expect(report.errors).toEqual([{ row: 1, column: null, message: "Missing column(s): Name" }]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import { newTraceId, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { createOrgUnit, provisionTenant } from "../tenancy/index.ts";
import { auditTrailOf } from "../audit/index.ts";
import { createSeries, DocumentService, DocumentTypeRegistry, LifecycleError, listSeries, NumberingError, seedCounter, updateSeriesPattern } from "./index.ts";
import type { DocumentEvent } from "./index.ts";
import { goodsReceipt, purchaseOrder, taxInvoice } from "./fixtures.ts";

describe.skipIf(!hasTestDatabase)("K6 document framework", { timeout: 120_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  let company: string;
  let site: string;
  const vendor = newId();
  const events: DocumentEvent[] = [];
  const registry = new DocumentTypeRegistry();
  registry.register(purchaseOrder);
  registry.register(goodsReceipt);
  registry.register(taxInvoice);
  const docs = new DocumentService(registry, { events: async (_tx, _ctx, e) => void events.push(e) });
  const run = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(t.app.db, ctx, work);

  beforeAll(async () => {
    t = await createTestDatabase();
    const tenantId = await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" });
    ctx = { tenantId, actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    await run(async (tx) => {
      company = await createOrgUnit(tx, { kind: "company", code: "AP", name: "Alpha Printers Pvt Ltd" });
      site = await createOrgUnit(tx, { kind: "site", code: "BHW", name: "Bhiwandi", parentId: company });
      await createSeries(tx, { documentType: "purchase.purchase_order", companyId: company, pattern: "PO/{FY}/{SEQ:4}" });
      await createSeries(tx, { documentType: "inventory.goods_receipt", companyId: company, pattern: "GRN/{FY}/{SEQ:4}" });
      // India pack lock: ≤ 16 characters, letters, digits, "/" and "-" only (GST Rule 46(b)).
      await createSeries(tx, { documentType: "sales.tax_invoice", companyId: company, pattern: "INV/{FY}/{SEQ:5}", maxLength: 16, allowedPattern: "^[A-Za-z0-9/-]{1,16}$" });
      await createSeries(tx, { documentType: "sales.tax_invoice", companyId: company, siteId: site, pattern: "BHW/{FY}/{SEQ:5}", maxLength: 16, allowedPattern: "^[A-Za-z0-9/-]{1,16}$" });
    });
  });
  afterAll(async () => t?.drop());

  it("rejects badly declared lifecycles", () => {
    const r = new DocumentTypeRegistry();
    expect(() => r.register({ ...purchaseOrder, documentType: "PurchaseOrder" })).toThrow(/<module>.<object>/);
    expect(() => r.register({ ...goodsReceipt, transitions: [{ action: "post", from: ["draft"], to: "nowhere", event: "posted" }] })).toThrow(/not declared/);
  });

  it("walks a purchase order through its core lifecycle; the number arrives at release", async () => {
    // A core guard: no release without a vendor.
    const noVendor = await run((tx) => docs.create(tx, ctx, { documentType: "purchase.purchase_order", companyId: company, date: "2026-10-04" }));
    await run((tx) => docs.transition(tx, ctx, noVendor.id, "submit"));
    await run((tx) => docs.transition(tx, ctx, noVendor.id, "approve"));
    await expect(run((tx) => docs.transition(tx, ctx, noVendor.id, "release"))).rejects.toThrow(LifecycleError);
    await run((tx) => docs.transition(tx, ctx, noVendor.id, "cancel", { reason: "vendor not chosen" }));
    events.length = 0;

    const po = await run((tx) => docs.create(tx, ctx, { documentType: "purchase.purchase_order", companyId: company, siteId: site, date: "2026-10-04", partyId: vendor, currency: "INR", totalAmount: "64250.50" }));
    expect(po.state).toBe("draft");
    expect(po.number).toBeNull();
    expect(registry.availableActions(po.document_type, po.state)).toEqual(["submit", "cancel"]);
    await run((tx) => docs.transition(tx, ctx, po.id, "submit"));
    await expect(run((tx) => docs.transition(tx, ctx, po.id, "release"))).rejects.toThrow(/not allowed/);
    await run((tx) => docs.transition(tx, ctx, po.id, "approve"));
    const released = await run((tx) => docs.transition(tx, ctx, po.id, "release"));
    expect(released.number).toBe("PO/26-27/0001");
    expect(released.posted_at).not.toBeNull();
    expect(events.map((e) => e.type)).toEqual([
      "purchase.purchase_order.created", "purchase.purchase_order.submitted", "purchase.purchase_order.approved", "purchase.purchase_order.released",
    ]);
  });

  it("makes posted documents immutable and undeletable, in the service and in the database", async () => {
    const po = await run((tx) => tx.selectFrom("kernel.document").select(["id", "version"]).where("number", "=", "PO/26-27/0001").executeTakeFirstOrThrow());
    await expect(run((tx) => docs.updateDraft(tx, po.id, po.version, { totalAmount: "1.00" }))).rejects.toThrow(/cannot be edited/);
    await expect(run((tx) => tx.updateTable("kernel.document").set({ total_amount: "1.00" }).where("id", "=", po.id).execute())).rejects.toThrow(/cannot be edited/);
    await expect(run((tx) => tx.deleteFrom("kernel.document").where("id", "=", po.id).execute())).rejects.toThrow(/cannot be deleted/);
  });

  it("uses optimistic locking for drafts", async () => {
    const d = await run((tx) => docs.create(tx, ctx, { documentType: "purchase.purchase_order", companyId: company, date: "2026-10-04" }));
    const v1 = (await run((tx) => tx.selectFrom("kernel.document").select("version").where("id", "=", d.id).executeTakeFirstOrThrow())).version;
    await run((tx) => docs.updateDraft(tx, d.id, v1, { totalAmount: "100" }));
    await expect(run((tx) => docs.updateDraft(tx, d.id, v1, { totalAmount: "200" }))).rejects.toThrow(/changed by someone else/);
    await run((tx) => docs.deleteDraft(tx, d.id));
  });

  it("derives open quantities from fulfils links of posted, not cancelled documents", async () => {
    const po = await run((tx) => tx.selectFrom("kernel.document").select("id").where("number", "=", "PO/26-27/0001").executeTakeFirstOrThrow());
    const poLine = newId(); // a purchase-order line id (module table)
    const grn1 = await run(async (tx) => {
      const g = await docs.create(tx, ctx, { documentType: "inventory.goods_receipt", companyId: company, siteId: site, date: "2026-10-05" });
      await docs.link(tx, { type: "fulfils", sourceDocumentId: po.id, sourceLineId: poLine, targetDocumentId: g.id, targetLineId: newId(), quantity: "400.5", uom: "KGM" });
      return g;
    });
    expect((await run((tx) => docs.openQuantity(tx, poLine, "630.5"))).toString()).toBe("630.5"); // draft GRN does not count
    await run((tx) => docs.transition(tx, ctx, grn1.id, "post"));
    expect((await run((tx) => docs.openQuantity(tx, poLine, "630.5"))).toString()).toBe("230");

    // The PO cannot be cancelled while a posted receipt fulfils it …
    await expect(run((tx) => docs.transition(tx, ctx, po.id, "cancel", { reason: "vendor failed" }))).rejects.toThrow(/follow-on document GRN\/26-27\/0001/);
    // … the receipt is cancelled first (with a reason), and its quantity is open again.
    await expect(run((tx) => docs.transition(tx, ctx, grn1.id, "cancel"))).rejects.toThrow(/needs a reason/);
    await run((tx) => docs.transition(tx, ctx, grn1.id, "cancel", { reason: "wrong vendor" }));
    expect((await run((tx) => docs.openQuantity(tx, poLine, "630.5"))).toString()).toBe("630.5");
  });

  it("amends a released PO into a new revision with the same number; the old revision is kept", async () => {
    const po = await run((tx) => tx.selectFrom("kernel.document").select("id").where("number", "=", "PO/26-27/0001").where("revision", "=", 1).executeTakeFirstOrThrow());
    const rev2 = await run((tx) => docs.amend(tx, ctx, po.id));
    expect(rev2.state).toBe("draft");
    expect(rev2.number).toBe("PO/26-27/0001");
    const old = await run((tx) => docs.get(tx, po.id));
    expect(old.state).toBe("superseded");
    const rev = await run((tx) => tx.selectFrom("kernel.document").select(["revision", "amends_id"]).where("id", "=", rev2.id).executeTakeFirstOrThrow());
    expect(rev).toEqual({ revision: 2, amends_id: po.id });
  });

  it("allocates statutory invoice numbers without gaps, even when postings fail or run concurrently", async () => {
    const drafts = await run(async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < 25; i++) ids.push((await docs.create(tx, ctx, { documentType: "sales.tax_invoice", companyId: company, siteId: site, date: "2026-10-04" })).id);
      return ids;
    });
    // 25 concurrent postings, every 5th fails after taking a number (e.g. a validation in the same transaction).
    const results = await Promise.allSettled(
      drafts.map((id, i) =>
        run(async (tx) => {
          await docs.transition(tx, ctx, id, "post");
          if (i % 5 === 0) throw new Error("e-invoice validation failed");
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    const numbers = (await run((tx) => tx.selectFrom("kernel.document").select("number").where("document_type", "=", "sales.tax_invoice").where("number", "is not", null).execute()))
      .map((r) => r.number as string)
      .sort();
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => `BHW/26-27/${String(i + 1).padStart(5, "0")}`)); // site series wins; 1…20, no gaps
  });

  it("continues from a legacy number and enforces the 16-character GST rule", async () => {
    await run(async (tx) => {
      const series = await tx.selectFrom("kernel.number_series").select("id").where("document_type", "=", "sales.tax_invoice").where("site_id", "is", null).executeTakeFirstOrThrow();
      await seedCounter(tx, series.id, "2026-27", 41n);
      await tx.updateTable("kernel.number_series").set({ pattern: "INVOICE/{FYYYY}/{SEQ:5}" }).where("id", "=", series.id).execute();
    });
    const d = await run((tx) => docs.create(tx, ctx, { documentType: "sales.tax_invoice", companyId: company, date: "2026-10-04" }));
    await expect(run((tx) => docs.transition(tx, ctx, d.id, "post"))).rejects.toThrow(NumberingError); // "INVOICE/2026-27/00042" is 21 characters
    await run((tx) => tx.updateTable("kernel.number_series").set({ pattern: "INV/{FY}/{SEQ:5}" }).where("document_type", "=", "sales.tax_invoice").where("site_id", "is", null).execute());
    const posted = await run((tx) => docs.transition(tx, ctx, d.id, "post"));
    expect(posted.number).toBe("INV/26-27/00042"); // the failed attempt did not consume 42
  });

  it("lets an admin change a pattern only before the first number, within the series limits", async () => {
    await run(async (tx) => {
      await expect(createSeries(tx, { documentType: "sales.credit_note", companyId: company, pattern: "CREDITNOTE/{FYYYY}/{SEQ:6}", maxLength: 16 })).rejects.toThrow(/longer than 16/);
      const id = await createSeries(tx, { documentType: "sales.credit_note", companyId: company, pattern: "CN/{FY}/{SEQ:4}", maxLength: 16, allowedPattern: "^[A-Za-z0-9/-]{1,16}$" });
      const listed = (await listSeries(tx, "2026-10-04")).find((x) => x.id === id);
      expect(listed).toMatchObject({ document_type: "sales.credit_note", company_code: "AP", used: false, preview: "CN/26-27/9999" });
      await expect(updateSeriesPattern(tx, id, "CN {FY} {SEQ:4}", "2026-10-04")).rejects.toThrow(/characters this series does not allow/);
      await expect(updateSeriesPattern(tx, id, "{COMPANY}/CREDIT/{FY}/{SEQ:4}", "2026-10-04")).rejects.toThrow(/longer than 16/);
      await updateSeriesPattern(tx, id, "{COMPANY}CN/{FY}/{SEQ:4}", "2026-10-04");
      await seedCounter(tx, id, "2026-27", 3n);
      await expect(updateSeriesPattern(tx, id, "CN/{FY}/{SEQ:5}", "2026-10-04")).rejects.toThrow(/already taken/);
    });
  });

  it("audits document changes, including state transitions", async () => {
    const po = await run((tx) => tx.selectFrom("kernel.document").select("id").where("number", "=", "PO/26-27/0001").where("revision", "=", 1).executeTakeFirstOrThrow());
    const trail = await run((tx) => auditTrailOf(tx, "kernel.document", po.id));
    const states = trail.filter((e) => e.action === "update" && e.changes.state).map((e) => (e.changes.state as string[])[1]);
    expect(states).toEqual(["submitted", "approved", "released", "superseded"]);
  });

  it("protects module line tables of posted documents with the kernel guard", async () => {
    await t.owner.pool.query(`create table kernel.test_lines (id uuid primary key, document_id uuid not null, qty numeric);
      create trigger guard before insert or update or delete on kernel.test_lines for each row execute function kernel.guard_document_rows();
      grant select, insert, update, delete on kernel.test_lines to erp_app;`);
    const posted = await run((tx) => tx.selectFrom("kernel.document").select("id").where("number", "=", "INV/26-27/00042").executeTakeFirstOrThrow());
    await expect(run((tx) => sql`insert into kernel.test_lines values (${newId()}, ${posted.id}, 1)`.execute(tx))).rejects.toThrow(/cannot be changed/);
  });
});

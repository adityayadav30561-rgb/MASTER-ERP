/**
 * Spike S3 — runs against a real PostgreSQL (DATABASE_URL must be a superuser/owner connection).
 * The application side connects as the unprivileged role s3_app, exactly as production will.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import pg from "pg";
import { run, runMigrations } from "graphile-worker";
import type { Runner } from "graphile-worker";
import { Decimal } from "@master-erp/kernel/decimal";
import { createDb, enqueueJob, withTenant } from "./db.ts";
import type { Db } from "./db.ts";
import { InsufficientStockError, postStockDocument } from "./posting.ts";

const ADMIN_URL = process.env.DATABASE_URL ?? "";
const TENANT_A = randomUUID();
const TENANT_B = randomUUID();

describe.skipIf(!ADMIN_URL)("Spike S3: RLS + Kysely + Graphile Worker", { timeout: 60_000 }, () => {
  let admin: pg.Pool;
  let app: { db: Db; pool: pg.Pool };
  let single: { db: Db; pool: pg.Pool }; // one connection, to prove the context never leaks
  let runner: Runner | undefined;
  const handled: { payload: Record<string, unknown>; at: number }[] = [];

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await admin.query(`do $$ begin
      if not exists (select from pg_roles where rolname = 's3_app') then
        create role s3_app login password 's3_app' nosuperuser nobypassrls;
      end if; end $$`);
    await runMigrations({ connectionString: ADMIN_URL });
    await admin.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    await admin.query("delete from graphile_worker._private_jobs");
    await admin.query("insert into s3_kernel.tenant (id, name) values ($1, 'Alpha Printers'), ($2, 'Beta Cartons')", [TENANT_A, TENANT_B]);
    const appUrl = new URL(ADMIN_URL);
    appUrl.username = "s3_app";
    appUrl.password = "s3_app";
    app = createDb(appUrl.toString(), 10);
    single = createDb(appUrl.toString(), 1);
  });

  afterAll(async () => {
    await runner?.stop();
    await app?.db.destroy();
    await single?.db.destroy();
    await admin?.end();
  });

  it("isolates tenants: each tenant sees only its own rows", async () => {
    await postStockDocument(app.db, TENANT_A, "GRN-A-1", [{ itemCode: "BOARD-300", warehouseCode: "MAIN", quantity: "100", value: "9275.00" }]);
    await postStockDocument(app.db, TENANT_B, "GRN-B-1", [{ itemCode: "BOARD-300", warehouseCode: "MAIN", quantity: "7", value: "700.00" }]);
    const seenByA = await withTenant(app.db, TENANT_A, (tx) => tx.selectFrom("s3_inventory.stock_ledger").selectAll().execute());
    const seenByB = await withTenant(app.db, TENANT_B, (tx) => tx.selectFrom("s3_inventory.stock_ledger").selectAll().execute());
    expect(seenByA.map((r) => r.document_ref)).toEqual(["GRN-A-1"]);
    expect(seenByB.map((r) => r.document_ref)).toEqual(["GRN-B-1"]);
  });

  it("fails closed without a tenant context", async () => {
    const rows = await app.db.selectFrom("s3_inventory.stock_ledger").selectAll().execute();
    expect(rows).toHaveLength(0);
    await expect(
      app.db.transaction().execute((tx) => enqueueJob(tx, "stock_posted", {})),
    ).rejects.toThrow(/no tenant context/);
  });

  it("rejects writing a row for another tenant", async () => {
    await expect(
      withTenant(app.db, TENANT_A, (tx) =>
        tx.insertInto("s3_inventory.stock_ledger")
          .values({ tenant_id: TENANT_B, item_code: "X", warehouse_code: "MAIN", quantity: "1", value: "1", document_ref: "FORGED" })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("never leaks the tenant context to the next user of a pooled connection", async () => {
    await withTenant(single.db, TENANT_A, (tx) => tx.selectFrom("s3_inventory.stock_ledger").selectAll().execute());
    const after = await sql<{ t: string | null }>`select current_setting('app.tenant_id', true) as t`.execute(single.db);
    expect(after.rows[0]?.t ?? "").toBe("");
    expect(await single.db.selectFrom("s3_inventory.stock_ledger").selectAll().execute()).toHaveLength(0);
  });

  it("keeps posted ledger rows immutable for the application role", async () => {
    await expect(
      withTenant(app.db, TENANT_A, (tx) => tx.updateTable("s3_inventory.stock_ledger").set({ quantity: "1" }).execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(app.db, TENANT_A, (tx) => tx.deleteFrom("s3_inventory.stock_ledger").execute()),
    ).rejects.toThrow(/permission denied/);
  });

  it("creates jobs inside the business transaction: rollback drops them, the tenant is stamped", async () => {
    const count = async () => Number((await admin.query("select count(*) from graphile_worker._private_jobs")).rows[0].count);
    const before = await count();
    await expect(
      withTenant(app.db, TENANT_A, async (tx) => {
        await enqueueJob(tx, "stock_posted", { document_ref: "ROLLED-BACK" });
        throw new Error("business rule failed");
      }),
    ).rejects.toThrow("business rule failed");
    expect(await count()).toBe(before);

    await withTenant(app.db, TENANT_A, (tx) => enqueueJob(tx, "stock_posted", { document_ref: "FORGE", tenant_id: TENANT_B }));
    const job = await admin.query("select payload from graphile_worker._private_jobs where payload->>'document_ref' = 'FORGE'");
    expect(job.rows[0].payload.tenant_id).toBe(TENANT_A); // the context wins over the payload
  });

  it("the worker picks up committed jobs quickly", async () => {
    runner = await run({
      connectionString: ADMIN_URL,
      concurrency: 2,
      noHandleSignals: true,
      pollInterval: 2000,
      taskList: {
        stock_posted: async (payload) => {
          handled.push({ payload: payload as Record<string, unknown>, at: Date.now() });
        },
      },
    });
    const start = Date.now();
    await postStockDocument(app.db, TENANT_A, "GRN-A-LATENCY", [{ itemCode: "INK-CYAN", warehouseCode: "MAIN", quantity: "5", value: "2500.00" }]);
    await expect.poll(() => handled.some((h) => h.payload.document_ref === "GRN-A-LATENCY"), { timeout: 10_000, interval: 20 }).toBe(true);
    const latency = (handled.find((h) => h.payload.document_ref === "GRN-A-LATENCY")?.at ?? 0) - start;
    console.log(`[S3] commit → job handler latency: ${latency} ms`);
    expect(latency).toBeLessThan(1000);
  });

  it("never lets stock go negative under 50 concurrent issues", async () => {
    await postStockDocument(app.db, TENANT_A, "GRN-A-PLATES", [{ itemCode: "PLATE-CTP", warehouseCode: "MAIN", quantity: "30", value: "3000.00" }]);
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        postStockDocument(app.db, TENANT_A, `ISS-${i}`, [{ itemCode: "PLATE-CTP", warehouseCode: "MAIN", quantity: "-1", value: "-100.00" }]),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const refused = results.filter((r) => r.status === "rejected" && r.reason instanceof InsufficientStockError).length;
    expect({ ok, refused }).toEqual({ ok: 30, refused: 20 });
    const balance = await withTenant(app.db, TENANT_A, (tx) =>
      tx.selectFrom("s3_inventory.stock_balance").select(["quantity", "value"]).where("item_code", "=", "PLATE-CTP").executeTakeFirstOrThrow(),
    );
    expect(Decimal.from(balance.quantity).isZero()).toBe(true);
    expect(Decimal.from(balance.value).isZero()).toBe(true);
  });

  it("posts multi-item documents concurrently without deadlocks (ordered locks)", async () => {
    const items = ["CARTON-A", "CARTON-B", "CARTON-C", "CARTON-D"];
    const docs = Array.from({ length: 40 }, (_, i) => {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      return postStockDocument(app.db, TENANT_A, `GRN-MULTI-${i}`, shuffled.map((itemCode) => ({ itemCode, warehouseCode: "MAIN", quantity: "2.5", value: "10.25" })));
    });
    const results = await Promise.allSettled(docs);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const balances = await withTenant(app.db, TENANT_A, (tx) =>
      tx.selectFrom("s3_inventory.stock_balance").select(["item_code", "quantity", "value"]).where("item_code", "in", items).orderBy("item_code").execute(),
    );
    expect(balances.map((b) => [b.item_code, b.quantity, b.value])).toEqual(items.map((i) => [i, "100.000000", "410.00"]));
  });

  it("round-trips NUMERIC exactly as strings (spike S4, database leg)", async () => {
    const big = "123456789012345678.123456";
    await postStockDocument(app.db, TENANT_A, "GRN-A-BIG", [{ itemCode: "SHEETS", warehouseCode: "MAIN", quantity: big, value: "0.01" }]);
    const row = await withTenant(app.db, TENANT_A, (tx) =>
      tx.selectFrom("s3_inventory.stock_ledger").select(["quantity", "value"]).where("document_ref", "=", "GRN-A-BIG").executeTakeFirstOrThrow(),
    );
    expect(typeof row.quantity).toBe("string");
    expect(Decimal.from(row.quantity).equals(big)).toBe(true);
    const sum = await withTenant(app.db, TENANT_A, (tx) =>
      sql<{ total: string }>`select sum(quantity) + 0.000001 as total from s3_inventory.stock_ledger where document_ref = 'GRN-A-BIG'`.execute(tx),
    );
    expect(sum.rows[0]?.total).toBe("123456789012345678.123457");
  });
});

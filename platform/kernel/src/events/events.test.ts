import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import type { Runner } from "graphile-worker";
import { newId } from "../ids/index.ts";
import { newTraceId, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { createOrgUnit, provisionTenant } from "../tenancy/index.ts";
import { createSeries, DocumentService, DocumentTypeRegistry } from "../documents/index.ts";
import { goodsReceipt } from "../documents/fixtures.ts";
import { EventBus, EventError, listDeadJobs, retryDeadJobs, startWorker } from "./index.ts";
import type { CloudEvent } from "./index.ts";

describe.skipIf(!hasTestDatabase)("K8 events, outbox and jobs", { timeout: 120_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  let company: string;
  let runner: Runner | undefined;
  const bus = new EventBus();
  const delivered: CloudEvent[] = [];
  let failNext = true;
  const run = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(t.app.db, ctx, work);

  bus.subscribe({
    name: "test.in_tx_counter",
    pattern: "inventory.goods_receipt.posted",
    mode: "in-transaction",
    handler: async (e, { tx }) => {
      await sql`insert into kernel.org_unit (id, kind, code, name) values (${newId()}, 'grouping', ${"IN-TX-" + e.id.slice(-6)}, 'marker')`.execute(tx);
    },
  });
  bus.subscribe({ name: "test.after_commit", pattern: "inventory.goods_receipt.*", mode: "after-commit", handler: async (e) => void delivered.push(e) });
  bus.subscribe({
    name: "test.flaky",
    pattern: "test.flaky.happened",
    mode: "after-commit",
    maxAttempts: 1,
    handler: async () => {
      if (failNext) throw new Error("Tally connector offline");
    },
  });
  bus.subscribe({
    name: "test.loop",
    pattern: "test.loop.happened",
    mode: "in-transaction",
    handler: async (e, h) => void (await bus.publish(h.tx, h.ctx, { type: "test.loop.happened", subject: e.subject, data: {} })),
  });

  const registry = new DocumentTypeRegistry();
  registry.register(goodsReceipt);
  const docs = new DocumentService(registry, { events: bus.documentSink() });

  beforeAll(async () => {
    t = await createTestDatabase();
    const tenantId = await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" });
    ctx = { tenantId, actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    company = await run(async (tx) => {
      const c = await createOrgUnit(tx, { kind: "company", code: "AP", name: "Alpha" });
      await createSeries(tx, { documentType: "inventory.goods_receipt", companyId: c, pattern: "GRN/{FY}/{SEQ:4}" });
      return c;
    });
  });
  afterAll(async () => {
    await runner?.stop();
    await t?.drop();
  });

  const jobCount = async () => Number((await t.owner.pool.query("select count(*) from graphile_worker._private_jobs")).rows[0].count);

  it("builds CloudEvents envelopes with tenant, trace and actor", async () => {
    const e = await run((tx) => bus.publish(tx, ctx, { type: "test.thing.happened", subject: "s-1", data: { a: 1 } }));
    expect(e).toMatchObject({ specversion: "1.0", source: "/erp/test", type: "test.thing.happened", tenantid: ctx.tenantId, causationdepth: 0, actor: ctx.actor });
    expect(e.traceparent).toMatch(new RegExp(`^00-${ctx.traceId}-[0-9a-f]{16}-01$`));
    await expect(run((tx) => bus.publish(tx, ctx, { type: "NotAType", subject: "x", data: {} }))).rejects.toThrow(EventError);
  });

  it("runs in-transaction subscribers inside the transaction and queues after-commit ones in the outbox", async () => {
    const before = await jobCount();
    await expect(
      run(async (tx) => {
        const grn = await docs.create(tx, ctx, { documentType: "inventory.goods_receipt", companyId: company, date: "2026-10-04" });
        await docs.transition(tx, ctx, grn.id, "post");
        throw new Error("posting failed later in the transaction");
      }),
    ).rejects.toThrow();
    expect(await jobCount()).toBe(before); // rolled back: no jobs, no in-transaction effects
    expect((await run((tx) => tx.selectFrom("kernel.org_unit").select("code").where("code", "like", "IN-TX-%").execute())).length).toBe(0);

    await run(async (tx) => {
      const grn = await docs.create(tx, ctx, { documentType: "inventory.goods_receipt", companyId: company, date: "2026-10-04" });
      await docs.transition(tx, ctx, grn.id, "post");
    });
    expect(await jobCount()).toBe(before + 2); // created + posted → after-commit subscriber
    expect((await run((tx) => tx.selectFrom("kernel.org_unit").select("code").where("code", "like", "IN-TX-%").execute())).length).toBe(1);
  });

  it("delivers after commit through the worker, in order per document", async () => {
    runner = await startWorker({ ownerConnectionString: t.url, ownerDb: t.owner.db, appDb: t.app.db, bus, concurrency: 4, pollInterval: 500 });
    await expect.poll(() => delivered.length, { timeout: 15_000 }).toBe(2);
    expect(delivered.map((e) => e.type)).toEqual(["inventory.goods_receipt.created", "inventory.goods_receipt.posted"]);
    // 10 events for one document keep their order even with 4 parallel workers.
    delivered.length = 0;
    await run(async (tx) => {
      for (let i = 0; i < 10; i++) await bus.publish(tx, ctx, { type: "inventory.goods_receipt.noted", subject: "doc-42", data: { i } });
    });
    await expect.poll(() => delivered.length, { timeout: 15_000 }).toBe(10);
    expect(delivered.map((e) => e.data.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("processes each event once per consumer even if delivered twice (inbox)", async () => {
    const e = await run((tx) => bus.publish(tx, ctx, { type: "test.idem.happened", subject: "x", data: {} }));
    let calls = 0;
    const local = new EventBus();
    local.subscribe({ name: "test.idempotent", pattern: "test.idem.happened", mode: "after-commit", handler: async () => void calls++ });
    expect(await local.deliver(t.app.db, { subscriber: "test.idempotent", event: e, tenant_id: ctx.tenantId })).toBe("processed");
    expect(await local.deliver(t.app.db, { subscriber: "test.idempotent", event: e, tenant_id: ctx.tenantId })).toBe("duplicate");
    expect(calls).toBe(1);
    await expect(local.deliver(t.app.db, { subscriber: "test.idempotent", event: e, tenant_id: newId() })).rejects.toThrow(/does not match/);
  });

  it("moves a failing job to the dead-letter list and replays it after the fix", async () => {
    await run((tx) => bus.publish(tx, ctx, { type: "test.flaky.happened", subject: "tally-1", data: {} }));
    await expect.poll(async () => (await listDeadJobs(t.owner.db)).length, { timeout: 15_000 }).toBe(1);
    const dead = await listDeadJobs(t.owner.db);
    expect(dead[0]?.last_error).toMatch(/Tally connector offline/);
    failNext = false;
    await retryDeadJobs(t.owner.db, dead.map((d) => d.id));
    await expect.poll(async () => (await listDeadJobs(t.owner.db)).length, { timeout: 15_000 }).toBe(0);
  });

  it("stops automation loops (ADR-0043)", async () => {
    await expect(run((tx) => bus.publish(tx, ctx, { type: "test.loop.happened", subject: "loop", data: {} }))).rejects.toThrow(/too deep/);
  });
});

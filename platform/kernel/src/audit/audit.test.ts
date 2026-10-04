import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import { newTraceId, setAuditReason, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { addMember, createOrgUnit, provisionTenant } from "../tenancy/index.ts";
import { auditTrailOf, logSecurityEvent, sealAllAuditChains, verifyAuditChain } from "./index.ts";

describe.skipIf(!hasTestDatabase)("K9 audit trail and security log", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  const owner = newId();

  beforeAll(async () => {
    t = await createTestDatabase();
    const tenantId = await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" });
    ctx = { tenantId, actor: { kind: "user", userId: owner, label: "Owner" }, traceId: newTraceId() };
  });
  afterAll(async () => t?.drop());

  it("records who changed which field from what to what, and why, in the same transaction", async () => {
    const id = await withTenant(t.app.db, ctx, (tx) => createOrgUnit(tx, { kind: "company", code: "AP", name: "Alpha Printers" }));
    await withTenant(t.app.db, ctx, async (tx) => {
      await setAuditReason(tx, "Registered name corrected");
      await tx.updateTable("kernel.org_unit").set({ name: "Alpha Printers Pvt Ltd" }).where("id", "=", id).execute();
    });
    const trail = await withTenant(t.app.db, ctx, (tx) => auditTrailOf(tx, "kernel.org_unit", id), { mode: "read" });
    expect(trail.map((e) => e.action)).toEqual(["insert", "update"]);
    const update = trail[1];
    expect(update?.changes).toEqual({ name: ["Alpha Printers", "Alpha Printers Pvt Ltd"] });
    expect(update?.reason).toBe("Registered name corrected");
    expect(update?.user_id).toBe(owner);
    expect(update?.actor.label).toBe("Owner");
  });

  it("is rolled back together with the change it describes", async () => {
    const before = (await t.owner.pool.query("select count(*)::int as n from kernel.audit_log")).rows[0].n;
    await expect(
      withTenant(t.app.db, ctx, async (tx) => {
        await createOrgUnit(tx, { kind: "company", code: "TMP", name: "temporary" });
        throw new Error("validation failed");
      }),
    ).rejects.toThrow();
    expect((await t.owner.pool.query("select count(*)::int as n from kernel.audit_log")).rows[0].n).toBe(before);
  });

  it("never stores secrets such as PIN hashes", async () => {
    const id = await withTenant(t.app.db, ctx, (tx) => addMember(tx, { userId: newId(), displayName: "Ramesh", employeeCode: "E-1" }));
    await withTenant(t.app.db, ctx, (tx) => tx.updateTable("kernel.tenant_membership").set({ pin_hash: "$argon2id$secret" }).where("id", "=", id).execute());
    const trail = await withTenant(t.app.db, ctx, (tx) => auditTrailOf(tx, "kernel.tenant_membership", id));
    expect(JSON.stringify(trail)).not.toContain("argon2id");
    expect(trail).toHaveLength(1); // the PIN change alone produces no audit diff
  });

  it("cannot be written, changed or deleted by the application", async () => {
    await expect(withTenant(t.app.db, ctx, (tx) => sql`update kernel.audit_log set reason = 'x'`.execute(tx))).rejects.toThrow(/permission denied/);
    await expect(withTenant(t.app.db, ctx, (tx) => sql`delete from kernel.audit_log`.execute(tx))).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(t.app.db, ctx, (tx) => sql`insert into kernel.audit_log (tenant_id, actor, table_name, action, changes) values (${ctx.tenantId}, '{}', 'x', 'insert', '{}')`.execute(tx)),
    ).rejects.toThrow(/permission denied/);
  });

  it("seals entries into a hash chain and detects tampering, even by the database owner", async () => {
    expect(await sealAllAuditChains(t.owner.db)).toBeGreaterThan(0);
    expect(await verifyAuditChain(t.owner.db, ctx.tenantId)).toBeUndefined();
    // Sealed entries cannot be changed, even by the owner, while the guard trigger is in place…
    await expect(t.owner.pool.query("update kernel.audit_log set reason = 'edited' where seq = 1")).rejects.toThrow(/cannot be changed/);
    await expect(t.owner.pool.query("delete from kernel.audit_log where seq = 1")).rejects.toThrow(/cannot be deleted/);
    // …and if someone disables the guard, verification still finds the edit.
    await t.owner.pool.query("alter table kernel.audit_log disable trigger guard");
    await t.owner.pool.query("update kernel.audit_log set reason = 'edited' where seq = 2");
    await t.owner.pool.query("alter table kernel.audit_log enable trigger guard");
    expect(await verifyAuditChain(t.owner.db, ctx.tenantId)).toBe("2");
  });

  it("appends security events that the application cannot read back", async () => {
    await withTenant(t.app.db, ctx, (tx) => logSecurityEvent(tx, { type: "auth.step_up", outcome: "success", details: { action: "approve" }, ip: "203.0.113.7" }));
    await logSecurityEvent(t.app.db, { type: "auth.sign_in", outcome: "failure", details: { email: "unknown@example.com" } });
    const rows = (await t.owner.pool.query("select event_type, outcome, tenant_id, user_id from kernel.security_event order by id")).rows;
    expect(rows).toEqual([
      { event_type: "auth.step_up", outcome: "success", tenant_id: ctx.tenantId, user_id: owner },
      { event_type: "auth.sign_in", outcome: "failure", tenant_id: null, user_id: null },
    ]);
    await expect(withTenant(t.app.db, ctx, (tx) => sql`select * from kernel.security_event`.execute(tx))).rejects.toThrow(/permission denied/);
  });
});

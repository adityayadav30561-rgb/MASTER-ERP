import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import { assertApplicationRole, kernelMigrations, migrate, systemContext, TenantAccessError, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { addMember, companyOf, createOrgUnit, findMembership, orgUnitAncestors, provisionTenant, setTenantStatus, TenancyError } from "./index.ts";

describe.skipIf(!hasTestDatabase)("K1/K3 tenancy and organisation units", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let alpha: ExecutionContext;
  let beta: ExecutionContext;

  beforeAll(async () => {
    t = await createTestDatabase();
    alpha = systemContext(await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" }));
    beta = systemContext(await provisionTenant(t.owner.db, { code: "beta", name: "Beta Cartons", status: "active" }));
  });
  afterAll(async () => t?.drop());

  it("migrations are idempotent and refuse edited files", async () => {
    expect(await migrate(t.url)).toEqual([]);
    await t.owner.pool.query("update kernel.schema_migration set checksum = 'tampered' where version = '0001' and package = $1", [kernelMigrations.package]);
    await expect(migrate(t.url)).rejects.toThrow(/was changed after it was applied/);
    await t.owner.pool.query("update kernel.schema_migration set checksum = $1 where version = '0001'", [
      (await import("node:crypto")).createHash("sha256").update((await import("node:fs")).readFileSync(new URL("0001_core.sql", kernelMigrations.directory))).digest("hex"),
    ]);
  });

  it("accepts only an unprivileged application role (RLS cannot be bypassed)", async () => {
    await expect(assertApplicationRole(t.app.db)).resolves.toBeUndefined();
    await expect(assertApplicationRole(t.owner.db)).rejects.toThrow(TenantAccessError);
  });

  it("generates UUIDv7 in SQL too", async () => {
    const r = await t.owner.pool.query("select kernel.uuid_v7()::text as id");
    expect(r.rows[0].id[14]).toBe("7");
  });

  it("isolates organisation units per tenant and fails closed without context", async () => {
    await withTenant(t.app.db, alpha, (tx) => createOrgUnit(tx, { kind: "company", code: "AP", name: "Alpha Printers Pvt Ltd" }));
    await withTenant(t.app.db, beta, (tx) => createOrgUnit(tx, { kind: "company", code: "BC", name: "Beta Cartons LLP" }));
    const seenByAlpha = await withTenant(t.app.db, alpha, (tx) => tx.selectFrom("kernel.org_unit").select("code").execute());
    expect(seenByAlpha.map((r) => r.code)).toEqual(["AP"]);
    expect(await t.app.db.selectFrom("kernel.org_unit").selectAll().execute()).toEqual([]);
    expect(await t.app.db.selectFrom("kernel.tenant").selectAll().execute()).toEqual([]);
  });

  it("rejects rows written for another tenant", async () => {
    await expect(
      withTenant(t.app.db, alpha, (tx) =>
        tx.insertInto("kernel.org_unit").values({ id: newId(), tenant_id: beta.tenantId, kind: "company", code: "X", name: "forged" }).execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("enforces the organisation tree rules and resolves ancestors and company", async () => {
    await withTenant(t.app.db, alpha, async (tx) => {
      const company = (await tx.selectFrom("kernel.org_unit").select("id").where("code", "=", "AP").executeTakeFirstOrThrow()).id;
      const site = await createOrgUnit(tx, { kind: "site", code: "BHW", name: "Bhiwandi plant", parentId: company });
      const store = await createOrgUnit(tx, { kind: "warehouse", code: "PAPER", name: "Paper store", parentId: site });
      await expect(createOrgUnit(tx, { kind: "warehouse", code: "BAD", name: "No site", parentId: company })).rejects.toThrow(TenancyError);
      expect(new Set(await orgUnitAncestors(tx, store))).toEqual(new Set([store, site, company]));
      expect(await companyOf(tx, store)).toBe(company);
    });
  });

  it("lets one person be a member of two tenants (ADR-0069), once per tenant", async () => {
    const accountant = newId();
    await withTenant(t.app.db, alpha, (tx) => addMember(tx, { userId: accountant, displayName: "CA Mehta" }));
    await withTenant(t.app.db, beta, (tx) => addMember(tx, { userId: accountant, displayName: "CA Mehta" }));
    await expect(withTenant(t.app.db, alpha, (tx) => addMember(tx, { userId: accountant, displayName: "again" }))).rejects.toThrow(/duplicate key/);
    expect((await withTenant(t.app.db, beta, (tx) => findMembership(tx, accountant)))?.display_name).toBe("CA Mehta");
  });

  it("bumps the version on every update (optimistic locking)", async () => {
    const v = await withTenant(t.app.db, alpha, async (tx) => {
      await tx.updateTable("kernel.org_unit").set({ name: "Alpha Printers Private Limited" }).where("code", "=", "AP").execute();
      return tx.selectFrom("kernel.org_unit").select("version").where("code", "=", "AP").executeTakeFirstOrThrow();
    });
    expect(v.version).toBe(2);
  });

  it("makes a suspended tenant read-only and a cancelled tenant inaccessible (ADR-0063)", async () => {
    const gamma = systemContext(await provisionTenant(t.owner.db, { code: "gamma", name: "Gamma Labels", status: "active" }));
    await withTenant(t.app.db, gamma, (tx) => createOrgUnit(tx, { kind: "company", code: "GL", name: "Gamma" }));
    await setTenantStatus(t.owner.db, gamma.tenantId, "suspended");
    expect(await withTenant(t.app.db, gamma, (tx) => tx.selectFrom("kernel.org_unit").select("code").execute(), { mode: "read" })).toHaveLength(1);
    await expect(withTenant(t.app.db, gamma, (tx) => createOrgUnit(tx, { kind: "company", code: "G2", name: "x" }))).rejects.toThrow(TenantAccessError);
    await expect(
      withTenant(t.app.db, gamma, (tx) => sql`insert into kernel.org_unit (id, kind, code, name) values (kernel.uuid_v7(), 'company', 'G3', 'x')`.execute(tx), { mode: "read" }),
    ).rejects.toThrow(/read-only transaction/);
    await setTenantStatus(t.owner.db, gamma.tenantId, "cancelled");
    await expect(withTenant(t.app.db, gamma, async () => 1, { mode: "read" })).rejects.toThrow(TenantAccessError);
  });
});

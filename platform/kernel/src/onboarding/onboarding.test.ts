import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EffectiveConfiguration, loadPackage } from "../config/index.ts";
import { systemContext, withTenant } from "../db/index.ts";
import type { Tx } from "../db/index.ts";
import { createIdentity } from "../identity/index.ts";
import type { Identity } from "../identity/index.ts";
import { ValidationError } from "../metadata/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { inviteMember, kernelChecklistItems, listMembers, listRoles, OnboardingChecklist, provisionFromPackages, ProvisioningError, setMemberRoles } from "./index.ts";
import type { ProvisionResult } from "./index.ts";

const config = new EffectiveConfiguration([loadPackage(fileURLToPath(new URL("./fixtures/basic/", import.meta.url)))]);

describe.skipIf(!hasTestDatabase)("Onboarding: tenant from packages, members, checklist", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let identity: Identity;
  let p: ProvisionResult;
  const seeded: string[] = [];
  const run = <T>(work: (tx: Tx) => Promise<T>) => withTenant(t.app.db, systemContext(p.tenantId, "test"), work);

  beforeAll(async () => {
    t = await createTestDatabase();
    identity = createIdentity({ appConnectionString: t.appUrl, appDb: t.app.db, baseURL: "http://erp.test", secret: "x".repeat(48), rateLimit: false });
    await identity.migrate(t.url);
    const ownerId = await identity.ensureUser("owner@demo.example", "Asha Mehta");
    p = await provisionFromPackages(
      { owner: t.owner.db, app: t.app.db },
      {
        tenant: { code: "demo", name: "Demo Printers", status: "active" },
        company: { code: "DP", name: "Demo Printers Pvt Ltd" },
        sites: [{ code: "BHW", name: "Bhiwandi", warehouses: [{ code: "PAPER", name: "Paper store" }, { code: "FG", name: "FG store" }] }],
        modules: ["foundation", "inventory"],
        config,
        owner: { userId: ownerId, displayName: "Asha Mehta" },
        seeders: [async (_tx, c) => void seeded.push(c.companyId)],
      },
    );
  });
  afterAll(async () => {
    await identity?.close();
    await t?.drop();
  });

  it("creates the tenant, organisation, roles, numbering, pins and runs the seeders", async () => {
    expect(Object.keys(p.orgUnits).sort()).toEqual(["BHW", "DP", "FG", "PAPER"]);
    expect(Object.keys(p.roles).sort()).toEqual(["admin", "owner", "store_keeper"]);
    expect(p.series).toEqual(["sales.tax_invoice"]); // credit note has rules but no pattern yet
    expect(seeded).toEqual([p.companyId]);
    const tenant = await t.owner.db.selectFrom("kernel.tenant").select("status").where("id", "=", p.tenantId).executeTakeFirstOrThrow();
    expect(tenant.status).toBe("active");
    const roles = await run((tx) => listRoles(tx));
    expect(roles.find((r) => r.code === "store_keeper")).toMatchObject({ shopFloor: true, templatePackage: "basic", permissions: ["foundation.item.read", "inventory.goods_receipt.*"] });
    const members = await run((tx) => listMembers(tx));
    expect(members).toHaveLength(1);
    expect(members[0]?.roles.map((r) => r.role)).toEqual(["admin", "owner"]);
    const pinned = await run((tx) => tx.selectFrom("kernel.tenant_package").select(["package_id", "version"]).execute());
    expect(pinned).toEqual([{ package_id: "basic", version: "0.1.0" }]);
  });

  it("refuses packages without an owner role template", async () => {
    await expect(provisionFromPackages({ owner: t.owner.db, app: t.app.db }, {
      tenant: { code: "nope", name: "Nope" }, company: { code: "N", name: "N" }, modules: [], config: new EffectiveConfiguration([]), owner: { userId: "x", displayName: "x" },
    })).rejects.toThrow(ProvisioningError);
  });

  it("invites a store keeper scoped to one store, and changes roles", async () => {
    const { membershipId } = await run((tx) =>
      inviteMember(tx, identity.ensureUser, { email: " Ravi@Demo.example ", name: "Ravi Patil", employeeCode: "E-014", roles: [{ role: "store_keeper", scope: { type: "org_unit", id: p.orgUnits.PAPER as string } }] }),
    );
    let ravi = (await run((tx) => listMembers(tx))).find((m) => m.membershipId === membershipId);
    expect(ravi).toMatchObject({ displayName: "Ravi Patil", employeeCode: "E-014", hasPin: false });
    expect(ravi?.roles).toEqual([expect.objectContaining({ role: "store_keeper", shopFloor: true, scope: { type: "org_unit", id: p.orgUnits.PAPER } })]);

    await run((tx) => setMemberRoles(tx, membershipId, [{ role: "store_keeper", scope: { type: "org_unit", id: p.orgUnits.PAPER as string } }, { role: "store_keeper", scope: { type: "org_unit", id: p.orgUnits.FG as string } }]));
    ravi = (await run((tx) => listMembers(tx))).find((m) => m.membershipId === membershipId);
    expect(ravi?.roles.map((r) => "id" in r.scope && r.scope.id).sort()).toEqual([p.orgUnits.FG, p.orgUnits.PAPER].sort());

    const err = await run((tx) => inviteMember(tx, identity.ensureUser, { email: "ravi@demo.example", name: "Ravi", roles: [{ role: "estimator" }] })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).errors).toEqual([{ field: "roles[0].role", message: 'unknown role "estimator"' }]);
    const dup = await run((tx) => inviteMember(tx, identity.ensureUser, { email: "ravi@demo.example", name: "Ravi", roles: [{ role: "store_keeper" }] })).catch((e: unknown) => e);
    expect((dup as ValidationError).errors).toEqual([{ field: "email", message: "is already a member of this business" }]);
  });

  it("derives the checklist from data and stores confirmed review steps", async () => {
    const checklist = new OnboardingChecklist(kernelChecklistItems({ mfaEnabled: identity.mfaEnabled }));
    const status = async () => Object.fromEntries((await run((tx) => checklist.evaluate(tx))).map((s) => [s.key, s.done]));
    expect(await status()).toEqual({ "organisation.sites": true, "users.invited": true, "users.mfa": false, "configuration.numbering": false, "configuration.settings": false });
    await run((tx) => checklist.confirm(tx, "configuration.numbering"));
    expect((await status())["configuration.numbering"]).toBe(true);
    await run((tx) => checklist.confirm(tx, "configuration.numbering", false));
    expect((await status())["configuration.numbering"]).toBe(false);
    await expect(run((tx) => checklist.confirm(tx, "users.mfa"))).rejects.toThrow(/not a step/);
  });
});

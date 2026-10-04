import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "../ids/index.ts";
import { newTraceId, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { addMember, createOrgUnit, provisionTenant, setMembershipStatus } from "../tenancy/index.ts";
import { addSodRule, assignRole, AuthorizationService, createRole, holdsPrivilegedRole, redactFields, setEntitlement } from "./index.ts";
import type { AuthRecord, Principal } from "./index.ts";

describe.skipIf(!hasTestDatabase)("K4 authorization — the eight checks (matrix)", { timeout: 120_000 }, () => {
  let t: TestDatabase;
  let ctx: ExecutionContext;
  const authz = new AuthorizationService();
  const org = {} as Record<"company" | "bhw" | "vapi" | "paper" | "fg", string>;
  const people = {} as Record<"owner" | "pm" | "sk" | "se" | "ca", Principal>;
  const run = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(t.app.db, ctx, work);

  beforeAll(async () => {
    t = await createTestDatabase();
    const tenantId = await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha Printers", status: "active" });
    ctx = { tenantId, actor: { kind: "system" }, traceId: newTraceId() };
    for (const m of ["purchase", "inventory", "sales"]) await setEntitlement(t.owner.db, tenantId, m, true); // no "accounting"
    await run(async (tx) => {
      org.company = await createOrgUnit(tx, { kind: "company", code: "AP", name: "Alpha Printers" });
      org.bhw = await createOrgUnit(tx, { kind: "site", code: "BHW", name: "Bhiwandi", parentId: org.company });
      org.vapi = await createOrgUnit(tx, { kind: "site", code: "VAPI", name: "Vapi", parentId: org.company });
      org.paper = await createOrgUnit(tx, { kind: "warehouse", code: "PAPER", name: "Paper store", parentId: org.bhw });
      org.fg = await createOrgUnit(tx, { kind: "warehouse", code: "FG", name: "FG store", parentId: org.vapi });

      const owner = await createRole(tx, { code: "owner", name: "Owner", privileged: true, permissions: ["*"],
        fieldGroups: ["cost", "purchase_price", "selling_price", "bank"].map((g) => ({ objectType: "*", group: g, access: "write" as const })) });
      const purchaseManager = await createRole(tx, {
        code: "purchase_manager", name: "Purchase manager", privileged: true,
        permissions: ["purchase.purchase_order.view", "purchase.purchase_order.create", "purchase.purchase_order.submit",
          { permission: "purchase.purchase_order.approve", limit: { amount: "1000000", currency: "INR" } }],
        fieldGroups: [{ objectType: "purchase.purchase_order", group: "purchase_price", access: "write" }],
      });
      const storeKeeper = await createRole(tx, { code: "store_keeper", name: "Store keeper", shopFloor: true,
        permissions: ["inventory.goods_receipt.view", "inventory.goods_receipt.create", "inventory.goods_receipt.post"] });
      const storesOffice = await createRole(tx, { code: "stores_office", name: "Stores office", permissions: ["purchase.purchase_order.view"] });
      const salesExec = await createRole(tx, { code: "sales_exec", name: "Sales executive",
        permissions: ["sales.quotation.view", "sales.quotation.create", { permission: "sales.quotation.edit", condition: "record.state == 'draft'" }] });
      const accountant = await createRole(tx, { code: "accountant", name: "Accountant", privileged: true, permissions: ["accounting.*"] });

      const member = async (name: string, code?: string) => {
        const userId = newId();
        const membershipId = await addMember(tx, { userId, displayName: name, ...(code ? { employeeCode: code } : {}) });
        return { tenantId, userId, membershipId, authMethod: "password" as const };
      };
      people.owner = await member("Mr Sharma (owner)");
      people.pm = await member("Ramesh (purchase)");
      people.sk = await member("Suresh (stores)", "E-0042");
      people.se = await member("Priya (sales)");
      people.ca = await member("CA Mehta");
      await assignRole(tx, people.owner.membershipId, owner, { type: "tenant" });
      await assignRole(tx, people.pm.membershipId, purchaseManager, { type: "org_unit", id: org.bhw });
      await assignRole(tx, people.sk.membershipId, storeKeeper, { type: "org_unit", id: org.paper });
      await assignRole(tx, people.sk.membershipId, storesOffice, { type: "org_unit", id: org.bhw });
      await assignRole(tx, people.se.membershipId, salesExec, { type: "own" });
      await assignRole(tx, people.ca.membershipId, accountant, { type: "tenant" });
      await addSodRule(tx, { objectType: "purchase.purchase_order", firstAction: "submit", secondAction: "approve", mode: "block", description: "The submitter may not approve the same PO" });
      await addSodRule(tx, { objectType: "purchase.purchase_order", firstAction: "create", secondAction: "approve", mode: "warn" });
    });
  });
  afterAll(async () => t?.drop());

  const device = (p: Principal, site: string): Principal => ({ ...p, authMethod: "device-pin", deviceSiteId: site });

  const matrix: [string, () => Principal, string, () => AuthRecord, boolean, number][] = [
    ["owner approves a big PO anywhere", () => people.owner, "purchase.purchase_order.approve", () => ({ orgUnitId: org.paper, amount: "5000000", currency: "INR" }), true, 0],
    ["purchase manager approves ₹6.2 lakh at Bhiwandi", () => people.pm, "purchase.purchase_order.approve", () => ({ orgUnitId: org.bhw, amount: "620000", currency: "INR" }), true, 0],
    ["purchase manager: ₹12 lakh is above authority", () => people.pm, "purchase.purchase_order.approve", () => ({ orgUnitId: org.bhw, amount: "1200000", currency: "INR" }), false, 7],
    ["purchase manager: Vapi is outside scope", () => people.pm, "purchase.purchase_order.approve", () => ({ orgUnitId: org.vapi, amount: "1000", currency: "INR" }), false, 4],
    ["purchase manager cannot see invoices", () => people.pm, "sales.tax_invoice.view", () => ({}), false, 3],
    ["accounting is not subscribed", () => people.ca, "accounting.voucher.post", () => ({}), false, 2],
    ["store keeper posts a GRN on the Bhiwandi tablet", () => device(people.sk, org.bhw), "inventory.goods_receipt.post", () => ({ orgUnitId: org.paper }), true, 0],
    ["store keeper cannot view POs from the tablet (office role)", () => device(people.sk, org.bhw), "purchase.purchase_order.view", () => ({ orgUnitId: org.bhw }), false, 3],
    ["…but can from the office with a password", () => people.sk, "purchase.purchase_order.view", () => ({ orgUnitId: org.bhw }), true, 0],
    ["Vapi tablet cannot post into the Bhiwandi store", () => device(people.sk, org.vapi), "inventory.goods_receipt.post", () => ({ orgUnitId: org.paper }), false, 4],
    ["store keeper cannot post into the FG store", () => people.sk, "inventory.goods_receipt.post", () => ({ orgUnitId: org.fg }), false, 4],
    ["sales executive edits own draft quotation", () => people.se, "sales.quotation.edit", () => ({ createdBy: people.se.userId, facts: { state: "draft" } }), true, 0],
    ["sales executive cannot edit a colleague's quotation", () => people.se, "sales.quotation.edit", () => ({ createdBy: people.owner.userId, facts: { state: "draft" } }), false, 4],
    ["sales executive cannot edit a sent quotation (CEL)", () => people.se, "sales.quotation.edit", () => ({ createdBy: people.se.userId, facts: { state: "sent" } }), false, 5],
    ["submitter may not approve (SoD block)", () => people.pm, "purchase.purchase_order.approve", () => ({ orgUnitId: org.bhw, amount: "1000", currency: "INR", history: { submit: [people.pm.userId] } }), false, 8],
    ["wrong tenant", () => ({ ...people.pm, tenantId: newId() }), "purchase.purchase_order.view", () => ({}), false, 1],
  ];

  it.each(matrix)("%s", async (_name, who, permission, record, allowed, failedCheck) => {
    const d = await run((tx) => authz.authorize(tx, ctx, who(), permission, record()));
    expect({ allowed: d.allowed, failedCheck: d.failedCheck, reason: d.reason }).toMatchObject({ allowed, failedCheck });
  });

  it("allows creator-approval with a warning (SoD warn) and reports the limit used", async () => {
    const d = await run((tx) => authz.authorize(tx, ctx, people.pm, "purchase.purchase_order.approve", { orgUnitId: org.bhw, amount: "1000", currency: "INR", history: { create: [people.pm.userId] } }));
    expect(d.allowed).toBe(true);
    expect(d.warnings).toEqual(["Same person may not create and approve"]);
    expect(d.limit).toEqual({ amount: "1000000.00", currency: "INR" });
  });

  it("hides field groups the role may not read (field security)", async () => {
    const po = { number: "PO/26-27/0001", vendor: "Shree Papers", rate: "92.75", estimated_cost: "51000.00", margin: "12.5" };
    const groups = { rate: "purchase_price", estimated_cost: "cost", margin: "cost" };
    const pm = await run((tx) => authz.authorize(tx, ctx, people.pm, "purchase.purchase_order.view", { orgUnitId: org.bhw }));
    expect(redactFields(po, groups, pm.readableGroups)).toEqual({ number: "PO/26-27/0001", vendor: "Shree Papers", rate: "92.75" });
    const owner = await run((tx) => authz.authorize(tx, ctx, people.owner, "purchase.purchase_order.view", { orgUnitId: org.bhw }));
    expect(redactFields(po, groups, owner.readableGroups)).toEqual(po);
  });

  it("refuses everything once a membership is suspended", async () => {
    await run((tx) => setMembershipStatus(tx, people.se.membershipId, "suspended"));
    const d = await run((tx) => authz.authorize(tx, ctx, people.se, "sales.quotation.view"));
    expect(d.failedCheck).toBe(1);
  });

  it("knows who must use MFA (privileged roles) and logs denials", async () => {
    expect(await run((tx) => holdsPrivilegedRole(tx, people.pm.membershipId))).toBe(true);
    expect(await run((tx) => holdsPrivilegedRole(tx, people.sk.membershipId))).toBe(false);
    const denied = (await t.owner.pool.query("select count(*)::int as n from kernel.security_event where event_type = 'authz.denied'")).rows[0].n;
    expect(denied).toBeGreaterThanOrEqual(10);
  });

  it("rejects invalid record conditions when the role is saved", async () => {
    await expect(run((tx) => createRole(tx, { code: "bad", name: "Bad", permissions: [{ permission: "sales.quotation.edit", condition: "record.state ==" }] }))).rejects.toThrow(/rule/);
  });
});

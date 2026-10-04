/**
 * K1 Tenancy and K3 organisation scopes (ADR-0004, ADR-0035, ADR-0063, ADR-0069).
 */
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import type { AnyDb, Tx } from "../db/database.ts";
import type { TenantStatus } from "../db/context.ts";

export class TenancyError extends Error {
  override name = "TenancyError";
}

/* ---------- tenants (provisioning: owner connection only) ---------- */

export async function provisionTenant(owner: AnyDb, input: { code: string; name: string; status?: TenantStatus }): Promise<string> {
  const id = newId();
  await owner
    .insertInto("kernel.tenant")
    .values({ id, code: input.code, name: input.name, status: input.status ?? "onboarding" })
    .execute();
  return id;
}

export async function setTenantStatus(owner: AnyDb, tenantId: string, status: TenantStatus): Promise<void> {
  const r = await owner.updateTable("kernel.tenant").set({ status }).where("id", "=", tenantId).executeTakeFirst();
  if (r.numUpdatedRows !== 1n) throw new TenancyError("Tenant not found");
}

/** Resolve a sub-domain to a tenant (owner connection: runs before any tenant context exists). */
export async function findTenantByCode(owner: AnyDb, code: string): Promise<{ id: string; status: TenantStatus } | undefined> {
  return owner.selectFrom("kernel.tenant").select(["id", "status"]).where("code", "=", code).executeTakeFirst();
}

/* ---------- memberships ---------- */

export interface Membership {
  id: string;
  user_id: string;
  display_name: string;
  status: "invited" | "active" | "suspended" | "left";
  employee_code: string | null;
}

export async function addMember(tx: Tx, input: { userId: string; displayName: string; employeeCode?: string; status?: Membership["status"] }): Promise<string> {
  const id = newId();
  await tx
    .insertInto("kernel.tenant_membership")
    .values({ id, user_id: input.userId, display_name: input.displayName, employee_code: input.employeeCode ?? null, status: input.status ?? "active" })
    .execute();
  return id;
}

export async function findMembership(tx: Tx, userId: string): Promise<Membership | undefined> {
  return tx
    .selectFrom("kernel.tenant_membership")
    .select(["id", "user_id", "display_name", "status", "employee_code"])
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

export async function setMembershipStatus(tx: Tx, membershipId: string, status: Membership["status"]): Promise<void> {
  await tx.updateTable("kernel.tenant_membership").set({ status }).where("id", "=", membershipId).execute();
}

/* ---------- organisation units ---------- */

export type OrgUnitKind =
  | "grouping" | "company" | "site" | "warehouse" | "location" | "work_center"
  | "department" | "team" | "cost_center" | "profit_center";

/** Which parent kinds each kind may have (ADR-0004 invariants). `null` = may be a root. */
const ALLOWED_PARENTS: Record<OrgUnitKind, readonly (OrgUnitKind | null)[]> = {
  grouping: [null, "grouping"],
  company: [null, "grouping"],
  site: ["company"],
  warehouse: ["site"],
  location: ["warehouse"],
  work_center: ["site"],
  department: ["company"],
  team: ["department", "company"],
  cost_center: ["company"],
  profit_center: ["company"],
};

export interface OrgUnit {
  id: string;
  kind: OrgUnitKind;
  parent_id: string | null;
  code: string;
  name: string;
}

export async function createOrgUnit(tx: Tx, input: { kind: OrgUnitKind; code: string; name: string; parentId?: string }): Promise<string> {
  let parentKind: OrgUnitKind | null = null;
  if (input.parentId) {
    const parent = await tx.selectFrom("kernel.org_unit").select("kind").where("id", "=", input.parentId).executeTakeFirst();
    if (!parent) throw new TenancyError("Parent organisation unit not found");
    parentKind = parent.kind as OrgUnitKind;
  }
  if (!ALLOWED_PARENTS[input.kind].includes(parentKind)) {
    throw new TenancyError(`A ${input.kind} cannot be placed under ${parentKind ?? "the root"}`);
  }
  const id = newId();
  await tx.insertInto("kernel.org_unit").values({ id, kind: input.kind, code: input.code, name: input.name, parent_id: input.parentId ?? null }).execute();
  return id;
}

export async function getOrgUnit(tx: Tx, id: string): Promise<OrgUnit | undefined> {
  return tx.selectFrom("kernel.org_unit").select(["id", "kind", "parent_id", "code", "name"]).where("id", "=", id).executeTakeFirst();
}

export async function listOrgUnits(tx: Tx): Promise<OrgUnit[]> {
  return tx.selectFrom("kernel.org_unit").select(["id", "kind", "parent_id", "code", "name"]).where("archived_at", "is", null).orderBy("kind").orderBy("code").execute();
}

/** The unit and all its ancestors (a scope on any of them covers the unit). */
export async function orgUnitAncestors(tx: Tx, id: string): Promise<string[]> {
  const r = await sql<{ id: string }>`select kernel.org_unit_ancestors(${id}::uuid) as id`.execute(tx);
  return r.rows.map((row) => row.id);
}

/** The company a unit belongs to (every document belongs to one company, ADR-0004). */
export async function companyOf(tx: Tx, id: string): Promise<string | undefined> {
  const r = await sql<{ id: string }>`select o.id from kernel.org_unit o
      where o.id in (select kernel.org_unit_ancestors(${id}::uuid)) and o.kind = 'company'`.execute(tx);
  return r.rows[0]?.id;
}

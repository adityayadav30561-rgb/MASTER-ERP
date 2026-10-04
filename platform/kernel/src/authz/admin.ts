/** Role administration (runtime settings). Every change is audited and written to the security log. */
import { sql } from "kysely";
import { newId } from "../ids/index.ts";
import type { AnyDb, Tx } from "../db/database.ts";
import { Decimal } from "../decimal/index.ts";
import { logSecurityEvent } from "../audit/audit.ts";
import { RuleEngine } from "../rules/engine.ts";

const rules = new RuleEngine();

export interface RoleInput {
  code: string;
  name: string;
  description?: string;
  privileged?: boolean;
  shopFloor?: boolean;
  permissions: readonly (string | { permission: string; condition?: string; limit?: { amount: string; currency: string } })[];
  fieldGroups?: readonly { objectType: string; group: string; access: "read" | "write" }[];
}

export async function createRole(tx: Tx, input: RoleInput): Promise<string> {
  const id = newId();
  await tx
    .insertInto("kernel.role")
    .values({ id, code: input.code, name: input.name, description: input.description ?? null, privileged: input.privileged ?? false, shop_floor: input.shopFloor ?? false })
    .execute();
  for (const p of input.permissions) {
    const def = typeof p === "string" ? { permission: p } : p;
    if (def.condition) rules.validateCondition(def.condition); // rejected at configuration time, not at run time
    await tx
      .insertInto("kernel.role_permission")
      .values({
        id: newId(),
        role_id: id,
        permission: def.permission,
        condition: def.condition ?? null,
        limit_amount: def.limit ? Decimal.from(def.limit.amount).toString() : null,
        limit_currency: def.limit?.currency ?? null,
      })
      .execute();
  }
  for (const f of input.fieldGroups ?? []) {
    await tx.insertInto("kernel.role_field_group").values({ role_id: id, object_type: f.objectType, field_group: f.group, access: f.access }).execute();
  }
  await logSecurityEvent(tx, { type: "authz.role_changed", outcome: "success", details: { role: input.code, change: "created" } });
  return id;
}

export type ScopeInput =
  | { type: "tenant" }
  | { type: "org_unit"; id: string }
  | { type: "own" }
  | { type: "assigned" }
  | { type: "party"; id: string };

export async function assignRole(tx: Tx, membershipId: string, roleId: string, scope: ScopeInput, validTo?: string): Promise<string> {
  const id = newId();
  await tx
    .insertInto("kernel.role_assignment")
    .values({ id, membership_id: membershipId, role_id: roleId, scope_type: scope.type, scope_id: "id" in scope ? scope.id : null, valid_to: validTo ?? null })
    .execute();
  await logSecurityEvent(tx, { type: "authz.role_changed", outcome: "success", details: { membershipId, roleId, scope, change: "assigned" } });
  return id;
}

export async function revokeAssignment(tx: Tx, assignmentId: string): Promise<void> {
  await tx.deleteFrom("kernel.role_assignment").where("id", "=", assignmentId).execute();
  await logSecurityEvent(tx, { type: "authz.role_changed", outcome: "success", details: { assignmentId, change: "revoked" } });
}

export async function addSodRule(tx: Tx, rule: { objectType: string; firstAction: string; secondAction: string; mode: "block" | "warn" | "allow"; description?: string }): Promise<void> {
  await tx
    .insertInto("kernel.sod_rule")
    .values({ id: newId(), object_type: rule.objectType, first_action: rule.firstAction, second_action: rule.secondAction, mode: rule.mode, description: rule.description ?? null })
    .execute();
}

/** Module entitlements come from the subscription (provisioning / billing, owner connection). */
export async function setEntitlement(owner: AnyDb, tenantId: string, module: string, active: boolean): Promise<void> {
  await owner
    .insertInto("kernel.tenant_entitlement")
    .values({ tenant_id: tenantId, module, active })
    .onConflict((oc) => oc.columns(["tenant_id", "module"]).doUpdateSet({ active }))
    .execute();
}

/** Does this membership hold a privileged role (MFA mandatory, ADR-0032)? */
export async function holdsPrivilegedRole(tx: Tx, membershipId: string): Promise<boolean> {
  const r = await tx
    .selectFrom("kernel.role_assignment as a")
    .innerJoin("kernel.role as r", "r.id", "a.role_id")
    .select("r.id")
    .where("a.membership_id", "=", membershipId)
    .where("r.privileged", "=", true)
    .executeTakeFirst();
  return r !== undefined;
}

/**
 * What a member may do, for the user interface (menus, buttons). Not a security decision: every request is
 * still checked by the authorization service. Shop-floor sessions only get shop-floor roles.
 */
export async function permissionsOf(tx: Tx, membershipId: string, options: { shopFloorOnly?: boolean } = {}): Promise<{ roles: string[]; permissions: string[] }> {
  let q = tx
    .selectFrom("kernel.role_assignment as a")
    .innerJoin("kernel.role as r", "r.id", "a.role_id")
    .innerJoin("kernel.role_permission as p", "p.role_id", "r.id")
    .select(["r.code", "p.permission"])
    .where("a.membership_id", "=", membershipId)
    .where(sql<boolean>`a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date)`);
  if (options.shopFloorOnly) q = q.where("r.shop_floor", "=", true);
  const rows = await q.execute();
  return { roles: [...new Set(rows.map((r) => r.code as string))].sort(), permissions: [...new Set(rows.map((r) => r.permission as string))].sort() };
}

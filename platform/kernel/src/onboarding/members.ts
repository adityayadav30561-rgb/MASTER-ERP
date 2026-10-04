/**
 * User administration (Step 6 §5, Slice 0): invite people, give them roles with a scope, list who can do what.
 * Identities are global (ADR-0069); the membership and its role assignments belong to the tenant.
 */
import type { Tx } from "../db/database.ts";
import { assignRole, revokeAssignment } from "../authz/admin.ts";
import type { ScopeInput } from "../authz/admin.ts";
import { NotFoundError, ValidationError } from "../metadata/fields.ts";
import type { FieldError } from "../metadata/fields.ts";
import { addMember, findMembership } from "../tenancy/tenancy.ts";

export interface RoleGrant {
  role: string; // role code
  scope?: ScopeInput; // default: whole tenant
}

export interface MemberInput {
  email: string;
  name: string;
  employeeCode?: string;
  roles: readonly RoleGrant[];
}

export interface MemberSummary {
  membershipId: string;
  userId: string;
  displayName: string;
  status: string;
  employeeCode: string | null;
  hasPin: boolean;
  roles: { assignmentId: string; role: string; roleName: string; privileged: boolean; shopFloor: boolean; scope: ScopeInput }[];
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  privileged: boolean;
  shopFloor: boolean;
  templatePackage: string | null;
  permissions: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveGrants(tx: Tx, grants: readonly RoleGrant[]): Promise<{ roleId: string; scope: ScopeInput }[]> {
  const errors: FieldError[] = [];
  const out: { roleId: string; scope: ScopeInput }[] = [];
  if (grants.length === 0) errors.push({ field: "roles", message: "give at least one role" });
  for (const [i, g] of grants.entries()) {
    const role = await tx.selectFrom("kernel.role").select("id").where("code", "=", g.role).executeTakeFirst();
    if (!role) errors.push({ field: `roles[${i}].role`, message: `unknown role "${g.role}"` });
    const scope = g.scope ?? { type: "tenant" };
    if (scope.type === "org_unit" && !(await tx.selectFrom("kernel.org_unit").select("id").where("id", "=", scope.id).executeTakeFirst())) {
      errors.push({ field: `roles[${i}].scope`, message: "unknown organisation unit" });
    }
    if (role) out.push({ roleId: role.id as string, scope });
  }
  if (errors.length > 0) throw new ValidationError(errors);
  return out;
}

/**
 * Add a person to the tenant. `ensureUser` comes from the identity service (finds or creates the global
 * identity by e-mail). The person signs in with a password set by the admin, a passkey, or Google/Microsoft.
 */
export async function inviteMember(tx: Tx, ensureUser: (email: string, name: string) => Promise<string>, input: MemberInput): Promise<{ userId: string; membershipId: string }> {
  const errors: FieldError[] = [];
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) errors.push({ field: "email", message: "is not a valid e-mail address" });
  if (!input.name.trim()) errors.push({ field: "name", message: "is required" });
  if (errors.length > 0) throw new ValidationError(errors);
  const grants = await resolveGrants(tx, input.roles);
  const userId = await ensureUser(email, input.name.trim());
  if (await findMembership(tx, userId)) throw new ValidationError([{ field: "email", message: "is already a member of this business" }]);
  const membershipId = await addMember(tx, { userId, displayName: input.name.trim(), ...(input.employeeCode ? { employeeCode: input.employeeCode } : {}) });
  for (const g of grants) await assignRole(tx, membershipId, g.roleId, g.scope);
  return { userId, membershipId };
}

/** Replace a member's role assignments (each change goes to the security log). */
export async function setMemberRoles(tx: Tx, membershipId: string, roles: readonly RoleGrant[]): Promise<void> {
  // Visible only within this tenant (RLS); foreign keys alone would not stop another tenant's id.
  if (!(await tx.selectFrom("kernel.tenant_membership").select("id").where("id", "=", membershipId).executeTakeFirst())) throw new NotFoundError("Member not found");
  const grants = await resolveGrants(tx, roles);
  const current = await tx.selectFrom("kernel.role_assignment").select(["id", "role_id", "scope_type", "scope_id"]).where("membership_id", "=", membershipId).execute();
  const key = (roleId: string, scope: ScopeInput) => `${roleId}|${scope.type}|${"id" in scope ? scope.id : ""}`;
  const wanted = new Set(grants.map((g) => key(g.roleId, g.scope)));
  const existing = new Set<string>();
  for (const a of current) {
    const k = `${a.role_id as string}|${a.scope_type as string}|${(a.scope_id as string | null) ?? ""}`;
    existing.add(k);
    if (!wanted.has(k)) await revokeAssignment(tx, a.id as string);
  }
  for (const g of grants) if (!existing.has(key(g.roleId, g.scope))) await assignRole(tx, membershipId, g.roleId, g.scope);
}

export async function listMembers(tx: Tx): Promise<MemberSummary[]> {
  const members = await tx
    .selectFrom("kernel.tenant_membership")
    .select(["id", "user_id", "display_name", "status", "employee_code", "pin_hash"])
    .orderBy("display_name")
    .execute();
  const assignments = await tx
    .selectFrom("kernel.role_assignment as a")
    .innerJoin("kernel.role as r", "r.id", "a.role_id")
    .select(["a.id", "a.membership_id", "a.scope_type", "a.scope_id", "r.code", "r.name", "r.privileged", "r.shop_floor"])
    .orderBy("r.code")
    .execute();
  return members.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    displayName: m.display_name,
    status: m.status,
    employeeCode: m.employee_code,
    hasPin: m.pin_hash !== null,
    roles: assignments
      .filter((a) => a.membership_id === m.id)
      .map((a) => ({
        assignmentId: a.id,
        role: a.code,
        roleName: a.name,
        privileged: a.privileged,
        shopFloor: a.shop_floor,
        scope: (a.scope_id ? { type: a.scope_type, id: a.scope_id } : { type: a.scope_type }) as ScopeInput,
      })),
  }));
}

export async function listRoles(tx: Tx): Promise<RoleSummary[]> {
  const roles = await tx.selectFrom("kernel.role").select(["id", "code", "name", "description", "privileged", "shop_floor", "template_package"]).orderBy("name").execute();
  const perms = await tx.selectFrom("kernel.role_permission").select(["role_id", "permission"]).orderBy("permission").execute();
  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    privileged: r.privileged,
    shopFloor: r.shop_floor,
    templatePackage: r.template_package,
    permissions: perms.filter((p) => p.role_id === r.id).map((p) => p.permission as string),
  }));
}

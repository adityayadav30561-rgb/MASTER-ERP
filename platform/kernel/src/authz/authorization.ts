/**
 * K4 Authorization (ADR-0033, ADR-0034, Step 6 §5–§7): every request passes eight checks in this one service.
 *   1 tenant · 2 module entitlement · 3 role permission · 4 scope · 5 record conditions (CEL)
 *   6 field security · 7 approval authority · 8 segregation of duties
 * Deny by default. Denials are written to the security log.
 */
import { sql } from "kysely";
import { Decimal } from "../decimal/index.ts";
import type { Tx } from "../db/database.ts";
import type { ExecutionContext } from "../db/context.ts";
import { logSecurityEvent } from "../audit/audit.ts";
import { RuleEngine, toFacts } from "../rules/engine.ts";

/** Who is asking: built from the session (ADR-0069) and the device for shop-floor logins. */
export interface Principal {
  tenantId: string;
  userId: string;
  membershipId: string;
  authMethod: "password" | "passkey" | "oidc" | "device-pin" | "api-key";
  /** Site of the registered device (shop-floor sessions only see their own plant, Step 6 §5.4). */
  deviceSiteId?: string;
}

export interface AuthRecord {
  /** Most specific organisation unit of the record (warehouse, site or company). */
  orgUnitId?: string | null;
  createdBy?: string | null;
  assignedTo?: readonly string[];
  partyId?: string | null;
  /** Amount checked against approval authority (company currency). */
  amount?: Decimal | string | null;
  currency?: string | null;
  /** Facts for CEL record conditions, available as `record` (decimal-text fields listed in decimalFields). */
  facts?: Record<string, unknown>;
  decimalFields?: readonly string[];
  /** Who already performed which action on this record (for SoD), e.g. { create: [userId] }. */
  history?: Readonly<Record<string, readonly string[]>>;
}

export interface Decision {
  allowed: boolean;
  /** 0 = allowed; otherwise the check that refused (1–8). */
  failedCheck: number;
  reason: string;
  /** SoD warnings that did not block (recorded for the SoD exceptions report). */
  warnings: string[];
  /** Field groups this principal may read / write on the object type (check 6). */
  readableGroups: ReadonlySet<string>;
  writableGroups: ReadonlySet<string>;
  /** Approval authority used (check 7), when a limit applied. */
  limit?: { amount: string; currency: string };
}

interface Grant {
  role_id: string;
  role_code: string;
  shop_floor: boolean;
  permission: string;
  condition: string | null;
  limit_amount: string | null;
  limit_currency: string | null;
  scope_type: "tenant" | "org_unit" | "own" | "assigned" | "party";
  scope_id: string | null;
}

/** Modules every tenant has (kernel administration and the user's own profile). */
const ALWAYS_ENTITLED = new Set(["kernel", "admin", "profile"]);

export function permissionMatches(pattern: string, permission: string): boolean {
  if (pattern === "*" || pattern === permission) return true;
  if (pattern.endsWith(".*")) return permission.startsWith(pattern.slice(0, -1));
  return false;
}

function deny(failedCheck: number, reason: string, warnings: string[] = []): Decision {
  return { allowed: false, failedCheck, reason, warnings, readableGroups: new Set(), writableGroups: new Set() };
}

export class AuthorizationService {
  readonly #rules: RuleEngine;

  constructor(rules: RuleEngine = new RuleEngine()) {
    this.#rules = rules;
  }

  async authorize(tx: Tx, ctx: ExecutionContext, principal: Principal, permission: string, record: AuthRecord = {}): Promise<Decision> {
    const decision = await this.#decide(tx, ctx, principal, permission, record);
    if (!decision.allowed && decision.failedCheck !== 7) {
      await logSecurityEvent(tx, { type: "authz.denied", outcome: "denied", userId: principal.userId, details: { permission, check: decision.failedCheck, reason: decision.reason } });
    }
    return decision;
  }

  /** Throwing variant for command handlers. */
  async require(tx: Tx, ctx: ExecutionContext, principal: Principal, permission: string, record: AuthRecord = {}): Promise<Decision> {
    const d = await this.authorize(tx, ctx, principal, permission, record);
    if (!d.allowed) throw new AuthorizationError(d);
    return d;
  }

  async #decide(tx: Tx, ctx: ExecutionContext, p: Principal, permission: string, record: AuthRecord): Promise<Decision> {
    // 1 · Tenant: the session's tenant is the request's tenant, and the membership is active.
    if (p.tenantId !== ctx.tenantId) return deny(1, "Wrong tenant");
    const membership = await tx
      .selectFrom("kernel.tenant_membership")
      .select(["status", "user_id"])
      .where("id", "=", p.membershipId)
      .executeTakeFirst();
    if (!membership || membership.status !== "active" || membership.user_id !== p.userId) return deny(1, "No active membership in this tenant");

    // 2 · Module entitlement.
    const module = permission.split(".")[0] ?? "";
    if (!ALWAYS_ENTITLED.has(module)) {
      const ent = await tx.selectFrom("kernel.tenant_entitlement").select("active").where("module", "=", module).executeTakeFirst();
      if (!ent?.active) return deny(2, `Module "${module}" is not part of this subscription`);
    }

    // 3 · Role permission (shop-floor sessions only use shop-floor roles).
    const grants = (await this.#grants(tx, p.membershipId)).filter(
      (g) => permissionMatches(g.permission, permission) && (p.authMethod !== "device-pin" || g.shop_floor),
    );
    if (grants.length === 0) return deny(3, `Missing permission ${permission}`);

    // Shop-floor device: the record must belong to the device's site.
    const ancestors = record.orgUnitId ? await this.#ancestors(tx, record.orgUnitId) : [];
    if (p.deviceSiteId && record.orgUnitId && !ancestors.includes(p.deviceSiteId)) return deny(4, "Outside this device's site");

    // 4 · Scope.
    const scoped = grants.filter((g) => this.#inScope(g, p, record, ancestors));
    if (scoped.length === 0) return deny(4, "Record is outside your scope");

    // 5 · Record conditions (CEL).
    const facts = record.facts ? toFacts(record.facts, new Set(record.decimalFields ?? [])) : {};
    const effective = scoped.filter((g) => !g.condition || this.#rules.compile(g.condition).test({ record: facts, user: { id: p.userId } }));
    if (effective.length === 0) return deny(5, "A record condition does not allow this");

    // 6 · Field security for the object type.
    const objectType = permission.split(".").slice(0, 2).join(".");
    const { read, write } = await this.#fieldGroups(tx, [...new Set(effective.map((g) => g.role_id))], objectType);

    // 7 · Approval authority: the highest limit among the effective grants; no limit means unlimited.
    let limit: Decision["limit"];
    if (record.amount !== undefined && record.amount !== null && effective.every((g) => g.limit_amount !== null)) {
      const amount = Decimal.from(record.amount);
      const usable = effective.filter((g) => !record.currency || g.limit_currency === record.currency);
      if (usable.length === 0) return deny(7, "No approval limit in the document currency");
      const best = usable.reduce((a, b) => (Decimal.from(a.limit_amount ?? "0").compare(b.limit_amount ?? "0") >= 0 ? a : b));
      limit = { amount: best.limit_amount ?? "0", currency: best.limit_currency ?? "" };
      if (amount.greaterThan(limit.amount)) {
        return { ...deny(7, `Above your approval authority of ${limit.currency} ${limit.amount}: route to the next approver`), limit };
      }
    }

    // 8 · Segregation of duties.
    const action = permission.split(".")[2] ?? "";
    const warnings: string[] = [];
    if (record.history) {
      const rules = await tx
        .selectFrom("kernel.sod_rule")
        .select(["first_action", "mode", "description"])
        .where((eb) => eb.or([eb("object_type", "=", objectType), eb("object_type", "=", "*")]))
        .where("second_action", "=", action)
        .execute();
      for (const r of rules) {
        if (r.mode === "allow" || !record.history[r.first_action]?.includes(p.userId)) continue;
        const text = r.description ?? `Same person may not ${r.first_action} and ${action}`;
        if (r.mode === "block") return deny(8, text);
        warnings.push(text);
      }
    }

    return { allowed: true, failedCheck: 0, reason: "allowed", warnings, readableGroups: read, writableGroups: write, ...(limit ? { limit } : {}) };
  }

  #inScope(g: Grant, p: Principal, record: AuthRecord, ancestors: readonly string[]): boolean {
    switch (g.scope_type) {
      case "tenant":
        return true;
      case "org_unit":
        // Without a record (e.g. "may I create purchase orders at all?") an org scope is enough.
        return !record.orgUnitId || (g.scope_id !== null && ancestors.includes(g.scope_id));
      case "own":
        return record.createdBy === undefined || record.createdBy === p.userId;
      case "assigned":
        return record.assignedTo === undefined || record.assignedTo.includes(p.userId);
      case "party":
        return record.partyId !== undefined && record.partyId !== null && record.partyId === g.scope_id;
    }
  }

  async #grants(tx: Tx, membershipId: string): Promise<Grant[]> {
    const r = await sql<Grant>`
      select r.id as role_id, r.code as role_code, r.shop_floor, p.permission, p.condition,
             p.limit_amount::text as limit_amount, p.limit_currency, a.scope_type, a.scope_id
      from kernel.role_assignment a
      join kernel.role r on r.id = a.role_id
      join kernel.role_permission p on p.role_id = r.id
      where a.membership_id = ${membershipId}
        and a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date)`.execute(tx);
    return r.rows;
  }

  async #ancestors(tx: Tx, orgUnitId: string): Promise<string[]> {
    const r = await sql<{ id: string }>`select kernel.org_unit_ancestors(${orgUnitId}::uuid) as id`.execute(tx);
    return r.rows.map((x) => x.id);
  }

  async #fieldGroups(tx: Tx, roleIds: string[], objectType: string): Promise<{ read: Set<string>; write: Set<string> }> {
    const rows = await tx
      .selectFrom("kernel.role_field_group")
      .select(["field_group", "access"])
      .where("role_id", "in", roleIds)
      .where((eb) => eb.or([eb("object_type", "=", objectType), eb("object_type", "=", "*")]))
      .execute();
    const read = new Set(rows.map((r) => r.field_group));
    const write = new Set(rows.filter((r) => r.access === "write").map((r) => r.field_group));
    return { read, write };
  }
}

export class AuthorizationError extends Error {
  override name = "AuthorizationError";
  readonly decision: Decision;
  constructor(decision: Decision) {
    super(decision.reason);
    this.decision = decision;
  }
}

/**
 * Field security (check 6): remove every field whose group the principal may not read. The server never
 * returns hidden fields — screens, API, exports, prints and notifications all go through this.
 * `fieldGroupOf` comes from metadata: field name → group; fields without a group are public.
 */
export function redactFields<T extends Record<string, unknown>>(row: T, fieldGroupOf: Readonly<Record<string, string>>, readable: ReadonlySet<string>): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([field]) => {
    const group = fieldGroupOf[field];
    return group === undefined || readable.has(group);
  })) as Partial<T>;
}

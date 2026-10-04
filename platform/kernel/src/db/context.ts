/**
 * The execution context: who acts, for which tenant, under which trace (ADR-0035, ADR-0036, ADR-0040).
 * Every unit of work runs inside `withTenant`, which sets the context as transaction-local settings
 * that RLS policies, audit triggers and defaults read. They vanish at commit or rollback.
 */
import { sql } from "kysely";
import { isUuid, newId } from "../ids/index.ts";
import type { AnyDb, Tx } from "./database.ts";

export type ActorKind = "user" | "device" | "system" | "automation" | "support";

export interface Actor {
  kind: ActorKind;
  /** Global identity of the person (ADR-0069); absent for system actors. */
  userId?: string | undefined;
  /** Person on whose behalf the action happens (delegation, support access). */
  onBehalfOf?: string | undefined;
  /** Readable label for the audit trail, e.g. "rule: auto-create job" or "device: Press 2 tablet". */
  label?: string | undefined;
}

export interface ExecutionContext {
  tenantId: string;
  actor: Actor;
  /** W3C Trace Context trace id (32 hex), shared by everything one request causes. */
  traceId: string;
  /** Set when the work was caused by an event (automation chains, loop protection — ADR-0043). */
  causation?: { eventId: string; depth: number } | undefined;
}

export type TenantStatus = "demo" | "onboarding" | "active" | "past_due" | "suspended" | "cancelled" | "deleted";

/** ADR-0063: a suspended tenant can read (data is never held hostage) but cannot change anything. */
const WRITABLE: readonly TenantStatus[] = ["demo", "onboarding", "active", "past_due"];
const READABLE: readonly TenantStatus[] = [...WRITABLE, "suspended"];

export class TenantAccessError extends Error {
  override name = "TenantAccessError";
}

export function newTraceId(): string {
  return newId().replace(/-/g, "");
}

export function systemContext(tenantId: string, label = "system"): ExecutionContext {
  return { tenantId, actor: { kind: "system", label }, traceId: newTraceId() };
}

export interface UnitOfWorkOptions {
  /** "read" opens a READ ONLY transaction; allowed for suspended tenants. Default "write". */
  mode?: "read" | "write";
  /** Why the change is made; stored with every audit entry of this transaction (ADR-0036). */
  reason?: string;
}

/**
 * Run `work` in one transaction with the tenant context set. Throws if the tenant cannot be accessed
 * in the requested mode. The application pool is subject to RLS, so rows of other tenants are invisible.
 */
export async function withTenant<T>(db: AnyDb, ctx: ExecutionContext, work: (tx: Tx) => Promise<T>, options: UnitOfWorkOptions = {}): Promise<T> {
  if (!isUuid(ctx.tenantId)) throw new TenantAccessError("Invalid tenant id");
  if (ctx.actor.userId !== undefined && !isUuid(ctx.actor.userId)) throw new TenantAccessError("Invalid actor user id");
  const mode = options.mode ?? "write";
  return db.transaction().execute(async (tx) => {
    if (mode === "read") await sql`set transaction read only`.execute(tx);
    await sql`select
        set_config('app.tenant_id', ${ctx.tenantId}, true),
        set_config('app.user_id', ${ctx.actor.userId ?? ""}, true),
        set_config('app.actor', ${JSON.stringify(ctx.actor)}, true),
        set_config('app.trace_id', ${ctx.traceId}, true),
        set_config('app.audit_reason', ${options.reason ?? ""}, true)`.execute(tx);
    const tenant = await sql<{ status: TenantStatus }>`select status from kernel.tenant where id = ${ctx.tenantId}`.execute(tx);
    const status = tenant.rows[0]?.status;
    if (!status || !READABLE.includes(status)) throw new TenantAccessError("Tenant not found or not accessible");
    if (mode === "write" && !WRITABLE.includes(status)) throw new TenantAccessError(`Tenant is ${status}: read-only`);
    return work(tx);
  });
}

/** Attach a reason to the audit entries written by the rest of this transaction. */
export async function setAuditReason(tx: Tx, reason: string): Promise<void> {
  await sql`select set_config('app.audit_reason', ${reason}, true)`.execute(tx);
}

/**
 * Start-up guard: the application must connect as a role that RLS applies to (ADR-0035).
 * Refuses superusers, BYPASSRLS roles, owners of kernel tables, and roles outside erp_app.
 */
export async function assertApplicationRole(db: AnyDb): Promise<void> {
  const r = await sql<{ rolsuper: boolean; rolbypassrls: boolean; member: boolean; owns: boolean }>`
    select r.rolsuper, r.rolbypassrls,
      pg_has_role(current_user, 'erp_app', 'member') as member,
      exists (select from pg_tables where schemaname = 'kernel' and tableowner = current_user) as owns
    from pg_roles r where r.rolname = current_user`.execute(db);
  const role = r.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.owns || !role.member) {
    throw new TenantAccessError("The application database role must be an unprivileged member of erp_app (ADR-0035)");
  }
}

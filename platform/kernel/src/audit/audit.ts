/**
 * K9 Audit trail and security log (ADR-0036). Writing happens in the database (triggers); this module reads,
 * seals and verifies the chain, and appends security events.
 */
import { sql } from "kysely";
import type { AnyDb, Tx } from "../db/database.ts";
import type { Actor } from "../db/context.ts";

export interface AuditEntry {
  id: string;
  occurred_at: Date;
  user_id: string | null;
  actor: Actor;
  table_name: string;
  object_id: string | null;
  action: "insert" | "update" | "delete";
  /** insert/delete: the row; update: { column: [old, new] } */
  changes: Record<string, unknown>;
  reason: string | null;
  seq: string | null;
}

/** History of one record, oldest first (what the "History" tab of a document shows). */
export async function auditTrailOf(tx: Tx, tableName: string, objectId: string): Promise<AuditEntry[]> {
  return tx
    .selectFrom("kernel.audit_log")
    .select(["id", "occurred_at", "user_id", "actor", "table_name", "object_id", "action", "changes", "reason", "seq"])
    .where("table_name", "=", tableName)
    .where("object_id", "=", objectId)
    .orderBy("id")
    .execute();
}

/** Seal committed entries into the per-tenant hash chain. Owner connection (worker job). */
export async function sealAuditChain(owner: AnyDb, tenantId: string): Promise<number> {
  const r = await sql<{ n: number }>`select kernel.seal_audit(${tenantId}::uuid) as n`.execute(owner);
  return r.rows[0]?.n ?? 0;
}

/** Seal every tenant that has unsealed entries (the periodic job). */
export async function sealAllAuditChains(owner: AnyDb): Promise<number> {
  const tenants = await sql<{ tenant_id: string }>`select distinct tenant_id from kernel.audit_log where seq is null`.execute(owner);
  let total = 0;
  for (const t of tenants.rows) total += await sealAuditChain(owner, t.tenant_id);
  return total;
}

/** Returns the first broken chain position, or undefined if the chain is intact. */
export async function verifyAuditChain(owner: AnyDb, tenantId: string): Promise<string | undefined> {
  const r = await sql<{ broken: string | null }>`select kernel.verify_audit_chain(${tenantId}::uuid) as broken`.execute(owner);
  return r.rows[0]?.broken ?? undefined;
}

export type SecurityEventType =
  | "auth.sign_in" | "auth.sign_out" | "auth.mfa" | "auth.step_up" | "auth.device_pin" | "auth.password_changed"
  | "authz.denied" | "authz.role_changed" | "data.export" | "api_key.used" | "support.access" | "config.changed";

export interface SecurityEvent {
  type: SecurityEventType;
  outcome: "success" | "failure" | "denied";
  details?: Record<string, unknown>;
  userId?: string;
  tenantId?: string;
  ip?: string;
  userAgent?: string;
}

/** Append to the security log (works inside or outside a tenant transaction). */
export async function logSecurityEvent(dbOrTx: AnyDb | Tx, e: SecurityEvent): Promise<void> {
  await sql`select kernel.log_security_event(${e.type}, ${e.outcome}, ${JSON.stringify(e.details ?? {})}::jsonb,
      ${e.userId ?? null}::uuid, ${e.tenantId ?? null}::uuid, ${e.ip ?? null}::inet, ${e.userAgent ?? null})`.execute(dbOrTx);
}

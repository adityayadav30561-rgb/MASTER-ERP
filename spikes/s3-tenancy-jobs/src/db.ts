/**
 * Database access with a tenant context per transaction (ADR-0035, ADR-0055).
 * Every unit of work runs in a transaction that first sets `app.tenant_id` with is_local = true,
 * so the setting disappears at commit/rollback and can never leak to the next user of the connection.
 */
import { Kysely, PostgresDialect, sql } from "kysely";
import type { ColumnType, Generated, Transaction } from "kysely";
import pg from "pg";

/** Decimal columns: NUMERIC is read as a string and written as a string (ADR-0053). */
type DecimalColumn = string;

export interface StockLedgerRow {
  id: Generated<string>; // bigint arrives as a string too
  tenant_id: Generated<string>; // defaults to the tenant context
  item_code: string;
  warehouse_code: string;
  quantity: DecimalColumn;
  value: DecimalColumn;
  document_ref: string;
  posted_at: Generated<Date>;
}

export interface StockBalanceRow {
  tenant_id: Generated<string>;
  item_code: string;
  warehouse_code: string;
  quantity: ColumnType<DecimalColumn, DecimalColumn | undefined, DecimalColumn>;
  value: ColumnType<DecimalColumn, DecimalColumn | undefined, DecimalColumn>;
  version: Generated<number>;
}

export interface Database {
  "s3_inventory.stock_ledger": StockLedgerRow;
  "s3_inventory.stock_balance": StockBalanceRow;
}

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export function createDb(connectionString: string, max = 10): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString, max });
  return { db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }), pool };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function withTenant<T>(db: Db, tenantId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error("withTenant: invalid tenant id");
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(tx);
    return work(tx);
  });
}

export async function enqueueJob(tx: Tx, task: string, payload: Record<string, unknown>, jobKey?: string): Promise<string> {
  const result = await sql<{ id: string }>`select s3_kernel.enqueue_job(${task}, ${JSON.stringify(payload)}::jsonb, ${jobKey ?? null}) as id`.execute(tx);
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("enqueue_job returned nothing");
  return id;
}

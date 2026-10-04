/**
 * Database access (ADR-0047, ADR-0055): PostgreSQL through Kysely.
 * Two pools exist in a running system:
 * - the **application pool** connects as a member of `erp_app` and is always subject to RLS;
 * - the **owner pool** runs migrations and tenant provisioning only.
 */
import { Kysely, PostgresDialect } from "kysely";
import type { Transaction } from "kysely";
import pg from "pg";

/** Kernel and module tables are typed per package; shared code works on this open type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = Transaction<any>;

const DATE_OID = 1082;

export interface Database {
  db: AnyDb;
  pool: pg.Pool;
  destroy(): Promise<void>;
}

export function createDatabase(connectionString: string, options: { max?: number; applicationName?: string } = {}): Database {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? "master-erp",
    // NUMERIC and BIGINT already arrive as strings (ADR-0053). DATE stays a plain "YYYY-MM-DD" string,
    // never a JavaScript Date in local time.
    types: {
      getTypeParser: ((oid: number, format?: string) =>
        oid === DATE_OID ? (value: string) => value : pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });
  return {
    db,
    pool,
    destroy: () => db.destroy(),
  };
}

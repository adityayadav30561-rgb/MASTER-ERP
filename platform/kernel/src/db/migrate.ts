/**
 * Forward-only SQL migrations (ADR-0052: expand → migrate → contract).
 * Each package keeps `migrations/NNNN_description.sql`. Files run in order inside their own transaction,
 * once, and are recorded with a checksum: changing an applied file is an error, never a silent re-run.
 * Runs with the owner role, never the application role.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Logger, runMigrations as runWorkerMigrations } from "graphile-worker";

export interface MigrationSource {
  /** Package name, e.g. "@master-erp/kernel". Sources run in the order given (kernel first, ADR-0002). */
  package: string;
  directory: URL;
}

export interface AppliedMigration {
  package: string;
  version: string;
  name: string;
}

export const kernelMigrations: MigrationSource = {
  package: "@master-erp/kernel",
  directory: new URL("../../migrations/", import.meta.url),
};

const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const LOCK_KEY = 4_826_101; // advisory lock: one migration runner at a time

export async function migrate(connectionString: string, sources: readonly MigrationSource[] = [kernelMigrations]): Promise<AppliedMigration[]> {
  // The job queue's own schema comes first: kernel functions enqueue jobs into it (ADR-0055).
  await runWorkerMigrations({ connectionString, logger: new Logger(() => () => undefined) });
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: AppliedMigration[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`create schema if not exists kernel;
      create table if not exists kernel.schema_migration (
        package text not null,
        version text not null,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default now(),
        primary key (package, version))`);
    for (const source of sources) {
      const done = new Map(
        (await client.query<{ version: string; checksum: string }>("select version, checksum from kernel.schema_migration where package = $1", [source.package])).rows.map(
          (r) => [r.version, r.checksum],
        ),
      );
      const files = readdirSync(fileURLToPath(source.directory)).filter((f) => FILE.test(f)).sort();
      for (const file of files) {
        const [, version = "", name = ""] = FILE.exec(file) ?? [];
        const text = readFileSync(new URL(file, source.directory), "utf8");
        const checksum = createHash("sha256").update(text).digest("hex");
        const previous = done.get(version);
        if (previous !== undefined) {
          if (previous !== checksum) throw new Error(`${source.package} migration ${file} was changed after it was applied`);
          continue;
        }
        await client.query("begin");
        try {
          await client.query(text);
          await client.query("insert into kernel.schema_migration (package, version, name, checksum) values ($1, $2, $3, $4)", [source.package, version, name, checksum]);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw new Error(`${source.package} migration ${file} failed: ${(error as Error).message}`, { cause: error });
        }
        applied.push({ package: source.package, version, name });
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
  return applied;
}


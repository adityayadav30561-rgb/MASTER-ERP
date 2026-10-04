/**
 * Test harness: a fresh, fully migrated PostgreSQL database per test file.
 * Needs DATABASE_URL pointing at a role that may CREATE DATABASE and CREATE ROLE (CI and docker-compose provide this).
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDatabase } from "../db/database.ts";
import type { Database } from "../db/database.ts";
import { kernelMigrations, migrate } from "../db/migrate.ts";
import type { MigrationSource } from "../db/migrate.ts";

export const TEST_DATABASE_URL = process.env.DATABASE_URL ?? "";
export const hasTestDatabase = TEST_DATABASE_URL !== "";

const APP_ROLE = "erp_app_test";
const APP_PASSWORD = "erp_app_test";

export interface TestDatabase {
  /** Owner connection (migrations, provisioning). Bypasses RLS: never use it for business logic. */
  owner: Database;
  /** Application connection: member of erp_app, subject to RLS. */
  app: Database;
  url: string;
  appUrl: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(sources: readonly MigrationSource[] = [kernelMigrations]): Promise<TestDatabase> {
  if (!hasTestDatabase) throw new Error("DATABASE_URL is not set");
  const name = `erp_t_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  await migrate(url.toString(), sources);

  const owner = createDatabase(url.toString(), { max: 4, applicationName: "erp-test-owner" });
  // The login role is shared by all test databases on the server; parallel test files may race to create it.
  for (let attempt = 1; ; attempt++) {
    try {
      await owner.pool.query(`do $$ begin
          create role ${APP_ROLE} login password '${APP_PASSWORD}' nosuperuser nobypassrls;
        exception when duplicate_object or unique_violation then null;
        end $$;
        grant erp_app to ${APP_ROLE};`);
      break;
    } catch (error) {
      if (attempt >= 5) throw error; // e.g. "tuple concurrently updated" while another file grants the same role
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  const appUrl = new URL(url.toString());
  appUrl.username = APP_ROLE;
  appUrl.password = APP_PASSWORD;
  const app = createDatabase(appUrl.toString(), { max: 10, applicationName: "erp-test-app" });

  return {
    owner,
    app,
    url: url.toString(),
    appUrl: appUrl.toString(),
    async drop() {
      await app.destroy();
      await owner.destroy();
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      // Wait for other libraries' pools (auth, job queue) to close their connections rather than killing them:
      // a killed idle connection surfaces as an unhandled error in whichever test file owns that pool.
      try {
        for (let i = 0; ; i++) {
          try {
            await c.query(`drop database if exists ${name}`);
            break;
          } catch (error) {
            if ((error as { code?: string }).code !== "55006" || i >= 75) {
              await c.query(`drop database if exists ${name} with (force)`);
              break;
            }
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      } finally {
        await c.end();
      }
    },
  };
}

/** A fresh database for every run: create it, an application role, run migrations, create the demo tenant. */
import { execFileSync, spawn } from "node:child_process";
import pg from "pg";
import { E2E } from "./env.ts";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const admin = new pg.Client({ connectionString: E2E.adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${E2E.database} with (force)`);
  await admin.query(`create database ${E2E.database}`);
  await admin.end();

  const server = new URL("../server/dist/main.js", import.meta.url).pathname;
  const env = { ...process.env, ...E2E.serverEnv };
  execFileSync("node", [server, "migrate"], { env, stdio: "inherit" });

  const owner = new pg.Client({ connectionString: E2E.ownerUrl });
  await owner.connect();
  await owner.query(`do $$ begin create role ${E2E.appUser} login password '${E2E.appPassword}' nosuperuser nobypassrls;
    exception when duplicate_object then null; end $$`);
  await owner.query(`grant erp_app to ${E2E.appUser}`);
  await owner.end();

  execFileSync("node", [server, "demo"], { env, stdio: "inherit" });

  const web = spawn("node", [server, "web"], { env, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://localhost:${E2E.port}/health/ready`)).ok) break;
    } catch {
      /* not listening yet */
    }
    if (i > 100 || web.exitCode !== null) throw new Error("The server did not start");
    await new Promise((r) => setTimeout(r, 300));
  }
  return async () => {
    web.kill("SIGTERM");
  };
}

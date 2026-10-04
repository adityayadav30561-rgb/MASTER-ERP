/**
 * One image, three commands (ADR-0059):
 *   web     — HTTP API (Fastify via NestJS)
 *   worker  — background jobs, outbox delivery, audit sealing
 *   migrate — database migrations (owner role)
 *   demo    — create the demo tenant and its owner (development, sales demos)
 */
import "reflect-metadata";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { assertApplicationRole, createDatabase, kernelMigrations, migrate } from "@master-erp/kernel/db";
import { foundationMigrations } from "@master-erp/foundation";
import { findTenantByCode } from "@master-erp/kernel/tenancy";
import { provisionDemoPrinters } from "@master-erp/tenant-demo-printers";
import { startWorker } from "@master-erp/kernel/events";
import { loadConfig } from "./config.ts";
import { AppModule, createKernel } from "./app.module.ts";
import { XLSX } from "./import.controller.ts";

export async function createApp(kernel = createKernel(loadConfig())): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forKernel(kernel), new FastifyAdapter({ logger: { level: "info", redact: ["req.headers.cookie", "req.headers.authorization"] }, trustProxy: true }), { logger: ["error", "warn"] });
  app.enableShutdownHooks();
  if (kernel.config.WEB_DIR) {
    // The web app on the same origin as the API (one image, ADR-0059); hashed assets are cached for a year.
    await app.register(fastifyStatic as never, {
      root: resolve(kernel.config.WEB_DIR),
      wildcard: false,
      index: false,
      cacheControl: false,
      setHeaders: (reply: { header(k: string, v: string): void }, path: string) =>
        reply.header("cache-control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"),
    });
  }
  // Excel uploads arrive as the raw file (no multipart), up to the importer's 2 MB limit.
  app.getHttpAdapter().getInstance().addContentTypeParser(XLSX, { parseAs: "buffer", bodyLimit: 2 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  return app;
}

async function main(command: string): Promise<void> {
  const config = loadConfig();
  if (command === "migrate") {
    const owner = config.DATABASE_OWNER_URL;
    if (!owner) throw new Error("DATABASE_OWNER_URL is required for migrations");
    const applied = await migrate(owner, [kernelMigrations, foundationMigrations]);
    const kernel = createKernel(config);
    await kernel.identity.migrate(owner);
    await kernel.identity.close();
    await kernel.database.destroy();
    console.log(`Applied ${applied.length} migration(s)`);
    return;
  }
  if (command === "demo") {
    // Demo tenant "demo" (Step 5A §10) with its owner; safe to run again (does nothing if it exists).
    const owner = config.DATABASE_OWNER_URL;
    const email = process.env.DEMO_OWNER_EMAIL;
    const password = process.env.DEMO_OWNER_PASSWORD;
    if (!owner || !email || !password) throw new Error("DATABASE_OWNER_URL, DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD are required");
    const kernel = createKernel(config);
    const ownerDb = createDatabase(owner, { max: 2, applicationName: "erp-demo" });
    try {
      if (await findTenantByCode(ownerDb.db, "demo")) {
        console.log("Demo tenant already exists");
        return;
      }
      const userId = await kernel.identity.ensureUser(email, "Demo Owner");
      await kernel.identity.setPassword(userId, password);
      const result = await provisionDemoPrinters({ owner: ownerDb.db, app: kernel.database.db }, { userId, displayName: "Demo Owner" });
      console.log(`Demo tenant created (${result.tenantId}); sign in at the "demo" sub-domain as ${email}`);
    } finally {
      await kernel.identity.close();
      await kernel.database.destroy();
      await ownerDb.destroy();
    }
    return;
  }
  if (command === "worker") {
    const owner = config.DATABASE_OWNER_URL;
    if (!owner) throw new Error("DATABASE_OWNER_URL is required for the worker");
    const kernel = createKernel(config);
    const ownerDb = createDatabase(owner, { max: 4, applicationName: "erp-worker" });
    await assertApplicationRole(kernel.database.db);
    const runner = await startWorker({ ownerConnectionString: owner, ownerDb: ownerDb.db, appDb: kernel.database.db, bus: kernel.events });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void runner.stop());
    await runner.promise;
    return;
  }
  const kernel = createKernel(config);
  await assertApplicationRole(kernel.database.db); // refuse to start as owner/superuser (ADR-0035)
  const app = await createApp(kernel);
  await app.listen({ port: Number(config.PORT), host: "0.0.0.0" });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv[2] ?? "web").catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

/**
 * One image, three commands (ADR-0059):
 *   web     — HTTP API (Fastify via NestJS)
 *   worker  — background jobs, outbox delivery, audit sealing
 *   migrate — database migrations (owner role)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { assertApplicationRole, createDatabase, migrate } from "@master-erp/kernel/db";
import { startWorker } from "@master-erp/kernel/events";
import { loadConfig } from "./config.ts";
import { AppModule, createKernel } from "./app.module.ts";

export async function createApp(kernel = createKernel(loadConfig())): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forKernel(kernel), new FastifyAdapter({ logger: { level: "info", redact: ["req.headers.cookie", "req.headers.authorization"] }, trustProxy: true }), { logger: ["error", "warn"] });
  app.enableShutdownHooks();
  return app;
}

async function main(command: string): Promise<void> {
  const config = loadConfig();
  if (command === "migrate") {
    const owner = config.DATABASE_OWNER_URL;
    if (!owner) throw new Error("DATABASE_OWNER_URL is required for migrations");
    const applied = await migrate(owner);
    const kernel = createKernel(config);
    await kernel.identity.migrate(owner);
    await kernel.identity.close();
    await kernel.database.destroy();
    console.log(`Applied ${applied.length} migration(s)`);
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

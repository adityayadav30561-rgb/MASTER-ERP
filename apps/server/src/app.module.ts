/** Wiring: kernel services are created once per process and injected by token (ADR-0054). */
import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { createDatabase } from "@master-erp/kernel/db";
import { createIdentity } from "@master-erp/kernel/identity";
import { AuthorizationService } from "@master-erp/kernel/authz";
import { EventBus } from "@master-erp/kernel/events";
import { DocumentService, DocumentTypeRegistry } from "@master-erp/kernel/documents";
import { FileService, LocalFileStorage } from "@master-erp/kernel/files";
import type { Config } from "./config.ts";
import { AuthController } from "./auth.controller.ts";
import { HealthController } from "./health.controller.ts";
import { MeController } from "./me.controller.ts";
import { ProblemFilter } from "./problem.filter.ts";
import { SessionGuard } from "./session.guard.ts";
import { APP_DB, AUTHZ, CONFIG, DOCUMENTS, EVENTS, FILES, IDENTITY } from "./tokens.ts";

export interface Kernel {
  config: Config;
  database: ReturnType<typeof createDatabase>;
  identity: ReturnType<typeof createIdentity>;
  events: EventBus;
  registry: DocumentTypeRegistry;
}

export function createKernel(config: Config): Kernel {
  const database = createDatabase(config.DATABASE_URL, { max: 20, applicationName: "erp-web" });
  return {
    config,
    database,
    identity: createIdentity({ appConnectionString: config.DATABASE_URL, appDb: database.db, baseURL: config.BASE_URL, secret: config.AUTH_SECRET }),
    events: new EventBus(),
    registry: new DocumentTypeRegistry(), // modules register their document types here (Slice 0 onwards)
  };
}

@Module({})
export class AppModule {
  static forKernel(kernel: Kernel): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AuthController, MeController],
      providers: [
        { provide: CONFIG, useValue: kernel.config },
        { provide: APP_DB, useValue: kernel.database.db },
        { provide: IDENTITY, useValue: kernel.identity },
        { provide: AUTHZ, useValue: new AuthorizationService() },
        { provide: EVENTS, useValue: kernel.events },
        { provide: DOCUMENTS, useValue: new DocumentService(kernel.registry, { events: kernel.events.documentSink() }) },
        { provide: FILES, useValue: new FileService(new LocalFileStorage(kernel.config.FILES_DIR, kernel.config.FILES_SECRET)) },
        { provide: APP_FILTER, useClass: ProblemFilter },
        SessionGuard,
      ],
    };
  }
}

/** Liveness (process up) and readiness (database reachable, correct role) for the load balancer. */
import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "kysely";
import { assertApplicationRole } from "@master-erp/kernel/db";
import type { AnyDb } from "@master-erp/kernel/db";
import { APP_DB } from "./tokens.ts";

@Controller("health")
export class HealthController {
  constructor(@Inject(APP_DB) private readonly db: AnyDb) {}

  @Get("live")
  live(): { status: string } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(): Promise<{ status: string }> {
    try {
      await sql`select 1`.execute(this.db);
      await assertApplicationRole(this.db);
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("Database not ready");
    }
  }
}

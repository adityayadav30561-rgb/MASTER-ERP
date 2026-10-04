/** Who am I, in this tenant? The first endpoint every screen calls after sign-in. */
import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { withTenant, newTraceId } from "@master-erp/kernel/db";
import type { AnyDb } from "@master-erp/kernel/db";
import { SessionGuard } from "./session.guard.ts";
import type { AuthenticatedRequest } from "./session.guard.ts";
import { APP_DB } from "./tokens.ts";

@Controller("api/v1/me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(@Inject(APP_DB) private readonly db: AnyDb) {}

  @Get()
  async me(@Req() request: AuthenticatedRequest) {
    const s = request.session;
    if (!s) throw new Error("guard did not run");
    const p = s.principal;
    const ctx = { tenantId: p.tenantId, actor: { kind: "user" as const, userId: p.userId }, traceId: newTraceId() };
    const membership = await withTenant(this.db, ctx, (tx) =>
      tx.selectFrom("kernel.tenant_membership as m")
        .innerJoin("kernel.tenant as t", "t.id", "m.tenant_id")
        .select(["m.display_name", "t.name as tenant_name", "t.status as tenant_status"])
        .where("m.id", "=", p.membershipId)
        .executeTakeFirstOrThrow(), { mode: "read" });
    return {
      userId: p.userId,
      tenantId: p.tenantId,
      tenantName: membership.tenant_name,
      tenantStatus: membership.tenant_status,
      displayName: membership.display_name,
      authMethod: p.authMethod,
      mfaEnrolmentRequired: s.mfaEnrolmentRequired,
    };
  }
}

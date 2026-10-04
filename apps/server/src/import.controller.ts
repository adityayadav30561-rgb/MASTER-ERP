/** Excel import of masters (Slice 0): download the template, upload for a dry run, then commit. */
import { Controller, Get, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { Type } from "@sinclair/typebox";
import { buildTemplate, runImport } from "@master-erp/kernel/importer";
import type { ImportTarget } from "@master-erp/kernel/importer";
import { ItemImportTarget, PartyImportTarget } from "@master-erp/foundation";
import { Api, TenantApi } from "./api.ts";
import type { ApiRequest, Scope } from "./api.ts";
import { SessionGuard } from "./session.guard.ts";

export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TargetParams = Type.Object({ target: Type.Union([Type.Literal("parties"), Type.Literal("items")]) }, { additionalProperties: false });
type TargetName = "parties" | "items";
const PERMISSION: Record<TargetName, string> = { parties: "foundation.party.import", items: "foundation.item.import" };

function targetFor(name: TargetName, s: Scope): ImportTarget {
  return (name === "parties" ? new PartyImportTarget({ rules: s.rules, config: s.config }) : new ItemImportTarget({ rules: s.rules, config: s.config, prepare: s.prepareItem })) as ImportTarget;
}

@Controller("api/v1/imports")
@UseGuards(SessionGuard)
export class ImportController {
  constructor(@Inject(TenantApi) private readonly api: TenantApi) {}

  @Get(":target/template")
  @Api({ summary: "Excel template with the tenant's columns, drop-downs and instructions", tags: ["Import"], params: TargetParams, responseMedia: XLSX })
  async template(@Req() req: ApiRequest, @Param("target") name: TargetName, @Res() reply: FastifyReply) {
    const file = await this.api.run(req, (s) => buildTemplate([targetFor(name, s)]), { permission: PERMISSION[name] });
    void reply.header("content-type", XLSX).header("content-disposition", `attachment; filename="${name}-template.xlsx"`).send(Buffer.from(file));
  }

  @Post(":target")
  @Api({
    summary: "Upload a filled template: dry-run reports every problem; commit saves all rows or none",
    tags: ["Import"],
    params: TargetParams,
    query: Type.Object({ mode: Type.Union([Type.Literal("dry-run"), Type.Literal("commit")]), existing: Type.Optional(Type.Union([Type.Literal("skip"), Type.Literal("error")])) }, { additionalProperties: false }),
    requestMedia: XLSX,
    status: 200,
  })
  async upload(@Req() req: ApiRequest & { body: unknown }, @Param("target") name: TargetName, @Query("mode") mode: "dry-run" | "commit", @Query("existing") existing: "skip" | "error" | undefined, @Res({ passthrough: true }) reply: FastifyReply) {
    const file = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
    void reply.status(200);
    return this.api.run(req, (s) => runImport(s.tx, targetFor(name, s), file, { mode, existing: existing ?? "skip" }), { permission: PERMISSION[name], mode: "write" });
  }
}

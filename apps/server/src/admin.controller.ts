/**
 * Administration over REST (Slice 0): people and roles, organisation, shop-floor devices, settings, numbering
 * and the onboarding checklist. Permissions admin.* belong to the Admin role (Step 6 §9); the Owner can read.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Type } from "@sinclair/typebox";
import { listMembers, listRoles, inviteMember, kernelChecklistItems, OnboardingChecklist, setMemberRoles } from "@master-erp/kernel/onboarding";
import type { RoleGrant } from "@master-erp/kernel/onboarding";
import type { Identity, ResolvedSession } from "@master-erp/kernel/identity";
import { createOrgUnit, listOrgUnits, setMembershipStatus } from "@master-erp/kernel/tenancy";
import type { OrgUnitKind } from "@master-erp/kernel/tenancy";
import { SettingsService } from "@master-erp/kernel/config";
import { listSeries, updateSeriesPattern } from "@master-erp/kernel/documents";
import { NotFoundError } from "@master-erp/kernel/metadata";
import { FOUNDATION_CHECKLIST } from "@master-erp/foundation";
import { Api, Id, IdParams, StepUpRequiredError, TenantApi } from "./api.ts";
import type { ApiRequest } from "./api.ts";
import { SessionGuard } from "./session.guard.ts";
import { SETTING_DEFINITIONS } from "./settings.ts";
import { IDENTITY } from "./tokens.ts";

const Scope = Type.Union([
  Type.Object({ type: Type.Literal("tenant") }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("org_unit"), id: Id }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("own") }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("assigned") }, { additionalProperties: false }),
]);
const Grants = Type.Array(Type.Object({ role: Type.String(), scope: Type.Optional(Scope) }, { additionalProperties: false }), { maxItems: 30 });
const InviteBody = Type.Object(
  {
    email: Type.String({ maxLength: 200 }),
    name: Type.String({ minLength: 1, maxLength: 100 }),
    employeeCode: Type.Optional(Type.String({ maxLength: 20 })),
    roles: Grants,
    initialPassword: Type.Optional(Type.String({ minLength: 8, maxLength: 128, description: "Until invitation e-mails exist (Slice 1), the admin may set a first password" })),
  },
  { additionalProperties: false },
);
const today = () => new Date().toISOString().slice(0, 10);

@Controller("api/v1/admin")
@UseGuards(SessionGuard)
export class AdminController {
  constructor(
    @Inject(TenantApi) private readonly api: TenantApi,
    @Inject(IDENTITY) private readonly identity: Identity,
  ) {}

  #stepUp(req: ApiRequest): void {
    if (!this.identity.hasRecentStepUp(req.session as ResolvedSession)) throw new StepUpRequiredError("Re-enter your password to change people or roles");
  }

  /* ---- people and roles ---- */

  @Get("members")
  @Api({ summary: "Members with their roles", tags: ["Admin"], permission: "admin.users.read" })
  members(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => listMembers(s.tx));
  }

  @Post("members")
  @Api({ summary: "Add a person with roles (step-up)", tags: ["Admin"], permission: "admin.users.manage", body: InviteBody })
  async invite(@Req() req: ApiRequest, @Body() body: { email: string; name: string; employeeCode?: string; roles: RoleGrant[]; initialPassword?: string }) {
    this.#stepUp(req);
    const { initialPassword, ...member } = body;
    const created = await this.api.run(req, (s) => inviteMember(s.tx, this.identity.ensureUser, member));
    if (initialPassword) await this.identity.setPassword(created.userId, initialPassword);
    return created;
  }

  @Put("members/:id/roles")
  @Api({ summary: "Replace a member's roles (step-up)", tags: ["Admin"], permission: "admin.users.manage", params: IdParams, body: Type.Object({ roles: Grants }, { additionalProperties: false }) })
  async roles(@Req() req: ApiRequest, @Param("id") id: string, @Body() body: { roles: RoleGrant[] }) {
    this.#stepUp(req);
    return this.api.run(req, async (s) => {
      await setMemberRoles(s.tx, id, body.roles);
      return (await listMembers(s.tx)).find((m) => m.membershipId === id);
    });
  }

  @Post("members/:id/status")
  @HttpCode(200)
  @Api({ summary: "Suspend or re-activate a member", tags: ["Admin"], permission: "admin.users.manage", params: IdParams, body: Type.Object({ status: Type.Union([Type.Literal("active"), Type.Literal("suspended")]) }, { additionalProperties: false }) })
  async status(@Req() req: ApiRequest, @Param("id") id: string, @Body() body: { status: "active" | "suspended" }) {
    this.#stepUp(req);
    return this.api.run(req, async (s) => {
      if (id === s.principal.membershipId) throw new StepUpRequiredError("You cannot suspend yourself");
      await setMembershipStatus(s.tx, id, body.status);
      return { membershipId: id, status: body.status };
    });
  }

  @Post("members/:id/pin")
  @HttpCode(204)
  @Api({ summary: "Set a member's shop-floor PIN", tags: ["Admin"], permission: "admin.users.manage", params: IdParams, body: Type.Object({ pin: Type.String({ pattern: "^[0-9]{4,8}$" }) }, { additionalProperties: false }) })
  async pin(@Req() req: ApiRequest, @Param("id") id: string, @Body() body: { pin: string }) {
    await this.api.run(req, (s) => this.identity.setPin(s.tx, id, body.pin));
  }

  @Get("roles")
  @Api({ summary: "Roles with their permissions", tags: ["Admin"], permission: "admin.roles.read" })
  listRoles(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => listRoles(s.tx));
  }

  /* ---- organisation and devices ---- */

  @Get("org-units")
  @Api({ summary: "Companies, sites, stores …", tags: ["Admin"], permission: "admin.org.read" })
  orgUnits(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => listOrgUnits(s.tx));
  }

  @Post("org-units")
  @Api({
    summary: "Add a site, store or department",
    tags: ["Admin"],
    permission: "admin.org.manage",
    body: Type.Object({ kind: Type.Union(["site", "warehouse", "location", "work_center", "department", "cost_center"].map((k) => Type.Literal(k))), code: Type.String({ pattern: "^[A-Z0-9][A-Z0-9_-]{0,19}$" }), name: Type.String({ minLength: 1, maxLength: 100 }), parentId: Id }, { additionalProperties: false }),
  })
  async addOrgUnit(@Req() req: ApiRequest, @Body() body: { kind: OrgUnitKind; code: string; name: string; parentId: string }) {
    return { id: await this.api.run(req, (s) => createOrgUnit(s.tx, body)) };
  }

  @Get("devices")
  @Api({ summary: "Shop-floor devices", tags: ["Admin"], permission: "admin.devices.manage" })
  devices(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => s.tx.selectFrom("kernel.shop_device").select(["id", "site_id as siteId", "name", "active", "last_seen_at as lastSeenAt", "created_at as createdAt"]).orderBy("name").execute());
  }

  @Post("devices")
  @Api({ summary: "Register a tablet at a site; the token is shown once", tags: ["Admin"], permission: "admin.devices.manage", body: Type.Object({ siteId: Id, name: Type.String({ minLength: 1, maxLength: 60 }) }, { additionalProperties: false }) })
  registerDevice(@Req() req: ApiRequest, @Body() body: { siteId: string; name: string }) {
    return this.api.run(req, (s) => this.identity.registerDevice(s.tx, body));
  }

  @Post("devices/:id/actions/revoke")
  @HttpCode(204)
  @Api({ summary: "Revoke a device", tags: ["Admin"], permission: "admin.devices.manage", params: IdParams })
  async revokeDevice(@Req() req: ApiRequest, @Param("id") id: string) {
    await this.api.run(req, (s) => this.identity.revokeDevice(s.tx, id));
  }

  /* ---- settings, numbering, checklist ---- */

  @Get("settings")
  @Api({ summary: "Settings with their current values and whether a package locks them", tags: ["Admin"], permission: "admin.settings.read" })
  settings(@Req() req: ApiRequest) {
    return this.api.run(req, async (s) => {
      const svc = new SettingsService(SETTING_DEFINITIONS, s.config);
      return Promise.all(svc.definitions().map(async (d) => ({ ...d, value: await svc.get(s.tx, d.key), locked: s.config.isLocked(`settings.${d.key}`) })));
    });
  }

  @Put("settings/:key")
  @Api({ summary: "Change a setting", tags: ["Admin"], permission: "admin.settings.update", params: Type.Object({ key: Type.String({ pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$" }) }), body: Type.Object({ value: Type.Unknown(), orgUnitId: Type.Optional(Id) }, { additionalProperties: false }) })
  async setSetting(@Req() req: ApiRequest, @Param("key") key: string, @Body() body: { value: unknown; orgUnitId?: string }) {
    return this.api.run(req, async (s) => {
      const svc = new SettingsService(SETTING_DEFINITIONS, s.config);
      await svc.set(s.tx, key, body.value, body.orgUnitId);
      return { key, value: await svc.get(s.tx, key, body.orgUnitId) };
    });
  }

  @Get("numbering")
  @Api({ summary: "Numbering series with a preview of the longest number", tags: ["Admin"], permission: "admin.numbering.read" })
  numbering(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => listSeries(s.tx, today()));
  }

  @Put("numbering/:id")
  @Api({ summary: "Change a series pattern (only before its first number)", tags: ["Admin"], permission: "admin.numbering.update", params: IdParams, body: Type.Object({ pattern: Type.String({ minLength: 3, maxLength: 60 }) }, { additionalProperties: false }) })
  async setPattern(@Req() req: ApiRequest, @Param("id") id: string, @Body() body: { pattern: string }) {
    return this.api.run(req, async (s) => {
      await updateSeriesPattern(s.tx, id, body.pattern, today());
      const series = (await listSeries(s.tx, today())).find((x) => x.id === id);
      if (!series) throw new NotFoundError("Series not found");
      return series;
    });
  }

  #checklist() {
    return new OnboardingChecklist([...kernelChecklistItems({ mfaEnabled: this.identity.mfaEnabled }), ...FOUNDATION_CHECKLIST]);
  }

  @Get("checklist")
  @Api({ summary: "Onboarding checklist", tags: ["Admin"], permission: "admin.settings.read" })
  checklist(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => this.#checklist().evaluate(s.tx));
  }

  @Post("checklist/:key")
  @HttpCode(200)
  @Api({ summary: "Confirm or re-open a review step", tags: ["Admin"], permission: "admin.settings.update", params: Type.Object({ key: Type.String({ maxLength: 60 }) }), body: Type.Object({ done: Type.Boolean() }, { additionalProperties: false }) })
  confirm(@Req() req: ApiRequest, @Param("key") key: string, @Body() body: { done: boolean }) {
    return this.api.run(req, async (s) => {
      const list = this.#checklist();
      await list.confirm(s.tx, key, body.done);
      return list.evaluate(s.tx);
    });
  }
}

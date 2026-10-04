/**
 * Tenant from packages (Step 5A §6, ADR-0024): one call turns a set of packages into a working tenant —
 * entitlements, organisation skeleton, roles from templates, numbering series from defaults, pinned
 * package versions, seed data from the layers above the kernel, and the owner's membership.
 */
import { systemContext, withTenant } from "../db/context.ts";
import type { TenantStatus } from "../db/context.ts";
import type { AnyDb, Tx } from "../db/database.ts";
import { assignRole, createRole, setEntitlement } from "../authz/admin.ts";
import type { EffectiveConfiguration } from "../config/effective.ts";
import { pinTenantPackages } from "../config/settings.ts";
import { createSeries } from "../documents/numbering.ts";
import { addMember, createOrgUnit, provisionTenant, setTenantStatus } from "../tenancy/tenancy.ts";

export interface ProvisionInput {
  tenant: { code: string; name: string; status?: Extract<TenantStatus, "demo" | "onboarding" | "active"> };
  company: { code: string; name: string };
  sites?: readonly { code: string; name: string; warehouses?: readonly { code: string; name: string }[] }[];
  /** Licensed modules (entitlements), e.g. ["foundation", "sales"]. */
  modules: readonly string[];
  config: EffectiveConfiguration;
  owner: { userId: string; displayName: string };
  /** Role templates the owner receives (default: owner and admin, where the packages define them). */
  ownerRoles?: readonly string[];
  /** Seeders from the layers above the kernel (foundation masters, demo data), run in the same transaction. */
  seeders?: readonly ((tx: Tx, context: { companyId: string; config: EffectiveConfiguration }) => Promise<unknown>)[];
}

export interface ProvisionResult {
  tenantId: string;
  companyId: string;
  orgUnits: Record<string, string>; // code → id
  roles: Record<string, string>; // code → id
  ownerMembershipId: string;
  series: string[]; // document types with a numbering series
}

export class ProvisioningError extends Error {
  override name = "ProvisioningError";
}

/**
 * Provision a tenant. `owner` is the owner connection (tenant row, entitlements); `app` is the application
 * pool (everything inside the tenant, one transaction, under RLS). If the second step fails, the tenant stays
 * in status "onboarding" with no data and can be removed by support.
 */
export async function provisionFromPackages(dbs: { owner: AnyDb; app: AnyDb }, input: ProvisionInput): Promise<ProvisionResult> {
  const templates = input.config.roleTemplates();
  const ownerRoles = input.ownerRoles ?? ["owner", "admin"].filter((code) => templates.some((t) => t.code === code));
  const missing = ownerRoles.filter((code) => !templates.some((t) => t.code === code));
  if (ownerRoles.length === 0 || missing.length > 0) throw new ProvisioningError(`The packages define no role template ${missing.join(", ") || "for the owner"}`);

  const tenantId = await provisionTenant(dbs.owner, { code: input.tenant.code, name: input.tenant.name, status: "onboarding" });
  for (const module of input.modules) await setEntitlement(dbs.owner, tenantId, module, true);

  const result = await withTenant(dbs.app, systemContext(tenantId, "provisioning"), async (tx) => {
    const orgUnits: Record<string, string> = {};
    const companyId = await createOrgUnit(tx, { kind: "company", code: input.company.code, name: input.company.name });
    orgUnits[input.company.code] = companyId;
    for (const site of input.sites ?? []) {
      const siteId = await createOrgUnit(tx, { kind: "site", code: site.code, name: site.name, parentId: companyId });
      orgUnits[site.code] = siteId;
      for (const w of site.warehouses ?? []) orgUnits[w.code] = await createOrgUnit(tx, { kind: "warehouse", code: w.code, name: w.name, parentId: siteId });
    }

    const roles: Record<string, string> = {};
    for (const t of templates) {
      roles[t.code] = await createRole(tx, t);
      await tx.updateTable("kernel.role").set({ template_package: input.config.roleSource(t.code) ?? null }).where("id", "=", roles[t.code]).execute();
    }

    const series: string[] = [];
    for (const [documentType, n] of Object.entries(input.config.allNumbering())) {
      if (!n.pattern) continue; // a pack may set only rules (India: length, gapless); the pattern comes from above
      await createSeries(tx, { ...n, pattern: n.pattern, documentType, companyId });
      series.push(documentType);
    }

    await pinTenantPackages(tx, input.config);
    for (const seed of input.seeders ?? []) await seed(tx, { companyId, config: input.config });

    const ownerMembershipId = await addMember(tx, { userId: input.owner.userId, displayName: input.owner.displayName });
    for (const code of ownerRoles) await assignRole(tx, ownerMembershipId, roles[code] as string, { type: "tenant" });
    return { tenantId, companyId, orgUnits, roles, ownerMembershipId, series };
  });
  if ((input.tenant.status ?? "onboarding") !== "onboarding") await setTenantStatus(dbs.owner, tenantId, input.tenant.status ?? "onboarding");
  return result;
}

/**
 * Runtime settings (Step 5 §4): frequently changed tenant settings in the database, audited, resolvable per
 * company/site. Resolution: nearest organisation unit → tenant → package default → module default.
 */
import { sql } from "kysely";
import { Ajv2020 } from "ajv/dist/2020.js";
import { newId } from "../ids/index.ts";
import type { Tx } from "../db/database.ts";
import { logSecurityEvent } from "../audit/audit.ts";
import type { EffectiveConfiguration } from "./effective.ts";

export interface SettingDefinition {
  key: string; // "<module>.<name>", e.g. "inventory.allow_negative_stock"
  description: string;
  schema: Record<string, unknown>; // JSON Schema of the value
  default: unknown;
  /** Can a company or site override the tenant value? */
  perOrgUnit?: boolean;
}

export class SettingsError extends Error {
  override name = "SettingsError";
}

export class SettingsService {
  readonly #defs = new Map<string, { def: SettingDefinition; validate: ReturnType<Ajv2020["compile"]> }>();
  readonly #config: EffectiveConfiguration | undefined;

  constructor(definitions: readonly SettingDefinition[], config?: EffectiveConfiguration) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    for (const def of definitions) this.#defs.set(def.key, { def, validate: ajv.compile(def.schema) });
    this.#config = config;
    for (const def of definitions) {
      const pkgDefault = config?.setting(def.key);
      if (pkgDefault !== undefined && !this.#defs.get(def.key)?.validate(pkgDefault)) throw new SettingsError(`Package default for ${def.key} is invalid`);
    }
  }

  #def(key: string) {
    const d = this.#defs.get(key);
    if (!d) throw new SettingsError(`Unknown setting ${key}`);
    return d;
  }

  async get<T = unknown>(tx: Tx, key: string, orgUnitId?: string): Promise<T> {
    const { def } = this.#def(key);
    if (orgUnitId && def.perOrgUnit) {
      const r = await sql<{ value: T }>`select s.value from kernel.setting s join kernel.org_unit_path(${orgUnitId}::uuid) p on p.id = s.org_unit_id
          where s.key = ${key} order by p.depth limit 1`.execute(tx);
      if (r.rows[0]) return r.rows[0].value;
    }
    const tenant = await tx.selectFrom("kernel.setting").select("value").where("key", "=", key).where("org_unit_id", "is", null).executeTakeFirst();
    if (tenant) return tenant.value as T;
    return (this.#config?.setting(key) ?? def.default) as T;
  }

  async set(tx: Tx, key: string, value: unknown, orgUnitId?: string): Promise<void> {
    const { def, validate } = this.#def(key);
    if (this.#config?.isLocked(`settings.${key}`)) throw new SettingsError(`${key} is locked by a package and cannot be changed`);
    if (orgUnitId && !def.perOrgUnit) throw new SettingsError(`${key} cannot differ per company or site`);
    if (!validate(value)) throw new SettingsError(`Invalid value for ${key}: ${validate.errors?.[0]?.message ?? "invalid"}`);
    const existing = await tx
      .selectFrom("kernel.setting")
      .select("id")
      .where("key", "=", key)
      .where((eb) => (orgUnitId ? eb("org_unit_id", "=", orgUnitId) : eb("org_unit_id", "is", null)))
      .executeTakeFirst();
    if (existing) await tx.updateTable("kernel.setting").set({ value: JSON.stringify(value) }).where("id", "=", existing.id).execute();
    else await tx.insertInto("kernel.setting").values({ id: newId(), key, value: JSON.stringify(value), org_unit_id: orgUnitId ?? null }).execute();
    await logSecurityEvent(tx, { type: "config.changed", outcome: "success", details: { setting: key, orgUnitId: orgUnitId ?? null } });
  }

  definitions(): SettingDefinition[] {
    return [...this.#defs.values()].map((d) => d.def);
  }
}

/** Record which package versions the tenant now runs (pinning, ADR-0030). */
export async function pinTenantPackages(tx: Tx, config: EffectiveConfiguration): Promise<void> {
  for (const p of config.packages) {
    await tx
      .insertInto("kernel.tenant_package")
      .values({ id: newId(), package_id: p.id, version: p.version, checksum: p.checksum })
      .onConflict((oc) => oc.columns(["tenant_id", "package_id"]).doUpdateSet({ version: p.version, checksum: p.checksum, applied_at: sql`now()` }))
      .execute();
  }
}

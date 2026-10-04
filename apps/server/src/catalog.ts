/**
 * Package catalog (ADR-0024, ADR-0030): the packages this server build ships, and per tenant the effective
 * configuration of the versions it has pinned. Built once per tenant and cached until the pins change.
 */
import { EffectiveConfiguration, loadPackage } from "@master-erp/kernel/config";
import type { LoadedPackage } from "@master-erp/kernel/config";
import type { Tx } from "@master-erp/kernel/db";
import type { ItemInput, LocalizationRules } from "@master-erp/foundation";
import { indiaPackageDir, indiaRules } from "@master-erp/pack-india";
import { printingPackageDir, withSheetConversions } from "@master-erp/pack-printing-packaging";
import { demoPrintersDir } from "@master-erp/tenant-demo-printers";

export interface CatalogEntry {
  dir: string;
  /** Country rules for the foundation (localization packs). */
  rules?: LocalizationRules;
  /** Industry code that completes an item before it is saved (e.g. the kg ↔ sheet conversion). */
  prepareItem?: (input: ItemInput) => ItemInput;
}

export interface TenantConfiguration {
  config: EffectiveConfiguration;
  rules: LocalizationRules[];
  prepareItem: (input: ItemInput) => ItemInput;
}

export const BUILT_IN_PACKAGES: Readonly<Record<string, CatalogEntry>> = {
  india: { dir: indiaPackageDir, rules: indiaRules },
  "printing-packaging": { dir: printingPackageDir, prepareItem: (i) => withSheetConversions([i])[0] ?? i },
  "demo-printers": { dir: demoPrintersDir },
};

export class PackageCatalog {
  readonly #entries: Readonly<Record<string, CatalogEntry>>;
  readonly #loaded = new Map<string, LoadedPackage>();
  readonly #byTenant = new Map<string, { pins: string; value: TenantConfiguration }>();

  constructor(entries: Readonly<Record<string, CatalogEntry>> = BUILT_IN_PACKAGES) {
    this.#entries = entries;
  }

  load(id: string): LoadedPackage {
    let p = this.#loaded.get(id);
    if (!p) {
      const entry = this.#entries[id];
      if (!entry) throw new Error(`Package ${id} is not part of this server build`);
      p = loadPackage(entry.dir);
      this.#loaded.set(id, p);
    }
    return p;
  }

  /** Configuration for the tenant of this transaction, from its pinned packages. */
  async forTenant(tx: Tx, tenantId: string): Promise<TenantConfiguration> {
    const pins = await tx.selectFrom("kernel.tenant_package").select(["package_id", "version", "checksum"]).orderBy("package_id").execute();
    const key = pins.map((p) => `${p.package_id as string}@${p.version as string}#${p.checksum as string}`).join(",");
    const cached = this.#byTenant.get(tenantId);
    if (cached?.pins === key) return cached.value;
    const ids = pins.map((p) => p.package_id as string);
    const packages = ids.map((id) => this.load(id));
    for (const [i, p] of packages.entries()) {
      // A pinned version that differs from the build means an upgrade is pending (ADR-0030): run what is installed, but say so.
      if (p.manifest.version !== pins[i]?.version) console.warn(`tenant ${tenantId}: package ${p.manifest.id} pinned at ${pins[i]?.version as string}, build has ${p.manifest.version}`);
    }
    const prepares = ids.map((id) => this.#entries[id]?.prepareItem).filter((f): f is (i: ItemInput) => ItemInput => f !== undefined);
    const value: TenantConfiguration = {
      config: new EffectiveConfiguration(packages),
      rules: ids.map((id) => this.#entries[id]?.rules).filter((r): r is LocalizationRules => r !== undefined),
      prepareItem: (input) => prepares.reduce((acc, f) => f(acc), input),
    };
    this.#byTenant.set(tenantId, { pins: key, value });
    return value;
  }
}

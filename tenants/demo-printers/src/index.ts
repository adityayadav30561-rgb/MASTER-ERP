/**
 * Demo tenant "Demo Printers Pvt Ltd" (Step 5A §10): India pack + Printing package + this tenant baseline.
 * Used by the demo seed command and the end-to-end tests of the Slice 0 exit criteria.
 */
import { fileURLToPath } from "node:url";
import { EffectiveConfiguration, loadPackage } from "@master-erp/kernel/config";
import type { AnyDb, Tx } from "@master-erp/kernel/db";
import { provisionFromPackages } from "@master-erp/kernel/onboarding";
import type { ProvisionResult } from "@master-erp/kernel/onboarding";
import { FOUNDATION_DEFAULT_SEED, FoundationSeeder } from "@master-erp/foundation";
import type { ItemInput, SeedReport } from "@master-erp/foundation";
import { indiaPackageDir, indiaRules } from "@master-erp/pack-india";
import { printingPackageDir, withSheetConversions } from "@master-erp/pack-printing-packaging";

/** Folder of the tenant baseline package. */
export const demoPrintersDir = fileURLToPath(new URL("../package/", import.meta.url));

/** The demo tenant's effective configuration (localization → industry → tenant). */
export function demoPrintersConfiguration(): EffectiveConfiguration {
  return new EffectiveConfiguration([loadPackage(indiaPackageDir), loadPackage(printingPackageDir), loadPackage(demoPrintersDir)]);
}

/** Apply platform defaults, package seed data and (optionally) demo data. Idempotent. */
export async function seedDemoPrinters(tx: Tx, config: EffectiveConfiguration, options: { demo?: boolean } = {}): Promise<SeedReport[]> {
  const seeder = new FoundationSeeder({ rules: [indiaRules], config });
  const reports = [await seeder.apply(tx, FOUNDATION_DEFAULT_SEED), await seeder.apply(tx, config.seed())];
  if (options.demo ?? true) {
    const demo = config.demo();
    const items = withSheetConversions((demo["foundation.item"] ?? []) as ItemInput[]);
    reports.push(await seeder.apply(tx, { ...demo, "foundation.item": items }));
  }
  return reports;
}

/**
 * Create the demo tenant (status "demo") with its organisation, roles, numbering, masters and demo data.
 * `owner` is an existing global identity (the demo seed command creates it).
 */
export async function provisionDemoPrinters(dbs: { owner: AnyDb; app: AnyDb }, owner: { userId: string; displayName: string }, options: { code?: string; demo?: boolean } = {}): Promise<ProvisionResult> {
  const config = demoPrintersConfiguration();
  return provisionFromPackages(dbs, {
    tenant: { code: options.code ?? "demo", name: "Demo Printers Pvt Ltd", status: "demo" },
    company: { code: "DP", name: "Demo Printers Pvt Ltd" },
    sites: [{ code: "BHW", name: "Bhiwandi works", warehouses: [{ code: "PAPER", name: "Paper and board store" }, { code: "INK", name: "Ink and consumables store" }, { code: "FG", name: "Finished goods store" }] }],
    modules: ["foundation"],
    config,
    owner,
    seeders: [(tx) => seedDemoPrinters(tx, config, { demo: options.demo ?? true })],
  });
}

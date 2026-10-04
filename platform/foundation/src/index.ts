import type { MigrationSource } from "@master-erp/kernel/db";

export const foundationMigrations: MigrationSource = {
  package: "@master-erp/foundation",
  directory: new URL("../migrations/", import.meta.url),
};

export { clampLimit, decodeCursor, encodeCursor, mergeRules, normalizePhone } from "./common.ts";
export type { LocalizationRules, Page, TaxIdScheme } from "./common.ts";
export { PARTY_ROLES, PartyService } from "./party.ts";
export type { AddressInput, ContactInput, Party, PartyInput, PartyRole, PartyStatus, PartySummary, TaxIdInput } from "./party.ts";
export { ItemService } from "./item.ts";
export type { Item, ItemCategoryInput, ItemInput, ItemStatus, ItemSummary, ItemType } from "./item.ts";
export { UomService } from "./uom.ts";
export type { Dimension, Uom, UomInput } from "./uom.ts";
export { TaxService } from "./tax.ts";
export type { TaxCategory } from "./tax.ts";
export { FOUNDATION_SEED_ORDER, FoundationSeeder } from "./seed.ts";
export type { SeedReport } from "./seed.ts";

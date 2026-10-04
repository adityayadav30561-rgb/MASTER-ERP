/**
 * Printing & Packaging industry package v0.1 (Step 5A §3, ADR-0002): the YAML package folder plus the
 * industry code it needs. Country-neutral: GST, HSN and UQC come from a localization pack.
 */
import { fileURLToPath } from "node:url";

/** Folder of the YAML package, for loadPackage(). */
export const printingPackageDir = fileURLToPath(new URL("../package/", import.meta.url));

export { FACTOR_SCALE, kgToSheetConversion, sheetsPerKg, sheetWeightGrams, withSheetConversions } from "./sheets.ts";
export type { SheetSpec } from "./sheets.ts";

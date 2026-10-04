/** India localization pack v0.1: rules for the foundation, the package folder, and GST computation. */
import { fileURLToPath } from "node:url";
import type { LocalizationRules } from "@master-erp/foundation";
import { gstinRegion, parseRegion, regionName, validateGstin, validateHsnSac, validatePan, validatePinCode } from "./identifiers.ts";

/** Folder with manifest.yaml and the YAML configuration (loaded with kernel loadPackage). */
export const indiaPackageDir = fileURLToPath(new URL("../package/", import.meta.url));

export const indiaRules: LocalizationRules = {
  taxIdSchemes: {
    pan: { label: "PAN", normalize: (v) => v.replace(/\s/g, "").toUpperCase(), validate: (v) => validatePan(v) },
    gstin: { label: "GSTIN", normalize: (v) => v.replace(/\s/g, "").toUpperCase(), validate: (v, c) => validateGstin(v, c), regionOf: gstinRegion },
  },
  validateHsnSac,
  validatePostalCode: validatePinCode,
  regionName,
  parseRegion,
};

export { gstinCheckCharacter, gstinRegion, parseRegion, regionHint, regionName, validateGstin, validateHsnSac, validatePan, validatePinCode } from "./identifiers.ts";
export { FORMER_ISO, SPECIAL_GST_CODES, STATES, stateByGstCode, stateByIso } from "./states.ts";
export type { IndianState } from "./states.ts";
export { computeInvoice, supplyType } from "./gst.ts";
export type { InvoiceLineInput, SupplyType, TaxedInvoice, TaxedLine } from "./gst.ts";

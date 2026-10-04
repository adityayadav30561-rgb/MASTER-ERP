/**
 * Indian tax identifiers.
 * - PAN: AAAAA9999A; the 4th letter is the holder type (C company, P person, H HUF, F firm, A AOP,
 *   T trust, B BOI, L local authority, J artificial juridical person, G government).
 * - GSTIN (15): 2-digit state code + PAN + entity number + "Z" (default) + check character (mod-36 checksum).
 */
import { FORMER_ISO, SPECIAL_GST_CODES, STATES, stateByGstCode, stateByIso } from "./states.ts";

const PAN = /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$/;
const GSTIN = /^[0-9]{2}[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z][1-9A-Z][A-Z][0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function validatePan(pan: string): string | undefined {
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return "must look like ABCDE1234F (5 letters, 4 digits, 1 letter)";
  if (!PAN.test(pan)) return "has an unknown holder type in the 4th letter";
  return undefined;
}

/** The GSTIN check character for the first 14 characters (GSTN mod-36 algorithm). */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i] ?? "0") * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] ?? "0";
}

export function validateGstin(gstin: string, context: { pan?: string | undefined } = {}): string | undefined {
  if (gstin.length !== 15) return "must have 15 characters";
  if (!GSTIN.test(gstin)) return "is not in GSTIN format (e.g. 27AAPFU0939F1ZV)";
  const state = gstin.slice(0, 2);
  if (!stateByGstCode.has(state) && !SPECIAL_GST_CODES.has(state)) return `starts with an unknown state code ${state}`;
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) return "has a wrong check character — please re-check the number";
  if (context.pan && gstin.slice(2, 12) !== context.pan) return `does not contain the party's PAN ${context.pan}`;
  return undefined;
}

export function gstinRegion(gstin: string): string | undefined {
  return stateByGstCode.get(gstin.slice(0, 2))?.iso;
}

export function regionName(iso: string): string | undefined {
  return stateByIso.get(iso)?.name;
}

/** "Maharashtra", "maharashtra", "27" (GST code), "IN-MH" or a former ISO code → "IN-MH". */
export function parseRegion(text: string): string | undefined {
  const t = text.trim();
  const upper = t.toUpperCase();
  if (stateByIso.has(upper)) return upper;
  if (FORMER_ISO[upper]) return FORMER_ISO[upper];
  const byCode = stateByGstCode.get(t.padStart(2, "0"));
  if (/^[0-9]{1,2}$/.test(t) && byCode) return byCode.iso;
  const simple = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
  return STATES.find((s) => simple(s.name) === simple(t))?.iso;
}

export function regionHint(iso: string): string | undefined {
  const current = FORMER_ISO[iso];
  return current ? `use the current code ${current}` : undefined;
}

/** Indian PIN code: 6 digits, first digit 1–9. */
export function validatePinCode(country: string, code: string): string | undefined {
  if (country !== "IN") return undefined;
  return /^[1-9][0-9]{5}$/.test(code) ? undefined : "must be a 6-digit PIN code";
}

/**
 * HSN (goods) and SAC (services). Goods: 4, 6 or 8 digits (6 or more needed above ₹5 crore turnover and on
 * e-invoices). Services: SAC, 6 digits starting with 99. Required for stock items and services.
 */
export function validateHsnSac(code: string | null, itemType: "stock" | "non_stock" | "service"): string | undefined {
  if (!code) return itemType === "non_stock" ? undefined : itemType === "service" ? "SAC code is required for services" : "HSN code is required for stock items";
  if (itemType === "service") return /^99\d{4}$/.test(code) ? undefined : "a service needs a 6-digit SAC code starting with 99";
  if (code.startsWith("99")) return "codes starting with 99 are SAC codes for services, not goods";
  return /^(\d{4}|\d{6}|\d{8})$/.test(code) ? undefined : "must be an HSN code of 4, 6 or 8 digits";
}

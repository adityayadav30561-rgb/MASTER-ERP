/** Shared helpers for foundation masters: localization hooks, keyset pagination, code generation. */
import { sql } from "kysely";
import type { Tx } from "@master-erp/kernel/db";
import type { FieldError } from "@master-erp/kernel/metadata";

/** A tax-identifier scheme contributed by a localization pack (e.g. India: "gstin", "pan"). */
export interface TaxIdScheme {
  label: string;
  normalize(value: string): string;
  /** Problem message, or undefined if valid. `context` gives other identifiers of the same party. */
  validate(value: string, context: { pan?: string | undefined }): string | undefined;
  /** Region (ISO 3166-2) the identifier belongs to, if it encodes one (GSTIN → state). */
  regionOf?(value: string): string | undefined;
}

/** Country rules plug in here; the foundation itself knows no country (ADR-0002). */
export interface LocalizationRules {
  taxIdSchemes?: Readonly<Record<string, TaxIdScheme>>;
  /** HSN/SAC check for an item; return a message, or undefined when acceptable. */
  validateHsnSac?(code: string | null, itemType: "stock" | "non_stock" | "service"): string | undefined;
  validatePostalCode?(country: string, code: string): string | undefined;
  regionName?(regionCode: string): string | undefined;
}

export function mergeRules(rules: readonly LocalizationRules[]): Required<Pick<LocalizationRules, "taxIdSchemes">> & LocalizationRules {
  const merged: LocalizationRules = { taxIdSchemes: {} };
  for (const r of rules) {
    merged.taxIdSchemes = { ...merged.taxIdSchemes, ...r.taxIdSchemes };
    if (r.validateHsnSac) merged.validateHsnSac = r.validateHsnSac;
    if (r.validatePostalCode) merged.validatePostalCode = r.validatePostalCode;
    if (r.regionName) merged.regionName = r.regionName;
  }
  return merged as Required<Pick<LocalizationRules, "taxIdSchemes">> & LocalizationRules;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Keyset cursor over (sort key, id): stable while rows are inserted (API conventions: cursor pagination). */
export function encodeCursor(key: string, id: string): string {
  return Buffer.from(JSON.stringify([key, id])).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): [string, string] | undefined {
  if (!cursor) return undefined;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string") return [v[0], v[1]];
  } catch {
    // fall through
  }
  return undefined;
}

export function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 200);
}

/** A readable code from a name: "Shree Papers Pvt Ltd" → "SHREEPAPER", then -2, -3 … if taken. */
export async function generateCode(tx: Tx, table: string, name: string, prefix = ""): Promise<string> {
  const base = (prefix + name.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toUpperCase()).slice(0, 10) || "X";
  const taken = await sql<{ code: string }>`select code from ${sql.table(table)} where code = ${base} or code like ${base + "-%"}`.execute(tx);
  const codes = new Set(taken.rows.map((r) => r.code));
  if (!codes.has(base)) return base;
  for (let n = 2; ; n++) if (!codes.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function requireText(errors: FieldError[], field: string, value: string | undefined | null, max = 200): void {
  if (!value || !value.trim()) errors.push({ field, message: "is required" });
  else if (value.length > max) errors.push({ field, message: `must be at most ${max} characters` });
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** E.164-like: optional +, 8–15 digits after removing spaces and dashes. */
export function normalizePhone(phone: string): string | undefined {
  const p = phone.replace(/[\s()-]/g, "");
  return /^\+?\d{8,15}$/.test(p) ? p : undefined;
}
